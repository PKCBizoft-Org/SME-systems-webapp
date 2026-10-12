-- One open job per problem type, and billing concerns are not technician jobs.
create or replace function public.repair_request_to_record()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.request_type = 'repair' and NEW.client_id is not null then
    -- A billing or account question is for Accounting, not for a technician visit.
    if lower(coalesce(NEW.issue_type, '')) like 'billing%' then
      return NEW;
    end if;

    if exists (
      select 1
      from public.repair_records r
      join public.service_requests s on s.id = r.service_request_id
      where r.client_id = NEW.client_id
        and coalesce(r.job_type, 'repair') = 'repair'
        and lower(coalesce(s.issue_type, '')) = lower(coalesce(NEW.issue_type, ''))
        and lower(coalesce(r.status, '')) !~ '(complete|resolved|done|fixed|cancel)'
    ) then
      raise exception 'You already reported this problem and it is still open. A technician will handle it soon.';
    end if;

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
