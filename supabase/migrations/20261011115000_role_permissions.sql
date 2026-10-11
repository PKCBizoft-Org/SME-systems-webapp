-- Role permissions: admins choose which pages / features each staff role can use.
--   * role_permissions: per-tenant overrides on top of the built-in defaults
--     (admin: everything; accounting: clients, accounting, ratings, analytics,
--     tickets, audit; inventory: clients, inventory; technician: clients).
--   * has_permission(): used inside the server functions of the newer features
--     (ticket chat, revenue analytics, staff tickets) and by the web pages.
--     Older table policies stay role-based and are not changed by this.
--   * my_permissions() / list_role_permissions() / set_role_permission(): the
--     menu, and the admin-only editor. Every change is written to user_audit.

create table if not exists public.role_permissions (
  tenant_id uuid not null,
  role text not null,
  permission text not null,
  allowed boolean not null,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, role, permission)
);

alter table public.role_permissions enable row level security;

drop policy if exists "members read their tenant permissions" on public.role_permissions;
create policy "members read their tenant permissions" on public.role_permissions
  for select to authenticated using (
    exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = role_permissions.tenant_id)
  );

revoke insert, update, delete on public.role_permissions from anon, authenticated;

-- Everything an admin can switch on or off, and what each role gets by default.
create or replace function public.permission_catalog()
returns text[]
language sql
immutable
set search_path = public
as $$ select array['clients', 'inventory', 'accounting', 'ratings', 'analytics', 'tickets', 'audit', 'users'] $$;

create or replace function public.permission_defaults(p_role text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(p_role, ''))
    when 'admin' then public.permission_catalog()
    when 'accounting' then array['clients', 'accounting', 'ratings', 'analytics', 'tickets', 'audit']
    when 'inventory' then array['clients', 'inventory']
    when 'technician' then array['clients']
    else array[]::text[]
  end
$$;

create or replace function public.has_permission(p_tenant uuid, p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_override boolean;
begin
  if v_uid is null or p_tenant is null then
    return false;
  end if;
  if not (p_permission = any (public.permission_catalog())) then
    return false;
  end if;
  if public.user_is_global_admin() then
    return true;
  end if;

  for v_role in
    select lower(tu.role) from public.tenant_users tu where tu.user_id = v_uid and tu.tenant_id = p_tenant
  loop
    if v_role = 'admin' then
      return true;
    end if;
    select allowed into v_override from public.role_permissions rp
    where rp.tenant_id = p_tenant and rp.role = v_role and rp.permission = p_permission;
    if coalesce(v_override, p_permission = any (public.permission_defaults(v_role))) then
      return true;
    end if;
  end loop;

  return false;
end;
$fn$;

revoke all on function public.has_permission(uuid, text) from public, anon;
grant execute on function public.has_permission(uuid, text) to authenticated, service_role;

-- The permissions of the signed-in staff member, for hiding menu items.
create or replace function public.my_permissions()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_tenant uuid;
  v_perm text;
  v_out text[] := array[]::text[];
begin
  if auth.uid() is null then
    return v_out;
  end if;
  select tenant_id into v_tenant from public.tenant_users where user_id = auth.uid() order by tenant_id limit 1;
  if v_tenant is null then
    return v_out;
  end if;
  foreach v_perm in array public.permission_catalog() loop
    if public.has_permission(v_tenant, v_perm) then
      v_out := v_out || v_perm;
    end if;
  end loop;
  return v_out;
end;
$fn$;

revoke all on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated, service_role;

-- Admin only: the full matrix as {role: {permission: allowed}}.
create or replace function public.list_role_permissions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_tenant uuid;
  v_result jsonb := '{}'::jsonb;
  v_role text;
  v_perm text;
  v_override boolean;
  v_row jsonb;
begin
  select tenant_id into v_tenant from public.tenant_users
  where user_id = auth.uid() and lower(role) = 'admin' order by tenant_id limit 1;
  if v_tenant is null and not public.user_is_global_admin() then
    raise exception 'Only an admin can see role permissions.';
  end if;
  if v_tenant is null then
    select tenant_id into v_tenant from public.tenant_users where user_id = auth.uid() order by tenant_id limit 1;
  end if;

  foreach v_role in array array['accounting', 'inventory', 'technician'] loop
    v_row := '{}'::jsonb;
    foreach v_perm in array public.permission_catalog() loop
      select allowed into v_override from public.role_permissions rp
      where rp.tenant_id = v_tenant and rp.role = v_role and rp.permission = v_perm;
      v_row := v_row || jsonb_build_object(v_perm, coalesce(v_override, v_perm = any (public.permission_defaults(v_role))));
    end loop;
    v_result := v_result || jsonb_build_object(v_role, v_row);
  end loop;
  return v_result;
end;
$fn$;

revoke all on function public.list_role_permissions() from public, anon;
grant execute on function public.list_role_permissions() to authenticated, service_role;

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
  -- Locking the admins out of user management is not possible, and staff must
  -- never be able to hand themselves the Users page.
  if p_permission = 'users' and p_allowed then
    raise exception 'Only admins can manage users.';
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

