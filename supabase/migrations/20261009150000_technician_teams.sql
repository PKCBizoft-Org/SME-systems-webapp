-- Technician teams: a technician creates a group (up to 10 technicians) and
-- sees which teammates are available or busy, with their staff IDs (TEC-0001).
-- Everything goes through the functions below; the tables have no direct access.
create table if not exists public.technician_teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null check (char_length(btrim(name)) between 2 and 40),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.technician_team_members (
  team_id uuid not null references public.technician_teams(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

alter table public.technician_teams enable row level security;
alter table public.technician_team_members enable row level security;

-- The tenant the calling technician works in.
create or replace function public.team_tenant()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare v uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select tenant_id into v from public.tenant_users
  where user_id = auth.uid() and role = 'technician' limit 1;
  if v is null then
    raise exception 'Only technicians can use teams.';
  end if;
  return v;
end;
$$;

create or replace function public.create_team(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.team_tenant();
  v_team uuid;
begin
  if exists (select 1 from public.technician_team_members where user_id = auth.uid()) then
    raise exception 'You are already in a team. Leave it first.';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then
    raise exception 'Give the team a name (at least 2 letters).';
  end if;

  insert into public.technician_teams (tenant_id, name, created_by)
  values (v_tenant, btrim(p_name), auth.uid())
  returning id into v_team;

  insert into public.technician_team_members (team_id, user_id, role)
  values (v_team, auth.uid(), 'leader');

  return v_team;
end;
$$;

-- The caller's team with every member's status. A member is "busy" while they
-- hold an open installation or repair, otherwise "available".
create or replace function public.my_team()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.technician_teams%rowtype;
  v_team_id uuid;
  v_role text;
begin
  perform public.team_tenant();

  select m.team_id, m.role into v_team_id, v_role
  from public.technician_team_members m
  where m.user_id = auth.uid();

  if v_team_id is null then
    return null;
  end if;

  select * into v_team from public.technician_teams where id = v_team_id;

  return jsonb_build_object(
    'id', v_team.id,
    'name', v_team.name,
    'max_members', 10,
    'is_leader', v_role = 'leader',
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'name', coalesce(nullif(btrim(up.full_name), ''), split_part(coalesce(u.email, ''), '@', 1)),
        'employee_number', up.employee_number,
        'phone', up.mobile_number,
        'role', m.role,
        'status', case when job.id is null then 'available' else 'busy' end,
        'job_type', job.job_type
      ) order by (m.role = 'leader') desc, m.joined_at)
      from public.technician_team_members m
      join auth.users u on u.id = m.user_id
      left join public.user_profiles up on up.user_id = m.user_id
      left join lateral (
        select r.id, r.job_type
        from public.repair_records r
        where r.technician_user_id = m.user_id
          and lower(coalesce(r.status, '')) !~ '(complete|resolved|done|fixed|closed|cancel)'
        order by r.created_at desc
        limit 1
      ) job on true
      where m.team_id = v_team.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Technicians the leader can still add (same tenant, not in any team yet).
create or replace function public.team_candidates()
returns table (user_id uuid, full_name text, employee_number text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_tenant uuid := public.team_tenant();
begin
  if not exists (
    select 1 from public.technician_team_members where technician_team_members.user_id = auth.uid() and role = 'leader'
  ) then
    raise exception 'Only the team leader can add members.';
  end if;

  return query
  select tu.user_id,
         coalesce(nullif(btrim(up.full_name), ''), split_part(coalesce(u.email, ''), '@', 1)),
         up.employee_number
  from public.tenant_users tu
  join auth.users u on u.id = tu.user_id
  left join public.user_profiles up on up.user_id = tu.user_id
  where tu.tenant_id = v_tenant
    and tu.role = 'technician'
    and tu.user_id <> auth.uid()
    and not exists (select 1 from public.technician_team_members m where m.user_id = tu.user_id)
  order by 2;
end;
$$;

create or replace function public.team_add_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.team_tenant();
  v_team uuid;
begin
  select team_id into v_team from public.technician_team_members
  where user_id = auth.uid() and role = 'leader';
  if v_team is null then
    raise exception 'Only the team leader can add members.';
  end if;

  if (select count(*) from public.technician_team_members where team_id = v_team) >= 10 then
    raise exception 'A team can have at most 10 technicians.';
  end if;

  if not exists (
    select 1 from public.tenant_users where user_id = p_user and tenant_id = v_tenant and role = 'technician'
  ) then
    raise exception 'That person is not a technician in your company.';
  end if;

  if exists (select 1 from public.technician_team_members where user_id = p_user) then
    raise exception 'That technician is already in a team.';
  end if;

  insert into public.technician_team_members (team_id, user_id) values (v_team, p_user);
end;
$$;

create or replace function public.team_remove_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_team uuid;
begin
  perform public.team_tenant();
  select team_id into v_team from public.technician_team_members
  where user_id = auth.uid() and role = 'leader';
  if v_team is null then
    raise exception 'Only the team leader can remove members.';
  end if;
  if p_user = auth.uid() then
    raise exception 'Use Leave team to leave your own team.';
  end if;
  delete from public.technician_team_members where team_id = v_team and user_id = p_user;
end;
$$;

-- Leave the team. A leader who leaves hands the team to the longest-standing
-- member; if nobody is left the team is removed.
create or replace function public.team_leave()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_role text;
  v_next uuid;
begin
  perform public.team_tenant();
  select team_id, role into v_team, v_role from public.technician_team_members where user_id = auth.uid();
  if v_team is null then
    return;
  end if;

  delete from public.technician_team_members where team_id = v_team and user_id = auth.uid();

  if not exists (select 1 from public.technician_team_members where team_id = v_team) then
    delete from public.technician_teams where id = v_team;
  elsif v_role = 'leader' then
    select user_id into v_next from public.technician_team_members
    where team_id = v_team order by joined_at limit 1;
    update public.technician_team_members set role = 'leader' where team_id = v_team and user_id = v_next;
  end if;
end;
$$;

revoke execute on function public.team_tenant() from public, anon, authenticated;
revoke execute on function public.create_team(text) from public, anon;
revoke execute on function public.my_team() from public, anon;
revoke execute on function public.team_candidates() from public, anon;
revoke execute on function public.team_add_member(uuid) from public, anon;
revoke execute on function public.team_remove_member(uuid) from public, anon;
revoke execute on function public.team_leave() from public, anon;
grant execute on function public.create_team(text) to authenticated;
grant execute on function public.my_team() to authenticated;
grant execute on function public.team_candidates() to authenticated;
grant execute on function public.team_add_member(uuid) to authenticated;
grant execute on function public.team_remove_member(uuid) to authenticated;
grant execute on function public.team_leave() to authenticated;
