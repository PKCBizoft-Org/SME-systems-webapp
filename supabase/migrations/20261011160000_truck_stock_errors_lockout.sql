-- Round 2, part 2: truck stock, error monitoring, login lockout.
--
--   * truck_stock: what each technician carries. Inventory staff LOAD stock onto
--     a truck (it leaves the central stock, with a normal stock-out record) and
--     can UNLOAD it back. A technician USES truck stock on a customer's job and
--     is warned when an item runs low. Every change is kept in truck_stock_log.
--   * app_errors: crashes and failed actions reported by the mobile app, grouped
--     for staff with the 'audit' permission.
--   * login_attempts: counts wrong passwords per email. After 5 in 15 minutes the
--     email is locked for 15 minutes. NOTE: Supabase's free plan cannot block a
--     sign-in on the server, so the lock is enforced by the PKC BIZOFT apps (they
--     check before signing in and sign out again if the account is locked).

-- ------------------------------------------------------------ truck stock
create table if not exists public.truck_stock (
  tenant_id uuid not null,
  user_id uuid not null,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  quantity numeric not null check (quantity >= 0),
  min_quantity numeric not null default 2 check (min_quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists public.truck_stock_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  item_id uuid not null,
  change numeric not null,
  kind text not null check (kind in ('load', 'unload', 'use')),
  client_id uuid,
  repair_id uuid,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists truck_stock_log_user_idx on public.truck_stock_log (user_id, created_at desc);

alter table public.truck_stock enable row level security;
alter table public.truck_stock_log enable row level security;

drop policy if exists "own or inventory staff read truck stock" on public.truck_stock;
create policy "own or inventory staff read truck stock" on public.truck_stock
  for select to authenticated using (user_id = auth.uid() or public.inventory_has_access(tenant_id));

drop policy if exists "own or inventory staff read truck log" on public.truck_stock_log;
create policy "own or inventory staff read truck log" on public.truck_stock_log
  for select to authenticated using (user_id = auth.uid() or public.inventory_has_access(tenant_id));

revoke insert, update, delete on public.truck_stock, public.truck_stock_log from anon, authenticated;

create or replace function public.load_truck_stock(p_user uuid, p_item uuid, p_qty numeric, p_min numeric default null)
returns numeric
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_item public.inventory_items%rowtype;
  v_tech_name text;
  v_new numeric;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_item from public.inventory_items where id = p_item;
  if not found then
    raise exception 'That item could not be found.';
  end if;
  if not public.inventory_has_access(v_item.tenant_id) then
    raise exception 'Only inventory staff can load a truck.';
  end if;
  if not exists (
    select 1 from public.tenant_users tu
    where tu.user_id = p_user and tu.tenant_id = v_item.tenant_id and lower(tu.role) = 'technician'
  ) then
    raise exception 'That person is not a technician of this company.';
  end if;
  if p_qty is null or p_qty <= 0 or p_qty > 10000 then
    raise exception 'Enter a quantity above 0.';
  end if;
  if p_min is not null and (p_min < 0 or p_min > 10000) then
    raise exception 'The low-stock level is not valid.';
  end if;

  v_tech_name := coalesce(nullif(public.team_person_name(p_user), ''), 'technician');

  -- Takes it out of the central stock (fails with a clear message if there is not enough).
  insert into public.inventory_movements (item_id, movement_type, quantity_change, reference, notes)
  values (p_item, 'stock_out', -p_qty, 'truck-load', 'Loaded to truck: ' || v_tech_name);

  insert into public.truck_stock (tenant_id, user_id, item_id, quantity, min_quantity)
  values (v_item.tenant_id, p_user, p_item, p_qty, coalesce(p_min, 2))
  on conflict (user_id, item_id) do update
    set quantity = public.truck_stock.quantity + excluded.quantity,
        min_quantity = coalesce(p_min, public.truck_stock.min_quantity),
        updated_at = now()
  returning quantity into v_new;

  insert into public.truck_stock_log (tenant_id, user_id, item_id, change, kind, created_by)
  values (v_item.tenant_id, p_user, p_item, p_qty, 'load', v_uid);

  return v_new;
end;
$fn$;

revoke all on function public.load_truck_stock(uuid, uuid, numeric, numeric) from public, anon;
grant execute on function public.load_truck_stock(uuid, uuid, numeric, numeric) to authenticated, service_role;

create or replace function public.unload_truck_stock(p_user uuid, p_item uuid, p_qty numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_row public.truck_stock%rowtype;
  v_tech_name text;
  v_new numeric;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_row from public.truck_stock where user_id = p_user and item_id = p_item for update;
  if not found then
    raise exception 'That technician has none of this item on the truck.';
  end if;
  if not public.inventory_has_access(v_row.tenant_id) then
    raise exception 'Only inventory staff can unload a truck.';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Enter a quantity above 0.';
  end if;
  if p_qty > v_row.quantity then
    raise exception 'Only % are on the truck.', v_row.quantity;
  end if;

  v_tech_name := coalesce(nullif(public.team_person_name(p_user), ''), 'technician');
  insert into public.inventory_movements (item_id, movement_type, quantity_change, reference, notes)
  values (p_item, 'return', p_qty, 'truck-unload', 'Returned from truck: ' || v_tech_name);

  update public.truck_stock set quantity = quantity - p_qty, updated_at = now()
  where user_id = p_user and item_id = p_item
  returning quantity into v_new;

  insert into public.truck_stock_log (tenant_id, user_id, item_id, change, kind, created_by)
  values (v_row.tenant_id, p_user, p_item, -p_qty, 'unload', v_uid);

  return v_new;
end;
$fn$;

revoke all on function public.unload_truck_stock(uuid, uuid, numeric) from public, anon;
grant execute on function public.unload_truck_stock(uuid, uuid, numeric) to authenticated, service_role;

create or replace function public.use_truck_stock(p_item uuid, p_qty numeric, p_client uuid, p_repair uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_row public.truck_stock%rowtype;
  v_client_tenant uuid;
  v_new numeric;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_row from public.truck_stock where user_id = v_uid and item_id = p_item for update;
  if not found then
    raise exception 'That item is not on your truck.';
  end if;
  if p_qty is null or p_qty <= 0 or p_qty > 1000 then
    raise exception 'Enter a quantity above 0.';
  end if;
  if p_qty > v_row.quantity then
    raise exception 'You only have % of this on your truck.', v_row.quantity;
  end if;

  select tenant_id into v_client_tenant from public.clients where id = p_client;
  if v_client_tenant is distinct from v_row.tenant_id then
    raise exception 'Choose the customer this was used for.';
  end if;

  update public.truck_stock set quantity = quantity - p_qty, updated_at = now()
  where user_id = v_uid and item_id = p_item
  returning quantity into v_new;

  insert into public.truck_stock_log (tenant_id, user_id, item_id, change, kind, client_id, repair_id, created_by)
  values (v_row.tenant_id, v_uid, p_item, -p_qty, 'use', p_client, p_repair, v_uid);

  return jsonb_build_object('quantity', v_new, 'min_quantity', v_row.min_quantity, 'low', v_new <= v_row.min_quantity);
end;
$fn$;

revoke all on function public.use_truck_stock(uuid, numeric, uuid, uuid) from public, anon;
grant execute on function public.use_truck_stock(uuid, numeric, uuid, uuid) to authenticated, service_role;

create or replace function public.my_truck_stock()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_out jsonb;
begin
  if auth.uid() is null then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id', s.item_id, 'name', i.name, 'unit', i.unit, 'quantity', s.quantity,
           'min_quantity', s.min_quantity, 'low', s.quantity <= s.min_quantity
         ) order by (s.quantity <= s.min_quantity) desc, i.name), '[]'::jsonb) into v_out
  from public.truck_stock s
  join public.inventory_items i on i.id = s.item_id
  where s.user_id = auth.uid();
  return v_out;
end;
$fn$;

revoke all on function public.my_truck_stock() from public, anon;
grant execute on function public.my_truck_stock() to authenticated, service_role;

-- Everything an inventory manager needs on one screen.
create or replace function public.truck_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_tenant uuid;
begin
  select tu.tenant_id into v_tenant from public.tenant_users tu
  where tu.user_id = auth.uid() and public.inventory_has_access(tu.tenant_id)
  order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'Only inventory staff can see the trucks.';
  end if;

  return jsonb_build_object(
    'trucks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', s.user_id, 'item_id', s.item_id, 'item', i.name, 'unit', i.unit,
               'quantity', s.quantity, 'min_quantity', s.min_quantity, 'low', s.quantity <= s.min_quantity
             ) order by s.user_id, i.name)
      from public.truck_stock s join public.inventory_items i on i.id = s.item_id
      where s.tenant_id = v_tenant), '[]'::jsonb),
    'technicians', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', tu.user_id,
               'name', coalesce(nullif(public.team_person_name(tu.user_id), ''), 'Technician')
             ) order by public.team_person_name(tu.user_id))
      from public.tenant_users tu where tu.tenant_id = v_tenant and lower(tu.role) = 'technician'), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'unit', i.unit, 'on_hand', i.quantity_on_hand) order by i.name)
      from public.inventory_items i where i.tenant_id = v_tenant and i.is_active), '[]'::jsonb)
  );
end;
$fn$;

revoke all on function public.truck_overview() from public, anon;
grant execute on function public.truck_overview() to authenticated, service_role;

-- ------------------------------------------------------- error monitoring
create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  user_id uuid,
  message text not null,
  stack text,
  screen text,
  app_version text,
  platform text,
  fatal boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists app_errors_created_idx on public.app_errors (created_at desc);
create index if not exists app_errors_user_idx on public.app_errors (user_id, created_at desc);

alter table public.app_errors enable row level security;
revoke all on public.app_errors from anon, authenticated;

create or replace function public.log_app_error(
  p_message text,
  p_stack text default null,
  p_screen text default null,
  p_version text default null,
  p_platform text default null,
  p_fatal boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_message text := left(btrim(coalesce(p_message, '')), 500);
begin
  if v_uid is null or v_message = '' then
    return;
  end if;

  -- At most 30 reports per person per hour, so a crash loop cannot flood the table.
  if (select count(*) from public.app_errors where user_id = v_uid and created_at > now() - interval '1 hour') >= 30 then
    return;
  end if;

  select tenant_id into v_tenant from public.tenant_users where user_id = v_uid order by tenant_id limit 1;
  if v_tenant is null then
    select tenant_id into v_tenant from public.clients where user_id = v_uid limit 1;
  end if;

  insert into public.app_errors (tenant_id, user_id, message, stack, screen, app_version, platform, fatal)
  values (v_tenant, v_uid, v_message, left(p_stack, 4000), left(p_screen, 80), left(p_version, 20), left(p_platform, 20), coalesce(p_fatal, false));

  -- Keep 30 days.
  if random() < 0.02 then
    delete from public.app_errors where created_at < now() - interval '30 days';
  end if;
end;
$fn$;

revoke all on function public.log_app_error(text, text, text, text, text, boolean) from public, anon;
grant execute on function public.log_app_error(text, text, text, text, text, boolean) to authenticated, service_role;

create or replace function public.list_app_errors(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_tenant uuid;
  v_days integer := least(greatest(coalesce(p_days, 7), 1), 30);
begin
  select tu.tenant_id into v_tenant from public.tenant_users tu
  where tu.user_id = auth.uid() and public.has_permission(tu.tenant_id, 'audit')
  order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'You do not have access to error reports.';
  end if;

  return jsonb_build_object(
    'total', (select count(*) from public.app_errors where tenant_id = v_tenant and created_at > now() - make_interval(days => v_days)),
    'people', (select count(distinct user_id) from public.app_errors where tenant_id = v_tenant and created_at > now() - make_interval(days => v_days)),
    'groups', coalesce((
      select jsonb_agg(row_to_json(g) order by g.last_at desc)
      from (
        select e.message, coalesce(e.screen, '') as screen, count(*) as occurrences,
               count(distinct e.user_id) as people, count(*) filter (where e.fatal) as fatal,
               max(e.created_at) as last_at,
               array_agg(distinct e.app_version) filter (where e.app_version is not null) as versions,
               (array_agg(e.stack order by e.created_at desc) filter (where e.stack is not null))[1] as sample_stack
        from public.app_errors e
        where e.tenant_id = v_tenant and e.created_at > now() - make_interval(days => v_days)
        group by e.message, coalesce(e.screen, '')
        order by max(e.created_at) desc
        limit 100
      ) g), '[]'::jsonb)
  );
end;
$fn$;

revoke all on function public.list_app_errors(integer) from public, anon;
grant execute on function public.list_app_errors(integer) to authenticated, service_role;

-- ---------------------------------------------------------- login lockout
create table if not exists public.login_attempts (
  id bigint generated always as identity primary key,
  email_key text not null,
  success boolean not null,
  at timestamptz not null default now()
);

create index if not exists login_attempts_key_idx on public.login_attempts (email_key, at desc);

alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from anon, authenticated;

create or replace function public.login_email_key(p_email text)
returns text
language sql
immutable
set search_path = public
as $$ select left(lower(btrim(coalesce(p_email, ''))), 254) $$;

revoke all on function public.login_email_key(text) from public, anon, authenticated;

create or replace function public.login_status(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_key text := public.login_email_key(p_email);
  v_since timestamptz;
  v_fails integer;
  v_last_fail timestamptz;
  v_until timestamptz;
begin
  if v_key = '' then
    return jsonb_build_object('locked', false, 'seconds_left', 0, 'attempts_left', 5);
  end if;

  select greatest(now() - interval '15 minutes', coalesce(max(at), '-infinity'::timestamptz)) into v_since
  from public.login_attempts where email_key = v_key and success;

  select count(*), max(at) into v_fails, v_last_fail
  from public.login_attempts where email_key = v_key and not success and at > v_since;

  if v_fails >= 5 then
    v_until := v_last_fail + interval '15 minutes';
    if v_until > now() then
      return jsonb_build_object('locked', true, 'seconds_left', ceil(extract(epoch from (v_until - now())))::integer, 'attempts_left', 0);
    end if;
  end if;

  return jsonb_build_object('locked', false, 'seconds_left', 0, 'attempts_left', greatest(0, 5 - v_fails));
end;
$fn$;

revoke all on function public.login_status(text) from public;
grant execute on function public.login_status(text) to anon, authenticated, service_role;

create or replace function public.record_login_attempt(p_email text, p_success boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_key text := public.login_email_key(p_email);
  v_status jsonb;
begin
  if v_key = '' then
    return public.login_status(p_email);
  end if;

  v_status := public.login_status(v_key);

  -- While locked nothing is recorded, so the lock does not extend itself.
  if (v_status->>'locked')::boolean then
    return v_status;
  end if;

  -- Bound the table: ignore floods against one address.
  if (select count(*) from public.login_attempts where email_key = v_key and at > now() - interval '1 hour') < 200 then
    insert into public.login_attempts (email_key, success) values (v_key, coalesce(p_success, false));
  end if;

  if random() < 0.02 then
    delete from public.login_attempts where at < now() - interval '2 days';
  end if;

  return public.login_status(v_key);
end;
$fn$;

revoke all on function public.record_login_attempt(text, boolean) from public;
grant execute on function public.record_login_attempt(text, boolean) to anon, authenticated, service_role;
