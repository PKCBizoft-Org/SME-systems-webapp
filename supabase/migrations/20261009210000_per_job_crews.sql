-- Reset of the team feature. No standing teams any more: any technician can
-- accept a job, then choose to do it SOLO or TEAM UP. Team-up shows every other
-- technician as available or busy (with their staff ID); the chosen ones get a
-- request and accept or decline (a reason is required to decline).
drop trigger if exists repair_team_accept_guard on public.repair_records;
drop trigger if exists repair_job_crew_push_trigger on public.repair_job_crew;
drop policy if exists "team leader reads team jobs" on public.repair_records;
drop policy if exists "crew can read assigned repairs" on public.repair_records;

drop function if exists public.guard_team_job_accept();
drop function if exists public.is_my_team_job(uuid);
drop function if exists public.assign_job_crew(uuid, uuid[]);
drop function if exists public.my_team();
drop function if exists public.team_candidates();
drop function if exists public.team_invite(uuid);
drop function if exists public.team_cancel_invite(uuid);
drop function if exists public.my_invites();
drop function if exists public.team_respond(uuid, boolean, text);
drop function if exists public.team_remove_member(uuid);
drop function if exists public.team_leave();
drop function if exists public.create_team(text);
drop function if exists public.notify_crew_joined();

drop table if exists public.technician_team_invites cascade;
drop table if exists public.technician_team_members cascade;
drop table if exists public.technician_teams cascade;

-- A crew row is now a request that the technician answers.
alter table public.repair_job_crew
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  add column if not exists decline_reason text,
  add column if not exists responded_at timestamptz;
update public.repair_job_crew set status = 'accepted' where status = 'pending' and responded_at is null and added_at < now() - interval '1 second';

-- Accepted crew members can read (not change) the job.
create policy "crew can read assigned repairs" on public.repair_records
  for select to authenticated
  using (exists (
    select 1 from public.repair_job_crew c
    where c.repair_id = repair_records.id and c.user_id = auth.uid() and c.status = 'accepted'
  ));

-- Busy = leads an open job, or accepted onto the crew of an open job.
create or replace function public.tech_is_busy(p_user uuid, p_except uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.repair_records r
    where r.id is distinct from p_except
      and lower(coalesce(r.status, '')) !~ '(complete|resolved|done|fixed|closed|cancel)'
      and (r.technician_user_id = p_user
           or exists (
             select 1 from public.repair_job_crew c
             where c.repair_id = r.id and c.user_id = p_user and c.status = 'accepted'
           ))
  );
$$;
revoke execute on function public.tech_is_busy(uuid, uuid) from public, anon, authenticated;

-- Every other technician in the company, available or busy.
create or replace function public.tech_directory()
returns table (user_id uuid, full_name text, employee_number text, status text, job_type text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_tenant uuid := public.team_tenant();
begin
  return query
  select tu.user_id,
         coalesce(nullif(btrim(up.full_name), ''), split_part(coalesce(u.email, ''), '@', 1)),
         up.employee_number,
         case when public.tech_is_busy(tu.user_id) then 'busy' else 'available' end,
         (select r.job_type from public.repair_records r
          where lower(coalesce(r.status, '')) !~ '(complete|resolved|done|fixed|closed|cancel)'
            and (r.technician_user_id = tu.user_id
                 or exists (select 1 from public.repair_job_crew c
                            where c.repair_id = r.id and c.user_id = tu.user_id and c.status = 'accepted'))
          order by r.created_at desc limit 1)
  from public.tenant_users tu
  join auth.users u on u.id = tu.user_id
  left join public.user_profiles up on up.user_id = tu.user_id
  where tu.tenant_id = v_tenant
    and tu.role = 'technician'
    and tu.user_id <> auth.uid()
  order by 4, 2;
end;
$$;

-- The job's lead asks technicians to join. Up to 10 on a job including the lead.
create or replace function public.request_job_crew(p_repair uuid, p_users uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.team_tenant();
  r public.repair_records%rowtype;
  v_user uuid;
  v_customer text;
  v_total int;
  v_new uuid[] := '{}';
begin
  select * into r from public.repair_records where id = p_repair;
  if r.id is null or r.technician_user_id is distinct from auth.uid() then
    raise exception 'Accept the job first, then choose who joins you.';
  end if;
  if lower(coalesce(r.status, '')) ~ '(complete|resolved|done|fixed|closed|cancel)' then
    raise exception 'That job is already finished.';
  end if;

  p_users := coalesce(p_users, '{}'::uuid[]);

  v_total := 1 + coalesce(array_length(p_users, 1), 0) + (
    select count(*) from public.repair_job_crew
    where repair_id = p_repair and status = 'accepted' and not (user_id = any (p_users))
  );
  if v_total > 10 then
    raise exception 'A job can have at most 10 technicians including you.';
  end if;

  foreach v_user in array p_users loop
    if v_user = auth.uid() then
      raise exception 'You are already on this job.';
    end if;
    if not exists (
      select 1 from public.tenant_users where user_id = v_user and tenant_id = v_tenant and role = 'technician'
    ) then
      raise exception 'That person is not a technician in your company.';
    end if;
    if public.tech_is_busy(v_user, p_repair) then
      raise exception '% is busy with another job.', public.team_person_name(v_user);
    end if;

    if not exists (
      select 1 from public.repair_job_crew where repair_id = p_repair and user_id = v_user and status in ('pending', 'accepted')
    ) then
      v_new := v_new || v_user;
    end if;

    insert into public.repair_job_crew (repair_id, user_id, added_by, status)
    values (p_repair, v_user, auth.uid(), 'pending')
    on conflict (repair_id, user_id) do update
      set status = case when public.repair_job_crew.status = 'accepted' then 'accepted' else 'pending' end,
          decline_reason = case when public.repair_job_crew.status = 'accepted' then null else null end,
          responded_at = case when public.repair_job_crew.status = 'accepted' then public.repair_job_crew.responded_at else null end,
          added_by = auth.uid();
  end loop;

  update public.repair_job_crew
  set status = 'cancelled', responded_at = now()
  where repair_id = p_repair and status = 'pending' and not (user_id = any (p_users));

  select customer_name into v_customer from public.clients where id = r.client_id;
  foreach v_user in array v_new loop
    perform public.team_push(
      v_user,
      'Help requested on a job',
      public.team_person_name(auth.uid()) || ' wants you on ' ||
        case when r.job_type = 'installation' then 'an installation' else 'a repair' end ||
        coalesce(' for ' || split_part(v_customer, ' ', 1), '') || '. Open Crew requests to accept or decline.'
    );
  end loop;
end;
$$;

create or replace function public.remove_job_crew_member(p_repair uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.team_tenant();
  update public.repair_job_crew c
  set status = 'cancelled', responded_at = now()
  where c.repair_id = p_repair and c.user_id = p_user and c.status in ('pending', 'accepted')
    and exists (select 1 from public.repair_records r where r.id = p_repair and r.technician_user_id = auth.uid());
end;
$$;

-- Requests waiting for the caller (open jobs only).
create or replace function public.my_crew_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.team_tenant();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'repair_id', r.id,
      'job_type', r.job_type,
      'customer', split_part(coalesce(c.customer_name, ''), ' ', 1),
      'address', public.client_full_address(r.client_id),
      'requested_by', public.team_person_name(r.technician_user_id),
      'requested_by_id', (select employee_number from public.user_profiles where user_id = r.technician_user_id),
      'created_at', crew.added_at
    ) order by crew.added_at desc)
    from public.repair_job_crew crew
    join public.repair_records r on r.id = crew.repair_id
    join public.clients c on c.id = r.client_id
    where crew.user_id = auth.uid()
      and crew.status = 'pending'
      and lower(coalesce(r.status, '')) !~ '(complete|resolved|done|fixed|closed|cancel)'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.respond_job_crew(p_repair uuid, p_accept boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.repair_job_crew%rowtype;
  r public.repair_records%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.team_tenant();

  select * into v_row from public.repair_job_crew
  where repair_id = p_repair and user_id = auth.uid() and status = 'pending'
  for update;
  if v_row.repair_id is null then
    raise exception 'That request is no longer open.';
  end if;
  select * into r from public.repair_records where id = p_repair;

  if p_accept then
    if public.tech_is_busy(auth.uid(), p_repair) then
      raise exception 'You are busy with another job. Finish it first.';
    end if;
    update public.repair_job_crew set status = 'accepted', responded_at = now()
    where repair_id = p_repair and user_id = auth.uid();

    perform public.team_push(r.technician_user_id, 'Request accepted',
      public.team_person_name(auth.uid()) || ' joined your job.');
  else
    if v_reason is null or char_length(v_reason) < 3 then
      raise exception 'Please tell them why you are declining.';
    end if;
    update public.repair_job_crew
    set status = 'declined', decline_reason = left(v_reason, 200), responded_at = now()
    where repair_id = p_repair and user_id = auth.uid();

    perform public.team_push(r.technician_user_id, 'Request declined',
      public.team_person_name(auth.uid()) || ' declined: ' || left(v_reason, 120));
  end if;
end;
$$;

-- Requests the lead sent, with answers and reasons.
create or replace function public.job_crew_requests(p_repair uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.team_tenant();
  if not exists (select 1 from public.repair_records where id = p_repair and technician_user_id = auth.uid()) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', c.user_id,
      'name', public.team_person_name(c.user_id),
      'employee_number', (select employee_number from public.user_profiles where user_id = c.user_id),
      'status', c.status,
      'reason', c.decline_reason
    ) order by c.added_at)
    from public.repair_job_crew c
    where c.repair_id = p_repair and c.status in ('pending', 'accepted', 'declined')
  ), '[]'::jsonb);
end;
$$;

-- Everyone on a job as the customer should see it: the lead plus accepted helpers.
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
    or exists (select 1 from public.repair_job_crew x where x.repair_id = p_repair and x.user_id = auth.uid() and x.status = 'accepted')
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
      select x.user_id, 'helper', 1 from public.repair_job_crew x where x.repair_id = p_repair and x.status = 'accepted'
    ) t
    left join public.user_profiles up on up.user_id = t.user_id
  ), '[]'::jsonb);
end;
$$;

-- Tell the customer when a helper actually joins (accepts).
create or replace function public.notify_crew_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_customer uuid;
begin
  if NEW.status = 'accepted' and OLD.status is distinct from 'accepted' then
    select c.user_id into v_customer
    from public.repair_records r
    join public.clients c on c.id = r.client_id
    where r.id = NEW.repair_id;

    if v_customer is not null then
      perform public.team_push(
        v_customer,
        'Your crew is set',
        public.team_person_name(NEW.user_id) || ' will also be coming to help with your job.'
      );
    end if;
  end if;
  return NEW;
exception when others then
  return NEW;
end;
$$;
revoke execute on function public.notify_crew_joined() from public, anon, authenticated;

create trigger repair_job_crew_push_trigger
  after update of status on public.repair_job_crew
  for each row execute function public.notify_crew_joined();

revoke execute on function public.tech_directory() from public, anon;
revoke execute on function public.request_job_crew(uuid, uuid[]) from public, anon;
revoke execute on function public.remove_job_crew_member(uuid, uuid) from public, anon;
revoke execute on function public.my_crew_requests() from public, anon;
revoke execute on function public.respond_job_crew(uuid, boolean, text) from public, anon;
revoke execute on function public.job_crew_requests(uuid) from public, anon;
revoke execute on function public.job_crew(uuid) from public, anon;
grant execute on function public.tech_directory() to authenticated;
grant execute on function public.request_job_crew(uuid, uuid[]) to authenticated;
grant execute on function public.remove_job_crew_member(uuid, uuid) to authenticated;
grant execute on function public.my_crew_requests() to authenticated;
grant execute on function public.respond_job_crew(uuid, boolean, text) to authenticated;
grant execute on function public.job_crew_requests(uuid) to authenticated;
grant execute on function public.job_crew(uuid) to authenticated;
