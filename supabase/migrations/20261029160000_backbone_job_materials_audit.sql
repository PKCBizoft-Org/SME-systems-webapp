-- Three connected pieces:
--   1. Backbone (infrastructure) jobs: work on the network itself, no customer.
--   2. Per-job materials: Out (installation_use with a job) -> Used (declared at
--      finish) -> Returned (must equal Out - Used; a mismatch warns the admins).
--   3. Monthly inventory audit: blind count, recount on variance, admin approval
--      posts adjustments to the ledger.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.tenant_role_in(p_tenant uuid, p_roles text[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = p_tenant and lower(tu.role) = any (p_roles)
  );
$$;
revoke execute on function public.tenant_role_in(uuid, text[]) from public, anon;
grant execute on function public.tenant_role_in(uuid, text[]) to authenticated;

create or replace function public.push_tenant_admins(p_tenant uuid, p_title text, p_body text)
returns void
language plpgsql security definer set search_path = public
as $$
declare u uuid;
begin
  for u in
    select distinct tu.user_id from public.tenant_users tu
    where tu.tenant_id = p_tenant and lower(tu.role) = 'admin' and tu.user_id is not null
  loop
    perform public.team_push(u, p_title, p_body);
  end loop;
end;
$$;
revoke execute on function public.push_tenant_admins(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Backbone jobs
-- ---------------------------------------------------------------------------

create table if not exists public.backbone_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  title text not null check (length(btrim(title)) between 3 and 120),
  job_type text not null default 'repair' check (job_type in ('repair', 'new_installation')),
  area text,
  landmark text,
  latitude double precision,
  longitude double precision,
  description text,
  status text not null default 'open' check (status in ('open', 'assigned', 'in_progress', 'done', 'cancelled')),
  technician_user_id uuid references auth.users(id) on delete set null,
  created_by uuid default auth.uid(),
  resolution text,
  before_photo_path text,
  after_photo_path text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index if not exists backbone_jobs_tenant_idx on public.backbone_jobs (tenant_id, status);
create index if not exists backbone_jobs_tech_idx on public.backbone_jobs (technician_user_id) where technician_user_id is not null;

alter table public.backbone_jobs enable row level security;

drop policy if exists backbone_jobs_select on public.backbone_jobs;
create policy backbone_jobs_select on public.backbone_jobs for select to authenticated
  using (public.tenant_role_in(tenant_id, array['admin', 'technician', 'inventory']));

-- Admins manage them directly on the web; technicians go through the functions below.
drop policy if exists backbone_jobs_admin_write on public.backbone_jobs;
create policy backbone_jobs_admin_write on public.backbone_jobs for all to authenticated
  using (public.tenant_role_in(tenant_id, array['admin']))
  with check (public.tenant_role_in(tenant_id, array['admin']));

create or replace function public.backbone_jobs_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW.technician_user_id is not null and not exists (
    select 1 from public.tenant_users tu
    where tu.user_id = NEW.technician_user_id and tu.tenant_id = NEW.tenant_id and lower(tu.role) = 'technician'
  ) then
    raise exception 'That person is not a technician of this company.';
  end if;
  if NEW.status = 'open' and NEW.technician_user_id is not null then
    NEW.status := 'assigned';
  end if;
  if NEW.status = 'in_progress' and NEW.started_at is null then
    NEW.started_at := now();
  end if;
  if NEW.status = 'done' and NEW.completed_at is null then
    NEW.completed_at := now();
  end if;

  -- Tell the technician when a job is handed to them by someone else.
  if NEW.technician_user_id is not null
     and NEW.technician_user_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or OLD.technician_user_id is distinct from NEW.technician_user_id) then
    perform public.team_push(
      NEW.technician_user_id,
      'New backbone job',
      format('%s%s', NEW.title, coalesce(' · ' || nullif(btrim(NEW.area), ''), ''))
    );
  end if;
  return NEW;
end;
$$;
revoke execute on function public.backbone_jobs_guard() from public, anon, authenticated;

drop trigger if exists backbone_jobs_guard_trg on public.backbone_jobs;
create trigger backbone_jobs_guard_trg
  before insert or update on public.backbone_jobs
  for each row execute function public.backbone_jobs_guard();

-- Technician starts a backbone job on the spot (e.g. a cut fibre).
create or replace function public.backbone_job_create(
  p_title text, p_job_type text, p_area text, p_landmark text,
  p_lat double precision default null, p_lng double precision default null, p_description text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid;
  v_id uuid;
begin
  select tu.tenant_id into v_tenant from public.tenant_users tu
  where tu.user_id = auth.uid() and lower(tu.role) = 'technician'
  order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'Only technicians can start a backbone job.';
  end if;

  insert into public.backbone_jobs (tenant_id, title, job_type, area, landmark, latitude, longitude, description,
                                    status, technician_user_id, created_by)
  values (v_tenant, btrim(p_title), coalesce(p_job_type, 'repair'), nullif(btrim(p_area), ''), nullif(btrim(p_landmark), ''),
          p_lat, p_lng, nullif(btrim(p_description), ''), 'in_progress', auth.uid(), auth.uid())
  returning id into v_id;

  perform public.push_tenant_admins(v_tenant, 'Backbone job started',
    format('%s started: %s', coalesce(nullif(public.team_person_name(auth.uid()), ''), 'A technician'), btrim(p_title)));
  return v_id;
end;
$$;
revoke execute on function public.backbone_job_create(text, text, text, text, double precision, double precision, text) from public, anon;
grant execute on function public.backbone_job_create(text, text, text, text, double precision, double precision, text) to authenticated;

-- accept (open job) / start (assigned to me)
create or replace function public.backbone_job_take(p_job uuid, p_action text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  j public.backbone_jobs%rowtype;
begin
  select * into j from public.backbone_jobs where id = p_job for update;
  if j.id is null or not public.tenant_role_in(j.tenant_id, array['technician']) then
    raise exception 'That backbone job could not be found.';
  end if;
  if p_action = 'accept' then
    if j.status <> 'open' or j.technician_user_id is not null then
      raise exception 'Someone already took this job.';
    end if;
    update public.backbone_jobs set technician_user_id = auth.uid(), status = 'assigned' where id = p_job;
  elsif p_action = 'start' then
    if j.technician_user_id is distinct from auth.uid() or j.status not in ('assigned', 'in_progress') then
      raise exception 'This job is not assigned to you.';
    end if;
    update public.backbone_jobs set status = 'in_progress' where id = p_job;
  else
    raise exception 'Unknown action.';
  end if;
end;
$$;
revoke execute on function public.backbone_job_take(uuid, text) from public, anon;
grant execute on function public.backbone_job_take(uuid, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backbone-photos', 'backbone-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists backbone_photos_insert on storage.objects;
create policy backbone_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'backbone-photos'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.tenant_role_in(((storage.foldername(name))[1])::uuid, array['admin', 'technician'])
  );
drop policy if exists backbone_photos_select on storage.objects;
create policy backbone_photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'backbone-photos'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.tenant_role_in(((storage.foldername(name))[1])::uuid, array['admin', 'technician', 'inventory'])
  );

-- ---------------------------------------------------------------------------
-- 2. Per-job materials
-- ---------------------------------------------------------------------------

alter table public.inventory_movements
  add column if not exists repair_id uuid references public.repair_records(id) on delete set null,
  add column if not exists backbone_job_id uuid references public.backbone_jobs(id) on delete set null;
create index if not exists inventory_movements_repair_idx on public.inventory_movements (repair_id) where repair_id is not null;
create index if not exists inventory_movements_backbone_idx on public.inventory_movements (backbone_job_id) where backbone_job_id is not null;

create table if not exists public.job_materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  repair_id uuid references public.repair_records(id) on delete cascade,
  backbone_job_id uuid references public.backbone_jobs(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  qty_used numeric not null check (qty_used >= 0),
  used_declared_by uuid,
  used_declared_at timestamptz not null default now(),
  return_done_at timestamptz,
  return_done_by uuid,
  return_note text,
  check ((repair_id is null) <> (backbone_job_id is null))
);
create unique index if not exists job_materials_repair_item on public.job_materials (repair_id, item_id) where repair_id is not null;
create unique index if not exists job_materials_backbone_item on public.job_materials (backbone_job_id, item_id) where backbone_job_id is not null;

alter table public.job_materials enable row level security;
drop policy if exists job_materials_select on public.job_materials;
create policy job_materials_select on public.job_materials for select to authenticated
  using (public.inventory_has_access(tenant_id) or used_declared_by = (select auth.uid()));

-- Who may work on a job's materials; returns the job's company or raises.
create or replace function public.job_tenant_for_materials(p_repair uuid, p_backbone uuid)
returns uuid
language plpgsql stable security definer set search_path = public
as $$
declare
  v_tenant uuid;
  v_tech uuid;
begin
  if (p_repair is null) = (p_backbone is null) then
    raise exception 'Choose one job.';
  end if;
  if p_repair is not null then
    select c.tenant_id, r.technician_user_id into v_tenant, v_tech
    from public.repair_records r join public.clients c on c.id = r.client_id where r.id = p_repair;
    if v_tenant is null then raise exception 'That job could not be found.'; end if;
    if v_tech = auth.uid() or public.inventory_has_access(v_tenant) or exists (
      select 1 from public.repair_job_crew cr where cr.repair_id = p_repair and cr.user_id = auth.uid() and cr.status = 'accepted'
    ) then
      return v_tenant;
    end if;
  else
    select tenant_id, technician_user_id into v_tenant, v_tech from public.backbone_jobs where id = p_backbone;
    if v_tenant is null then raise exception 'That backbone job could not be found.'; end if;
    if v_tech = auth.uid() or public.inventory_has_access(v_tenant) then
      return v_tenant;
    end if;
  end if;
  raise exception 'This job is not yours.';
end;
$$;
revoke execute on function public.job_tenant_for_materials(uuid, uuid) from public, anon, authenticated;

-- Out / used / returned per item for one job.
create or replace function public.job_material_lines(p_repair uuid default null, p_backbone uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_out jsonb;
begin
  perform public.job_tenant_for_materials(p_repair, p_backbone);
  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id', x.item_id, 'name', i.name, 'unit', i.unit,
           'out', x.out_qty, 'returned', x.ret_qty,
           'used', jm.qty_used, 'return_done', jm.return_done_at is not null,
           'expected_return', case when jm.qty_used is null then null else x.out_qty - jm.qty_used end
         ) order by i.name), '[]'::jsonb) into v_out
  from (
    select m.item_id,
           coalesce(sum(-m.quantity_change) filter (where m.movement_type = 'installation_use'), 0) as out_qty,
           coalesce(sum(m.quantity_change) filter (where m.movement_type = 'return'), 0) as ret_qty
    from public.inventory_movements m
    where (p_repair is not null and m.repair_id = p_repair) or (p_backbone is not null and m.backbone_job_id = p_backbone)
    group by m.item_id
  ) x
  join public.inventory_items i on i.id = x.item_id
  left join public.job_materials jm on jm.item_id = x.item_id
    and ((p_repair is not null and jm.repair_id = p_repair) or (p_backbone is not null and jm.backbone_job_id = p_backbone))
  where x.out_qty > 0;
  return v_out;
end;
$$;
revoke execute on function public.job_material_lines(uuid, uuid) from public, anon;
grant execute on function public.job_material_lines(uuid, uuid) to authenticated;

-- When the job is finished: how much of each item taken out was really used.
-- p_lines: [{"item_id": "...", "qty": 3}]
create or replace function public.declare_job_materials_used(p_repair uuid, p_backbone uuid, p_lines jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.job_tenant_for_materials(p_repair, p_backbone);
  l jsonb;
  v_qty numeric;
  v_all_used boolean := true;
begin
  for l in select * from jsonb_array_elements(public.job_material_lines(p_repair, p_backbone)) loop
    if (l->>'return_done')::boolean then
      raise exception 'The leftovers for this job were already returned.';
    end if;
    select (e->>'qty')::numeric into v_qty
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e where e->>'item_id' = l->>'item_id';
    if v_qty is null then
      raise exception 'Say how much % you used.', l->>'name';
    end if;
    if v_qty < 0 or v_qty > (l->>'out')::numeric then
      raise exception 'Used % must be between 0 and the % you took.', l->>'name', l->>'out';
    end if;
    if v_qty < (l->>'out')::numeric - (l->>'returned')::numeric then
      v_all_used := false;
    end if;

    update public.job_materials set qty_used = v_qty, used_declared_by = auth.uid(), used_declared_at = now()
    where item_id = (l->>'item_id')::uuid
      and ((p_repair is not null and repair_id = p_repair) or (p_backbone is not null and backbone_job_id = p_backbone));
    if not found then
      insert into public.job_materials (tenant_id, repair_id, backbone_job_id, item_id, qty_used, used_declared_by)
      values (v_tenant, p_repair, p_backbone, (l->>'item_id')::uuid, v_qty, auth.uid());
    end if;
  end loop;

  -- Everything taken was used: nothing to bring back, so the return is complete.
  if v_all_used then
    update public.job_materials set return_done_at = now(), return_done_by = auth.uid()
    where ((p_repair is not null and repair_id = p_repair) or (p_backbone is not null and backbone_job_id = p_backbone))
      and return_done_at is null;
  end if;
  return public.job_material_lines(p_repair, p_backbone);
end;
$$;
revoke execute on function public.declare_job_materials_used(uuid, uuid, jsonb) from public, anon;
grant execute on function public.declare_job_materials_used(uuid, uuid, jsonb) to authenticated;

-- Bring back the leftovers. They should equal Out - Used; a different amount
-- needs a reason and warns the admins.
create or replace function public.return_job_materials(p_repair uuid, p_backbone uuid, p_lines jsonb, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.job_tenant_for_materials(p_repair, p_backbone);
  v_client uuid;
  l jsonb;
  v_qty numeric;
  v_expected numeric;
  v_mismatch text[] := array[]::text[];
  v_job text;
begin
  if p_repair is not null then
    select r.client_id, coalesce(c.customer_name, 'customer') into v_client, v_job
    from public.repair_records r join public.clients c on c.id = r.client_id where r.id = p_repair;
  else
    select title into v_job from public.backbone_jobs where id = p_backbone;
  end if;

  for l in select * from jsonb_array_elements(public.job_material_lines(p_repair, p_backbone)) loop
    if l->'used' is null or l->>'used' is null then
      raise exception 'Declare what you used first.';
    end if;
    if (l->>'return_done')::boolean then
      continue;
    end if;
    v_expected := (l->>'out')::numeric - (l->>'used')::numeric - (l->>'returned')::numeric;
    select (e->>'qty')::numeric into v_qty
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e where e->>'item_id' = l->>'item_id';
    v_qty := coalesce(v_qty, 0);
    if v_qty < 0 then
      raise exception 'Returned amounts cannot be negative.';
    end if;
    if v_qty <> v_expected then
      v_mismatch := v_mismatch || format('%s: expected %s, returned %s', l->>'name', trim_scale(v_expected), trim_scale(v_qty));
    end if;
    if v_qty > 0 then
      insert into public.inventory_movements (item_id, movement_type, quantity_change, client_id, repair_id, backbone_job_id,
                                              reference, notes)
      values ((l->>'item_id')::uuid, 'return', v_qty, v_client, p_repair, p_backbone, 'job-return',
              coalesce(nullif(btrim(p_note), ''), 'Unused from job'));
    end if;
  end loop;

  if cardinality(v_mismatch) > 0 and coalesce(btrim(p_note), '') = '' then
    raise exception 'The return does not match what should come back (%). Explain why.', array_to_string(v_mismatch, '; ');
  end if;

  update public.job_materials
  set return_done_at = now(), return_done_by = auth.uid(),
      return_note = case when cardinality(v_mismatch) > 0 then btrim(p_note) else return_note end
  where ((p_repair is not null and repair_id = p_repair) or (p_backbone is not null and backbone_job_id = p_backbone))
    and return_done_at is null;

  if cardinality(v_mismatch) > 0 then
    perform public.push_tenant_admins(v_tenant, '⚠ Return does not match',
      format('%s, job %s: %s', coalesce(nullif(public.team_person_name(auth.uid()), ''), 'Technician'), v_job,
             array_to_string(v_mismatch, '; ')));
  end if;
  return jsonb_build_object('mismatches', to_jsonb(v_mismatch));
end;
$$;
revoke execute on function public.return_job_materials(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.return_job_materials(uuid, uuid, jsonb, text) to authenticated;

-- A backbone job can only be closed once its materials are declared.
create or replace function public.backbone_job_finish(p_job uuid, p_resolution text, p_before text, p_after text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  j public.backbone_jobs%rowtype;
begin
  select * into j from public.backbone_jobs where id = p_job for update;
  if j.id is null or j.technician_user_id is distinct from auth.uid() then
    raise exception 'This job is not assigned to you.';
  end if;
  if j.status in ('done', 'cancelled') then
    raise exception 'This job is already closed.';
  end if;
  if coalesce(btrim(p_resolution), '') = '' then
    raise exception 'Write what you did.';
  end if;
  if p_before is null or p_after is null
     or split_part(p_before, '/', 1) <> j.tenant_id::text or split_part(p_after, '/', 1) <> j.tenant_id::text then
    raise exception 'Add the before and after photos.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(public.job_material_lines(null, p_job)) l where l->>'used' is null
  ) then
    raise exception 'Declare the materials you used first.';
  end if;

  update public.backbone_jobs
  set status = 'done', resolution = btrim(p_resolution), before_photo_path = p_before, after_photo_path = p_after
  where id = p_job;

  perform public.push_tenant_admins(j.tenant_id, 'Backbone job done',
    format('%s finished: %s', coalesce(nullif(public.team_person_name(auth.uid()), ''), 'A technician'), j.title));
end;
$$;
revoke execute on function public.backbone_job_finish(uuid, text, text, text) from public, anon;
grant execute on function public.backbone_job_finish(uuid, text, text, text) to authenticated;

-- Admin page: Out / Used / Returned per job and item.
create or replace function public.job_materials_report(p_days integer default 60)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_tenants uuid[];
  v_out jsonb;
begin
  select array_agg(tu.tenant_id) into v_tenants from public.tenant_users tu
  where tu.user_id = auth.uid() and lower(tu.role) in ('admin', 'inventory');
  if v_tenants is null then
    raise exception 'Only admin and inventory staff can see this.';
  end if;

  with moves as (
    select m.repair_id, m.backbone_job_id, m.item_id, m.tenant_id,
           coalesce(sum(-m.quantity_change) filter (where m.movement_type = 'installation_use'), 0) as out_qty,
           coalesce(sum(m.quantity_change) filter (where m.movement_type = 'return'), 0) as ret_qty,
           min(m.created_at) as first_at,
           (array_agg(m.created_by order by m.created_at) filter (where m.movement_type = 'installation_use'))[1] as taken_by
    from public.inventory_movements m
    where m.tenant_id = any (v_tenants)
      and (m.repair_id is not null or m.backbone_job_id is not null)
      and m.created_at > now() - make_interval(days => greatest(1, least(p_days, 366)))
    group by m.repair_id, m.backbone_job_id, m.item_id, m.tenant_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', case when x.repair_id is not null then 'client' else 'backbone' end,
           'job_id', coalesce(x.repair_id, x.backbone_job_id),
           'job', coalesce(c.customer_name, b.title, 'Job'),
           'job_type', coalesce(r.job_type, b.job_type),
           'job_status', coalesce(r.status, b.status),
           'technician', coalesce(nullif(public.team_person_name(x.taken_by), ''), 'Technician'),
           'item', i.name, 'unit', i.unit, 'unit_cost', coalesce(i.unit_cost, 0),
           'out', x.out_qty, 'used', jm.qty_used, 'returned', x.ret_qty,
           'return_done', jm.return_done_at is not null, 'return_note', jm.return_note,
           'diff', case when jm.return_done_at is not null then x.ret_qty - (x.out_qty - jm.qty_used) end,
           'at', x.first_at
         ) order by x.first_at desc, i.name), '[]'::jsonb) into v_out
  from moves x
  join public.inventory_items i on i.id = x.item_id
  left join public.repair_records r on r.id = x.repair_id
  left join public.clients c on c.id = r.client_id
  left join public.backbone_jobs b on b.id = x.backbone_job_id
  left join public.job_materials jm on jm.item_id = x.item_id
    and ((x.repair_id is not null and jm.repair_id = x.repair_id) or (x.backbone_job_id is not null and jm.backbone_job_id = x.backbone_job_id))
  where x.out_qty > 0;
  return v_out;
end;
$$;
revoke execute on function public.job_materials_report(integer) from public, anon;
grant execute on function public.job_materials_report(integer) to authenticated;

-- Ledger checks, now aware of jobs. Same rules as before plus:
--   * a movement linked to a customer job takes its customer from the job;
--   * a backbone job needs no customer;
--   * technicians may only take/return for jobs that are theirs, and returns
--     are capped by what was taken for that job.
create or replace function public.inventory_movements_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid;
  v_active boolean;
  v_on_hand numeric;
  v_client_tenant uuid;
  v_taken numeric;
  v_job_tenant uuid;
  v_job_tech uuid;
  v_job_status text;
  v_job_client uuid;
begin
  select i.tenant_id, i.is_active, i.quantity_on_hand into v_tenant, v_active, v_on_hand
  from public.inventory_items i where i.id = NEW.item_id for update;
  if v_tenant is null then raise exception 'Inventory item not found.'; end if;

  NEW.tenant_id := v_tenant;
  NEW.created_by := coalesce(auth.uid(), NEW.created_by);
  NEW.created_at := now();
  select u.email into NEW.created_by_email from auth.users u where u.id = NEW.created_by;
  select p.full_name into NEW.created_by_name from public.user_profiles p where p.user_id = NEW.created_by;

  if NEW.repair_id is not null and NEW.backbone_job_id is not null then
    raise exception 'A movement belongs to one job only.';
  end if;
  if NEW.repair_id is not null then
    select r.client_id, r.technician_user_id, r.status into v_job_client, v_job_tech, v_job_status
    from public.repair_records r where r.id = NEW.repair_id;
    if v_job_client is null then raise exception 'That job could not be found.'; end if;
    NEW.client_id := v_job_client;
  end if;
  if NEW.backbone_job_id is not null then
    select b.tenant_id, b.technician_user_id, b.status into v_job_tenant, v_job_tech, v_job_status
    from public.backbone_jobs b where b.id = NEW.backbone_job_id;
    if v_job_tenant is distinct from v_tenant then raise exception 'That backbone job belongs to another company.'; end if;
    NEW.client_id := null;
  end if;

  if not v_active then raise exception 'This item is archived. Reactivate it before recording stock.'; end if;
  if NEW.movement_type in ('stock_in','return') and NEW.quantity_change <= 0 then
    raise exception '% must add stock (positive quantity).', NEW.movement_type;
  end if;
  if NEW.movement_type in ('installation_use','stock_out') and NEW.quantity_change >= 0 then
    raise exception '% must remove stock (negative quantity).', NEW.movement_type;
  end if;
  if NEW.movement_type = 'installation_use' and NEW.client_id is null and NEW.backbone_job_id is null then
    raise exception 'Select the client installation these materials were used on.';
  end if;
  if NEW.client_id is not null then
    select c.tenant_id into v_client_tenant from public.clients c where c.id = NEW.client_id;
    if v_client_tenant is distinct from v_tenant then raise exception 'That client does not belong to this tenant.'; end if;
  end if;

  if auth.uid() is not null and not public.inventory_has_access(v_tenant) then
    if NEW.movement_type not in ('installation_use','return') then
      raise exception 'Technicians can only take materials for a job or return unused ones.';
    end if;

    if NEW.repair_id is not null or NEW.backbone_job_id is not null then
      if v_job_tech is distinct from auth.uid() and not exists (
        select 1 from public.repair_job_crew cr
        where NEW.repair_id is not null and cr.repair_id = NEW.repair_id and cr.user_id = auth.uid() and cr.status = 'accepted'
      ) then
        raise exception 'You can only take materials for your own jobs.';
      end if;
      if NEW.movement_type = 'installation_use'
         and lower(coalesce(v_job_status, '')) ~ '(complete|resolved|done|fixed|cancel)' then
        raise exception 'This job is already closed.';
      end if;
      if NEW.movement_type = 'return' then
        select coalesce(sum(-m.quantity_change), 0) into v_taken
        from public.inventory_movements m
        where m.item_id = NEW.item_id and m.movement_type in ('installation_use','return')
          and ((NEW.repair_id is not null and m.repair_id = NEW.repair_id)
            or (NEW.backbone_job_id is not null and m.backbone_job_id = NEW.backbone_job_id));
        if NEW.quantity_change > v_taken then
          raise exception 'You can only return up to % that was taken for this job.', v_taken;
        end if;
      end if;
    elsif NEW.movement_type = 'return' then
      if NEW.client_id is null then raise exception 'Select the client job these materials are being returned from.'; end if;
      select coalesce(sum(-m.quantity_change), 0) into v_taken
      from public.inventory_movements m
      where m.item_id = NEW.item_id and m.client_id = NEW.client_id and m.created_by = NEW.created_by
        and m.movement_type in ('installation_use','return');
      if NEW.quantity_change > v_taken then
        raise exception 'You can only return up to % that you took for this client.', v_taken;
      end if;
    end if;
  end if;

  if v_on_hand + NEW.quantity_change < 0 then
    raise exception 'Insufficient stock: % on hand, cannot remove %.', v_on_hand, abs(NEW.quantity_change);
  end if;
  return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Monthly inventory audit
-- ---------------------------------------------------------------------------

alter table public.truck_stock_log drop constraint if exists truck_stock_log_kind_check;
alter table public.truck_stock_log add constraint truck_stock_log_kind_check
  check (kind = any (array['load', 'unload', 'use', 'audit']));

create table if not exists public.inventory_audits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  period date not null,
  status text not null default 'counting' check (status in ('counting', 'review', 'approved', 'cancelled')),
  started_by uuid default auth.uid(),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  notes text
);
create unique index if not exists inventory_audits_one_per_month
  on public.inventory_audits (tenant_id, period) where status <> 'cancelled';

create table if not exists public.inventory_audit_lines (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.inventory_audits(id) on delete cascade,
  tenant_id uuid not null,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  holder_user_id uuid,                      -- null = warehouse, else that technician's truck
  location text,
  system_qty numeric,                       -- what the system said at the moment of the (re)count
  counted_qty numeric check (counted_qty is null or counted_qty >= 0),
  counted_by uuid,
  counted_at timestamptz,
  recount_qty numeric check (recount_qty is null or recount_qty >= 0),
  recounted_by uuid,
  recounted_at timestamptz,
  reason text check (reason is null or reason in ('damaged', 'lost', 'found', 'wrong_entry', 'other')),
  note text
);
create unique index if not exists inventory_audit_lines_unique
  on public.inventory_audit_lines (audit_id, item_id, coalesce(holder_user_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.inventory_audits enable row level security;
alter table public.inventory_audit_lines enable row level security;
-- Everything goes through the functions below (they hide system counts while counting).
drop policy if exists inventory_audits_select on public.inventory_audits;
create policy inventory_audits_select on public.inventory_audits for select to authenticated
  using (public.inventory_has_access(tenant_id));

create or replace function public.audit_tenant()
returns uuid
language sql stable security definer set search_path = public
as $$
  select tu.tenant_id from public.tenant_users tu
  where tu.user_id = auth.uid() and lower(tu.role) in ('admin', 'inventory')
  order by (lower(tu.role) = 'admin') desc, tu.tenant_id limit 1;
$$;
revoke execute on function public.audit_tenant() from public, anon, authenticated;

create or replace function public.audit_start()
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.audit_tenant();
  v_period date := date_trunc('month', (now() at time zone 'Asia/Manila'))::date;
  v_id uuid;
begin
  if v_tenant is null then raise exception 'Only admin and inventory staff can run an audit.'; end if;
  if exists (select 1 from public.inventory_audits where tenant_id = v_tenant and status in ('counting', 'review')) then
    raise exception 'An audit is already open. Finish or cancel it first.';
  end if;
  if exists (select 1 from public.inventory_audits where tenant_id = v_tenant and period = v_period and status = 'approved') then
    raise exception 'This month''s audit is already approved.';
  end if;

  insert into public.inventory_audits (tenant_id, period) values (v_tenant, v_period) returning id into v_id;

  insert into public.inventory_audit_lines (audit_id, tenant_id, item_id, holder_user_id, location)
  select v_id, v_tenant, i.id, null, coalesce(nullif(btrim(i.location), ''), 'No location')
  from public.inventory_items i where i.tenant_id = v_tenant and i.is_active;

  insert into public.inventory_audit_lines (audit_id, tenant_id, item_id, holder_user_id, location)
  select v_id, v_tenant, s.item_id, s.user_id,
         'Truck: ' || coalesce(nullif(public.team_person_name(s.user_id), ''), 'technician')
  from public.truck_stock s where s.tenant_id = v_tenant and s.quantity > 0;

  return v_id;
end;
$$;
revoke execute on function public.audit_start() from public, anon;
grant execute on function public.audit_start() to authenticated;

-- Current system quantity for a line (warehouse or truck).
create or replace function public.audit_system_qty(p_item uuid, p_holder uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select case when p_holder is null
    then (select quantity_on_hand from public.inventory_items where id = p_item)
    else coalesce((select quantity from public.truck_stock where item_id = p_item and user_id = p_holder), 0)
  end;
$$;
revoke execute on function public.audit_system_qty(uuid, uuid) from public, anon, authenticated;

-- How many people can count/approve; a one-person shop may check its own count.
create or replace function public.audit_staff_count(p_tenant uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select count(distinct tu.user_id)::int from public.tenant_users tu
  where tu.tenant_id = p_tenant and lower(tu.role) in ('admin', 'inventory');
$$;
revoke execute on function public.audit_staff_count(uuid) from public, anon, authenticated;

-- Count (status counting) or recount a flagged line (status review).
create or replace function public.audit_count(p_line uuid, p_qty numeric)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  ln public.inventory_audit_lines%rowtype;
  a public.inventory_audits%rowtype;
begin
  select * into ln from public.inventory_audit_lines where id = p_line for update;
  select * into a from public.inventory_audits where id = ln.audit_id;
  if a.id is null or not public.inventory_has_access(a.tenant_id) then raise exception 'Audit line not found.'; end if;
  if p_qty is null or p_qty < 0 then raise exception 'Enter the quantity you counted (0 or more).'; end if;

  if a.status = 'counting' then
    update public.inventory_audit_lines
    set counted_qty = p_qty, counted_by = auth.uid(), counted_at = now(),
        system_qty = public.audit_system_qty(item_id, holder_user_id)
    where id = p_line;
  elsif a.status = 'review' then
    if ln.counted_qty is null or ln.counted_qty = ln.system_qty then
      raise exception 'This line does not need a recount.';
    end if;
    if ln.counted_by = auth.uid() and public.audit_staff_count(a.tenant_id) > 1 then
      raise exception 'A different person must do the recount.';
    end if;
    update public.inventory_audit_lines
    set recount_qty = p_qty, recounted_by = auth.uid(), recounted_at = now(),
        system_qty = public.audit_system_qty(item_id, holder_user_id)
    where id = p_line;
  else
    raise exception 'This audit is closed.';
  end if;
end;
$$;
revoke execute on function public.audit_count(uuid, numeric) from public, anon;
grant execute on function public.audit_count(uuid, numeric) to authenticated;

create or replace function public.audit_set_reason(p_line uuid, p_reason text, p_note text)
returns void
language plpgsql security definer set search_path = public
as $$
declare a public.inventory_audits%rowtype;
begin
  select au.* into a from public.inventory_audits au join public.inventory_audit_lines l on l.audit_id = au.id where l.id = p_line;
  if a.id is null or not public.inventory_has_access(a.tenant_id) then raise exception 'Audit line not found.'; end if;
  if a.status <> 'review' then raise exception 'Reasons are added during review.'; end if;
  update public.inventory_audit_lines set reason = p_reason, note = nullif(btrim(p_note), '') where id = p_line;
end;
$$;
revoke execute on function public.audit_set_reason(uuid, text, text) from public, anon;
grant execute on function public.audit_set_reason(uuid, text, text) to authenticated;

-- Lines for the page. While counting, the system quantity stays hidden (blind count).
create or replace function public.audit_detail(p_audit uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  a public.inventory_audits%rowtype;
  v_blind boolean;
begin
  select * into a from public.inventory_audits where id = p_audit;
  if a.id is null or not public.inventory_has_access(a.tenant_id) then raise exception 'Audit not found.'; end if;
  v_blind := a.status = 'counting';

  return jsonb_build_object(
    'audit', jsonb_build_object(
      'id', a.id, 'period', a.period, 'status', a.status, 'started_at', a.started_at, 'approved_at', a.approved_at,
      'started_by', public.team_person_name(a.started_by), 'approved_by', public.team_person_name(a.approved_by)),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'item_id', l.item_id, 'item', i.name, 'unit', i.unit, 'sku', i.sku, 'barcode', i.barcode,
        'unit_cost', coalesce(i.unit_cost, 0), 'location', l.location, 'truck', l.holder_user_id is not null,
        'counted_qty', l.counted_qty, 'counted_by', public.team_person_name(l.counted_by),
        'counted_by_me', l.counted_by = auth.uid(),
        'recount_qty', l.recount_qty, 'recounted_by', public.team_person_name(l.recounted_by),
        'system_qty', case when v_blind then null else l.system_qty end,
        'final_qty', coalesce(l.recount_qty, l.counted_qty),
        'variance', case when v_blind or l.counted_qty is null then null else coalesce(l.recount_qty, l.counted_qty) - l.system_qty end,
        'needs_recount', not v_blind and l.counted_qty is not null and l.counted_qty <> l.system_qty and l.recount_qty is null,
        'reason', l.reason, 'note', l.note
      ) order by l.location, i.name)
      from public.inventory_audit_lines l join public.inventory_items i on i.id = l.item_id
      where l.audit_id = a.id), '[]'::jsonb),
    -- Stock out on jobs that has not come back yet (not on any shelf).
    'in_field', coalesce((
      select jsonb_agg(jsonb_build_object('item', i.name, 'unit', i.unit, 'qty', f.qty) order by i.name)
      from (
        select m.item_id, sum(-m.quantity_change) - coalesce(max(jm.qty_used), 0) as qty
        from public.inventory_movements m
        left join public.job_materials jm on jm.item_id = m.item_id
          and (jm.repair_id = m.repair_id or jm.backbone_job_id = m.backbone_job_id)
        where m.tenant_id = a.tenant_id and (m.repair_id is not null or m.backbone_job_id is not null)
          and m.movement_type in ('installation_use', 'return')
          and (jm.id is null or jm.return_done_at is null)
        group by m.item_id, coalesce(m.repair_id, m.backbone_job_id)
      ) f join public.inventory_items i on i.id = f.item_id
      where f.qty > 0), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.audit_detail(uuid) from public, anon;
grant execute on function public.audit_detail(uuid) to authenticated;

create or replace function public.audit_list()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_tenant uuid := public.audit_tenant();
begin
  if v_tenant is null then raise exception 'Only admin and inventory staff can see audits.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'period', a.period, 'status', a.status, 'started_at', a.started_at, 'approved_at', a.approved_at,
      'lines', (select count(*) from public.inventory_audit_lines l where l.audit_id = a.id),
      'counted', (select count(*) from public.inventory_audit_lines l where l.audit_id = a.id and l.counted_qty is not null),
      'matched', (select count(*) from public.inventory_audit_lines l where l.audit_id = a.id
                    and coalesce(l.recount_qty, l.counted_qty) = l.system_qty),
      'value_diff', case when a.status = 'counting' then null else (
        select coalesce(sum((coalesce(l.recount_qty, l.counted_qty) - l.system_qty) * coalesce(i.unit_cost, 0)), 0)
        from public.inventory_audit_lines l join public.inventory_items i on i.id = l.item_id
        where l.audit_id = a.id and l.counted_qty is not null) end
    ) order by a.period desc, a.started_at desc)
    from public.inventory_audits a where a.tenant_id = v_tenant), '[]'::jsonb);
end;
$$;
revoke execute on function public.audit_list() from public, anon;
grant execute on function public.audit_list() to authenticated;

-- counting -> review (all lines counted), review -> approved (posts adjustments), or cancel.
create or replace function public.audit_advance(p_audit uuid, p_action text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  a public.inventory_audits%rowtype;
  ln record;
  v_var numeric;
  v_label text;
begin
  select * into a from public.inventory_audits where id = p_audit for update;
  if a.id is null or not public.inventory_has_access(a.tenant_id) then raise exception 'Audit not found.'; end if;
  v_label := 'Audit ' || to_char(a.period, 'YYYY-MM');

  if p_action = 'cancel' then
    if a.status not in ('counting', 'review') then raise exception 'This audit is closed.'; end if;
    update public.inventory_audits set status = 'cancelled' where id = p_audit;
    return;
  end if;

  if p_action = 'submit' then
    if a.status <> 'counting' then raise exception 'This audit is not counting.'; end if;
    if exists (select 1 from public.inventory_audit_lines where audit_id = p_audit and counted_qty is null) then
      raise exception 'Count every line first.';
    end if;
    update public.inventory_audits set status = 'review', submitted_at = now() where id = p_audit;
    return;
  end if;

  if p_action <> 'approve' then raise exception 'Unknown action.'; end if;
  if a.status <> 'review' then raise exception 'Submit the count for review first.'; end if;
  if not public.tenant_role_in(a.tenant_id, array['admin']) then raise exception 'Only an admin can approve an audit.'; end if;
  if exists (
    select 1 from public.inventory_audit_lines where audit_id = p_audit and counted_qty <> system_qty and recount_qty is null
  ) then
    raise exception 'Recount every line that did not match.';
  end if;
  if exists (
    select 1 from public.inventory_audit_lines
    where audit_id = p_audit and recount_qty is not null and recount_qty <> system_qty and reason is null
  ) then
    raise exception 'Give a reason for every line that still does not match.';
  end if;
  if public.audit_staff_count(a.tenant_id) > 1 and exists (
    select 1 from public.inventory_audit_lines
    where audit_id = p_audit and counted_qty <> system_qty and auth.uid() in (counted_by, recounted_by)
  ) then
    raise exception 'Someone who did not count the mismatched lines must approve.';
  end if;

  for ln in
    select l.*, i.name from public.inventory_audit_lines l join public.inventory_items i on i.id = l.item_id
    where l.audit_id = p_audit and coalesce(l.recount_qty, l.counted_qty) <> l.system_qty
  loop
    v_var := coalesce(ln.recount_qty, ln.counted_qty) - ln.system_qty;
    if ln.holder_user_id is null then
      insert into public.inventory_movements (item_id, movement_type, quantity_change, reference, notes)
      values (ln.item_id, 'adjustment', v_var, v_label, coalesce(ln.reason, 'audit') || coalesce(': ' || ln.note, ''));
    else
      update public.truck_stock set quantity = greatest(0, quantity + v_var), updated_at = now()
      where user_id = ln.holder_user_id and item_id = ln.item_id;
      insert into public.truck_stock_log (tenant_id, user_id, item_id, change, kind, created_by)
      values (a.tenant_id, ln.holder_user_id, ln.item_id, v_var, 'audit', auth.uid());
    end if;
  end loop;

  update public.inventory_audits set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_audit;
end;
$$;
revoke execute on function public.audit_advance(uuid, text) from public, anon;
grant execute on function public.audit_advance(uuid, text) to authenticated;

-- Reminders: on the 1st when no audit has started, on the 5th when it is not approved.
create or replace function public.audit_reminders()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t uuid;
  v_period date := date_trunc('month', (now() at time zone 'Asia/Manila'))::date;
  v_day int := extract(day from (now() at time zone 'Asia/Manila'))::int;
  u uuid;
begin
  for t in select distinct tenant_id from public.inventory_items loop
    if v_day = 1 and not exists (select 1 from public.inventory_audits where tenant_id = t and period = v_period and status <> 'cancelled') then
      for u in select distinct user_id from public.tenant_users where tenant_id = t and lower(role) in ('admin', 'inventory') loop
        perform public.team_push(u, 'Monthly stock count is due', 'Open Inventory → Audit on the website and start this month''s count.');
      end loop;
    elsif v_day = 5 and not exists (select 1 from public.inventory_audits where tenant_id = t and period = v_period and status = 'approved') then
      perform public.push_tenant_admins(t, 'Stock audit not finished', 'This month''s inventory audit is still not approved.');
    end if;
  end loop;
end;
$$;
revoke execute on function public.audit_reminders() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('pkc-inventory-audit-reminders')
  where exists (select 1 from cron.job where jobname = 'pkc-inventory-audit-reminders');
  perform cron.schedule('pkc-inventory-audit-reminders', '0 1 * * *', 'select public.audit_reminders()');
end;
$$;

-- Phones refresh the backbone list live.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'backbone_jobs') then
    alter publication supabase_realtime add table public.backbone_jobs;
  end if;
end $$;
