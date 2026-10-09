-- ============================================================================
-- Bill payments and a sturdier payment pipeline
--
--  * Customers can send proof of payment for a monthly bill; Accounting
--    verifies it and the bill's balance updates by itself (partial payments
--    included).
--  * The payment date a customer types is now kept (it was silently replaced
--    by today's date).
--  * The same GCash / bank reference can no longer be submitted twice.
--  * billing_balances view: one definition of "amount, paid, balance, status"
--    for the app and the web.
--  * list_plans(): the app reads the live plan catalog instead of a hardcoded
--    list, and the plan check no longer blocks new catalog plans.
--  * Accounting can record a walk-in / cash payment (record_payment_as).
--  * Scheduled plan changes now actually switch on their date (the function
--    existed but nothing ever called it).
--  * Reminder emails quote the remaining balance, new bills trigger a push.
-- ============================================================================

-- Manila "today": customer-facing dates must not roll over at 8 AM local time.
create or replace function public.today_ph()
returns date
language sql
stable
as $fn$ select (now() at time zone 'Asia/Manila')::date $fn$;

-- ---------------------------------------------------------------------------
-- 1. payment_submissions can pay a bill, not only a plan application
-- ---------------------------------------------------------------------------
alter table public.payment_submissions alter column service_request_id drop not null;

alter table public.payment_submissions
  add column if not exists billing_id uuid references public.billing(id),
  add column if not exists gcash_mobile text,
  add column if not exists bank_account_name text,
  add column if not exists bank_account_number text;

alter table public.payment_submissions drop constraint if exists payment_submissions_target_check;
alter table public.payment_submissions
  add constraint payment_submissions_target_check
  check (service_request_id is not null or billing_id is not null);

create index if not exists payment_submissions_billing_id_idx on public.payment_submissions (billing_id);
create index if not exists payment_submissions_payment_id_idx on public.payment_submissions (payment_id);
create index if not exists payment_submissions_reviewed_by_idx on public.payment_submissions (reviewed_by);
create index if not exists payment_submissions_user_id_idx on public.payment_submissions (user_id);

-- One live submission per reference number (rejected ones may be resubmitted).
create unique index if not exists payment_submissions_active_reference_uq
  on public.payment_submissions (tenant_id, lower(btrim(reference_number)))
  where status in ('Pending', 'Verified') and nullif(btrim(reference_number), '') is not null;

-- ---------------------------------------------------------------------------
-- 2. payments remember the reference and who recorded them
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists reference_number text,
  add column if not exists recorded_by uuid references auth.users(id) on delete set null;

create index if not exists payments_recorded_by_idx on public.payments (recorded_by);

update public.payments p
set reference_number = nullif(btrim(s.reference_number), '')
from public.payment_submissions s
where s.payment_id = p.id and p.reference_number is null;

create unique index if not exists payments_reference_uq
  on public.payments (tenant_id, lower(btrim(reference_number)))
  where nullif(btrim(reference_number), '') is not null;

-- ---------------------------------------------------------------------------
-- 3. Triggers: plan applications and verification
-- ---------------------------------------------------------------------------
create or replace function public.plan_application_to_submission()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if NEW.request_type = 'plan_change'
     and NEW.client_id is not null
     and coalesce(NEW.requested_amount, 0) > 0
     and NEW.payment_method in ('GCash', 'Bank Transfer', 'Cash') then
    insert into public.payment_submissions (
      client_id, user_id, service_request_id, amount_claimed, payment_method,
      reference_number, bank_name, gcash_mobile, bank_account_name, bank_account_number,
      payment_date, proof_path, status
    ) values (
      NEW.client_id, NEW.user_id, NEW.id, NEW.requested_amount, NEW.payment_method,
      NEW.payment_reference, NEW.bank_name, NEW.gcash_mobile, NEW.bank_account_name, NEW.bank_account_number,
      public.today_ph(), NEW.payment_proof_path, 'Pending'
    );
  end if;
  return NEW;
end;
$fn$;

create or replace function public.payment_submission_verification_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_payment_id uuid;
  v_request_status text;
begin
  if NEW.status = 'Verified'
     and OLD.status is distinct from 'Verified'
     and NEW.payment_id is null then

    if NEW.service_request_id is not null then
      select sr.status into v_request_status
      from public.service_requests sr
      where sr.id = NEW.service_request_id;

      if lower(coalesce(v_request_status, '')) = 'completed' then
        raise exception 'This plan request has already been completed.';
      end if;
    end if;

    insert into public.payments (
      tenant_id, client_id, service_request_id, billing_id, payment_id, receipt_number,
      amount_paid, payment_date, payment_method, reference_number, recorded_by
    ) values (
      NEW.tenant_id, NEW.client_id, NEW.service_request_id, NEW.billing_id,
      'PS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
      'RCPT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
      NEW.amount_claimed, NEW.payment_date, NEW.payment_method,
      nullif(btrim(coalesce(NEW.reference_number, '')), ''),
      coalesce(NEW.reviewed_by, auth.uid())
    )
    returning id into v_payment_id;

    NEW.payment_id := v_payment_id;
    NEW.reviewed_at := coalesce(NEW.reviewed_at, now());
    NEW.reviewed_by := coalesce(NEW.reviewed_by, auth.uid());
  end if;

  return NEW;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. One definition of a bill's amount, paid, balance and status
-- ---------------------------------------------------------------------------
create or replace view public.billing_balances
with (security_invoker = true) as
select
  b.id,
  b.tenant_id,
  b.client_id,
  b.bill_id,
  b.bill_type,
  b.bill_date,
  b.due_date,
  b.billing_period_start,
  b.billing_period_end,
  x.amount,
  coalesce(p.paid, 0)::numeric as paid,
  x.balance,
  coalesce(s.pending, 0)::numeric as pending_review,
  x.closed,
  case
    when x.closed then b.status
    when x.balance <= 0 then 'Paid'
    when b.due_date is not null and b.due_date < public.today_ph() then 'Overdue'
    when coalesce(p.paid, 0) > 0 then 'Partially Paid'
    else 'Unpaid'
  end as status,
  case
    when not x.closed and x.balance > 0 and b.due_date is not null and b.due_date < public.today_ph()
      then public.today_ph() - b.due_date
    else 0
  end as days_overdue
from public.billing b
left join lateral (
  select sum(pay.amount_paid) filter (where pay.amount_paid > 0) as paid
  from public.payments pay
  where pay.billing_id = b.id
) p on true
left join lateral (
  select sum(sub.amount_claimed) as pending
  from public.payment_submissions sub
  where sub.billing_id = b.id and sub.status = 'Pending'
) s on true
cross join lateral (
  select
    coalesce(b.final_amount, b.amount_due, b.original_amount, 0)::numeric as amount,
    greatest(coalesce(b.final_amount, b.amount_due, b.original_amount, 0) - coalesce(p.paid, 0), 0)::numeric as balance,
    lower(coalesce(b.status, '')) in ('cancelled', 'canceled', 'void', 'waived') as closed
) x;

-- True when this reference number is already on a recorded payment or on a
-- submission that is waiting or verified (rejected ones may be reused).
create or replace function public.reference_in_use(p_tenant uuid, p_ref text, p_except uuid default null)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select nullif(btrim(coalesce(p_ref, '')), '') is not null and (
    exists (
      select 1 from public.payments x
      where x.tenant_id = p_tenant and lower(btrim(x.reference_number)) = lower(btrim(p_ref))
    )
    or exists (
      select 1 from public.payment_submissions o
      where o.tenant_id = p_tenant
        and o.status in ('Pending', 'Verified')
        and o.id is distinct from p_except
        and lower(btrim(o.reference_number)) = lower(btrim(p_ref))
    )
  );
$fn$;

-- ---------------------------------------------------------------------------
-- 5. Customers pay a bill
-- ---------------------------------------------------------------------------
create or replace function public.submit_bill_payment(
  p_billing_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference_number text default null,
  p_bank_name text default null,
  p_gcash_mobile text default null,
  p_payment_date date default null,
  p_payment_proof_path text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_user uuid := auth.uid();
  v_today date := public.today_ph();
  v_pay_date date := coalesce(p_payment_date, public.today_ph());
  v_bill public.billing%rowtype;
  v_client public.clients%rowtype;
  v_amount numeric;
  v_paid numeric;
  v_pending numeric;
  v_remaining numeric;
  v_ref text := nullif(btrim(coalesce(p_reference_number, '')), '');
  v_proof text := nullif(btrim(coalesce(p_payment_proof_path, '')), '');
  v_mobile text := nullif(btrim(coalesce(p_gcash_mobile, '')), '');
  v_submission uuid;
begin
  if v_user is null then
    raise exception 'You must be signed in.';
  end if;

  -- Lock the bill so two quick taps cannot both pass the balance check.
  select b.* into v_bill
  from public.billing b
  join public.clients c on c.id = b.client_id
  where b.id = p_billing_id and c.user_id = v_user
  for update of b;

  if not found then
    raise exception 'That bill could not be found on your account.';
  end if;

  select * into v_client from public.clients where id = v_bill.client_id;

  if lower(coalesce(v_bill.status, '')) in ('cancelled', 'canceled', 'void', 'waived') then
    raise exception 'This bill was cancelled, so there is nothing to pay.';
  end if;

  v_amount := coalesce(v_bill.final_amount, v_bill.amount_due, v_bill.original_amount, 0);

  select coalesce(sum(amount_paid) filter (where amount_paid > 0), 0) into v_paid
  from public.payments where billing_id = v_bill.id;

  select coalesce(sum(amount_claimed), 0) into v_pending
  from public.payment_submissions where billing_id = v_bill.id and status = 'Pending';

  v_remaining := v_amount - v_paid;

  if v_remaining <= 0 then
    raise exception 'This bill is already fully paid.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter the amount you paid.';
  end if;

  if p_amount <> round(p_amount, 2) then
    raise exception 'The amount can have at most 2 decimal places.';
  end if;

  if p_amount > v_remaining then
    raise exception 'The amount is more than what is left on this bill (PHP %).', to_char(v_remaining, 'FM999,999,990.00');
  end if;

  if p_amount + v_pending > v_remaining then
    raise exception 'You already have a payment for this bill waiting for Accounting. Wait for it to be checked first.';
  end if;

  if p_payment_method not in ('GCash', 'Bank Transfer', 'Cash') then
    raise exception 'Unsupported payment method.';
  end if;

  if p_payment_method <> 'Cash' and v_ref is null then
    raise exception 'Enter the transaction reference number from your receipt.';
  end if;

  if p_payment_method = 'GCash' then
    if v_mobile is null or v_mobile !~ '^09[0-9]{9}$' then
      raise exception 'Enter the GCash mobile number you paid from (09XXXXXXXXX).';
    end if;
  end if;

  if p_payment_method = 'Bank Transfer' and nullif(btrim(coalesce(p_bank_name, '')), '') is null then
    raise exception 'Enter the bank name.';
  end if;

  if v_proof is null then
    raise exception 'Attach a photo of your receipt so Accounting can check the payment.';
  end if;

  if v_proof not like v_user::text || '/%' then
    raise exception 'That receipt photo does not belong to your account. Upload it again.';
  end if;

  if v_pay_date > v_today then
    raise exception 'The payment date cannot be in the future.';
  end if;

  if v_pay_date < v_today - 365 then
    raise exception 'The payment date is too far in the past. Please check it.';
  end if;

  if public.reference_in_use(v_client.tenant_id, v_ref) then
    raise exception 'That reference number was already submitted. Check the number on your receipt, or contact Accounting if you think this is a mistake.';
  end if;

  insert into public.payment_submissions (
    client_id, user_id, billing_id, amount_claimed, payment_method, reference_number,
    bank_name, gcash_mobile, payment_date, proof_path, status
  ) values (
    v_client.id, v_user, v_bill.id, p_amount, p_payment_method, v_ref,
    nullif(btrim(coalesce(p_bank_name, '')), ''),
    case when p_payment_method = 'GCash' then v_mobile end,
    v_pay_date, v_proof, 'Pending'
  )
  returning id into v_submission;

  return v_submission;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 6. Plan applications: keep the typed date, tighter checks, no dead end
-- ---------------------------------------------------------------------------
create or replace function public.submit_plan_purchase(
  p_client_id uuid,
  p_requested_plan text,
  p_amount numeric,
  p_payment_mode text,
  p_payment_method text,
  p_reference_number text default null,
  p_bank_name text default null,
  p_bank_account_name text default null,
  p_bank_account_number text default null,
  p_gcash_mobile text default null,
  p_payment_date date default null,
  p_payment_proof_path text default null,
  p_replace_service_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_today date := public.today_ph();
  v_pay_date date := coalesce(p_payment_date, public.today_ph());
  v_ref text := nullif(btrim(coalesce(p_reference_number, '')), '');
  v_tenant_id uuid;
  v_current_plan text;
  v_plan_price numeric;
  v_plan_count integer;
  v_effective_at timestamptz;
  v_request_id uuid;
  v_old_status text;
  v_has_bills boolean;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  select c.tenant_id, c.plan_name
  into v_tenant_id, v_current_plan
  from public.clients c
  where c.id = p_client_id and c.user_id = v_user_id;

  if not found then
    raise exception 'Customer account not found.';
  end if;

  -- The catalog decides the price; the app's number is only checked against it.
  select count(*), min(ip.price)
  into v_plan_count, v_plan_price
  from public.internet_plans ip
  where ip.tenant_id = v_tenant_id
    and ip.plan_name = p_requested_plan
    and ip.active = true;

  if v_plan_count = 0 then
    raise exception 'Selected plan is not available.';
  end if;
  if v_plan_count > 1 then
    raise exception 'Multiple active plans with the same name exist for this tenant.';
  end if;
  if v_plan_price is null then
    raise exception 'Selected plan does not have a valid price.';
  end if;

  if p_amount is null or p_amount <> v_plan_price then
    raise exception 'Payment amount does not match the selected plan.';
  end if;

  if v_current_plan is not null and btrim(v_current_plan) = p_requested_plan then
    raise exception 'This is already your current plan.';
  end if;

  if p_payment_method not in ('GCash', 'Bank Transfer', 'Cash') then
    raise exception 'Unsupported payment method.';
  end if;

  if p_payment_mode not in ('Manual', 'Automatic') then
    raise exception 'Unsupported payment mode.';
  end if;

  if p_payment_method = 'Cash' and p_payment_mode = 'Automatic' then
    raise exception 'Cash payments must be manual.';
  end if;

  if p_payment_mode = 'Manual' and p_payment_method <> 'Cash' and v_ref is null then
    raise exception 'Manual GCash and bank payments require a transaction reference.';
  end if;

  if p_payment_mode = 'Manual' and nullif(btrim(p_payment_proof_path), '') is null then
    raise exception 'Manual payments require transaction proof.';
  end if;

  if nullif(btrim(p_payment_proof_path), '') is not null
     and btrim(p_payment_proof_path) not like v_user_id::text || '/%' then
    raise exception 'That receipt photo does not belong to your account. Upload it again.';
  end if;

  if p_payment_method = 'GCash' and nullif(btrim(p_gcash_mobile), '') is null then
    raise exception 'GCash mobile number is required.';
  end if;

  if p_payment_method = 'Bank Transfer'
     and (nullif(btrim(p_bank_name), '') is null
          or nullif(btrim(p_bank_account_name), '') is null
          or nullif(btrim(p_bank_account_number), '') is null) then
    raise exception 'Bank name, account name, and account number are required.';
  end if;

  if v_pay_date > v_today then
    raise exception 'The payment date cannot be in the future.';
  end if;
  if v_pay_date < v_today - 365 then
    raise exception 'The payment date is too far in the past. Please check it.';
  end if;

  -- Replace the customer's earlier, still-unverified application.
  if p_replace_service_request_id is not null then
    select status into v_old_status
    from public.service_requests
    where id = p_replace_service_request_id
      and client_id = p_client_id
      and request_type = 'plan_change';

    if v_old_status is null then
      raise exception 'The previous scheduled plan change could not be found.';
    end if;

    if lower(v_old_status) in ('scheduled', 'verified', 'paid', 'completed') then
      raise exception 'The existing paid plan change cannot be replaced. Remove it first or wait for it to take effect.';
    end if;

    update public.service_requests
    set status = 'Cancelled', updated_at = now()
    where id = p_replace_service_request_id;
  end if;

  -- Only one application can wait for Accounting at a time.
  if exists (
    select 1 from public.service_requests sr
    where sr.client_id = p_client_id
      and sr.request_type = 'plan_change'
      and lower(coalesce(sr.status, '')) in ('payment pending', 'pending', 'processing')
  ) then
    raise exception 'You already have a plan application waiting for Accounting. Withdraw it first if you want to apply for a different plan.';
  end if;

  if public.reference_in_use(v_tenant_id, v_ref) then
    raise exception 'That reference number was already submitted. Check the number on your receipt, or contact Accounting if you think this is a mistake.';
  end if;

  -- A new plan starts when the current paid period ends (the day after its
  -- last day). With no billing period running yet, it starts right away.
  select (max(b.billing_period_end) + 1)::timestamptz
  into v_effective_at
  from public.billing b
  where b.client_id = p_client_id
    and coalesce(lower(b.status), '') not in ('cancelled', 'void')
    and b.billing_period_end is not null;

  select exists (
    select 1 from public.billing b
    where b.client_id = p_client_id and coalesce(lower(b.status), '') not in ('cancelled', 'void')
  ) into v_has_bills;

  if v_current_plan is not null and v_effective_at is null and v_has_bills then
    raise exception 'Your current billing period has no end date. Please contact Accounting before scheduling a plan change.';
  end if;

  if v_effective_at is null or v_effective_at < now() then
    v_effective_at := now();
  end if;

  insert into public.service_requests (
    user_id, client_id, request_type, requested_plan, requested_amount, description,
    status, created_at, updated_at, effective_at, payment_mode, payment_method,
    payment_reference, bank_name, bank_account_name, bank_account_number,
    gcash_mobile, payment_proof_path
  ) values (
    v_user_id, p_client_id, 'plan_change', p_requested_plan, v_plan_price,
    format(
      'Customer scheduled %s plan change from %s. Current plan remains active until the current billing period ends.',
      p_requested_plan, coalesce(v_current_plan, 'No current plan')
    ),
    'Payment Pending', now(), now(), v_effective_at, p_payment_mode, p_payment_method,
    v_ref, nullif(btrim(p_bank_name), ''), nullif(btrim(p_bank_account_name), ''),
    nullif(btrim(p_bank_account_number), ''), nullif(btrim(p_gcash_mobile), ''),
    nullif(btrim(p_payment_proof_path), '')
  )
  returning id into v_request_id;

  -- The trigger created the submission with today's date; use the typed one.
  update public.payment_submissions
  set payment_date = v_pay_date
  where service_request_id = v_request_id;

  if p_payment_mode = 'Automatic' then
    insert into public.auto_pay_enrollments (
      tenant_id, client_id, user_id, payment_method, gcash_mobile,
      bank_name, bank_account_name, bank_account_number, status
    ) values (
      v_tenant_id, p_client_id, v_user_id, p_payment_method, nullif(btrim(p_gcash_mobile), ''),
      nullif(btrim(p_bank_name), ''), nullif(btrim(p_bank_account_name), ''),
      nullif(btrim(p_bank_account_number), ''), 'Setup Pending'
    );
  end if;

  return v_request_id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. The plan catalog for the app, and a plan check that follows the catalog
-- ---------------------------------------------------------------------------
create or replace function public.list_plans()
returns table (plan_name text, price numeric, speed text)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select distinct ip.plan_name, ip.price, ip.speed
  from public.internet_plans ip
  join public.clients c on c.tenant_id = ip.tenant_id
  where c.user_id = auth.uid() and ip.active = true
  order by ip.price, ip.plan_name;
$fn$;

alter table public.service_requests drop constraint if exists service_requests_plan_check;
alter table public.service_requests
  add constraint service_requests_plan_check
  check (requested_plan is null or requested_plan ~ '^[A-Za-z0-9_.-]{1,40}$');

-- ---------------------------------------------------------------------------
-- 8. Accounting: verify / reject understand bill payments
-- ---------------------------------------------------------------------------
create or replace function public.refresh_disconnection_flag(p_client uuid, p_flag_after_days integer default 7)
returns void
language sql
security definer
set search_path to 'public'
as $fn$
  -- Lifts the flag once nothing is badly overdue any more. Only the daily job
  -- ever raises it.
  update public.clients c
  set disconnection_flag = false, disconnection_flagged_at = null
  where c.id = p_client
    and c.disconnection_flag = true
    and not exists (
      select 1 from public.billing_balances b
      where b.client_id = c.id
        and not b.closed
        and b.balance > 0
        and b.due_date < public.today_ph() - p_flag_after_days
    );
$fn$;

create or replace function public.verify_payment_submission_as(p_submission_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  sub public.payment_submissions%rowtype;
  req public.service_requests%rowtype;
  cl public.clients%rowtype;
  bill public.billing%rowtype;
  pay public.payments%rowtype;
  v_email text;
  v_new_customer boolean;
  v_total numeric;
  v_paid numeric;
  v_remaining numeric;
begin
  select * into sub from public.payment_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Payment submission not found.';
  end if;

  if not public.actor_is_payment_staff(p_actor, sub.tenant_id) then
    raise exception 'Only accounting or admin staff can verify payments.';
  end if;

  if lower(coalesce(sub.status, 'pending')) <> 'pending' then
    raise exception 'This submission was already %.', lower(sub.status);
  end if;

  if sub.client_id is null or (sub.service_request_id is null and sub.billing_id is null) then
    raise exception 'This submission is missing its client, plan application or bill.';
  end if;

  select * into cl from public.clients where id = sub.client_id;

  if sub.user_id = p_actor or cl.user_id = p_actor then
    raise exception 'You cannot approve a payment for your own account.';
  end if;

  if public.reference_in_use(sub.tenant_id, sub.reference_number, sub.id) then
    raise exception 'Reference % was already used on another payment (a reused receipt?).', sub.reference_number;
  end if;

  -- ---- A payment for a monthly bill -------------------------------------
  if sub.billing_id is not null then
    select * into bill from public.billing where id = sub.billing_id for update;
    if not found then
      raise exception 'The bill for this payment no longer exists.';
    end if;

    if lower(coalesce(bill.status, '')) in ('cancelled', 'canceled', 'void', 'waived') then
      raise exception 'Bill % is no longer open (%).', bill.bill_id, bill.status;
    end if;

    v_total := coalesce(bill.final_amount, bill.amount_due, bill.original_amount, 0);
    select coalesce(sum(amount_paid) filter (where amount_paid > 0), 0) into v_paid
    from public.payments where billing_id = bill.id;
    v_remaining := v_total - v_paid;

    if v_remaining <= 0 then
      raise exception 'Bill % is already fully paid. Reject this payment.', bill.bill_id;
    end if;

    if sub.amount_claimed > v_remaining then
      raise exception 'The customer claims % but only % is left on bill %. Reject it and ask them to resubmit the right amount.',
        sub.amount_claimed, v_remaining, bill.bill_id;
    end if;

    update public.payment_submissions
    set status = 'Verified', reviewed_at = now(), reviewed_by = p_actor
    where id = sub.id;

    select p.* into pay
    from public.payments p
    join public.payment_submissions s on s.payment_id = p.id
    where s.id = sub.id;

    perform public.refresh_disconnection_flag(cl.id);

    select email into v_email from auth.users where id = p_actor;
    insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
    values (
      sub.tenant_id, sub.client_id, coalesce(v_email, 'Unknown'), 'payment_verified',
      coalesce(sub.reference_number, ''),
      coalesce(pay.receipt_number, '') || ' / ' || sub.amount_claimed::text || ' / bill ' || coalesce(bill.bill_id, '')
    );

    return jsonb_build_object(
      'kind', 'bill',
      'payment_uuid', pay.id,
      'receipt_number', pay.receipt_number,
      'amount', sub.amount_claimed,
      'plan', null,
      'bill_id', bill.bill_id,
      'remaining', v_remaining - sub.amount_claimed,
      'new_customer', false,
      'customer_name', cl.customer_name,
      'customer_email', cl.email,
      'reference', sub.reference_number
    );
  end if;

  -- ---- A plan application ------------------------------------------------
  select * into req from public.service_requests where id = sub.service_request_id;

  if lower(coalesce(req.status, '')) in ('cancelled', 'canceled', 'completed', 'for installation') then
    raise exception 'This plan application is no longer open (%).', req.status;
  end if;

  if coalesce(req.requested_amount, 0) > 0 and sub.amount_claimed <> req.requested_amount then
    raise exception 'Amount mismatch: the customer entered % but % costs %. Reject it and ask them to pay the exact amount.',
      sub.amount_claimed, req.requested_plan, req.requested_amount;
  end if;

  v_new_customer :=
    lower(coalesce(cl.account_status, '')) <> 'active'
    and lower(coalesce(cl.installation_status, 'pending')) not in ('installed', 'completed', 'done');

  if not exists (select 1 from public.client_services where client_id = cl.id) then
    insert into public.client_services (tenant_id, client_id, status, installation_status)
    values (cl.tenant_id, cl.id, 'pending', case when v_new_customer then 'For installation' else cl.installation_status end);
  end if;

  update public.payment_submissions
  set status = 'Verified', reviewed_at = now(), reviewed_by = p_actor
  where id = sub.id;

  select p.* into pay
  from public.payments p
  join public.payment_submissions s on s.payment_id = p.id
  where s.id = sub.id;

  if v_new_customer then
    update public.clients set installation_status = 'For installation' where id = cl.id;

    update public.service_requests
    set status = 'For installation', updated_at = now()
    where id = req.id;

    insert into public.repair_records (
      client_id, repair_date, problem_description, status, service_request_id,
      job_type, latitude, longitude
    ) values (
      cl.id, current_date,
      'New installation: ' || coalesce(req.requested_plan, 'internet plan')
        || case when req.installation_location_type = 'other' and coalesce(req.installation_area, '') <> ''
                then ' at ' || req.installation_area else '' end,
      'Pending', req.id, 'installation',
      case when req.installation_location_type = 'other' then req.latitude else coalesce(req.latitude, cl.latitude) end,
      case when req.installation_location_type = 'other' then req.longitude else coalesce(req.longitude, cl.longitude) end
    )
    on conflict (service_request_id) where service_request_id is not null do nothing;
  end if;

  select email into v_email from auth.users where id = p_actor;
  insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values (
    sub.tenant_id, sub.client_id, coalesce(v_email, 'Unknown'), 'payment_verified',
    coalesce(sub.reference_number, ''),
    coalesce(pay.receipt_number, '') || ' / ' || sub.amount_claimed::text || ' / ' || coalesce(req.requested_plan, '')
  );

  return jsonb_build_object(
    'kind', 'plan',
    'payment_uuid', pay.id,
    'receipt_number', pay.receipt_number,
    'amount', sub.amount_claimed,
    'plan', req.requested_plan,
    'new_customer', v_new_customer,
    'customer_name', cl.customer_name,
    'customer_email', cl.email,
    'reference', sub.reference_number
  );
end;
$fn$;

create or replace function public.reject_payment_submission_as(
  p_submission_id uuid,
  p_actor uuid,
  p_reason text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  sub public.payment_submissions%rowtype;
  cl public.clients%rowtype;
  req public.service_requests%rowtype;
  v_bill_ref text;
  v_email text;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Choose a reason for rejecting this payment.';
  end if;

  select * into sub from public.payment_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Payment submission not found.';
  end if;

  if not public.actor_is_payment_staff(p_actor, sub.tenant_id) then
    raise exception 'Only accounting or admin staff can reject payments.';
  end if;

  if lower(coalesce(sub.status, 'pending')) <> 'pending' then
    raise exception 'This submission was already %.', lower(sub.status);
  end if;

  select * into cl from public.clients where id = sub.client_id;
  select * into req from public.service_requests where id = sub.service_request_id;
  select b.bill_id into v_bill_ref from public.billing b where b.id = sub.billing_id;

  update public.payment_submissions
  set status = 'Rejected', reviewed_at = now(), reviewed_by = p_actor,
      reject_reason = btrim(p_reason), reject_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = sub.id;

  -- A rejected plan application is closed; a rejected bill payment leaves the
  -- bill open so the customer can simply pay again.
  if sub.service_request_id is not null then
    update public.service_requests
    set status = 'Cancelled', updated_at = now()
    where id = sub.service_request_id;
  end if;

  select email into v_email from auth.users where id = p_actor;
  insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values (
    sub.tenant_id, sub.client_id, coalesce(v_email, 'Unknown'), 'payment_rejected',
    coalesce(sub.reference_number, ''),
    btrim(p_reason) || coalesce(' - ' || nullif(btrim(coalesce(p_note, '')), ''), '')
  );

  return jsonb_build_object(
    'kind', case when sub.billing_id is not null then 'bill' else 'plan' end,
    'status', 'Rejected',
    'amount', sub.amount_claimed,
    'plan', req.requested_plan,
    'bill_id', v_bill_ref,
    'customer_name', cl.customer_name,
    'customer_email', cl.email,
    'reference', sub.reference_number,
    'reason', btrim(p_reason),
    'note', nullif(btrim(coalesce(p_note, '')), '')
  );
end;
$fn$;

-- The customer hears about the result, including why a payment was refused.
create or replace function public.notify_payment_result()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $fn$
declare
  v_user uuid;
  v_old text := lower(coalesce(OLD.status, ''));
  v_new text := lower(coalesce(NEW.status, ''));
  v_title text;
  v_body text;
  v_secret text;
begin
  if v_old = v_new then
    return NEW;
  end if;

  if v_new ~ '(verif|approv)' then
    v_title := 'Payment verified';
    v_body := case when NEW.billing_id is not null
                   then 'Accounting verified your bill payment. Thank you!'
                   else 'Accounting verified your payment. Thank you!' end;
  elsif v_new ~ '(reject|declin)' then
    -- Withdrawing your own application is not news.
    if NEW.reject_reason = 'Withdrawn by customer' then
      return NEW;
    end if;
    v_title := 'Payment was not accepted';
    v_body := case when coalesce(NEW.reject_reason, '') <> ''
                   then 'Reason: ' || NEW.reject_reason || '. Open the app to submit it again.'
                   else 'Accounting could not verify your payment. Open the app to see why and submit it again.' end;
  else
    return NEW;
  end if;

  select coalesce(NEW.user_id, c.user_id) into v_user
  from (select 1) x left join public.clients c on c.id = NEW.client_id;
  if v_user is null then
    return NEW;
  end if;

  select secret into v_secret from public.push_config limit 1;

  perform net.http_post(
    url := 'https://ylqmsghxihtzbaqgkyxi.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('user_id', v_user, 'title', v_title, 'body', v_body)
  );
  return NEW;
exception when others then
  return NEW;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 9. Accounting records a walk-in / cash payment
-- ---------------------------------------------------------------------------
create or replace function public.record_payment_as(
  p_actor uuid,
  p_billing_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text default null,
  p_paid_on date default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_today date := public.today_ph();
  v_paid_on date := coalesce(p_paid_on, public.today_ph());
  v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  bill public.billing%rowtype;
  cl public.clients%rowtype;
  pay public.payments%rowtype;
  v_total numeric;
  v_paid numeric;
  v_remaining numeric;
  v_email text;
begin
  select * into bill from public.billing where id = p_billing_id for update;
  if not found then
    raise exception 'Bill not found.';
  end if;

  if not public.actor_is_payment_staff(p_actor, bill.tenant_id) then
    raise exception 'Only accounting or admin staff can record payments.';
  end if;

  select * into cl from public.clients where id = bill.client_id;
  if cl.user_id is not null and cl.user_id = p_actor then
    raise exception 'You cannot record a payment on your own account.';
  end if;

  if lower(coalesce(bill.status, '')) in ('cancelled', 'canceled', 'void', 'waived') then
    raise exception 'Bill % is no longer open (%).', bill.bill_id, bill.status;
  end if;

  if p_method not in ('Cash', 'GCash', 'Bank Transfer') then
    raise exception 'Choose how the customer paid.';
  end if;

  if p_method <> 'Cash' and v_ref is null then
    raise exception 'Enter the transaction reference number.';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Enter a valid amount (up to 2 decimals).';
  end if;

  if v_paid_on > v_today then
    raise exception 'The payment date cannot be in the future.';
  end if;
  if v_paid_on < v_today - 365 then
    raise exception 'The payment date is too far in the past.';
  end if;

  v_total := coalesce(bill.final_amount, bill.amount_due, bill.original_amount, 0);
  select coalesce(sum(amount_paid) filter (where amount_paid > 0), 0) into v_paid
  from public.payments where billing_id = bill.id;
  v_remaining := v_total - v_paid;

  if v_remaining <= 0 then
    raise exception 'Bill % is already fully paid.', bill.bill_id;
  end if;

  if p_amount > v_remaining then
    raise exception 'Only PHP % is left on bill %.', to_char(v_remaining, 'FM999,999,990.00'), bill.bill_id;
  end if;

  if public.reference_in_use(bill.tenant_id, v_ref) then
    raise exception 'Reference % is already on another payment.', v_ref;
  end if;

  -- A pending payment from the customer for the same bill would double count.
  if exists (select 1 from public.payment_submissions s
             where s.billing_id = bill.id and s.status = 'Pending') then
    raise exception 'The customer has a payment for this bill waiting in Payment verification. Verify or reject that one instead.';
  end if;

  insert into public.payments (
    tenant_id, client_id, billing_id, payment_id, receipt_number, amount_paid,
    payment_date, payment_method, reference_number, recorded_by
  ) values (
    bill.tenant_id, bill.client_id, bill.id,
    'PS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    'RCPT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    p_amount, v_paid_on, p_method, v_ref, p_actor
  )
  returning * into pay;

  perform public.refresh_disconnection_flag(cl.id);

  select email into v_email from auth.users where id = p_actor;
  insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values (
    bill.tenant_id, bill.client_id, coalesce(v_email, 'Unknown'), 'payment_recorded',
    coalesce(v_ref, p_method),
    pay.receipt_number || ' / ' || p_amount::text || ' / bill ' || coalesce(bill.bill_id, '')
      || coalesce(' / ' || v_note, '')
  );

  if cl.user_id is not null then
    perform public.team_push(
      cl.user_id,
      'Payment received',
      format('PHP %s was recorded for bill %s. Thank you!', to_char(p_amount, 'FM999,999,990.00'), coalesce(bill.bill_id, ''))
    );
  end if;

  return jsonb_build_object(
    'kind', 'bill',
    'payment_uuid', pay.id,
    'receipt_number', pay.receipt_number,
    'amount', p_amount,
    'bill_id', bill.bill_id,
    'remaining', v_remaining - p_amount,
    'customer_name', cl.customer_name,
    'customer_email', cl.email,
    'reference', v_ref,
    'method', p_method
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 10. Receipts show which bill they paid
-- ---------------------------------------------------------------------------
create or replace function public.get_receipt(p_payment_uuid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  pay public.payments%rowtype;
  c public.clients%rowtype;
  plan_label text;
  ref text;
  v_bill_ref text;
  v_start date;
  v_end date;
begin
  select * into pay from public.payments where id = p_payment_uuid;
  if not found then
    raise exception 'Receipt not found.';
  end if;

  select * into c from public.clients where id = pay.client_id;

  if not (c.user_id = auth.uid() or public.is_payment_staff(pay.tenant_id)) then
    raise exception 'You do not have access to this receipt.';
  end if;

  select sr.requested_plan into plan_label from public.service_requests sr where sr.id = pay.service_request_id;
  select s.reference_number into ref from public.payment_submissions s where s.payment_id = pay.id limit 1;
  select b.bill_id, b.billing_period_start, b.billing_period_end
    into v_bill_ref, v_start, v_end
  from public.billing b where b.id = pay.billing_id;

  return jsonb_build_object(
    'kind', case when pay.billing_id is not null then 'bill' else 'plan' end,
    'receipt_number', pay.receipt_number,
    'payment_id', pay.payment_id,
    'amount', pay.amount_paid,
    'method', pay.payment_method,
    'payment_date', pay.payment_date,
    'customer_name', c.customer_name,
    'account_id', c.account_id,
    'plan', coalesce(plan_label, c.plan_name),
    'reference', coalesce(pay.reference_number, ref),
    'bill_id', v_bill_ref,
    'period_start', v_start,
    'period_end', v_end
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 11. Daily automation: plan changes switch on time, reminders quote the
--     remaining balance, new bills reach the customer's phone
-- ---------------------------------------------------------------------------
create or replace function public.activate_due_scheduled_plan_changes()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_count integer := 0;
  v_request public.service_requests%rowtype;
  v_plan_id uuid;
  v_service public.client_services%rowtype;
  v_total_paid numeric := 0;
  v_user uuid;
begin
  for v_request in
    select sr.*
    from public.service_requests sr
    where sr.request_type = 'plan_change'
      and lower(coalesce(sr.status, '')) = 'scheduled'
      and sr.effective_at is not null
      and sr.effective_at <= now()
    order by sr.effective_at asc
    for update skip locked
  loop
    if v_request.requested_plan is null
       or v_request.requested_amount is null
       or v_request.requested_amount <= 0 then
      continue;
    end if;

    select coalesce(sum(case when p.amount_paid > 0 then p.amount_paid else 0 end), 0)
    into v_total_paid
    from public.payments p
    where p.service_request_id = v_request.id;

    if v_total_paid < v_request.requested_amount then
      continue;
    end if;

    select ip.id into v_plan_id
    from public.internet_plans ip
    where ip.tenant_id = (select c.tenant_id from public.clients c where c.id = v_request.client_id)
      and ip.plan_name = v_request.requested_plan
      and ip.active = true
    limit 1;

    if v_plan_id is null then
      continue;
    end if;

    select * into v_service
    from public.client_services cs
    where cs.client_id = v_request.client_id
    order by cs.created_at desc
    limit 1
    for update;

    if not found then
      continue;
    end if;

    update public.client_services
    set plan_id = v_plan_id, status = 'active', started_at = coalesce(started_at, now()),
        ended_at = null, updated_at = now()
    where id = v_service.id;

    update public.clients set plan_name = v_request.requested_plan where id = v_request.client_id;

    update public.service_requests set status = 'Completed', updated_at = now() where id = v_request.id;

    select user_id into v_user from public.clients where id = v_request.client_id;
    if v_user is not null then
      perform public.team_push(v_user, 'Your new plan is active', format('You are now on %s. Thank you!', v_request.requested_plan));
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$fn$;

create or replace function public.pending_billing_reminders()
returns table (billing_id uuid, kind text, customer_name text, customer_email text, amount numeric, due_date date, bill_ref text)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select * from (
    select
      b.id as billing_id,
      case
        when b.due_date = current_date + 5 then 'due5'
        when b.due_date = current_date then 'due0'
        when b.due_date = current_date - 1 then 'late1'
        when b.due_date = current_date - 7 then 'late7'
      end as kind,
      c.customer_name, c.email as customer_email,
      greatest(
        coalesce(b.final_amount, b.amount_due, b.original_amount, 0)
          - coalesce((select sum(p.amount_paid) from public.payments p where p.billing_id = b.id and p.amount_paid > 0), 0),
        0
      ) as amount,
      b.due_date, b.bill_id as bill_ref
    from public.billing b
    join public.clients c on c.id = b.client_id
    where lower(coalesce(b.status, '')) in ('unpaid', 'partially paid', 'overdue', 'pending')
      and c.email is not null
  ) r
  where r.kind is not null
    and r.amount > 0
    and not exists (
      select 1 from public.billing_reminders_sent s where s.billing_id = r.billing_id and s.kind = r.kind
    );
$fn$;

create or replace function public.run_billing_automation(p_flag_after_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_activated integer := 0;
  v_generated integer := 0;
  v_overdue integer := 0;
  v_flagged integer := 0;
  v_unflagged integer := 0;
  v_released integer := 0;
  v_new jsonb;
  r record;
begin
  -- Same per-tenant lock the other bill generator takes, so two runs (or a run
  -- and a manual generation) can never hand out the same bill number.
  for r in select id from public.tenants loop
    perform pg_advisory_xact_lock(hashtextextended('billing-number:' || r.id::text, 0));
  end loop;

  -- Paid plan changes whose period has ended switch first, so this cycle's bill
  -- uses the new plan's price.
  v_activated := public.activate_due_scheduled_plan_changes();

  with due_cycles as (
    select
      c.id as client_id,
      c.tenant_id,
      ip.price,
      case
        when current_date >= make_date(extract(year from current_date)::int, extract(month from current_date)::int,
               least(coalesce(c.billing_day, extract(day from c.install_date)::int, 1), 28))
        then make_date(extract(year from current_date)::int, extract(month from current_date)::int,
               least(coalesce(c.billing_day, extract(day from c.install_date)::int, 1), 28))
        else (make_date(extract(year from current_date)::int, extract(month from current_date)::int,
               least(coalesce(c.billing_day, extract(day from c.install_date)::int, 1), 28)) - interval '1 month')::date
      end as cycle_start
    from public.clients c
    join public.internet_plans ip
      on ip.tenant_id = c.tenant_id and ip.plan_name = c.plan_name and ip.active = true
    where lower(coalesce(c.account_status, '')) = 'active'
      and lower(coalesce(c.installation_status, '')) in ('installed', 'completed', 'done')
      and c.install_date is not null
  ), todo as (
    select
      d.tenant_id, d.client_id, d.price, d.cycle_start,
      row_number() over (partition by d.tenant_id order by d.client_id) as rn
    from due_cycles d
    join public.clients c on c.id = d.client_id
    where d.cycle_start > c.install_date
      and not exists (
        select 1 from public.billing b
        where b.client_id = d.client_id and b.billing_period_start = d.cycle_start
      )
  ), ins as (
    insert into public.billing (
      tenant_id, client_id, bill_id, status, bill_type, bill_date, due_date,
      amount_due, original_amount, final_amount, billing_cycle,
      billing_period_start, billing_period_end
    )
    select
      t.tenant_id, t.client_id,
      -- Sequential per tenant (SAM-00012), never a guess that two customers
      -- could share: a clash used to stop the whole day's billing run.
      'SAM-' || lpad((
        coalesce((
          select max(substring(b.bill_id from 5)::bigint)
          from public.billing b
          where b.tenant_id = t.tenant_id and b.bill_id ~ '^SAM-[0-9]+$'
        ), 0) + t.rn
      )::text, 5, '0'),
      'Unpaid', 'Monthly', t.cycle_start, (t.cycle_start + 7),
      t.price, t.price, t.price, 'Monthly',
      t.cycle_start, (t.cycle_start + interval '1 month' - interval '1 day')::date
    from todo t
    returning client_id, bill_id, due_date, amount_due
  )
  select coalesce(jsonb_agg(to_jsonb(ins)), '[]'::jsonb) into v_new from ins;

  v_generated := jsonb_array_length(v_new);

  -- Tell each customer their new bill is ready (best effort).
  for r in
    select x.bill_id, x.due_date, x.amount_due, c.user_id
    from jsonb_to_recordset(v_new) as x(client_id uuid, bill_id text, due_date date, amount_due numeric)
    join public.clients c on c.id = x.client_id
  loop
    if r.user_id is not null then
      perform public.team_push(
        r.user_id,
        'Your new bill is ready',
        format('Bill %s: PHP %s, due %s. Pay in the app under Plan & Bills.',
               r.bill_id, to_char(r.amount_due, 'FM999,999,990.00'), to_char(r.due_date, 'Mon FMDD'))
      );
    end if;
  end loop;

  update public.billing
  set status = 'Overdue'
  where lower(coalesce(status, '')) in ('unpaid', 'partially paid', 'pending')
    and due_date is not null
    and due_date < current_date;
  get diagnostics v_overdue = row_count;

  update public.clients c
  set disconnection_flag = true, disconnection_flagged_at = now()
  where c.disconnection_flag = false
    and exists (
      select 1 from public.billing b
      where b.client_id = c.id
        and lower(coalesce(b.status, '')) = 'overdue'
        and b.due_date < current_date - p_flag_after_days
    );
  get diagnostics v_flagged = row_count;

  update public.clients c
  set disconnection_flag = false, disconnection_flagged_at = null
  where c.disconnection_flag = true
    and not exists (
      select 1 from public.billing b
      where b.client_id = c.id
        and lower(coalesce(b.status, '')) = 'overdue'
        and b.due_date < current_date - p_flag_after_days
    );
  get diagnostics v_unflagged = row_count;

  v_released := public.release_stale_jobs();

  return jsonb_build_object(
    'plans_activated', v_activated, 'generated', v_generated, 'overdue', v_overdue,
    'flagged', v_flagged, 'unflagged', v_unflagged, 'released_jobs', v_released
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 12. Who may call what
-- ---------------------------------------------------------------------------
revoke all on function public.today_ph() from public, anon;
grant execute on function public.today_ph() to authenticated, service_role;

revoke all on function public.submit_bill_payment(uuid, numeric, text, text, text, text, date, text) from public, anon;
grant execute on function public.submit_bill_payment(uuid, numeric, text, text, text, text, date, text) to authenticated, service_role;

revoke all on function public.reference_in_use(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.reference_in_use(uuid, text, uuid) to service_role;

revoke all on function public.list_plans() from public, anon;
grant execute on function public.list_plans() to authenticated, service_role;

revoke all on function public.record_payment_as(uuid, uuid, numeric, text, text, date, text) from public, anon, authenticated;
grant execute on function public.record_payment_as(uuid, uuid, numeric, text, text, date, text) to service_role;

revoke all on function public.refresh_disconnection_flag(uuid, integer) from public, anon, authenticated;
grant execute on function public.refresh_disconnection_flag(uuid, integer) to service_role;

revoke all on function public.activate_due_scheduled_plan_changes() from public, anon, authenticated;
grant execute on function public.activate_due_scheduled_plan_changes() to service_role;

-- Supabase's defaults give signed-in users every privilege on new views; the
-- balances view is read-only.
revoke all on public.billing_balances from public, anon, authenticated;
grant select on public.billing_balances to authenticated, service_role;
