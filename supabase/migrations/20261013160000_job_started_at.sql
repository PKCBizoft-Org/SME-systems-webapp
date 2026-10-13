-- When the technician actually started working (arrival starts the job).
alter table public.repair_records add column if not exists started_at timestamptz;

create or replace function public.stamp_job_started()
returns trigger
language plpgsql
as $$
begin
  if NEW.started_at is null
     and lower(coalesce(NEW.status, '')) ~ '(progress|ongoing|awaiting|complete|resolved|done|fixed)'
     and lower(coalesce(OLD.status, '')) !~ '(progress|ongoing|awaiting|complete|resolved|done|fixed)' then
    NEW.started_at := now();
  end if;
  return NEW;
end;
$$;

drop trigger if exists repair_job_started_trigger on public.repair_records;
create trigger repair_job_started_trigger
  before update on public.repair_records
  for each row execute function public.stamp_job_started();

-- Jobs already past the start get their arrival time (or completion) as the start.
update public.repair_records
set started_at = coalesce(arrived_at, accepted_at, completed_at)
where started_at is null
  and lower(coalesce(status, '')) ~ '(progress|ongoing|awaiting|complete|resolved|done|fixed)';
