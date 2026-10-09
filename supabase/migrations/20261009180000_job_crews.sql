-- Team jobs: the team LEADER accepts a job for the team and chooses who goes.
-- The chosen technicians form the job's crew. Team members cannot accept jobs
-- on their own, and the customer sees the whole crew.
create table if not exists public.repair_job_crew (
  repair_id uuid not null references public.repair_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (repair_id, user_id)
);
create index if not exists repair_job_crew_user_idx on public.repair_job_crew (user_id);

alter table public.repair_job_crew enable row level security;

drop policy if exists "crew can see own assignments" on public.repair_job_crew;
create policy "crew can see own assignments" on public.repair_job_crew
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete, truncate on public.repair_job_crew from anon, authenticated;

-- Crew members can read (not change) the jobs they were assigned to.
drop policy if exists "crew can read assigned repairs" on public.repair_records;
create policy "crew can read assigned repairs" on public.repair_records
  for select to authenticated
  using (exists (
    select 1 from public.repair_job_crew c
    where c.repair_id = repair_records.id and c.user_id = auth.uid()
  ));

-- A team member cannot accept a job themselves; their leader does.
create or replace function public.guard_team_job_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and OLD.technician_user_id is null
     and NEW.technician_user_id is not null
     and NEW.technician_user_id = auth.uid()
     and exists (
       select 1 from public.technician_team_members m
       where m.user_id = auth.uid() and m.role = 'member'
     ) then
    raise exception 'Your team leader accepts jobs for the team and chooses who goes.';
  end if;
  return NEW;
end;
$$;
revoke execute on function public.guard_team_job_accept() from public, anon, authenticated;

drop trigger if exists repair_team_accept_guard on public.repair_records;
create trigger repair_team_accept_guard
  before update of technician_user_id on public.repair_records
  for each row execute function public.guard_team_job_accept();

-- The leader (who accepted the job) picks the crew from their available teammates.
create or replace function public.assign_job_crew(p_repair uuid, p_users uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_customer text;
  r public.repair_records%rowtype;
  v_user uuid;
begin
  perform public.team_tenant();

  select team_id into v_team from public.technician_team_members
  where user_id = auth.uid() and role = 'leader';
  if v_team is null then
    raise exception 'Only a team leader can choose the crew.';
  end if;

  select * into r from public.repair_records where id = p_repair;
  if r.id is null or r.technician_user_id is distinct from auth.uid() then
    raise exception 'Accept the job first, then choose your crew.';
  end if;
  if lower(coalesce(r.status, '')) ~ '(complete|resolved|done|fixed|closed|cancel)' then
    raise exception 'That job is already finished.';
  end if;

  p_users := coalesce(p_users, '{}'::uuid[]);

  foreach v_user in array p_users loop
    if v_user = auth.uid() then
      raise exception 'You are already on this job as the leader.';
    end if;
    if not exists (
      select 1 from public.technician_team_members where team_id = v_team and user_id = v_user
    ) then
      raise exception 'You can only choose people from your own team.';
    end if;
    -- Busy on another open job (not this one): not available.
    if exists (
      select 1 from public.repair_records o
      where o.id <> p_repair
        and lower(coalesce(o.status, '')) !~ '(complete|resolved|done|fixed|closed|cancel)'
        and (o.technician_user_id = v_user
             or exists (select 1 from public.repair_job_crew c where c.repair_id = o.id and c.user_id = v_user))
    ) then
      raise exception '% is busy with another job.', public.team_person_name(v_user);
    end if;
  end loop;

  delete from public.repair_job_crew where repair_id = p_repair and not (user_id = any (p_users));

  insert into public.repair_job_crew (repair_id, user_id, added_by)
  select p_repair, u, auth.uid() from unnest(p_users) as u
  on conflict do nothing;

  select customer_name into v_customer from public.clients where id = r.client_id;
  foreach v_user in array p_users loop
    perform public.team_push(
      v_user,
      'You were added to a job',
      public.team_person_name(auth.uid()) || ' added you to ' ||
        case when r.job_type = 'installation' then 'an installation' else 'a repair' end ||
        coalesce(' for ' || v_customer, '') || '. Open Jobs.'
    );
  end loop;
end;
$$;

-- Everyone on a job, for the customer, the crew and staff of the same company.
create or replace function public.job_crew(p_repair uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.repair_records%rowtype;
  c public.clients%rowtype;
  v_ok boolean;
begin
  select * into r from public.repair_records where id = p_repair;
  if r.id is null then
    return '[]'::jsonb;
  end if;
  select * into c from public.clients where id = r.client_id;

  v_ok := c.user_id = auth.uid()
    or r.technician_user_id = auth.uid()
    or exists (select 1 from public.repair_job_crew x where x.repair_id = p_repair and x.user_id = auth.uid())
    or exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = c.tenant_id);
  if not v_ok then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', t.user_id,
      'name', coalesce(nullif(btrim(up.full_name), ''), public.team_person_name(t.user_id)),
      'employee_number', up.employee_number,
      'phone', up.mobile_number,
      'role', t.role
    ) order by (t.role = 'lead') desc, t.sort)
    from (
      select r.technician_user_id as user_id, 'lead'::text as role, 0 as sort
      where r.technician_user_id is not null
      union all
      select x.user_id, 'helper', 1 from public.repair_job_crew x where x.repair_id = p_repair
    ) t
    left join public.user_profiles up on up.user_id = t.user_id
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.assign_job_crew(uuid, uuid[]) from public, anon;
revoke execute on function public.job_crew(uuid) from public, anon;
grant execute on function public.assign_job_crew(uuid, uuid[]) to authenticated;
grant execute on function public.job_crew(uuid) to authenticated;

-- Team view: a teammate on a crew counts as busy too.
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
        where lower(coalesce(r.status, '')) !~ '(complete|resolved|done|fixed|closed|cancel)'
          and (r.technician_user_id = m.user_id
               or exists (select 1 from public.repair_job_crew c where c.repair_id = r.id and c.user_id = m.user_id))
        order by r.created_at desc
        limit 1
      ) job on true
      where m.team_id = v_team.id
    ), '[]'::jsonb),
    'invites', case when v_role = 'leader' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name', public.team_person_name(i.invited_user),
        'employee_number', (select employee_number from public.user_profiles where user_id = i.invited_user),
        'status', i.status,
        'reason', i.decline_reason,
        'responded_at', i.responded_at
      ) order by i.created_at desc)
      from public.technician_team_invites i
      where i.team_id = v_team.id
        and (i.status = 'pending' or (i.status = 'declined' and i.responded_at > now() - interval '14 days'))
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;
