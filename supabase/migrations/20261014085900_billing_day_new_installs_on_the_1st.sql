-- Billing day = the day of the month the monthly bill is issued.
-- New customers are billed on the 1st; customers installed before this change are billed on the 25th
-- (5 days before the end-of-month due date), so their bill comes first.
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
    set billing_day = 1
    where id = NEW.client_id and billing_day is null;
    perform set_config('app.bypass_client_guard', 'off', true);
  end if;
  return NEW;
end;
$$;

do $$
begin
  perform set_config('app.bypass_client_guard', 'on', true);
  update public.clients
  set billing_day = 25
  where lower(coalesce(installation_status, '')) in ('installed', 'completed', 'done')
    and billing_day is distinct from 25;
  perform set_config('app.bypass_client_guard', 'off', true);
end $$;
