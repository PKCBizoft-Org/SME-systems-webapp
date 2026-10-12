-- Let a customer say "I was referred by..." after sign-up, and show referrers who they brought in.
--
-- * set_my_referrer(code): only while the customer has no referrer and is not installed yet.
-- * my_referrer(): who referred me, plus whether I can still enter a code.
-- * my_referred_customers(): the people who used my code with where they are in the process
--   (names are shortened to first name + last initial).

create or replace function public.short_person_name(p_name text)
returns text
language sql
immutable
as $$
  select case
    when nullif(btrim(coalesce(p_name, '')), '') is null then 'A customer'
    when array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1) = 1 then btrim(p_name)
    else (regexp_split_to_array(btrim(p_name), '\s+'))[1] || ' '
         || upper(left((regexp_split_to_array(btrim(p_name), '\s+'))[array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1)], 1)) || '.'
  end;
$$;

create or replace function public.my_referrer()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me public.clients%rowtype;
  ref public.clients%rowtype;
  v_installed boolean;
begin
  select * into me from public.clients where user_id = auth.uid() limit 1;
  if not found then
    return jsonb_build_object('has_referrer', false, 'can_enter', false);
  end if;

  v_installed := lower(coalesce(me.installation_status, '')) in ('installed', 'completed', 'done')
    or exists (select 1 from public.referrals where referred_client_id = me.id);

  if me.referred_by_client_id is not null then
    select * into ref from public.clients where id = me.referred_by_client_id;
    return jsonb_build_object(
      'has_referrer', true,
      'referrer_name', public.short_person_name(ref.customer_name),
      'can_enter', false,
      'installed', v_installed
    );
  end if;

  return jsonb_build_object('has_referrer', false, 'can_enter', not v_installed, 'installed', v_installed);
end;
$$;

create or replace function public.set_my_referrer(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.clients%rowtype;
  ref public.clients%rowtype;
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select * into me from public.clients where user_id = auth.uid() limit 1;
  if not found then
    raise exception 'Your customer account could not be found.';
  end if;

  if v_code = '' then
    raise exception 'Enter the referral code.';
  end if;

  if me.referred_by_client_id is not null then
    raise exception 'You already have a referrer.';
  end if;

  if lower(coalesce(me.installation_status, '')) in ('installed', 'completed', 'done')
     or exists (select 1 from public.referrals where referred_client_id = me.id) then
    raise exception 'Referral codes can only be added before your installation is done.';
  end if;

  select * into ref from public.clients where upper(referral_code) = v_code limit 1;
  if not found then
    raise exception 'That referral code was not found. Check it with your friend.';
  end if;

  if ref.id = me.id then
    raise exception 'You cannot use your own referral code.';
  end if;

  if ref.referred_by_client_id = me.id then
    raise exception 'That customer was referred by you, so their code cannot be used here.';
  end if;

  perform set_config('app.bypass_client_guard', 'on', true);
  update public.clients set referred_by_client_id = ref.id where id = me.id;
  perform set_config('app.bypass_client_guard', 'off', true);

  return jsonb_build_object('referrer_name', public.short_person_name(ref.customer_name));
end;
$$;

create or replace function public.my_referred_customers()
returns table (
  client_id uuid,
  display_name text,
  stage text,
  joined_at timestamptz,
  reward_amount numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    public.short_person_name(c.customer_name),
    case
      when exists (select 1 from public.referrals r where r.referred_client_id = c.id) then 'Installed'
      when lower(coalesce(c.installation_status, '')) in ('installed', 'completed', 'done') then 'Installed'
      when lower(coalesce(c.installation_status, '')) = 'for installation' then 'Paid, waiting for installation'
      else 'Registered'
    end,
    (select u.created_at from auth.users u where u.id = c.user_id),
    (select max(r.bonus_amount) from public.referrals r where r.referred_client_id = c.id)
  from public.clients c
  where c.referred_by_client_id = (select id from public.clients where user_id = auth.uid() limit 1)
  order by 4 desc nulls last;
$$;

revoke execute on function public.my_referrer() from public, anon;
revoke execute on function public.set_my_referrer(text) from public, anon;
revoke execute on function public.my_referred_customers() from public, anon;
grant execute on function public.my_referrer() to authenticated;
grant execute on function public.set_my_referrer(text) to authenticated;
grant execute on function public.my_referred_customers() to authenticated;
