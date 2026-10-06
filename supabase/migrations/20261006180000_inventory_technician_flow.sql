-- Inventory part 2: technician check-out flow, usage history context, and
-- recommended material kits.
--
-- Technicians (tenant_users.role = 'technician') can:
--   * see the stock catalog (no cost data) through the inventory_catalog view
--   * take materials for a client job (installation_use) and return unused ones
--   * see ONLY their own movements
--   * read the recommended kits
-- They cannot see costs, other people's history, or change items/kits.
-- Admin and inventory staff keep full access (see the first migration).

-- ---------------------------------------------------------------------------
-- 1. Who / when / where context on every movement
-- ---------------------------------------------------------------------------

alter table public.inventory_movements
  add column if not exists checkout_id uuid,            -- groups the lines of one job check-out
  add column if not exists job_type text
    check (job_type is null or job_type in ('new_installation','repair','replacement','upgrade','other')),
  add column if not exists install_location text,       -- where at the customer's site the item went
  add column if not exists replaced_item_id uuid references public.inventory_items(id) on delete set null,
  add column if not exists created_by_name text;

create index if not exists inventory_movements_checkout_idx
  on public.inventory_movements (checkout_id) where checkout_id is not null;
create index if not exists inventory_movements_user_idx
  on public.inventory_movements (created_by, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

create or replace function public.inventory_is_technician(p_tenant uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = p_tenant and tu.role = 'technician'
  );
$$;
revoke execute on function public.inventory_is_technician(uuid) from public, anon;
grant execute on function public.inventory_is_technician(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Movement trigger: identity from the server + technician rules
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
  v_taken numeric;
begin
  select i.tenant_id, i.is_active, i.quantity_on_hand
    into v_tenant, v_active, v_on_hand
  from public.inventory_items i
  where i.id = NEW.item_id
  for update;

  if v_tenant is null then
    raise exception 'Inventory item not found.';
  end if;

  NEW.tenant_id := v_tenant;
  NEW.created_by := coalesce(auth.uid(), NEW.created_by);
  NEW.created_at := now();

  -- Identity is stamped by the server so the history cannot be spoofed.
  select u.email into NEW.created_by_email from auth.users u where u.id = NEW.created_by;
  select p.full_name into NEW.created_by_name from public.user_profiles p where p.user_id = NEW.created_by;

  if not v_active then
    raise exception 'This item is archived. Reactivate it before recording stock.';
  end if;

  if NEW.movement_type in ('stock_in','return') and NEW.quantity_change <= 0 then
    raise exception '% must add stock (positive quantity).', NEW.movement_type;
  end if;
  if NEW.movement_type in ('installation_use','stock_out') and NEW.quantity_change >= 0 then
    raise exception '% must remove stock (negative quantity).', NEW.movement_type;
  end if;

  if NEW.movement_type = 'installation_use' and NEW.client_id is null then
    raise exception 'Select the client installation these materials were used on.';
  end if;
  if NEW.client_id is not null then
    select c.tenant_id into v_client_tenant from public.clients c where c.id = NEW.client_id;
    if v_client_tenant is distinct from v_tenant then
      raise exception 'That client does not belong to this tenant.';
    end if;
  end if;

  -- Technicians (not admin/inventory staff) have extra limits.
  if auth.uid() is not null and not public.inventory_has_access(v_tenant) then
    if NEW.movement_type not in ('installation_use','return') then
      raise exception 'Technicians can only take materials for a job or return unused ones.';
    end if;
    if NEW.movement_type = 'return' then
      if NEW.client_id is null then
        raise exception 'Select the client job these materials are being returned from.';
      end if;
      -- A technician can only return what they themselves took for that client.
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
revoke execute on function public.inventory_movements_before_insert() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Technician policies and the cost-free catalog view
-- ---------------------------------------------------------------------------

drop policy if exists inventory_movements_tech_insert on public.inventory_movements;
create policy inventory_movements_tech_insert on public.inventory_movements
  for insert to authenticated
  with check (
    public.inventory_is_technician(tenant_id)
    and movement_type in ('installation_use','return')
  );

drop policy if exists inventory_movements_tech_select on public.inventory_movements;
create policy inventory_movements_tech_select on public.inventory_movements
  for select to authenticated
  using (public.inventory_is_technician(tenant_id) and created_by = auth.uid());

-- Runs with the view owner's rights on purpose: technicians get the stock
-- levels but never unit_cost, notes or who created the item.
create or replace view public.inventory_catalog with (security_barrier = true) as
  select i.id, i.tenant_id, i.sku, i.name, i.category, i.unit,
         i.quantity_on_hand, i.reorder_level, i.location
  from public.inventory_items i
  where i.is_active
    and (public.inventory_has_access(i.tenant_id) or public.inventory_is_technician(i.tenant_id));

revoke all on public.inventory_catalog from public, anon;
grant select on public.inventory_catalog to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Recommended kits (a ready-made material set per job type)
-- ---------------------------------------------------------------------------

create table if not exists public.inventory_kits (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  name        text not null check (length(btrim(name)) > 0),
  job_type    text not null default 'new_installation'
                check (job_type in ('new_installation','repair','replacement','upgrade','other')),
  description text,
  is_active   boolean not null default true,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists inventory_kits_tenant_idx on public.inventory_kits (tenant_id, is_active);

create table if not exists public.inventory_kit_items (
  id          uuid primary key default gen_random_uuid(),
  kit_id      uuid not null references public.inventory_kits(id) on delete cascade,
  tenant_id   uuid not null,
  item_id     uuid not null references public.inventory_items(id) on delete restrict,
  quantity    numeric(12,2) not null check (quantity > 0),
  is_optional boolean not null default false,
  unique (kit_id, item_id)
);

-- The tenant on a kit line always comes from its kit; the item must match it.
create or replace function public.inventory_kit_items_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid;
  v_item_tenant uuid;
begin
  select k.tenant_id into v_tenant from public.inventory_kits k where k.id = NEW.kit_id;
  select i.tenant_id into v_item_tenant from public.inventory_items i where i.id = NEW.item_id;
  if v_tenant is null or v_item_tenant is distinct from v_tenant then
    raise exception 'That item does not belong to this kit''s tenant.';
  end if;
  NEW.tenant_id := v_tenant;
  return NEW;
end;
$$;
revoke execute on function public.inventory_kit_items_guard() from public, anon, authenticated;

drop trigger if exists inventory_kit_items_guard_trg on public.inventory_kit_items;
create trigger inventory_kit_items_guard_trg
  before insert or update on public.inventory_kit_items
  for each row execute function public.inventory_kit_items_guard();

alter table public.inventory_kits enable row level security;
alter table public.inventory_kit_items enable row level security;

drop policy if exists inventory_kits_select on public.inventory_kits;
create policy inventory_kits_select on public.inventory_kits
  for select to authenticated
  using (public.inventory_has_access(tenant_id) or public.inventory_is_technician(tenant_id));

drop policy if exists inventory_kits_write on public.inventory_kits;
create policy inventory_kits_write on public.inventory_kits
  for all to authenticated
  using (public.inventory_has_access(tenant_id))
  with check (public.inventory_has_access(tenant_id));

drop policy if exists inventory_kit_items_select on public.inventory_kit_items;
create policy inventory_kit_items_select on public.inventory_kit_items
  for select to authenticated
  using (public.inventory_has_access(tenant_id) or public.inventory_is_technician(tenant_id));

drop policy if exists inventory_kit_items_write on public.inventory_kit_items;
create policy inventory_kit_items_write on public.inventory_kit_items
  for all to authenticated
  using (public.inventory_has_access(tenant_id))
  with check (public.inventory_has_access(tenant_id));

revoke all on public.inventory_kits, public.inventory_kit_items from anon;

-- ---------------------------------------------------------------------------
-- Rollback (drops kits and the technician flow; keeps part 1):
-- drop view if exists public.inventory_catalog;
-- drop table if exists public.inventory_kit_items;
-- drop table if exists public.inventory_kits;
-- drop function if exists public.inventory_kit_items_guard();
-- drop policy if exists inventory_movements_tech_insert on public.inventory_movements;
-- drop policy if exists inventory_movements_tech_select on public.inventory_movements;
-- drop function if exists public.inventory_is_technician(uuid);
-- (the extra movement columns can stay; they are nullable)
