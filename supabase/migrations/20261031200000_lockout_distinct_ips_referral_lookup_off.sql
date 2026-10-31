-- Security follow-up to the 2026-10-20 audit (F2, F3).
--
-- F2: anyone can report a "failed" sign-in for any email (the browser reports it). The global lock
--     (for every address) triggered on 50 failures in 15 minutes, so ONE attacker could send 50 fake
--     failures and lock a real user out. Now the global lock needs failures from at least 10
--     different addresses (a real distributed attack); a single address only ever locks itself.
--     Each address may add at most 20 failures per hour per email, so one attacker can't flood the table.
-- F3: resolve_referral_code returned a customer's name and internal id for any code to any signed-in
--     account (and anyone can sign up). Nothing calls it any more (the app uses set_my_referrer), so
--     only the server (service_role) may run it.

create or replace function public.login_status(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_key text := public.login_email_key(p_email);
  v_ip text := public.request_ip();
  v_since timestamptz := now() - interval '15 minutes';
  v_fails integer;
  v_ips integer;
  v_last_fail timestamptz;
  v_until timestamptz;
begin
  if v_key = '' then
    return jsonb_build_object('locked', false, 'seconds_left', 0, 'attempts_left', 5);
  end if;

  -- Failures from this caller's address only: a stranger's fake failures do not count.
  select count(*), max(at) into v_fails, v_last_fail
  from public.login_attempts
  where email_key = v_key and not success and at > v_since and coalesce(ip_key, '') = v_ip;

  -- Many DIFFERENT addresses guessing the same account: lock it for everyone.
  select count(distinct coalesce(ip_key, '')) into v_ips
  from public.login_attempts
  where email_key = v_key and not success and at > v_since;

  if v_ips >= 10 then
    select max(at) into v_last_fail from public.login_attempts where email_key = v_key and not success and at > v_since;
    v_fails := greatest(v_fails, 5);
  end if;

  if v_fails >= 5 then
    v_until := v_last_fail + interval '15 minutes';
    if v_until > now() then
      return jsonb_build_object('locked', true,
        'seconds_left', ceil(extract(epoch from (v_until - now())))::integer, 'attempts_left', 0);
    end if;
  end if;

  return jsonb_build_object('locked', false, 'seconds_left', 0,
    'attempts_left', greatest(0, 5 - v_fails));
end;
$fn$;

create or replace function public.record_login_attempt(p_email text, p_success boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_key text := public.login_email_key(p_email);
  v_ip text := public.request_ip();
  v_status jsonb;
begin
  if v_key = '' then return public.login_status(p_email); end if;
  v_status := public.login_status(v_key);
  if (v_status->>'locked')::boolean then return v_status; end if;

  -- A success never clears anything (the browser could lie about it); failures are capped per address.
  if p_success is not true
     and (select count(*) from public.login_attempts
          where email_key = v_key and coalesce(ip_key, '') = v_ip and at > now() - interval '1 hour') < 20 then
    insert into public.login_attempts (email_key, success, ip_key) values (v_key, false, v_ip);
  end if;

  if random() < 0.02 then
    delete from public.login_attempts where at < now() - interval '2 days';
  end if;

  return public.login_status(v_key);
end;
$fn$;

revoke execute on function public.resolve_referral_code(text) from public, anon, authenticated;
grant execute on function public.resolve_referral_code(text) to service_role;
