-- New customers pay the plan and the installation fee together; after the
-- technician finishes, the customer signs (on the spot, or later in the app
-- when nobody is home) and only then is the account ready to use.

-- One place for the one-time installation fee (pesos).
create or replace function public.install_fee()
returns numeric
language sql
immutable
as $$ select 750::numeric $$;

grant execute on function public.install_fee() to authenticated;

alter table public.repair_records
  add column if not exists signature_requested_at timestamptz,
  add column if not exists customer_signed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 1. Plan application: first month + installation fee for a new customer
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

  -- A new customer pays the first month together with the one-time installation fee.
  v_expected := v_plan_price + case when v_new_customer then public.install_fee() else 0 end;
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

-- ---------------------------------------------------------------------------
-- 2. The customer is told when the request reaches the technicians
-- ---------------------------------------------------------------------------
create or replace function public.notify_installation_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
begin
  if NEW.job_type = 'installation' then
    select user_id into v_customer from public.clients where id = NEW.client_id;
    if v_customer is not null then
      perform public.team_push(
        v_customer,
        'Request sent to the technicians',
        'Your payment is confirmed and your installation request is now with our technicians. Please wait a short while for one to accept it.'
      );
    end if;
  end if;
  return NEW;
exception when others then
  return NEW;
end;
$$;

drop trigger if exists repair_installation_open_notice on public.repair_records;
create trigger repair_installation_open_notice
  after insert on public.repair_records
  for each row execute function public.notify_installation_open();

-- ---------------------------------------------------------------------------
-- 3. Customer not at home: the technician asks them to sign in the app
-- ---------------------------------------------------------------------------
create or replace function public.request_customer_signature(
  p_repair uuid,
  p_resolution text default null,
  p_checklist jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.repair_records%rowtype;
  v_customer uuid;
begin
  select * into r from public.repair_records where id = p_repair for update;
  if r.id is null or r.technician_user_id is distinct from auth.uid() then
    raise exception 'Only the technician who took this job can ask for a signature.';
  end if;
  if lower(r.status) ~ '(complete|resolved|done|fixed|cancel)' then
    raise exception 'This job is already finished.';
  end if;
  if not exists (select 1 from public.repair_photos where repair_id = p_repair and photo_type = 'after') then
    raise exception 'Add the after photo first, so the customer can see the finished work.';
  end if;

  update public.repair_records
  set status = 'Awaiting signature',
      signature_requested_at = now(),
      resolution = coalesce(p_resolution, resolution),
      checklist = coalesce(p_checklist, checklist)
  where id = p_repair;

  select user_id into v_customer from public.clients where id = r.client_id;
  if v_customer is not null then
    begin
      perform public.team_push(
        v_customer,
        'Please sign off your ' || case when r.job_type = 'installation' then 'installation' else 'repair' end,
        'Your technician finished the work. Open the app, check the before and after photos, and sign to confirm.'
      );
    exception when others then
      null;
    end;
  end if;
end;
$$;

revoke execute on function public.request_customer_signature(uuid, text, jsonb) from public, anon;
grant execute on function public.request_customer_signature(uuid, text, jsonb) to authenticated;

-- The technician changed their mind (for example the customer came home).
create or replace function public.cancel_signature_request(p_repair uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.repair_records
  set status = 'In Progress', signature_requested_at = null
  where id = p_repair
    and technician_user_id = auth.uid()
    and lower(status) = 'awaiting signature';
  if not found then
    raise exception 'This job is not waiting for a signature.';
  end if;
end;
$$;

revoke execute on function public.cancel_signature_request(uuid) from public, anon;
grant execute on function public.cancel_signature_request(uuid) to authenticated;

-- The customer signs. The signature file is already in storage (their own
-- folder, only while the job waits for it); this records it and finishes the
-- job, which makes the account Active.
create or replace function public.sign_off_job(p_repair uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.repair_records%rowtype;
  v_owner uuid;
begin
  select * into r from public.repair_records where id = p_repair for update;
  if r.id is null then
    raise exception 'Job not found.';
  end if;
  select user_id into v_owner from public.clients where id = r.client_id;
  if v_owner is distinct from auth.uid() then
    raise exception 'This job is not on your account.';
  end if;
  if lower(r.status) <> 'awaiting signature' then
    raise exception 'This job is not waiting for your signature.';
  end if;
  if p_path is null or p_path !~ ('^jobs/' || r.client_id::text || '/' || r.id::text || '/signature-[^/]+$') then
    raise exception 'That signature file does not belong to this job.';
  end if;

  insert into public.repair_photos (repair_id, photo_type, storage_path)
  values (p_repair, 'signature', p_path);

  update public.repair_records
  set status = 'Completed', customer_signed_at = now()
  where id = p_repair;

  if r.technician_user_id is not null then
    begin
      perform public.team_push(
        r.technician_user_id,
        'Customer signed',
        coalesce((select customer_name from public.clients where id = r.client_id), 'The customer') || ' signed off the job.'
      );
    exception when others then
      null;
    end;
  end if;
end;
$$;

revoke execute on function public.sign_off_job(uuid, text) from public, anon;
grant execute on function public.sign_off_job(uuid, text) to authenticated;

-- The customer may upload the signature file for their own job, only while
-- that job waits for it.
drop policy if exists client_media_customer_signature on storage.objects;
create policy client_media_customer_signature on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'client-media'
    and (storage.foldername(name))[1] = 'jobs'
    and name ~ '/signature-[^/]+$'
    and exists (
      select 1
      from public.clients c
      join public.repair_records r on r.client_id = c.id
      where c.user_id = (select auth.uid())
        and c.id::text = (storage.foldername(name))[2]
        and r.id::text = (storage.foldername(name))[3]
        and lower(r.status) = 'awaiting signature'
    )
  );
