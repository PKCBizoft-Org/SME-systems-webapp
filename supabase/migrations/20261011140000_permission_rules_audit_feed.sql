-- Follow-up to the role permissions:
--   1. set_role_permission() now only lets an admin SWITCH ON a permission that
--      the database really enforces (analytics, tickets, audit), or that the
--      role already has by default. The older pages (clients, inventory,
--      accounting, ratings, users) are protected by role-based table rules,
--      so they can be switched OFF for a role but cannot be handed to a role
--      that never had them.
--   2. audit_feed(): one searchable list of everything worth auditing (record
--      changes from audit_log plus staff/permission changes from user_audit),
--      for anyone with the 'audit' permission in the tenant.

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
  v_enforced constant text[] := array['analytics', 'tickets', 'audit'];
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

create or replace function public.audit_feed(p_limit integer default 500, p_since timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
  v_out jsonb;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select tu.tenant_id into v_tenant from public.tenant_users tu
  where tu.user_id = v_uid and public.has_permission(tu.tenant_id, 'audit')
  order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'You do not have access to the audit log.';
  end if;

  select coalesce(jsonb_agg(row_to_json(e) order by e.at desc), '[]'::jsonb) into v_out
  from (
    select * from (
      select 'record-' || a.id::text as id,
             a.changed_at as at,
             coalesce(a.changed_by_email, 'Unknown') as who,
             coalesce(a.field_name, '') as what,
             coalesce(c.customer_name, '') as customer,
             case when coalesce(a.old_value, '') <> '' then a.old_value || ' -> ' else '' end || coalesce(a.new_value, '') as detail,
             'record'::text as source
      from public.audit_log a
      left join public.clients c on c.id = a.client_id
      where a.tenant_id = v_tenant and (p_since is null or a.changed_at >= p_since)
      union all
      select 'staff-' || u.id::text,
             u.created_at,
             coalesce(u.actor_email, 'Unknown'),
             coalesce(u.action, ''),
             coalesce(u.target_email, ''),
             coalesce(u.detail, ''),
             'staff'
      from public.user_audit u
      where u.tenant_id = v_tenant and (p_since is null or u.created_at >= p_since)
    ) merged
    order by merged.at desc
    limit v_limit
  ) e;

  return v_out;
end;
$fn$;

revoke all on function public.audit_feed(integer, timestamptz) from public, anon;
grant execute on function public.audit_feed(integer, timestamptz) to authenticated, service_role;
