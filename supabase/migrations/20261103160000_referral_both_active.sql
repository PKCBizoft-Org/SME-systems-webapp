-- 2026-11-03 (PKC's rule): referral rewards can only be withdrawn when BOTH customers are
-- active: the referrer (the one withdrawing) and the friend whose sign-up earned the reward.
-- Rewards stay "Eligible" meanwhile; they become withdrawable as soon as both are active.

create or replace function public.referral_customer_active(p_client uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clients c
    where c.id = p_client
      and lower(coalesce(c.account_status, '')) = 'active'
      and lower(coalesce(c.installation_status, '')) in ('installed', 'completed', 'done')
  );
$$;
revoke all on function public.referral_customer_active(uuid) from public, anon, authenticated;

create or replace function public.request_referral_withdrawal(p_amount numeric, p_method text, p_account_name text, p_account_number text, p_notes text default null::text)
returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  c_fee constant numeric := 5;
  v_client uuid;
  v_gross numeric := 0;
  v_available numeric := 0;
  v_unit numeric;
  v_withdrawal uuid;
  r record;
  v_ids uuid[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select id into v_client from public.clients where user_id = auth.uid() limit 1;
  if v_client is null then
    raise exception 'Your customer account could not be found.';
  end if;

  if not public.referral_customer_active(v_client) then
    raise exception 'Your own internet account must be active (installed and connected) before you can withdraw referral rewards.';
  end if;

  if coalesce(btrim(p_method), '') = '' then
    raise exception 'Choose where we should send the money.';
  end if;

  if coalesce(btrim(p_account_name), '') = '' or coalesce(btrim(p_account_number), '') = '' then
    raise exception 'Enter your payout account name and number.';
  end if;

  if p_amount is null or p_amount <= c_fee then
    raise exception 'The withdrawal must be more than the PHP % transfer fee.', c_fee;
  end if;

  if exists (
    select 1 from public.referral_withdrawals
    where referrer_client_id = v_client and lower(status) in ('pending', 'processing')
  ) then
    raise exception 'You already have a withdrawal in progress. Wait for Accounting to finish it first.';
  end if;

  -- Only rewards whose referred friend is still an active customer can be withdrawn.
  select coalesce(sum(w.amount), 0), min(w.amount)
  into v_available, v_unit
  from public.referral_rewards w
  join public.referrals rf on rf.id = w.referral_id
  where w.referrer_client_id = v_client and lower(w.status) = 'eligible'
    and public.referral_customer_active(rf.referred_client_id);

  if v_available = 0 and exists (
    select 1 from public.referral_rewards w
    where w.referrer_client_id = v_client and lower(w.status) = 'eligible'
  ) then
    raise exception 'Your rewards can be withdrawn once the friends you referred are active customers.';
  end if;

  if v_available < p_amount then
    raise exception 'Your available referral balance is PHP %.', to_char(v_available, 'FM999,999,990.00');
  end if;

  for r in
    select w.id, w.amount from public.referral_rewards w
    join public.referrals rf on rf.id = w.referral_id
    where w.referrer_client_id = v_client and lower(w.status) = 'eligible'
      and public.referral_customer_active(rf.referred_client_id)
    order by w.eligible_at nulls last, w.created_at
    for update of w
  loop
    exit when v_gross >= p_amount;
    v_gross := v_gross + r.amount;
    v_ids := v_ids || r.id;
  end loop;

  if v_gross <> p_amount then
    raise exception 'Withdraw in whole rewards of PHP % each. You can withdraw up to PHP %.',
      to_char(v_unit, 'FM999,999,990.00'), to_char(v_available, 'FM999,999,990.00');
  end if;

  insert into public.referral_withdrawals (
    referrer_client_id, gross_amount, transfer_fee, net_amount,
    payout_method, payout_account_name, payout_account_number, payout_notes, status
  ) values (
    v_client, v_gross, c_fee, v_gross - c_fee,
    btrim(p_method), btrim(p_account_name), btrim(p_account_number),
    nullif(btrim(coalesce(p_notes, '')), ''), 'Pending'
  )
  returning id into v_withdrawal;

  update public.referral_rewards
  set status = 'Reserved', withdrawal_id = v_withdrawal, updated_at = now()
  where id = any (v_ids);

  return v_withdrawal;
end;
$function$;
