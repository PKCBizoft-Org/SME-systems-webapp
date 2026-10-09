-- Employee numbers for staff (admin, technician, accounting, inventory).
-- Format EMP-0001, assigned when someone is added to a tenant as staff.
alter table public.user_profiles
  add column if not exists employee_number text,
  add column if not exists date_hired date;

create unique index if not exists user_profiles_employee_number_uniq
  on public.user_profiles (employee_number)
  where employee_number is not null;

create sequence if not exists public.employee_number_seq;

create or replace function public.assign_employee_number(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number text;
begin
  select employee_number into v_number from public.user_profiles where user_id = p_user;
  if v_number is not null then
    return v_number;
  end if;

  v_number := 'EMP-' || lpad(nextval('public.employee_number_seq')::text, 4, '0');

  insert into public.user_profiles (user_id, employee_number, date_hired, approval_status)
  values (p_user, v_number, current_date, 'approved')
  on conflict (user_id) do update
    set employee_number = excluded.employee_number,
        date_hired = coalesce(public.user_profiles.date_hired, excluded.date_hired),
        updated_at = now();

  return v_number;
end;
$$;
revoke execute on function public.assign_employee_number(uuid) from public, anon, authenticated;
grant execute on function public.assign_employee_number(uuid) to service_role;

-- Give the staff who already exist a number, oldest account first.
do $$
declare r record;
begin
  for r in
    select distinct tu.user_id, u.created_at
    from public.tenant_users tu
    join auth.users u on u.id = tu.user_id
    where tu.role in ('admin', 'technician', 'accounting', 'inventory')
    order by u.created_at
  loop
    perform public.assign_employee_number(r.user_id);
    update public.user_profiles
      set date_hired = r.created_at::date
      where user_id = r.user_id and date_hired = current_date;
  end loop;
end $$;
