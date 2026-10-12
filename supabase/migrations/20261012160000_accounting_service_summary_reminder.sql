-- Accounting sees where a customer's service stands (read-only, automatic) and
-- can remind the customer inside the app.

-- Staff who handle money for the customer's company.
create or replace function public.is_billing_staff_of_client(p_client uuid)
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
    where c.id = p_client
      and tu.user_id = auth.uid()
      and tu.role in ('admin', 'accounting')
  );
$$;

revoke execute on function public.is_billing_staff_of_client(uuid) from public, anon;
grant execute on function public.is_billing_staff_of_client(uuid) to authenticated;

-- One row of facts about the customer's service. Nothing here can be edited.
create or replace function public.account_service_summary(p_client uuid)
returns table (
  house_photos integer,
  post_photos integer,
  installation_photos integer,
  open_jobs integer,
  repairs_done integer,
  last_repair_at timestamptz,
  install_job_status text,
  install_signed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_billing_staff_of_client(p_client) then
    raise exception 'Only accounting or admin staff can see this.';
  end if;

  return query
  select
    (select count(*)::int from public.client_site_photos where client_id = p_client and photo_type = 'house'),
    (select count(*)::int from public.client_site_photos where client_id = p_client and photo_type = 'post'),
    (select count(*)::int from public.client_site_photos where client_id = p_client and photo_type = 'installation'),
    (select count(*)::int from public.repair_records
       where client_id = p_client and lower(status) !~ '(complete|resolved|done|fixed|cancel)'),
    (select count(*)::int from public.repair_records
       where client_id = p_client and coalesce(job_type, 'repair') <> 'installation'
         and lower(status) ~ '(complete|resolved|done|fixed)'),
    (select max(completed_at) from public.repair_records
       where client_id = p_client and coalesce(job_type, 'repair') <> 'installation'),
    (select r.status from public.repair_records r
       where r.client_id = p_client and r.job_type = 'installation'
       order by r.created_at desc limit 1),
    (select r.customer_signed_at from public.repair_records r
       where r.client_id = p_client and r.job_type = 'installation'
       order by r.created_at desc limit 1);
end;
$$;

revoke execute on function public.account_service_summary(uuid) from public, anon;
grant execute on function public.account_service_summary(uuid) to authenticated;

-- A reminder that shows up in the customer's app (and as a phone notification).
-- Once an hour per customer, so nobody gets nagged.
create or replace function public.remind_customer(p_client uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
  v_tenant uuid;
  v_email text;
  v_msg text := btrim(coalesce(p_message, ''));
begin
  if not public.is_billing_staff_of_client(p_client) then
    raise exception 'Only accounting or admin staff can remind customers.';
  end if;
  if v_msg = '' then
    raise exception 'Write a reminder message first.';
  end if;
  if length(v_msg) > 300 then
    raise exception 'Keep the reminder under 300 characters.';
  end if;

  select user_id, tenant_id into v_customer, v_tenant from public.clients where id = p_client;
  if v_customer is null then
    raise exception 'This customer has not signed in to the app yet, so there is nobody to notify.';
  end if;

  if exists (
    select 1 from public.audit_log
    where client_id = p_client
      and field_name = 'customer_reminder'
      and changed_at > now() - interval '1 hour'
  ) then
    raise exception 'This customer was already reminded in the last hour.';
  end if;

  perform public.team_push(v_customer, 'Reminder from PKC BIZOFT', v_msg);

  select email into v_email from auth.users where id = auth.uid();
  insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values (v_tenant, p_client, coalesce(v_email, 'Unknown'), 'customer_reminder', '', v_msg);
end;
$$;

revoke execute on function public.remind_customer(uuid, text) from public, anon;
grant execute on function public.remind_customer(uuid, text) to authenticated;
