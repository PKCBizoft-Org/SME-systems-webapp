-- Staff IDs by role: ADM-0001 (admin), TEC-0001 (technician), ACC-0001
-- (accounting), INV-0001 (inventory). Each role counts on its own. Customers
-- keep PKC-00001. An ID never changes once given, even if the role changes.
create table if not exists public.employee_counters (
  prefix text primary key,
  last_number integer not null default 0
);
alter table public.employee_counters enable row level security;
-- no policies: only the function below touches it

drop function if exists public.assign_employee_number(uuid);

create or replace function public.assign_employee_number(p_user uuid, p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number text;
  v_prefix text;
  v_next integer;
begin
  select employee_number into v_number from public.user_profiles where user_id = p_user;
  if v_number is not null and v_number !~ '^EMP-' then
    return v_number;
  end if;

  v_prefix := case lower(coalesce(p_role, ''))
    when 'admin' then 'ADM'
    when 'technician' then 'TEC'
    when 'accounting' then 'ACC'
    when 'inventory' then 'INV'
    else null
  end;
  if v_prefix is null then
    return v_number;
  end if;

  insert into public.employee_counters (prefix, last_number) values (v_prefix, 1)
  on conflict (prefix) do update set last_number = public.employee_counters.last_number + 1
  returning last_number into v_next;

  v_number := v_prefix || '-' || lpad(v_next::text, 4, '0');

  insert into public.user_profiles (user_id, employee_number, date_hired, approval_status)
  values (p_user, v_number, current_date, 'approved')
  on conflict (user_id) do update
    set employee_number = excluded.employee_number,
        date_hired = coalesce(public.user_profiles.date_hired, excluded.date_hired),
        updated_at = now();

  return v_number;
end;
$$;
revoke execute on function public.assign_employee_number(uuid, text) from public, anon, authenticated;
grant execute on function public.assign_employee_number(uuid, text) to service_role;

-- Re-number the staff that got the first-draft EMP-000N IDs, oldest first.
do $$
declare r record;
begin
  for r in
    select x.user_id, x.role
    from (
      select distinct on (tu.user_id) tu.user_id, tu.role, u.created_at
      from public.tenant_users tu
      join auth.users u on u.id = tu.user_id
      join public.user_profiles up on up.user_id = tu.user_id
      where up.employee_number ~ '^EMP-'
        and tu.role in ('admin', 'technician', 'accounting', 'inventory')
      order by tu.user_id, tu.role
    ) x
    order by x.created_at
  loop
    perform public.assign_employee_number(r.user_id, r.role);
  end loop;
end $$;

drop sequence if exists public.employee_number_seq;
