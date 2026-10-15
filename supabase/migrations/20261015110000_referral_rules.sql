-- Referral rules:
--  1. "Were you referred?" (set_my_referrer) can never create a loop: you cannot name someone you referred,
--     directly or through a chain of friends (A referred B, B referred C: A cannot use C's code, and neither can
--     anyone else close the circle).
--  2. A reward is only created once the referred friend has subscribed to a wifi plan: the account has a plan
--     that is on sale, the plan application payment was confirmed by Accounting, and the installation is done.
--     The reward is also refused if the referrer was themselves referred by this friend.

-- True when p_target is p_start or sits anywhere above p_start in the chain of referrers.
create or replace function public.referral_chain_has(p_start uuid, p_target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current uuid := p_start;
  v_steps integer := 0;
begin
  while v_current is not null and v_steps < 50 loop
    if v_current = p_target then
      return true;
    end if;
    select referred_by_client_id into v_current from public.clients where id = v_current;
    v_steps := v_steps + 1;
  end loop;
  return false;
end;
$$;
revoke execute on function public.referral_chain_has(uuid, uuid) from public, anon, authenticated;

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

  select * into ref from public.clients where upper(referral_code) = v_code and tenant_id = me.tenant_id limit 1;
  if not found then
    raise exception 'That referral code was not found. Check it with your friend.';
  end if;

  if ref.id = me.id then
    raise exception 'You cannot use your own referral code.';
  end if;

  -- Nobody you referred (directly or through their own friends) can be your referrer.
  if public.referral_chain_has(ref.id, me.id) then
    raise exception 'You cannot use the code of someone you referred, directly or through their friends.';
  end if;

  perform set_config('app.bypass_client_guard', 'on', true);
  update public.clients set referred_by_client_id = ref.id where id = me.id;
  perform set_config('app.bypass_client_guard', 'off', true);

  return jsonb_build_object('referrer_name', public.short_person_name(ref.customer_name));
end;
$$;
revoke execute on function public.set_my_referrer(text) from public, anon;
grant execute on function public.set_my_referrer(text) to authenticated;

create or replace function public.award_referral(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_referrer uuid;
  v_code text;
  v_referral uuid;
  v_friend text;
  v_referrer_user uuid;
  v_plan text;
  v_tenant uuid;
  v_status text;
begin
  select referred_by_client_id, customer_name, plan_name, tenant_id, installation_status
    into v_referrer, v_friend, v_plan, v_tenant, v_status
  from public.clients where id = p_client_id;
  if v_referrer is null or v_referrer = p_client_id then
    return;
  end if;

  -- Never reward a loop.
  if public.referral_chain_has(v_referrer, p_client_id) then
    return;
  end if;

  -- The friend must have subscribed to a wifi plan that is on sale, and be installed.
  if nullif(btrim(coalesce(v_plan, '')), '') is null
     or not exists (
       select 1 from public.internet_plans ip
       where ip.tenant_id = v_tenant and ip.plan_name = v_plan and ip.active = true
     )
     or lower(coalesce(v_status, '')) not in ('installed', 'completed', 'done') then
    return;
  end if;

  -- And Accounting must have confirmed the payment for the plan application.
  if not exists (
    select 1 from public.payment_submissions
    where client_id = p_client_id and lower(status) = 'verified' and service_request_id is not null
  ) then
    return;
  end if;

  if exists (select 1 from public.referrals where referred_client_id = p_client_id) then
    return;
  end if;

  select referral_code, user_id into v_code, v_referrer_user from public.clients where id = v_referrer;

  insert into public.referrals (
    referrer_client_id, referred_client_id, referral_code,
    status, bonus_amount, bonus_status, bonus_eligible_at
  ) values (
    v_referrer, p_client_id, v_code,
    'Successful', 250, 'Eligible', now()
  )
  returning id into v_referral;

  insert into public.referral_rewards (referral_id, referrer_client_id, amount, status, eligible_at)
  values (v_referral, v_referrer, 250, 'Eligible', now());

  if v_referrer_user is not null then
    perform public.team_push(
      v_referrer_user,
      'You earned a referral reward',
      format('%s is now connected. PHP 250 was added to your referral balance.', coalesce(nullif(btrim(v_friend), ''), 'Your friend'))
    );
  end if;
end;
$fn$;
revoke execute on function public.award_referral(uuid) from public, anon, authenticated;
