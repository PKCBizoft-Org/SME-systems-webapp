-- Lets staff of the customer's own tenant see that a plan application is
-- still waiting for Accounting to verify the payment (so no job exists yet).
create or replace function public.client_payment_waiting(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.service_requests s
    join public.clients c on c.id = s.client_id
    where s.client_id = p_client
      and lower(s.status) = 'payment pending'
      and exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid() and tu.tenant_id = c.tenant_id
      )
  );
$$;

revoke execute on function public.client_payment_waiting(uuid) from public, anon;
grant execute on function public.client_payment_waiting(uuid) to authenticated;

-- Jobs screens refresh by themselves when a job is taken or changed.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'repair_records'
  ) then
    alter publication supabase_realtime add table public.repair_records;
  end if;
end $$;

-- A technician who accepted a job by mistake can hand it back, as long as the
-- work has not started (no "In Progress", no arrival check-in). Only the lead.
create or replace function public.release_repair_job(p_repair uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.repair_records%rowtype;
begin
  select * into r from public.repair_records where id = p_repair for update;
  if r.id is null or r.technician_user_id is distinct from auth.uid() then
    raise exception 'Only the technician who took this job can hand it back.';
  end if;
  if lower(r.status) !~ '^(assigned|pending)$' or r.arrived_at is not null then
    raise exception 'This job has already started, so it can no longer be handed back.';
  end if;

  delete from public.repair_job_crew where repair_id = p_repair;

  -- repair_record_sync clears the technician name, phone and accepted time.
  update public.repair_records
  set technician_user_id = null, status = 'Pending'
  where id = p_repair;
end;
$$;

revoke execute on function public.release_repair_job(uuid) from public, anon;
grant execute on function public.release_repair_job(uuid) to authenticated;

-- Every open job of the technician's own company, including ones taken by
-- someone else (row-level security hides those), so the customer list and
-- Client Details can say who has a job.
create or replace function public.open_jobs_overview()
returns table (
  repair_id uuid,
  client_id uuid,
  job_type text,
  status text,
  created_at timestamptz,
  technician_user_id uuid,
  technician_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.client_id, r.job_type, r.status, r.created_at, r.technician_user_id,
         coalesce(nullif(btrim(up.full_name), ''), r.technician)
  from public.repair_records r
  join public.clients c on c.id = r.client_id
  left join public.user_profiles up on up.user_id = r.technician_user_id
  where lower(r.status) !~ '(complete|resolved|done|fixed|cancel)'
    and exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.tenant_id = c.tenant_id
    );
$$;

revoke execute on function public.open_jobs_overview() from public, anon;
grant execute on function public.open_jobs_overview() to authenticated;
