-- A team leader also sees, and can choose the crew for, jobs their own team
-- members accepted (for example a job taken before the person joined the team).
create or replace function public.is_my_team_job(p_technician uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_technician is not null and exists (
    select 1
    from public.technician_team_members l
    join public.technician_team_members m on m.team_id = l.team_id
    where l.user_id = auth.uid() and l.role = 'leader' and m.user_id = p_technician
  );
$$;
revoke execute on function public.is_my_team_job(uuid) from public, anon;
grant execute on function public.is_my_team_job(uuid) to authenticated;

drop policy if exists "team leader reads team jobs" on public.repair_records;
create policy "team leader reads team jobs" on public.repair_records
  for select to authenticated
  using (public.is_my_team_job(technician_user_id));

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
  if r.id is null
     or r.technician_user_id is null
     or (r.technician_user_id <> auth.uid() and not public.is_my_team_job(r.technician_user_id)) then
    raise exception 'Accept the job first, then choose your crew.';
  end if;
  if lower(coalesce(r.status, '')) ~ '(complete|resolved|done|fixed|closed|cancel)' then
    raise exception 'That job is already finished.';
  end if;

  p_users := coalesce(p_users, '{}'::uuid[]);

  foreach v_user in array p_users loop
    if v_user = r.technician_user_id then
      raise exception 'That person is already the lead on this job.';
    end if;
    if not exists (
      select 1 from public.technician_team_members where team_id = v_team and user_id = v_user
    ) then
      raise exception 'You can only choose people from your own team.';
    end if;
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
