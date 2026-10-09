-- Push alerts to the CUSTOMER about their job (the SMS is separate and still
-- waits for the Semaphore key):
--   * a technician accepts their installation / repair
--   * a technician joins the crew
create or replace function public.notify_job_accepted()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_customer uuid;
begin
  if OLD.technician_user_id is null and NEW.technician_user_id is not null then
    select secret into v_secret from public.push_config limit 1;

    perform net.http_post(
      url := 'https://sme-systems-webapp.vercel.app/api/sms/job-accepted',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('repair_id', NEW.id)
    );

    select user_id into v_customer from public.clients where id = NEW.client_id;
    if v_customer is not null then
      perform public.team_push(
        v_customer,
        'A technician accepted your request',
        public.team_person_name(NEW.technician_user_id) || ' accepted your ' ||
          case when NEW.job_type = 'installation' then 'installation' else 'repair' end ||
          ' request and will visit you soon.'
      );
    end if;
  end if;
  return NEW;
exception when others then
  -- A failed alert must never block the technician from accepting the job.
  return NEW;
end;
$$;
revoke execute on function public.notify_job_accepted() from public, anon, authenticated;

create or replace function public.notify_crew_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_customer uuid;
begin
  select c.user_id into v_customer
  from public.repair_records r
  join public.clients c on c.id = r.client_id
  where r.id = NEW.repair_id;

  if v_customer is not null then
    perform public.team_push(
      v_customer,
      'Your crew is set',
      public.team_person_name(NEW.user_id) || ' will also be coming to help with your job.'
    );
  end if;
  return NEW;
exception when others then
  return NEW;
end;
$$;
revoke execute on function public.notify_crew_joined() from public, anon, authenticated;

drop trigger if exists repair_job_crew_push_trigger on public.repair_job_crew;
create trigger repair_job_crew_push_trigger
  after insert on public.repair_job_crew
  for each row execute function public.notify_crew_joined();
