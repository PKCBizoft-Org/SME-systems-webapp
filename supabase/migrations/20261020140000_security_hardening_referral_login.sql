-- Security hardening from the 2026-10-20 authorized audit.
-- Idempotent: safe to re-run / re-apply.
--
-- F1 Referral IDOR: get_my_referral_stats trusted a caller-supplied id and ran
--    as SECURITY DEFINER, so anyone (even anon) could read another customer's
--    referral counts. Identity now comes from auth.uid() only.
-- F3 Referral-code enumeration: resolve_referral_code leaked customer names +
--    internal client ids to anon. EXECUTE revoked from anon/public.
-- F2 Login lockout: record_login_attempt trusted a client "success" flag, which
--    let a caller clear their own lockout (and forge others'). Failures only now.
-- F4 search_path pinned on the remaining flagged functions.
-- (F5 inventory_catalog view is left SECURITY DEFINER on purpose: it exposes a
--  column subset to technicians and re-checks access in its WHERE; anon has no
--  grant. F6 leaked-password protection is a dashboard toggle.)

-- F1 + F4
CREATE OR REPLACE FUNCTION public.get_my_referral_stats(p_user_id uuid)
RETURNS TABLE(total_referrals bigint, successful_referrals bigint, pending_referrals bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
begin
  -- p_user_id is ignored on purpose: identity is auth.uid(), so a caller can
  -- only ever read their own referral stats (anon/auth.uid() null -> no rows).
  return query
  select count(*)::bigint,
         count(*) filter (where lower(c_ref.installation_status) = 'completed')::bigint,
         count(*) filter (where lower(c_ref.installation_status) is null
                             or lower(c_ref.installation_status) <> 'completed')::bigint
  from public.clients c_me
  join public.clients c_ref on c_ref.referred_by_client_id = c_me.id
  where c_me.user_id = auth.uid();
end;
$$;

CREATE OR REPLACE FUNCTION public.get_my_referral_stats(p_id text)
RETURNS TABLE(total_referrals bigint, successful_referrals bigint, pending_referrals bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
begin
  return query
  select count(*)::bigint,
         count(*) filter (where lower(c_ref.installation_status) = 'completed')::bigint,
         count(*) filter (where lower(c_ref.installation_status) is null
                             or lower(c_ref.installation_status) <> 'completed')::bigint
  from public.clients c_me
  join public.clients c_ref on c_ref.referred_by_client_id = c_me.id
  where c_me.user_id = auth.uid();
end;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_referral_stats(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_referral_stats(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_referral_stats(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_referral_stats(text) TO authenticated;

-- F3
REVOKE EXECUTE ON FUNCTION public.resolve_referral_code(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resolve_referral_code(text) TO authenticated;

-- F2
CREATE OR REPLACE FUNCTION public.login_status(p_email text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_key text := public.login_email_key(p_email);
  v_since timestamptz := now() - interval '15 minutes';
  v_fails integer;
  v_last_fail timestamptz;
  v_until timestamptz;
begin
  if v_key = '' then
    return jsonb_build_object('locked', false, 'seconds_left', 0, 'attempts_left', 5);
  end if;

  select count(*), max(at) into v_fails, v_last_fail
  from public.login_attempts where email_key = v_key and not success and at > v_since;

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
$$;

CREATE OR REPLACE FUNCTION public.record_login_attempt(p_email text, p_success boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_key text := public.login_email_key(p_email);
  v_status jsonb;
begin
  if v_key = '' then return public.login_status(p_email); end if;
  v_status := public.login_status(v_key);
  if (v_status->>'locked')::boolean then return v_status; end if;

  -- Only failures are recorded; p_success is never trusted to clear the window.
  if p_success is not true
     and (select count(*) from public.login_attempts
          where email_key = v_key and at > now() - interval '1 hour') < 200 then
    insert into public.login_attempts (email_key, success) values (v_key, false);
  end if;

  if random() < 0.02 then
    delete from public.login_attempts where at < now() - interval '2 days';
  end if;

  return public.login_status(v_key);
end;
$$;

-- F4
ALTER FUNCTION public.billing_day_for(date)   SET search_path = public;
ALTER FUNCTION public.today_ph()              SET search_path = public;
ALTER FUNCTION public.short_person_name(text) SET search_path = public;
ALTER FUNCTION public.stamp_job_started()     SET search_path = public;
