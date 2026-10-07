-- Accounting, technician assignment and billing automation.
--
--   1. payment approvals/rejections as server-only functions (reasons, audit,
--      no self-approval, amount + reference checks, "For installation" flow)
--   2. technician jobs: GPS on reports, nearest-first data, max 3 active jobs,
--      24h auto-release, name + phone for the customer, live location
--   3. installation done -> account Active + account id
--   4. billing automation: monthly bills, overdue, disconnection flag, reminders
--   5. customer guard on clients, receipt function, daily schedules

-- ---------------------------------------------------------------- columns
alter table public.payment_submissions
  add column if not exists reject_reason text,
  add column if not exists reject_note text;

alter table public.repair_records
  add column if not exists job_type text not null default 'repair',
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists accepted_at timestamptz,
  add column if not exists technician_phone text;

do $$
begin
  alter table public.repair_records
    add constraint repair_records_job_type_check check (job_type in ('repair', 'installation'));
exception when duplicate_object then null;
end $$;

alter table public.service_requests
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.clients
  add column if not exists disconnection_flag boolean not null default false,
  add column if not exists disconnection_flagged_at timestamptz;

create sequence if not exists public.client_account_seq;

-- ------------------------------------------------- technician live location
create table if not exists public.technician_locations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  updated_at timestamptz not null default now()
);
alter table public.technician_locations enable row level security;

drop policy if exists "technicians insert own location" on public.technician_locations;
create policy "technicians insert own location" on public.technician_locations
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "technicians update own location" on public.technician_locations;
create policy "technicians update own location" on public.technician_locations
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "technicians read own location" on public.technician_locations;
create policy "technicians read own location" on public.technician_locations
  for select to authenticated using (user_id = auth.uid());

-- A customer sees the location of the technician working their open job, and only that.
drop policy if exists "customers read assigned technician location" on public.technician_locations;
create policy "customers read assigned technician location" on public.technician_locations
  for select to authenticated using (
    exists (
      select 1
      from public.repair_records r
      join public.clients c on c.id = r.client_id
      where r.technician_user_id = technician_locations.user_id
        and c.user_id = auth.uid()
        and lower(r.status) !~ '(complete|resolved|done|fixed|cancel)'
    )
  );

drop policy if exists "admins read technician locations" on public.technician_locations;
create policy "admins read technician locations" on public.technician_locations
  for select to authenticated using (
    exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.role = 'admin')
  );

-- ---------------------------------------------------------- staff helpers
create or replace function public.is_payment_staff(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_is_global_admin()
      or exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid()
          and tu.tenant_id = target_tenant_id
          and tu.role in ('admin', 'accounting')
      );
$$;
grant execute on function public.is_payment_staff(uuid) to authenticated;

create or replace function public.actor_is_payment_staff(p_actor uuid, p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_users tu
    where tu.user_id = p_actor
      and tu.tenant_id = p_tenant
      and tu.role in ('admin', 'accounting')
  );
$$;
revoke execute on function public.actor_is_payment_staff(uuid, uuid) from public, anon, authenticated;
grant execute on function public.actor_is_payment_staff(uuid, uuid) to service_role;

-- ------------------------------------------------------ approve a payment
-- Called only by the web server (service role) after it has checked the
-- accountant's session and, for large amounts, their secondary password.
create or replace function public.verify_payment_submission_as(p_submission_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sub public.payment_submissions%rowtype;
  req public.service_requests%rowtype;
  cl public.clients%rowtype;
  pay public.payments%rowtype;
  v_email text;
  v_new_customer boolean;
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

  if sub.client_id is null or sub.service_request_id is null then
    raise exception 'This submission is missing its client or plan application.';
  end if;

  select * into cl from public.clients where id = sub.client_id;
  select * into req from public.service_requests where id = sub.service_request_id;

  if sub.user_id = p_actor or cl.user_id = p_actor then
    raise exception 'You cannot approve a payment for your own account.';
  end if;

  if lower(coalesce(req.status, '')) in ('cancelled', 'canceled', 'completed', 'for installation') then
    raise exception 'This plan application is no longer open (%).', req.status;
  end if;

  if coalesce(req.requested_amount, 0) > 0 and sub.amount_claimed <> req.requested_amount then
    raise exception 'Amount mismatch: the customer entered % but % costs %. Reject it and ask them to pay the exact amount.',
      sub.amount_claimed, req.requested_plan, req.requested_amount;
  end if;

  if coalesce(btrim(sub.reference_number), '') <> '' and exists (
    select 1 from public.payment_submissions o
    where o.id <> sub.id
      and o.tenant_id = sub.tenant_id
      and o.status = 'Verified'
      and lower(btrim(o.reference_number)) = lower(btrim(sub.reference_number))
  ) then
    raise exception 'Reference % was already verified on another payment (a reused receipt?).', sub.reference_number;
  end if;

  v_new_customer :=
    lower(coalesce(cl.account_status, '')) <> 'active'
    and lower(coalesce(cl.installation_status, 'pending')) not in ('installed', 'completed', 'done');

  -- The plan trigger needs a service record to attach the plan to.
  if not exists (select 1 from public.client_services where client_id = cl.id) then
    insert into public.client_services (tenant_id, client_id, status, installation_status)
    values (cl.tenant_id, cl.id, 'pending', case when v_new_customer then 'For installation' else cl.installation_status end);
  end if;

  -- Existing triggers record the payment (receipt number) and activate the plan.
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
      cl.id, current_date, 'New installation: ' || coalesce(req.requested_plan, 'internet plan'),
      'Pending', req.id, 'installation',
      coalesce(req.latitude, cl.latitude), coalesce(req.longitude, cl.longitude)
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
$$;
revoke execute on function public.verify_payment_submission_as(uuid, uuid) from public, anon, authenticated;
grant execute on function public.verify_payment_submission_as(uuid, uuid) to service_role;

-- ------------------------------------------------------- reject a payment
create or replace function public.reject_payment_submission_as(
  p_submission_id uuid, p_actor uuid, p_reason text, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sub public.payment_submissions%rowtype;
  cl public.clients%rowtype;
  req public.service_requests%rowtype;
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

  update public.payment_submissions
  set status = 'Rejected', reviewed_at = now(), reviewed_by = p_actor,
      reject_reason = btrim(p_reason), reject_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = sub.id;

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
    'status', 'Rejected',
    'amount', sub.amount_claimed,
    'plan', req.requested_plan,
    'customer_name', cl.customer_name,
    'customer_email', cl.email,
    'reference', sub.reference_number,
    'reason', btrim(p_reason),
    'note', nullif(btrim(coalesce(p_note, '')), '')
  );
end;
$$;
revoke execute on function public.reject_payment_submission_as(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.reject_payment_submission_as(uuid, uuid, text, text) to service_role;

-- Approvals and rejections must go through the functions above (server only).
drop policy if exists "payment_submissions_staff_update" on public.payment_submissions;

-- A withdrawn application closes its pending submission, with a reason.
create or replace function public.plan_application_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(NEW.status, '')) in ('cancelled', 'canceled')
     and lower(coalesce(OLD.status, '')) not in ('cancelled', 'canceled') then
    update public.payment_submissions
    set status = 'Rejected', reviewed_at = now(), reject_reason = 'Withdrawn by customer'
    where service_request_id = NEW.id and status = 'Pending';
  end if;
  return NEW;
end;
$$;

-- ----------------------------------------------------- receipts for the app
create or replace function public.get_receipt(p_payment_uuid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pay public.payments%rowtype;
  c public.clients%rowtype;
  plan_label text;
  ref text;
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

  return jsonb_build_object(
    'receipt_number', pay.receipt_number,
    'payment_id', pay.payment_id,
    'amount', pay.amount_paid,
    'method', pay.payment_method,
    'payment_date', pay.payment_date,
    'customer_name', c.customer_name,
    'account_id', c.account_id,
    'plan', coalesce(plan_label, c.plan_name),
    'reference', ref
  );
end;
$$;
grant execute on function public.get_receipt(uuid) to authenticated;

-- -------------------------------------------------------- technician jobs
-- Customer issue -> repair record, now carrying the GPS the customer sent.
create or replace function public.repair_request_to_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.request_type = 'repair' and NEW.client_id is not null then
    insert into public.repair_records (client_id, repair_date, problem_description, status, service_request_id, job_type, latitude, longitude)
    values (
      NEW.client_id, current_date,
      btrim(coalesce(NEW.issue_type, 'Issue') || case when coalesce(btrim(NEW.description), '') <> '' then ': ' || btrim(NEW.description) else '' end),
      'Pending', NEW.id, 'repair', NEW.latitude, NEW.longitude
    );
  end if;
  return NEW;
end;
$$;

-- Accepting a job: max 3 active jobs, remember when, and give the customer the
-- technician's name and phone. Releasing a job clears them again.
create or replace function public.repair_record_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_phone text;
  v_active int;
begin
  if OLD.technician_user_id is null and NEW.technician_user_id is not null then
    select count(*) into v_active
    from public.repair_records r
    where r.technician_user_id = NEW.technician_user_id
      and r.id <> NEW.id
      and lower(r.status) !~ '(complete|resolved|done|fixed|cancel)';

    if v_active >= 3 then
      raise exception 'You already have 3 active jobs. Finish one before accepting another.';
    end if;

    select full_name, mobile_number into v_name, v_phone
    from public.user_profiles where user_id = NEW.technician_user_id;

    NEW.accepted_at := now();
    NEW.technician := coalesce(NEW.technician, v_name, 'Technician');
    NEW.technician_phone := v_phone;
  elsif OLD.technician_user_id is not null and NEW.technician_user_id is null then
    NEW.accepted_at := null;
    NEW.technician := null;
    NEW.technician_phone := null;
  end if;
  return NEW;
end;
$$;

-- Not started within 24 hours -> back to the open list for everyone.
create or replace function public.release_stale_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.repair_records
  set technician_user_id = null, status = 'Pending'
  where technician_user_id is not null
    and accepted_at is not null
    and accepted_at < now() - interval '24 hours'
    and lower(status) in ('assigned', 'accepted');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.release_stale_jobs() from public, anon, authenticated;
grant execute on function public.release_stale_jobs() to service_role;

-- Installation finished -> the account becomes Active and gets an account id.
create or replace function public.installation_job_done()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_done constant text := '(complete|resolved|done|fixed)';
  v_tenant uuid;
  v_email text;
begin
  if NEW.job_type = 'installation'
     and lower(coalesce(NEW.status, '')) ~ v_done
     and lower(coalesce(OLD.status, '')) !~ v_done then

    perform set_config('app.bypass_client_guard', 'on', true);

    update public.clients
    set installation_status = 'Installed',
        account_status = 'Active',
        install_date = coalesce(install_date, current_date),
        account_id = coalesce(nullif(account_id, ''), 'PKC-' || lpad(nextval('public.client_account_seq')::text, 5, '0')),
        technicians = coalesce(nullif(technicians, ''), NEW.technician)
    where id = NEW.client_id
    returning tenant_id into v_tenant;

    update public.client_services
    set installation_status = 'Installed',
        install_date = coalesce(install_date, current_date),
        technician_user_id = coalesce(technician_user_id, NEW.technician_user_id),
        status = 'active',
        started_at = coalesce(started_at, now()),
        updated_at = now()
    where client_id = NEW.client_id;

    perform set_config('app.bypass_client_guard', 'off', true);

    select email into v_email from auth.users where id = NEW.technician_user_id;
    insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
    values (v_tenant, NEW.client_id, coalesce(v_email, 'Unknown'), 'installation_completed', '', coalesce(NEW.problem_description, ''));
  end if;
  return NEW;
end;
$$;

drop trigger if exists installation_job_done_after on public.repair_records;
create trigger installation_job_done_after
  after update of status on public.repair_records
  for each row execute function public.installation_job_done();

-- ------------------------------------------------- client edit protection
-- Admins edit freely. Technicians only installation/location fields. Customers
-- only their own contact and location details (never plan or account status).
create or replace function public.guard_technician_client_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return NEW;
  end if;

  if coalesce(current_setting('app.bypass_client_guard', true), '') = 'on' then
    return NEW;
  end if;

  if public.user_is_global_admin() then
    return NEW;
  end if;

  if exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = OLD.tenant_id and tu.role = 'admin'
  ) then
    return NEW;
  end if;

  if exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = OLD.tenant_id and tu.role = 'technician'
  ) then
    if (to_jsonb(NEW) - array['installation_status', 'latitude', 'longitude', 'map_location'])
       is distinct from
       (to_jsonb(OLD) - array['installation_status', 'latitude', 'longitude', 'map_location']) then
      raise exception 'Technicians can only change installation status and location fields.';
    end if;
    return NEW;
  end if;

  if OLD.user_id = auth.uid() then
    if (to_jsonb(NEW) - array['mobile_number', 'latitude', 'longitude', 'map_location', 'address'])
       is distinct from
       (to_jsonb(OLD) - array['mobile_number', 'latitude', 'longitude', 'map_location', 'address']) then
      raise exception 'You can only change your contact and location details.';
    end if;
  end if;

  return NEW;
end;
$$;

-- ------------------------------------------------------ billing automation
create table if not exists public.billing_reminders_sent (
  billing_id uuid not null,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (billing_id, kind)
);
alter table public.billing_reminders_sent enable row level security;

create or replace function public.run_billing_automation(p_flag_after_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_generated integer := 0;
  v_overdue integer := 0;
  v_flagged integer := 0;
  v_unflagged integer := 0;
  v_released integer := 0;
begin
  -- 1. One bill per customer per month, starting one month after installation
  --    (the plan application payment covers the first month).
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
  ), ins as (
    insert into public.billing (
      tenant_id, client_id, bill_id, status, bill_type, bill_date, due_date,
      amount_due, original_amount, final_amount, billing_cycle,
      billing_period_start, billing_period_end
    )
    select
      d.tenant_id, d.client_id,
      'BILL-' || to_char(d.cycle_start, 'YYYYMM') || '-' || upper(substr(replace(d.client_id::text, '-', ''), 1, 6)),
      'Unpaid', 'Monthly', d.cycle_start, (d.cycle_start + 7),
      d.price, d.price, d.price, 'Monthly',
      d.cycle_start, (d.cycle_start + interval '1 month' - interval '1 day')::date
    from due_cycles d
    join public.clients c on c.id = d.client_id
    where d.cycle_start > c.install_date
      and not exists (
        select 1 from public.billing b
        where b.client_id = d.client_id and b.billing_period_start = d.cycle_start
      )
    returning 1
  )
  select count(*) into v_generated from ins;

  -- 2. Overdue
  update public.billing
  set status = 'Overdue'
  where lower(coalesce(status, '')) in ('unpaid', 'partially paid', 'pending')
    and due_date is not null
    and due_date < current_date;
  get diagnostics v_overdue = row_count;

  -- 3. Flag for disconnection (a flag for staff only; service is never cut automatically)
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

  -- 4. Jobs nobody started
  v_released := public.release_stale_jobs();

  return jsonb_build_object(
    'generated', v_generated, 'overdue', v_overdue,
    'flagged', v_flagged, 'unflagged', v_unflagged, 'released_jobs', v_released
  );
end;
$$;
revoke execute on function public.run_billing_automation(integer) from public, anon, authenticated;
grant execute on function public.run_billing_automation(integer) to service_role;

-- Reminder emails still to send: 5 days before, on the due date, 1 and 7 days late.
create or replace function public.pending_billing_reminders()
returns table (
  billing_id uuid, kind text, customer_name text, customer_email text,
  amount numeric, due_date date, bill_ref text
)
language sql
stable
security definer
set search_path = public
as $$
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
      coalesce(b.final_amount, b.amount_due, b.original_amount, 0) as amount,
      b.due_date, b.bill_id as bill_ref
    from public.billing b
    join public.clients c on c.id = b.client_id
    where lower(coalesce(b.status, '')) in ('unpaid', 'partially paid', 'overdue', 'pending')
      and c.email is not null
  ) r
  where r.kind is not null
    and not exists (
      select 1 from public.billing_reminders_sent s where s.billing_id = r.billing_id and s.kind = r.kind
    );
$$;
revoke execute on function public.pending_billing_reminders() from public, anon, authenticated;
grant execute on function public.pending_billing_reminders() to service_role;

-- --------------------------------------------------------- daily schedules
do $$
begin
  create extension if not exists pg_cron with schema extensions;

  perform cron.unschedule(jobid) from cron.job where jobname in ('pkc-billing-daily', 'pkc-release-stale-jobs');
  perform cron.schedule('pkc-billing-daily', '10 0 * * *', 'select public.run_billing_automation()');
  perform cron.schedule('pkc-release-stale-jobs', '*/30 * * * *', 'select public.release_stale_jobs()');
exception when others then
  raise notice 'pg_cron schedules were not created: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
