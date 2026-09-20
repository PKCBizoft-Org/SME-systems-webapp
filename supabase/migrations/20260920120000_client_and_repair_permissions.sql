-- Client and repair permissions
-- Applied to SME-webapp-db (PKC NetLink) on 2026-09-20.
-- Safe to run more than once. Rollback statements are at the bottom.

-- 1. Admins can insert and update clients in their own tenant
drop policy if exists clients_admin_insert on public.clients;
create policy clients_admin_insert on public.clients
  for insert to authenticated
  with check (
    tenant_id in (
      select tu.tenant_id from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.role = 'admin'
    )
  );

drop policy if exists clients_admin_update on public.clients;
create policy clients_admin_update on public.clients
  for update to authenticated
  using (
    tenant_id in (
      select tu.tenant_id from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.role = 'admin'
    )
  )
  with check (
    tenant_id in (
      select tu.tenant_id from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.role = 'admin'
    )
  );

-- 2. Technicians can update clients (the guard trigger below limits the columns)
drop policy if exists clients_technician_update on public.clients;
create policy clients_technician_update on public.clients
  for update to authenticated
  using (
    tenant_id in (
      select tu.tenant_id from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.role = 'technician'
    )
  )
  with check (
    tenant_id in (
      select tu.tenant_id from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.role = 'technician'
    )
  );

-- 3. Guard: a technician may only change installation_status
create or replace function public.guard_technician_client_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return NEW;
  end if;

  if exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = OLD.tenant_id and tu.role = 'admin'
  ) then
    return NEW;
  end if;

  if exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = OLD.tenant_id and tu.role = 'technician'
  ) then
    if (to_jsonb(NEW) - 'installation_status') is distinct from (to_jsonb(OLD) - 'installation_status') then
      raise exception 'Technicians can only change the installation status.';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists clients_technician_guard on public.clients;
create trigger clients_technician_guard
  before update on public.clients
  for each row execute function public.guard_technician_client_update();

-- 4. Repair records: admins have full access within their tenant
drop policy if exists repair_records_admin_all on public.repair_records;
create policy repair_records_admin_all on public.repair_records
  for all to authenticated
  using (
    exists (
      select 1 from public.clients c
      join public.tenant_users tu on tu.tenant_id = c.tenant_id
      where c.id = repair_records.client_id
        and tu.user_id = auth.uid() and tu.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.clients c
      join public.tenant_users tu on tu.tenant_id = c.tenant_id
      where c.id = repair_records.client_id
        and tu.user_id = auth.uid() and tu.role = 'admin'
    )
  );

-- Rollback (run these to undo everything above):
-- drop trigger if exists clients_technician_guard on public.clients;
-- drop function if exists public.guard_technician_client_update();
-- drop policy if exists clients_technician_update on public.clients;
-- drop policy if exists clients_admin_update on public.clients;
-- drop policy if exists clients_admin_insert on public.clients;
-- drop policy if exists repair_records_admin_all on public.repair_records;
