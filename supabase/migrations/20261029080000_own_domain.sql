-- The web app now lives at its own domain, bizoftph.com. Point the
-- job-accepted alert there (the old vercel.app address still works too).
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
      url := 'https://bizoftph.com/api/sms/job-accepted',
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
