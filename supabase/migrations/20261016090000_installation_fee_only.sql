-- A new customer pays only the one-time installation fee when applying. The
-- subscription is postpaid: it is billed on the fixed schedule (1st, due the
-- last day of the month) after installation, not collected up front.
-- The fee is a per-business setting that admin and accounting can change.

alter table public.tenants
  add column if not exists install_fee numeric not null default 750 check (install_fee > 0 and install_fee <= 100000);

-- The fee for one business (750 when nothing is set).
create or replace function public.install_fee(p_tenant uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$ select coalesce((select t.install_fee from public.tenants t where t.id = p_tenant), 750::numeric) $$;

-- The fee the signed-in customer or staff member should see.
create or replace function public.get_install_fee()
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.install_fee(coalesce(
    (select c.tenant_id from public.clients c where c.user_id = auth.uid() limit 1),
    (select tu.tenant_id from public.tenant_users tu where tu.user_id = auth.uid() limit 1)
  ))
$$;

revoke all on function public.install_fee(uuid) from public, anon, authenticated;
revoke all on function public.get_install_fee() from public, anon;
-- install_fee(uuid) takes any tenant id, so signed-in users cannot call it directly; they use
-- get_install_fee(), which looks up their own business, and the security-definer functions run as owner.
grant execute on function public.install_fee(uuid) to service_role;
grant execute on function public.get_install_fee() to authenticated, service_role;

-- Preserve the original app RPC used by already-installed mobile builds. It has no
-- tenant argument and resolves only the signed-in user's own tenant fee.
create or replace function public.install_fee()
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$ select public.get_install_fee() $$;
revoke all on function public.install_fee() from public, anon;
grant execute on function public.install_fee() to authenticated, service_role;

create or replace function public.submit_plan_purchase_v2(
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
  v_new_customer boolean;
  v_expected numeric;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  select c.tenant_id, c.plan_name,
         lower(coalesce(c.account_status, '')) <> 'active'
           and lower(coalesce(c.installation_status, 'pending')) not in ('installed', 'completed', 'done')
  into v_tenant_id, v_current_plan, v_new_customer
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

  -- A new customer pays only the one-time installation fee; the plan is billed later on the schedule.
  v_expected := case when v_new_customer then public.install_fee(v_tenant_id) else v_plan_price end;
  if p_amount is null or p_amount <> v_expected then
    raise exception 'Payment amount does not match the selected plan (it should be %).', v_expected;
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
    v_user_id, p_client_id, 'plan_change', p_requested_plan, v_expected,
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

-- Plan changes for existing customers (plan price only). New customers must use
-- submit_plan_purchase_v2; older app builds that still send the first month plus
-- the fee are told to update.
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
  v_new_customer boolean;
  v_expected numeric;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  select c.tenant_id, c.plan_name,
         lower(coalesce(c.account_status, '')) <> 'active'
           and lower(coalesce(c.installation_status, 'pending')) not in ('installed', 'completed', 'done')
  into v_tenant_id, v_current_plan, v_new_customer
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

  if v_new_customer then
    raise exception 'Please update the PKC app to apply. New customers now pay only the installation fee.';
  end if;

  v_expected := v_plan_price;
  if p_amount is null or p_amount <> v_expected then
    raise exception 'Payment amount does not match the selected plan (it should be %).', v_expected;
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
    v_user_id, p_client_id, 'plan_change', p_requested_plan, v_expected,
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

revoke execute on function public.submit_plan_purchase(uuid, text, numeric, text, text, text, text, text, text, text, date, text, uuid) from public, anon;
grant execute on function public.submit_plan_purchase(uuid, text, numeric, text, text, text, text, text, text, text, date, text, uuid) to authenticated, service_role;
revoke execute on function public.submit_plan_purchase_v2(uuid, text, numeric, text, text, text, text, text, text, text, date, text, uuid) from public, anon;
grant execute on function public.submit_plan_purchase_v2(uuid, text, numeric, text, text, text, text, text, text, text, date, text, uuid) to authenticated, service_role;
