-- An installation can only be finished for a customer who has a plan, because
-- an account without a plan can never be billed (it would sit on "nothing due"
-- forever). And every installed account gets its billing day from the install
-- date, so the billing cycle is never blank.

create or replace function public.installation_needs_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_done constant text := '(complete|resolved|done|fixed)';
begin
  if NEW.job_type = 'installation'
     and lower(coalesce(NEW.status, '')) ~ v_done
     and lower(coalesce(OLD.status, '')) !~ v_done
     and not exists (
       select 1 from public.clients c
       where c.id = NEW.client_id and nullif(btrim(c.plan_name), '') is not null
     ) then
    raise exception 'This customer has no plan yet, so the account could never be billed. Have the customer choose a plan and pay in the app (Plan & Bills), or ask an admin to set the plan, then finish the installation.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists installation_needs_plan_before on public.repair_records;
create trigger installation_needs_plan_before
  before update of status on public.repair_records
  for each row execute function public.installation_needs_plan();

-- The same check when the technician asks the customer to sign in the app, so
-- the job never waits for a signature that could not finish it.
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
  if r.job_type = 'installation' and not exists (
    select 1 from public.clients c where c.id = r.client_id and nullif(btrim(c.plan_name), '') is not null
  ) then
    raise exception 'This customer has no plan yet, so the account could never be billed. Have the customer choose a plan and pay in the app (Plan & Bills), or ask an admin to set the plan, then finish the installation.';
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

-- Billing day = the day of the month the customer was installed (never past the 28th).
create or replace function public.installation_set_billing_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.job_type = 'installation'
     and lower(coalesce(NEW.status, '')) ~ '(complete|resolved|done|fixed)'
     and lower(coalesce(OLD.status, '')) !~ '(complete|resolved|done|fixed)' then
    perform set_config('app.bypass_client_guard', 'on', true);
    update public.clients
    set billing_day = least(extract(day from coalesce(install_date, current_date))::int, 28)
    where id = NEW.client_id and billing_day is null;
    perform set_config('app.bypass_client_guard', 'off', true);
  end if;
  return NEW;
end;
$$;

drop trigger if exists installation_set_billing_day_after on public.repair_records;
create trigger installation_set_billing_day_after
  after update of status on public.repair_records
  for each row execute function public.installation_set_billing_day();

-- Accounts that were installed before this existed.
do $$
begin
  perform set_config('app.bypass_client_guard', 'on', true);
  update public.clients
  set billing_day = least(extract(day from install_date)::int, 28)
  where billing_day is null
    and install_date is not null
    and lower(coalesce(installation_status, '')) in ('installed', 'completed', 'done');
  perform set_config('app.bypass_client_guard', 'off', true);
end $$;
