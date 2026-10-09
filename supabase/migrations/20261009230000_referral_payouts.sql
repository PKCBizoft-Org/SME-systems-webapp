-- ============================================================================
-- Referral payouts that work from request to payout
--
-- Before this, a customer's withdrawal request always failed: the withdrawal
-- table still required a single referral and a fixed PHP 250 amount, and the
-- reward table did not allow the 'Reserved' state the app and RPC use. There
-- was also nowhere for Accounting to process a request.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Schema that matches the "reserve rewards, then pay" model
-- ---------------------------------------------------------------------------
alter table public.referral_rewards drop constraint if exists referral_rewards_status_check;
alter table public.referral_rewards
  add constraint referral_rewards_status_check
  check (status in ('Pending', 'Eligible', 'Reserved', 'Withdrawn', 'Cancelled'));

alter table public.referral_withdrawals alter column referral_id drop not null;
drop index if exists public.referral_withdrawals_referral_id_unique;

alter table public.referral_withdrawals drop constraint if exists referral_withdrawal_amount_check;
alter table public.referral_withdrawals
  add constraint referral_withdrawal_amount_check
  check (gross_amount > 0 and transfer_fee >= 0 and net_amount = gross_amount - transfer_fee);

alter table public.referral_withdrawals
  add column if not exists payout_reference text,
  add column if not exists processed_by uuid references auth.users(id) on delete set null,
  add column if not exists reject_reason text;

-- Covering indexes for the foreign keys.
create index if not exists referral_withdrawals_referral_id_idx on public.referral_withdrawals (referral_id);
create index if not exists referral_withdrawals_processed_by_idx on public.referral_withdrawals (processed_by);
create index if not exists referral_rewards_withdrawal_id_idx on public.referral_rewards (withdrawal_id);
create index if not exists referrals_referred_client_id_idx on public.referrals (referred_client_id);

-- ---------------------------------------------------------------------------
-- 2. Accounting can see every withdrawal and reward in their tenant
--    (one policy per table: the customer's own rows, or payment staff)
-- ---------------------------------------------------------------------------
drop policy if exists "customers can view own referral withdrawals" on public.referral_withdrawals;
create policy "referral withdrawals visible to owner and payment staff"
  on public.referral_withdrawals for select to authenticated
  using (
    exists (
      select 1 from public.clients c
      where c.id = referral_withdrawals.referrer_client_id
        and (c.user_id = (select auth.uid()) or public.is_payment_staff(c.tenant_id))
    )
  );

drop policy if exists "customers can view own referral rewards" on public.referral_rewards;
create policy "referral rewards visible to owner and payment staff"
  on public.referral_rewards for select to authenticated
  using (
    exists (
      select 1 from public.clients c
      where c.id = referral_rewards.referrer_client_id
        and (c.user_id = (select auth.uid()) or public.is_payment_staff(c.tenant_id))
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Customer requests a withdrawal (whole rewards only) and can cancel it
-- ---------------------------------------------------------------------------
create or replace function public.request_referral_withdrawal(
  p_amount numeric,
  p_method text,
  p_account_name text,
  p_account_number text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
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

  select coalesce(sum(amount), 0), min(amount)
  into v_available, v_unit
  from public.referral_rewards
  where referrer_client_id = v_client and lower(status) = 'eligible';

  if v_available < p_amount then
    raise exception 'Your available referral balance is PHP %.', to_char(v_available, 'FM999,999,990.00');
  end if;

  for r in
    select id, amount from public.referral_rewards
    where referrer_client_id = v_client and lower(status) = 'eligible'
    order by eligible_at nulls last, created_at
    for update
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
$fn$;

create or replace function public.cancel_my_referral_withdrawal(p_withdrawal_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  w public.referral_withdrawals%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select w2.* into w
  from public.referral_withdrawals w2
  join public.clients c on c.id = w2.referrer_client_id
  where w2.id = p_withdrawal_id and c.user_id = auth.uid()
  for update of w2;

  if not found then
    raise exception 'Withdrawal not found.';
  end if;

  if lower(w.status) <> 'pending' then
    raise exception 'Only a request that Accounting has not started can be cancelled (this one is %).', lower(w.status);
  end if;

  update public.referral_withdrawals
  set status = 'Cancelled', processed_at = now(), updated_at = now()
  where id = w.id;

  update public.referral_rewards
  set status = 'Eligible', withdrawal_id = null, updated_at = now()
  where withdrawal_id = w.id and lower(status) = 'reserved';
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Accounting processes a withdrawal: start, mark paid, or reject
-- ---------------------------------------------------------------------------
create or replace function public.process_referral_withdrawal_as(
  p_withdrawal_id uuid,
  p_actor uuid,
  p_action text,
  p_reference text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  w public.referral_withdrawals%rowtype;
  cl public.clients%rowtype;
  v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_status text;
  v_email text;
  v_title text;
  v_body text;
begin
  if p_action not in ('processing', 'paid', 'reject') then
    raise exception 'Unknown action.';
  end if;

  select * into w from public.referral_withdrawals where id = p_withdrawal_id for update;
  if not found then
    raise exception 'Withdrawal not found.';
  end if;

  select * into cl from public.clients where id = w.referrer_client_id;

  if not public.actor_is_payment_staff(p_actor, cl.tenant_id) then
    raise exception 'Only accounting or admin staff can process withdrawals.';
  end if;

  if cl.user_id is not null and cl.user_id = p_actor then
    raise exception 'You cannot process your own withdrawal.';
  end if;

  v_status := lower(w.status);

  if p_action = 'processing' then
    if v_status <> 'pending' then
      raise exception 'Only a pending request can be started (this one is %).', v_status;
    end if;
    update public.referral_withdrawals
    set status = 'Processing', processed_by = p_actor, updated_at = now()
    where id = w.id;
    v_title := 'Your payout is being processed';
    v_body := format('Accounting is sending your PHP %s referral payout.', to_char(w.net_amount, 'FM999,999,990.00'));

  elsif p_action = 'paid' then
    if v_status not in ('pending', 'processing') then
      raise exception 'This withdrawal is already % and cannot be marked paid.', v_status;
    end if;
    if v_ref is null then
      raise exception 'Enter the reference number of the transfer you sent.';
    end if;
    update public.referral_withdrawals
    set status = 'Paid', processed_at = now(), processed_by = p_actor,
        payout_reference = v_ref, accounting_notes = v_note, updated_at = now()
    where id = w.id;
    update public.referral_rewards
    set status = 'Withdrawn', updated_at = now()
    where withdrawal_id = w.id and lower(status) = 'reserved';
    update public.referrals
    set bonus_status = 'Paid', bonus_paid_at = now()
    where id in (select referral_id from public.referral_rewards where withdrawal_id = w.id);
    v_title := 'Referral payout sent';
    v_body := format('PHP %s was sent to your %s account (ref %s). Thank you for referring!',
                     to_char(w.net_amount, 'FM999,999,990.00'), w.payout_method, v_ref);

  else
    if v_status not in ('pending', 'processing') then
      raise exception 'This withdrawal is already % and cannot be rejected.', v_status;
    end if;
    if v_note is null then
      raise exception 'Tell the customer why the withdrawal was rejected.';
    end if;
    update public.referral_withdrawals
    set status = 'Rejected', processed_at = now(), processed_by = p_actor,
        reject_reason = v_note, accounting_notes = v_note, updated_at = now()
    where id = w.id;
    update public.referral_rewards
    set status = 'Eligible', withdrawal_id = null, updated_at = now()
    where withdrawal_id = w.id and lower(status) = 'reserved';
    v_title := 'Referral withdrawal was not approved';
    v_body := format('Reason: %s. Your PHP %s is back in your referral balance.', v_note, to_char(w.gross_amount, 'FM999,999,990.00'));
  end if;

  select email into v_email from auth.users where id = p_actor;
  insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values (
    cl.tenant_id, cl.id, coalesce(v_email, 'Unknown'), 'referral_withdrawal_' || p_action,
    w.status,
    format('PHP %s net / %s %s', w.net_amount, w.payout_method, coalesce(v_ref, v_note, ''))
  );

  if cl.user_id is not null then
    perform public.team_push(cl.user_id, v_title, v_body);
  end if;

  return jsonb_build_object(
    'action', p_action,
    'gross', w.gross_amount,
    'net', w.net_amount,
    'method', w.payout_method,
    'account_name', w.payout_account_name,
    'account_number', w.payout_account_number,
    'reference', v_ref,
    'reason', case when p_action = 'reject' then v_note end,
    'customer_name', cl.customer_name,
    'customer_email', cl.email
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. Tell the referrer when a friend's installation earns them a reward
-- ---------------------------------------------------------------------------
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
begin
  select referred_by_client_id, customer_name into v_referrer, v_friend
  from public.clients where id = p_client_id;
  if v_referrer is null or v_referrer = p_client_id then
    return;
  end if;

  if not exists (
    select 1 from public.payment_submissions
    where client_id = p_client_id and lower(status) = 'verified'
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

-- ---------------------------------------------------------------------------
-- 6. Who may call what
-- ---------------------------------------------------------------------------
revoke all on function public.cancel_my_referral_withdrawal(uuid) from public, anon;
grant execute on function public.cancel_my_referral_withdrawal(uuid) to authenticated, service_role;

revoke all on function public.process_referral_withdrawal_as(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.process_referral_withdrawal_as(uuid, uuid, text, text, text) to service_role;
