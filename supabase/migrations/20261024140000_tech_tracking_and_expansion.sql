-- 1) Live technician tracking.
-- A technician's phone shares its position only after they tap Start job and
-- they have not arrived yet. The row is deleted the moment they check in,
-- finish, or release the job, so no location history is kept.
create table if not exists public.tech_locations (
  repair_id uuid primary key references public.repair_records(id) on delete cascade,
  technician_user_id uuid not null,
  latitude double precision not null,
  longitude double precision not null,
  updated_at timestamptz not null default now()
);
alter table public.tech_locations enable row level security;
-- No policies: read and written only through the functions below.

create or replace function public.update_tech_location(p_repair uuid, p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.repair_records%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Invalid location.';
  end if;

  select * into r from public.repair_records where id = p_repair;
  if not found or r.technician_user_id is distinct from auth.uid() then
    raise exception 'This is not your job.';
  end if;

  if lower(coalesce(r.status, '')) !~ '(progress|ongoing)' or r.arrived_at is not null then
    delete from public.tech_locations where repair_id = p_repair;
    return;
  end if;

  insert into public.tech_locations (repair_id, technician_user_id, latitude, longitude, updated_at)
  values (p_repair, auth.uid(), p_lat, p_lng, now())
  on conflict (repair_id) do update
    set latitude = excluded.latitude, longitude = excluded.longitude,
        technician_user_id = excluded.technician_user_id, updated_at = now();
end;
$$;

-- Stop sharing as soon as the job is no longer "on the way".
create or replace function public.clear_tech_location()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.arrived_at is not null
     or lower(coalesce(NEW.status, '')) !~ '(progress|ongoing)'
     or NEW.technician_user_id is distinct from OLD.technician_user_id then
    delete from public.tech_locations where repair_id = NEW.id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists repair_records_clear_tech_location on public.repair_records;
create trigger repair_records_clear_tech_location
after update of status, arrived_at, technician_user_id on public.repair_records
for each row execute function public.clear_tech_location();

-- Customer: where is the technician coming to me? Only my own job, only while
-- on the way, only if the position is fresh (last 10 minutes).
create or replace function public.my_technician_location()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'repair_id', r.id,
    'technician', coalesce(public.short_person_name(r.technician), 'Your technician'),
    'lat', t.latitude,
    'lng', t.longitude,
    'dest_lat', coalesce(r.latitude, c.latitude),
    'dest_lng', coalesce(r.longitude, c.longitude),
    'updated_at', t.updated_at
  )
  from public.clients c
  join public.repair_records r on r.client_id = c.id
  join public.tech_locations t on t.repair_id = r.id
  where c.user_id = auth.uid()
    and lower(coalesce(r.status, '')) ~ '(progress|ongoing)'
    and r.arrived_at is null
    and t.updated_at > now() - interval '10 minutes'
  order by t.updated_at desc
  limit 1
$$;

revoke all on function public.update_tech_location(uuid, double precision, double precision) from public, anon;
revoke all on function public.my_technician_location() from public, anon;
grant execute on function public.update_tech_location(uuid, double precision, double precision) to authenticated;
grant execute on function public.my_technician_location() to authenticated;

-- Staff map: technicians on the way (fresh positions only).
create or replace function public.mission_control_technicians()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_tenant uuid;
begin
  select tu.tenant_id into v_tenant from public.tenant_users tu
  where tu.user_id = auth.uid() and public.has_permission(tu.tenant_id, 'dispatch')
  order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'You do not have access to the map.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'repair_id', r.id,
      'technician', coalesce(public.short_person_name(r.technician), 'Technician'),
      'customer', public.short_person_name(c.customer_name),
      'customer_id', c.id,
      'job_type', r.job_type,
      'lat', t.latitude,
      'lng', t.longitude,
      'updated_at', t.updated_at
    ))
    from public.tech_locations t
    join public.repair_records r on r.id = t.repair_id
    join public.clients c on c.id = r.client_id
    where c.tenant_id = v_tenant
      and lower(coalesce(r.status, '')) ~ '(progress|ongoing)'
      and r.arrived_at is null
      and t.updated_at > now() - interval '15 minutes'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.mission_control_technicians() from public, anon;
grant execute on function public.mission_control_technicians() to authenticated;

-- 2) Expansion planner (admins only).
-- Demand = people who applied but are not installed yet. Each household counts
-- once (same app account, or pins within about 11 m). Weight per household:
--   1 base, +1 confirmed email, +2 paid installation fee (strongest signal),
--   times 1.5 if referred by an existing customer, times recency of the newest request.
create or replace function public.expansion_planner()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_tenant uuid;
begin
  select tu.tenant_id into v_tenant from public.tenant_users tu
  where tu.user_id = auth.uid() and tu.role = 'admin'
  order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'Only admins can open the expansion planner.';
  end if;

  return (
    with people as (
      select c.id, c.user_id, c.area, c.latitude, c.longitude, c.referred_by_client_id,
             lower(coalesce(c.installation_status, '')) in ('installed', 'completed', 'done') as installed,
             (u.email_confirmed_at is not null) as verified,
             exists (select 1 from public.payments p where p.client_id = c.id) as paid,
             (select max(s.created_at) from public.service_requests s where s.client_id = c.id) as last_request
      from public.clients c
      left join auth.users u on u.id = c.user_id
      where c.tenant_id = v_tenant
        and lower(coalesce(c.account_status, '')) not in ('terminated', 'cancelled')
    ),
    keyed as (
      select p.*,
             coalesce(p.user_id::text, round(p.latitude::numeric, 4) || ',' || round(p.longitude::numeric, 4), p.id::text) as household
      from people p
      where not p.installed
    ),
    demand as (
      select distinct on (k.household)
             k.*,
             coalesce(nullif(btrim(k.area), ''), 'No area given') as area_name,
             (1 + case when k.verified then 1 else 0 end + case when k.paid then 2 else 0 end)
               * case when k.referred_by_client_id is not null then 1.5 else 1 end
               * case
                   when k.last_request is null then 0.5
                   when k.last_request > now() - interval '30 days' then 1
                   when k.last_request > now() - interval '90 days' then 0.7
                   else 0.4
                 end as weight
      from keyed k
      order by k.household, k.paid desc, k.verified desc
    ),
    served as (
      select coalesce(nullif(btrim(area), ''), 'No area given') as area_name, count(*) as installed
      from people where installed group by 1
    ),
    areas as (
      select d.area_name,
             count(*) as households,
             count(*) filter (where d.verified) as verified,
             count(*) filter (where d.paid) as paid,
             count(*) filter (where d.referred_by_client_id is not null) as referred,
             round(sum(d.weight)::numeric, 1) as score,
             coalesce(max(s.installed), 0) as installed,
             avg(d.latitude) as lat,
             avg(d.longitude) as lng
      from demand d
      left join served s on s.area_name = d.area_name
      group by d.area_name
    )
    select jsonb_build_object(
      'areas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'area', a.area_name, 'households', a.households, 'verified', a.verified, 'paid', a.paid,
          'referred', a.referred, 'score', a.score, 'installed', a.installed, 'lat', a.lat, 'lng', a.lng,
          'confidence', case when a.paid >= 3 or a.verified >= 8 then 'high'
                             when a.paid >= 1 or a.verified >= 3 then 'medium'
                             else 'low' end
        ) order by a.score desc)
        from areas a
      ), '[]'::jsonb),
      'points', coalesce((
        select jsonb_agg(jsonb_build_object('lat', d.latitude, 'lng', d.longitude, 'area', d.area_name, 'paid', d.paid, 'verified', d.verified, 'referred', d.referred_by_client_id is not null))
        from demand d where d.latitude is not null and d.longitude is not null
      ), '[]'::jsonb),
      'served', coalesce((
        select jsonb_agg(jsonb_build_object('lat', p.latitude, 'lng', p.longitude))
        from people p where p.installed and p.latitude is not null and p.longitude is not null
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.expansion_planner() from public, anon;
grant execute on function public.expansion_planner() to authenticated;
