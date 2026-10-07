-- Connects the mobile app's two customer flows to the staff side.
-- NOT YET APPLIED. Paste into the Supabase SQL editor and run once.
--
--   1. New customer signups get a client record (nothing created one before),
--      via ensure_customer_client(), which the mobile app calls after login.
--   2. A plan application (service_requests.request_type = 'plan_change') also
--      creates a payment_submissions row, which is what the web Accounting
--      verification page reads. Withdrawing the application rejects it.
--   3. A customer issue (request_type = 'repair') also creates a repair_records
--      row. Technicians of that tenant can see unassigned issues and accept
--      them; the customer's request status follows the repair status.

-- 1. Client record for new customer signups.
create or replace function public.ensure_customer_client()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_role text;
  v_email text;
  up public.user_profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select id into v_id from public.clients where user_id = v_uid limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select role into v_role from public.profiles where id = v_uid;
  if coalesce(v_role, 'customer') <> 'customer' then
    return null;
  end if;

  select email into v_email from auth.users where id = v_uid;
  select * into up from public.user_profiles where user_id = v_uid;

  insert into public.clients (
    tenant_id, user_id, customer_name, email, mobile_number,
    area, address, account_status, installation_status
  ) values (
    '4eefc34f-5475-4c54-886b-9d833ef3997a', v_uid,
    coalesce(nullif(btrim(up.full_name), ''), split_part(v_email, '@', 1)),
    v_email, up.mobile_number, up.purok, up.purok, 'Inactive', 'Pending'
  )
  returning id into v_id;

  return v_id;
end;
$$;
revoke execute on function public.ensure_customer_client() from public, anon;
grant execute on function public.ensure_customer_client() to authenticated;

-- 2. Plan application -> payment submission for Accounting/Admin.
create or replace function public.plan_application_to_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.request_type = 'plan_change'
     and NEW.client_id is not null
     and coalesce(NEW.requested_amount, 0) > 0
     and NEW.payment_method in ('GCash', 'Bank Transfer', 'Cash') then
    insert into public.payment_submissions (
      client_id, user_id, service_request_id, amount_claimed, payment_method,
      reference_number, bank_name, payment_date, proof_path, status
    ) values (
      NEW.client_id, NEW.user_id, NEW.id, NEW.requested_amount, NEW.payment_method,
      NEW.payment_reference, NEW.bank_name, current_date, NEW.payment_proof_path, 'Pending'
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists service_request_plan_application_trigger on public.service_requests;
create trigger service_request_plan_application_trigger
  after insert on public.service_requests
  for each row execute function public.plan_application_to_submission();

-- Withdrawn / replaced applications close their pending submission.
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
    set status = 'Rejected', reviewed_at = now()
    where service_request_id = NEW.id and status = 'Pending';
  end if;
  return NEW;
end;
$$;

drop trigger if exists service_request_plan_cancel_trigger on public.service_requests;
create trigger service_request_plan_cancel_trigger
  after update of status on public.service_requests
  for each row execute function public.plan_application_cancelled();

-- 3. Customer issue -> repair record technicians can see and accept.
alter table public.repair_records
  add column if not exists service_request_id uuid references public.service_requests(id) on delete set null;
create unique index if not exists repair_records_service_request_uniq
  on public.repair_records (service_request_id) where service_request_id is not null;

create or replace function public.repair_request_to_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.request_type = 'repair' and NEW.client_id is not null then
    insert into public.repair_records (client_id, repair_date, problem_description, status, service_request_id)
    values (
      NEW.client_id, current_date,
      btrim(coalesce(NEW.issue_type, 'Issue') || case when coalesce(btrim(NEW.description), '') <> '' then ': ' || btrim(NEW.description) else '' end),
      'Pending', NEW.id
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists service_request_repair_record_trigger on public.service_requests;
create trigger service_request_repair_record_trigger
  after insert on public.service_requests
  for each row execute function public.repair_request_to_record();

-- Is the signed-in user a technician of this client's tenant? (security definer
-- so the policies below do not recurse through clients/tenant_users RLS.)
create or replace function public.is_client_technician(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clients c
    join public.tenant_users tu on tu.tenant_id = c.tenant_id
    where c.id = p_client and tu.user_id = auth.uid() and tu.role = 'technician'
  );
$$;
revoke execute on function public.is_client_technician(uuid) from public, anon;
grant execute on function public.is_client_technician(uuid) to authenticated;

drop policy if exists "technicians can see open issues" on public.repair_records;
create policy "technicians can see open issues" on public.repair_records
  for select to authenticated
  using (technician_user_id is null and public.is_client_technician(client_id));

drop policy if exists "technicians can accept open issues" on public.repair_records;
create policy "technicians can accept open issues" on public.repair_records
  for update to authenticated
  using (technician_user_id is null and public.is_client_technician(client_id))
  with check (technician_user_id = auth.uid());

-- Name the technician when one accepts.
create or replace function public.repair_record_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if OLD.technician_user_id is null and NEW.technician_user_id is not null and NEW.technician is null then
    select full_name into v_name from public.user_profiles where user_id = NEW.technician_user_id;
    NEW.technician := coalesce(v_name, 'Technician');
  end if;
  return NEW;
end;
$$;

drop trigger if exists repair_record_sync_before on public.repair_records;
create trigger repair_record_sync_before
  before update on public.repair_records
  for each row execute function public.repair_record_sync();

-- The customer's request status follows the repair status.
create or replace function public.repair_record_status_to_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.service_request_id is not null and NEW.status is distinct from OLD.status then
    update public.service_requests set status = NEW.status where id = NEW.service_request_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists repair_record_status_after on public.repair_records;
create trigger repair_record_status_after
  after update of status on public.repair_records
  for each row execute function public.repair_record_status_to_request();

notify pgrst, 'reload schema';
