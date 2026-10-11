-- Round 2, part 1: outages, arrival check-in, job history by customer, dispatch.
--
--   * New permission 'dispatch' (admins by default; can be given to other roles).
--   * outages: staff post a known outage for some areas; customers in those
--     areas get a push and see a banner (active_outages_for_me). Areas are
--     matched as lower-case keywords against the customer's area/address text.
--   * check_in_arrival(): the technician on a job taps "I've arrived"; it saves
--     the time and GPS point on the job and tells the customer.
--   * client_job_history(): past jobs at one customer, for staff who may see
--     them (admin/accounting, or a technician currently working a job there).
--   * dispatch_board() / dispatch_assign(): see open jobs and technicians, and
--     assign or reassign a job. Assignment goes through the normal job rules
--     (max 3 active jobs, acceptance time, customer notification).

-- ------------------------------------------------------------ permissions
create or replace function public.permission_catalog()
returns text[]
language sql
immutable
set search_path = public
as $$ select array['clients', 'inventory', 'accounting', 'ratings', 'analytics', 'tickets', 'audit', 'dispatch', 'users'] $$;

create or replace function public.set_role_permission(p_role text, p_permission text, p_allowed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_email text;
  v_enforced constant text[] := array['analytics', 'tickets', 'audit', 'dispatch'];
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select tenant_id into v_tenant from public.tenant_users
  where user_id = v_uid and lower(role) = 'admin' order by tenant_id limit 1;
  if v_tenant is null then
    raise exception 'Only an admin can change role permissions.';
  end if;

  if v_role = 'admin' then
    raise exception 'Admins always have every permission.';
  end if;
  if v_role not in ('accounting', 'inventory', 'technician') then
    raise exception 'Unknown role.';
  end if;
  if not (p_permission = any (public.permission_catalog())) then
    raise exception 'Unknown permission.';
  end if;
  if p_allowed is null then
    raise exception 'Choose on or off.';
  end if;
  if p_permission = 'users' and p_allowed then
    raise exception 'Only admins can manage users.';
  end if;
  if p_allowed
     and not (p_permission = any (v_enforced))
     and not (p_permission = any (public.permission_defaults(v_role))) then
    raise exception 'That page cannot be switched on for this role yet: its data is protected by the built-in role rules.';
  end if;

  insert into public.role_permissions (tenant_id, role, permission, allowed, updated_by, updated_at)
  values (v_tenant, v_role, p_permission, p_allowed, v_uid, now())
  on conflict (tenant_id, role, permission)
  do update set allowed = excluded.allowed, updated_by = excluded.updated_by, updated_at = now();

  select email into v_email from auth.users where id = v_uid;
  insert into public.user_audit (tenant_id, actor_id, actor_email, action, detail)
  values (v_tenant, v_uid, v_email, 'permission_changed',
          v_role || ': ' || p_permission || ' ' || case when p_allowed then 'on' else 'off' end);
end;
$fn$;

revoke all on function public.set_role_permission(text, text, boolean) from public, anon;
grant execute on function public.set_role_permission(text, text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------- outages
create table if not exists public.outages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  areas text[] not null default '{}',
  title text not null check (char_length(title) between 3 and 80),
  message text not null check (char_length(message) between 3 and 400),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  resolved_at timestamptz,
  notified integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists outages_tenant_open_idx on public.outages (tenant_id, created_at desc) where resolved_at is null;

alter table public.outages enable row level security;

drop policy if exists "dispatch staff read outages" on public.outages;
create policy "dispatch staff read outages" on public.outages
  for select to authenticated using (public.has_permission(tenant_id, 'dispatch'));

revoke insert, update, delete on public.outages from anon, authenticated;

-- Customers (user ids) of a tenant whose area/address matches any keyword;
-- no keywords means every customer of the tenant.
create or replace function public.outage_audience(p_tenant uuid, p_areas text[])
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select c.user_id
  from public.clients c
  where c.tenant_id = p_tenant
    and c.user_id is not null
    and (
      coalesce(array_length(p_areas, 1), 0) = 0
      or exists (
        select 1 from unnest(p_areas) k
        where position(k in lower(coalesce(c.area, '') || ' ' || coalesce(c.address, ''))) > 0
      )
    )
$$;

revoke all on function public.outage_audience(uuid, text[]) from public, anon, authenticated;

create or replace function public.create_outage(p_areas text[], p_title text, p_message text, p_ends_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_areas text[];
  v_title text := btrim(coalesce(p_title, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_id uuid;
  v_target uuid;
  v_count integer := 0;
  v_email text;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select tu.tenant_id into v_tenant from public.tenant_users tu
  where tu.user_id = v_uid and public.has_permission(tu.tenant_id, 'dispatch')
  order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'You do not have access to outages.';
  end if;

  if char_length(v_title) < 3 or char_length(v_title) > 80 then
    raise exception 'The title needs 3 to 80 characters.';
  end if;
  if char_length(v_message) < 3 or char_length(v_message) > 400 then
    raise exception 'The message needs 3 to 400 characters.';
  end if;
  if p_ends_at is not null and p_ends_at < now() then
    raise exception 'The expected restoration time is in the past.';
  end if;

  select coalesce(array_agg(distinct left(lower(btrim(a)), 60)), '{}') into v_areas
  from unnest(coalesce(p_areas, '{}')) a where btrim(coalesce(a, '')) <> '';
  if coalesce(array_length(v_areas, 1), 0) > 10 then
    raise exception 'Please list at most 10 areas.';
  end if;

  insert into public.outages (tenant_id, areas, title, message, ends_at, created_by)
  values (v_tenant, v_areas, v_title, v_message, p_ends_at, v_uid)
  returning id into v_id;

  -- A failed push must never fail the notice itself.
  begin
    for v_target in select user_id from public.outage_audience(v_tenant, v_areas) limit 500 loop
      perform public.team_push(v_target, v_title, v_message);
      v_count := v_count + 1;
    end loop;
  exception when others then
    null;
  end;
  update public.outages set notified = v_count where id = v_id;

  select email into v_email from auth.users where id = v_uid;
  insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values (v_tenant, null, coalesce(v_email, 'Unknown'), 'outage_created', '', v_title);

  return jsonb_build_object('id', v_id, 'notified', v_count);
end;
$fn$;

revoke all on function public.create_outage(text[], text, text, timestamptz) from public, anon;
grant execute on function public.create_outage(text[], text, text, timestamptz) to authenticated, service_role;

create or replace function public.resolve_outage(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_uid uuid := auth.uid();
  v_out public.outages%rowtype;
  v_target uuid;
  v_email text;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_out from public.outages where id = p_id for update;
  if not found or not public.has_permission(v_out.tenant_id, 'dispatch') then
    raise exception 'That outage could not be found.';
  end if;
  if v_out.resolved_at is not null then
    raise exception 'That outage is already marked as resolved.';
  end if;

  update public.outages set resolved_at = now() where id = v_out.id;

  begin
    for v_target in select user_id from public.outage_audience(v_out.tenant_id, v_out.areas) limit 500 loop
      perform public.team_push(v_target, 'Service restored', v_out.title || ' has been resolved. Thank you for your patience.');
    end loop;
  exception when others then
    null;
  end;

  select email into v_email from auth.users where id = v_uid;
  insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values (v_out.tenant_id, null, coalesce(v_email, 'Unknown'), 'outage_resolved', v_out.title, '');
end;
$fn$;

revoke all on function public.resolve_outage(uuid) from public, anon;
grant execute on function public.resolve_outage(uuid) to authenticated, service_role;

create or replace function public.list_outages()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_tenant uuid;
  v_out jsonb;
begin
  select tu.tenant_id into v_tenant from public.tenant_users tu
  where tu.user_id = auth.uid() and public.has_permission(tu.tenant_id, 'dispatch')
  order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'You do not have access to outages.';
  end if;

  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc), '[]'::jsonb) into v_out
  from (
    select o.id, o.areas, o.title, o.message, o.starts_at, o.ends_at, o.resolved_at, o.notified, o.created_at,
           (select count(*) from public.outage_audience(o.tenant_id, o.areas)) as customers_in_area
    from public.outages o
    where o.tenant_id = v_tenant
    order by o.created_at desc
    limit 50
  ) x;

  return v_out;
end;
$fn$;

revoke all on function public.list_outages() from public, anon;
grant execute on function public.list_outages() to authenticated, service_role;

create or replace function public.active_outages_for_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_client public.clients%rowtype;
  v_out jsonb;
begin
  if auth.uid() is null then
    return '[]'::jsonb;
  end if;
  select * into v_client from public.clients where user_id = auth.uid() limit 1;
  if not found then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'title', o.title, 'message', o.message, 'starts_at', o.starts_at, 'ends_at', o.ends_at
         ) order by o.starts_at desc), '[]'::jsonb) into v_out
  from public.outages o
  where o.tenant_id = v_client.tenant_id
    and o.resolved_at is null
    and o.starts_at <= now()
    and (
      coalesce(array_length(o.areas, 1), 0) = 0
      or exists (
        select 1 from unnest(o.areas) k
        where position(k in lower(coalesce(v_client.area, '') || ' ' || coalesce(v_client.address, ''))) > 0
      )
    );

  return v_out;
end;
$fn$;

revoke all on function public.active_outages_for_me() from public, anon;
grant execute on function public.active_outages_for_me() to authenticated, service_role;

-- --------------------------------------------------------------- arrival
alter table public.repair_records add column if not exists arrived_at timestamptz;
alter table public.repair_records add column if not exists arrived_latitude double precision;
alter table public.repair_records add column if not exists arrived_longitude double precision;

create or replace function public.check_in_arrival(p_repair_id uuid, p_lat double precision default null, p_lon double precision default null)
returns timestamptz
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_uid uuid := auth.uid();
  v_job public.repair_records%rowtype;
  v_customer uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_job from public.repair_records where id = p_repair_id for update;
  if not found then
    raise exception 'That job could not be found.';
  end if;

  if not (
    v_job.technician_user_id = v_uid
    or exists (
      select 1 from public.repair_job_crew c
      where c.repair_id = v_job.id and c.user_id = v_uid and c.status = 'accepted'
    )
  ) then
    raise exception 'Only the technician on this job can check in.';
  end if;

  if coalesce(v_job.status, '') ~* '(complete|resolved|done|fixed|cancel)' then
    raise exception 'This job is already finished.';
  end if;

  if v_job.arrived_at is not null then
    return v_job.arrived_at;
  end if;

  if (p_lat is not null and (p_lat < -90 or p_lat > 90)) or (p_lon is not null and (p_lon < -180 or p_lon > 180)) then
    raise exception 'That location is not valid.';
  end if;

  update public.repair_records
  set arrived_at = now(), arrived_latitude = p_lat, arrived_longitude = p_lon
  where id = v_job.id
  returning arrived_at into v_job.arrived_at;

  begin
    select user_id into v_customer from public.clients where id = v_job.client_id;
    v_name := coalesce(nullif(public.team_person_name(v_uid), ''), 'Your technician');
    if v_customer is not null then
      perform public.team_push(v_customer, 'Your technician has arrived', v_name || ' is at your location.');
    end if;
  exception when others then
    null;
  end;

  return v_job.arrived_at;
end;
$fn$;

revoke all on function public.check_in_arrival(uuid, double precision, double precision) from public, anon;
grant execute on function public.check_in_arrival(uuid, double precision, double precision) to authenticated, service_role;

-- ------------------------------------------------------------ job history
create or replace function public.client_job_history(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_client public.clients%rowtype;
  v_allowed boolean;
  v_jobs jsonb;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_client from public.clients where id = p_client_id;
  if not found then
    raise exception 'That customer could not be found.';
  end if;

  v_allowed := public.user_is_global_admin()
    or exists (
      select 1 from public.tenant_users tu
      where tu.user_id = v_uid and tu.tenant_id = v_client.tenant_id and lower(tu.role) in ('admin', 'accounting')
    )
    or (
      exists (
        select 1 from public.tenant_users tu
        where tu.user_id = v_uid and tu.tenant_id = v_client.tenant_id and lower(tu.role) = 'technician'
      )
      and exists (
        select 1 from public.repair_records r
        where r.client_id = p_client_id
          and coalesce(r.status, '') !~* '(complete|resolved|done|fixed|cancel)'
          and (
            r.technician_user_id = v_uid
            or exists (select 1 from public.repair_job_crew c where c.repair_id = r.id and c.user_id = v_uid and c.status = 'accepted')
          )
      )
    );

  if not v_allowed then
    raise exception 'You can only see the history of customers you are working for.';
  end if;

  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc), '[]'::jsonb) into v_jobs
  from (
    select r.id, r.repair_date, r.job_type, r.status, r.problem_description as problem, r.resolution,
           coalesce(nullif(r.technician, ''), 'Unassigned') as technician,
           r.created_at, r.completed_at, r.arrived_at, (r.checklist is not null) as has_checklist
    from public.repair_records r
    where r.client_id = p_client_id
    order by r.created_at desc
    limit 25
  ) x;

  return jsonb_build_object('modem_serial', v_client.modem_serial, 'jobs', v_jobs);
end;
$fn$;

revoke all on function public.client_job_history(uuid) from public, anon;
grant execute on function public.client_job_history(uuid) to authenticated, service_role;

-- --------------------------------------------------------------- dispatch
create or replace function public.dispatch_board()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_tenant uuid;
  v_jobs jsonb;
  v_techs jsonb;
begin
  select tu.tenant_id into v_tenant from public.tenant_users tu
  where tu.user_id = auth.uid() and public.has_permission(tu.tenant_id, 'dispatch')
  order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'You do not have access to the dispatch board.';
  end if;

  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at asc), '[]'::jsonb) into v_jobs
  from (
    select r.id, c.customer_name, c.account_id, c.area, r.job_type, r.problem_description as problem,
           r.status, r.created_at, r.technician_user_id,
           case when r.technician_user_id is null then null else coalesce(nullif(r.technician, ''), public.team_person_name(r.technician_user_id)) end as technician_name,
           r.accepted_at, r.arrived_at,
           coalesce(r.latitude, c.latitude) as latitude, coalesce(r.longitude, c.longitude) as longitude
    from public.repair_records r
    join public.clients c on c.id = r.client_id
    where c.tenant_id = v_tenant
      and coalesce(r.status, '') !~* '(complete|resolved|done|fixed|cancel)'
    order by r.created_at asc
    limit 200
  ) x;

  select coalesce(jsonb_agg(row_to_json(t) order by t.name), '[]'::jsonb) into v_techs
  from (
    select tu.user_id,
           coalesce(nullif(btrim(up.full_name), ''), public.team_person_name(tu.user_id), 'Technician') as name,
           up.mobile_number as phone,
           (select count(*) from public.repair_records r
             where r.technician_user_id = tu.user_id
               and coalesce(r.status, '') !~* '(complete|resolved|done|fixed|cancel)') as active_jobs,
           l.latitude, l.longitude, l.updated_at as location_at
    from public.tenant_users tu
    left join public.user_profiles up on up.user_id = tu.user_id
    left join public.technician_locations l on l.user_id = tu.user_id
    where tu.tenant_id = v_tenant and lower(tu.role) = 'technician'
  ) t;

  return jsonb_build_object('jobs', v_jobs, 'technicians', v_techs);
end;
$fn$;

revoke all on function public.dispatch_board() from public, anon;
grant execute on function public.dispatch_board() to authenticated, service_role;

create or replace function public.dispatch_assign(p_repair_id uuid, p_technician uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_uid uuid := auth.uid();
  v_job public.repair_records%rowtype;
  v_tenant uuid;
  v_old_name text;
  v_new_name text;
  v_email text;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select r.* into v_job from public.repair_records r where r.id = p_repair_id for update;
  if not found then
    raise exception 'That job could not be found.';
  end if;
  select c.tenant_id into v_tenant from public.clients c where c.id = v_job.client_id;

  if v_tenant is null or not public.has_permission(v_tenant, 'dispatch') then
    raise exception 'You do not have access to assign jobs.';
  end if;
  if coalesce(v_job.status, '') ~* '(complete|resolved|done|fixed|cancel)' then
    raise exception 'This job is already finished.';
  end if;
  if p_technician is not distinct from v_job.technician_user_id then
    return;
  end if;

  if p_technician is not null and not exists (
    select 1 from public.tenant_users tu
    where tu.user_id = p_technician and tu.tenant_id = v_tenant and lower(tu.role) = 'technician'
  ) then
    raise exception 'That person is not a technician of this company.';
  end if;

  v_old_name := coalesce(nullif(v_job.technician, ''), '');

  -- Hand the job back first, so the normal assignment rules run again for the new technician.
  if v_job.technician_user_id is not null then
    delete from public.repair_job_crew where repair_id = v_job.id;
    update public.repair_records
    set technician_user_id = null, status = 'Pending', arrived_at = null, arrived_latitude = null, arrived_longitude = null
    where id = v_job.id;
  end if;

  if p_technician is not null then
    update public.repair_records set technician_user_id = p_technician where id = v_job.id;
    v_new_name := coalesce(nullif(public.team_person_name(p_technician), ''), 'Technician');
    begin
      perform public.team_push(p_technician, 'New job assigned',
        left(coalesce(v_job.problem_description, 'A customer needs your help.'), 120));
    exception when others then
      null;
    end;
  end if;

  select email into v_email from auth.users where id = v_uid;
  insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values (v_tenant, v_job.client_id, coalesce(v_email, 'Unknown'), 'job_assigned', v_old_name, coalesce(v_new_name, 'Unassigned'));
end;
$fn$;

revoke all on function public.dispatch_assign(uuid, uuid) from public, anon;
grant execute on function public.dispatch_assign(uuid, uuid) to authenticated, service_role;
