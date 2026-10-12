-- A technician must check in ("I have arrived") before a job can be finished,
-- so every finished job has a real arrival time. Admins who close a job from
-- the website are not affected; only the technician who holds the job is.

create or replace function public.require_arrival_before_done()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_done constant text := '(complete|resolved|done|fixed)';
begin
  if lower(coalesce(NEW.status, '')) ~ v_done
     and lower(coalesce(OLD.status, '')) !~ v_done
     and NEW.arrived_at is null
     and NEW.technician_user_id is not null
     and NEW.technician_user_id = auth.uid() then
    raise exception 'Tap "I have arrived" first. A job can only be finished after you have checked in at the customer.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists require_arrival_before_done_before on public.repair_records;
create trigger require_arrival_before_done_before
  before update of status on public.repair_records
  for each row execute function public.require_arrival_before_done();

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
  if r.arrived_at is null then
    raise exception 'Tap "I have arrived" first. A job can only be finished after you have checked in at the customer.';
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
