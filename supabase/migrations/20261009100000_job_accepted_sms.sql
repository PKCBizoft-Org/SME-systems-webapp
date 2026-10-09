-- Text the customer (Semaphore) when a technician accepts their job.
-- The database only pings the web app; the app sends the SMS (and does nothing
-- until SEMAPHORE_API_KEY is configured). One SMS per job.
create extension if not exists pg_net with schema extensions;

alter table public.repair_records
  add column if not exists accept_sms_sent_at timestamptz;

create or replace function public.notify_job_accepted()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  if OLD.technician_user_id is null and NEW.technician_user_id is not null then
    select secret into v_secret from public.push_config limit 1;

    perform net.http_post(
      url := 'https://sme-systems-webapp.vercel.app/api/sms/job-accepted',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('repair_id', NEW.id)
    );
  end if;
  return NEW;
exception when others then
  -- A failed text must never block the technician from accepting the job.
  return NEW;
end;
$$;

drop trigger if exists repair_job_accepted_sms_trigger on public.repair_records;
create trigger repair_job_accepted_sms_trigger
  after update of technician_user_id on public.repair_records
  for each row execute function public.notify_job_accepted();

revoke execute on function public.notify_job_accepted() from public, anon, authenticated;
