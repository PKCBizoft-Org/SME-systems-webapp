-- Inventory system: installation materials (cable, connectors, devices, tools)
-- Safe to run more than once. Rollback is at the bottom.
--
-- ACCESS: only tenant members whose role is 'admin' or 'inventory' can read or
-- write anything here. Technicians, accounting and customers get no access.
--
-- Assumptions (matching the existing migration and app code):
--   * public.tenant_users(tenant_id, user_id, role) with role in ('admin','inventory',...)
--   * public.clients(id, tenant_id) -- id and tenant_id are uuid
-- If clients.id or tenants are not uuid, change the column types below first.
--
-- How the flow works
--   inventory_items      one row per stock item; quantity_on_hand is maintained
--                        ONLY by the movement trigger, never edited by hand.
--   inventory_movements  append-only ledger. Every receive / use / return /
--                        correction is a row. No updates or deletes are allowed,
--                        so the history is a trustworthy audit trail.
--   A movement can point at a client (the installation it was used on).

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.inventory_items (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  sku              text,
  name             text not null check (length(btrim(name)) > 0),
  category         text not null default 'other'
                     check (category in ('cable','connector','network_device','tool','accessory','other')),
  unit             text not null default 'pc'
                     check (unit in ('pc','m','roll','box','set','pack')),
  quantity_on_hand numeric(12,2) not null default 0 check (quantity_on_hand >= 0),
  reorder_level    numeric(12,2) not null default 0 check (reorder_level >= 0),
  unit_cost        numeric(12,2) check (unit_cost is null or unit_cost >= 0),
  location         text,
  notes            text,
  is_active        boolean not null default true,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- A SKU, when given, is unique inside a tenant.
create unique index if not exists inventory_items_tenant_sku_key
  on public.inventory_items (tenant_id, lower(sku)) where sku is not null and sku <> '';
create index if not exists inventory_items_tenant_idx
  on public.inventory_items (tenant_id, is_active, category);

create table if not exists public.inventory_movements (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  item_id         uuid not null references public.inventory_items(id) on delete restrict,
  movement_type   text not null
                    check (movement_type in ('stock_in','installation_use','return','stock_out','adjustment')),
  -- Signed: positive adds stock, negative removes it.
  quantity_change numeric(12,2) not null check (quantity_change <> 0),
  client_id       uuid references public.clients(id) on delete set null,
  reference       text,
  notes           text,
  created_by      uuid default auth.uid(),
  created_by_email text,
  created_at      timestamptz not null default now()
);

create index if not exists inventory_movements_item_idx
  on public.inventory_movements (item_id, created_at desc);
create index if not exists inventory_movements_client_idx
  on public.inventory_movements (client_id, created_at desc) where client_id is not null;
create index if not exists inventory_movements_tenant_idx
  on public.inventory_movements (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Helpers (security definer so they work regardless of tenant_users RLS)
-- ---------------------------------------------------------------------------

create or replace function public.inventory_has_access(p_tenant uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and tu.tenant_id = p_tenant
      and tu.role in ('admin','inventory')
  );
$$;
revoke execute on function public.inventory_has_access(uuid) from public, anon;
grant execute on function public.inventory_has_access(uuid) to authenticated;

-- Allow the new 'inventory' staff role on profiles (invite flow writes it there).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['customer','technician','admin','accounting','inventory']));

-- ---------------------------------------------------------------------------
-- 3. Item guard: stock count can only change through a movement
-- ---------------------------------------------------------------------------

create or replace function public.inventory_items_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- New items always start empty; receive stock with a stock_in movement.
    NEW.quantity_on_hand := 0;
    NEW.created_at := now();
    NEW.updated_at := now();
    return NEW;
  end if;

  -- The movement trigger updates this table from inside another trigger
  -- (depth 2). A direct update from a client runs at depth 1.
  if NEW.quantity_on_hand is distinct from OLD.quantity_on_hand and pg_trigger_depth() < 2 then
    raise exception 'Stock quantity cannot be edited directly. Record a stock movement instead.';
  end if;

  if NEW.tenant_id is distinct from OLD.tenant_id then
    raise exception 'An inventory item cannot be moved to another tenant.';
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists inventory_items_guard_trg on public.inventory_items;
create trigger inventory_items_guard_trg
  before insert or update on public.inventory_items
  for each row execute function public.inventory_items_guard();

-- ---------------------------------------------------------------------------
-- 4. Movement validation + stock update
-- ---------------------------------------------------------------------------

create or replace function public.inventory_movements_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid;
  v_active boolean;
  v_on_hand numeric;
  v_client_tenant uuid;
begin
  -- Lock the item so concurrent movements cannot both pass the stock check.
  select i.tenant_id, i.is_active, i.quantity_on_hand
    into v_tenant, v_active, v_on_hand
  from public.inventory_items i
  where i.id = NEW.item_id
  for update;

  if v_tenant is null then
    raise exception 'Inventory item not found.';
  end if;

  -- The tenant always comes from the item, never from the caller.
  NEW.tenant_id := v_tenant;
  NEW.created_by := coalesce(auth.uid(), NEW.created_by);
  NEW.created_at := now();

  if not v_active then
    raise exception 'This item is archived. Reactivate it before recording stock.';
  end if;

  -- Sign must match the movement type.
  if NEW.movement_type in ('stock_in','return') and NEW.quantity_change <= 0 then
    raise exception '% must add stock (positive quantity).', NEW.movement_type;
  end if;
  if NEW.movement_type in ('installation_use','stock_out') and NEW.quantity_change >= 0 then
    raise exception '% must remove stock (negative quantity).', NEW.movement_type;
  end if;

  -- Installation use needs a client, and the client must be in the same tenant.
  if NEW.movement_type = 'installation_use' and NEW.client_id is null then
    raise exception 'Select the client installation these materials were used on.';
  end if;
  if NEW.client_id is not null then
    select c.tenant_id into v_client_tenant from public.clients c where c.id = NEW.client_id;
    if v_client_tenant is distinct from v_tenant then
      raise exception 'That client does not belong to this tenant.';
    end if;
  end if;

  if v_on_hand + NEW.quantity_change < 0 then
    raise exception 'Insufficient stock: % on hand, cannot remove %.', v_on_hand, abs(NEW.quantity_change);
  end if;

  return NEW;
end;
$$;

drop trigger if exists inventory_movements_before_insert_trg on public.inventory_movements;
create trigger inventory_movements_before_insert_trg
  before insert on public.inventory_movements
  for each row execute function public.inventory_movements_before_insert();

create or replace function public.inventory_movements_after_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.inventory_items
     set quantity_on_hand = quantity_on_hand + NEW.quantity_change
   where id = NEW.item_id;
  return NEW;
end;
$$;

drop trigger if exists inventory_movements_after_insert_trg on public.inventory_movements;
create trigger inventory_movements_after_insert_trg
  after insert on public.inventory_movements
  for each row execute function public.inventory_movements_after_insert();

-- The ledger is append-only.
create or replace function public.inventory_movements_immutable()
returns trigger
language plpgsql
as $$
begin
  -- The one allowed change: when a client is deleted, the foreign key clears
  -- client_id on its movements (on delete set null). Everything else about the
  -- row must stay identical.
  if tg_op = 'UPDATE'
     and OLD.client_id is not null and NEW.client_id is null
     and (to_jsonb(NEW) - 'client_id') = (to_jsonb(OLD) - 'client_id') then
    return NEW;
  end if;

  raise exception 'Inventory movements cannot be changed or deleted. Record an adjustment instead.';
end;
$$;

drop trigger if exists inventory_movements_immutable_trg on public.inventory_movements;
create trigger inventory_movements_immutable_trg
  before update or delete on public.inventory_movements
  for each row execute function public.inventory_movements_immutable();

-- ---------------------------------------------------------------------------
-- 5. Row level security
-- ---------------------------------------------------------------------------

alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;

-- Items: admin and inventory staff only.
drop policy if exists inventory_items_select on public.inventory_items;
create policy inventory_items_select on public.inventory_items
  for select to authenticated
  using (public.inventory_has_access(tenant_id));

drop policy if exists inventory_items_insert on public.inventory_items;
create policy inventory_items_insert on public.inventory_items
  for insert to authenticated
  with check (public.inventory_has_access(tenant_id));

drop policy if exists inventory_items_update on public.inventory_items;
create policy inventory_items_update on public.inventory_items
  for update to authenticated
  using (public.inventory_has_access(tenant_id))
  with check (public.inventory_has_access(tenant_id));

-- Movements: admin and inventory staff only, any movement type.
drop policy if exists inventory_movements_select on public.inventory_movements;
create policy inventory_movements_select on public.inventory_movements
  for select to authenticated
  using (public.inventory_has_access(tenant_id));

drop policy if exists inventory_movements_insert on public.inventory_movements;
create policy inventory_movements_insert on public.inventory_movements
  for insert to authenticated
  with check (public.inventory_has_access(tenant_id));

-- Trigger functions must not be callable over the API.
revoke execute on function public.inventory_items_guard(), public.inventory_movements_before_insert(), public.inventory_movements_after_insert() from public, anon, authenticated;

-- Nothing is granted to anon.
revoke all on public.inventory_items, public.inventory_movements from anon;

-- No update or delete policies exist on movements (and the trigger blocks
-- them anyway), so history cannot be rewritten from the app.

-- ---------------------------------------------------------------------------
-- Rollback (run to undo everything above; this DELETES inventory data):
-- drop table if exists public.inventory_movements;
-- drop table if exists public.inventory_items;
-- drop function if exists public.inventory_movements_immutable();
-- drop function if exists public.inventory_movements_after_insert();
-- drop function if exists public.inventory_movements_before_insert();
-- drop function if exists public.inventory_items_guard();
-- drop function if exists public.inventory_has_access(uuid);
