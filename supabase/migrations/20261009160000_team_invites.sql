-- Team invitations: a leader invites a technician, who must accept or decline.
-- Declining needs a reason, which the leader can read. Replaces the direct
-- "add member" function.
create table if not exists public.technician_team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.technician_teams(id) on delete cascade,
  invited_user uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  decline_reason text,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists technician_team_invites_pending_uniq
  on public.technician_team_invites (team_id, invited_user)
  where status = 'pending';

alter table public.technician_team_invites enable row level security;

-- Push alert through the existing send-push function. Never blocks the caller.
create or replace function public.team_push(p_user uuid, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_secret text;
begin
  select secret into v_secret from public.push_config limit 1;
  perform net.http_post(
    url := 'https://ylqmsghxihtzbaqgkyxi.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('user_id', p_user, 'title', p_title, 'body', p_body)
  );
exception when others then
  null;
end;
$$;
revoke execute on function public.team_push(uuid, text, text) from public, anon, authenticated;

drop function if exists public.team_add_member(uuid);

create or replace function public.team_person_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(up.full_name), ''), split_part(coalesce(u.email, ''), '@', 1))
  from auth.users u
  left join public.user_profiles up on up.user_id = u.id
  where u.id = p_user;
$$;
revoke execute on function public.team_person_name(uuid) from public, anon, authenticated;

create or replace function public.team_invite(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.team_tenant();
  v_team uuid;
  v_team_name text;
begin
  select m.team_id, t.name into v_team, v_team_name
  from public.technician_team_members m
  join public.technician_teams t on t.id = m.team_id
  where m.user_id = auth.uid() and m.role = 'leader';
  if v_team is null then
    raise exception 'Only the team leader can invite members.';
  end if;

  -- Pending invitations hold a seat, so the team can never go past 10.
  if (select count(*) from public.technician_team_members where team_id = v_team)
     + (select count(*) from public.technician_team_invites where team_id = v_team and status = 'pending') >= 10 then
    raise exception 'A team can have at most 10 technicians (pending invitations count).';
  end if;

  if not exists (
    select 1 from public.tenant_users where user_id = p_user and tenant_id = v_tenant and role = 'technician'
  ) then
    raise exception 'That person is not a technician in your company.';
  end if;

  if exists (select 1 from public.technician_team_members where user_id = p_user) then
    raise exception 'That technician is already in a team.';
  end if;

  if exists (
    select 1 from public.technician_team_invites
    where team_id = v_team and invited_user = p_user and status = 'pending'
  ) then
    raise exception 'You already invited that technician.';
  end if;

  insert into public.technician_team_invites (team_id, invited_user, invited_by)
  values (v_team, p_user, auth.uid());

  perform public.team_push(
    p_user,
    'Team invitation',
    public.team_person_name(auth.uid()) || ' invited you to join "' || v_team_name || '". Open My team to accept or decline.'
  );
end;
$$;

create or replace function public.team_cancel_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.team_tenant();
  update public.technician_team_invites i
  set status = 'cancelled', responded_at = now()
  where i.id = p_invite and i.status = 'pending'
    and exists (
      select 1 from public.technician_team_members m
      where m.team_id = i.team_id and m.user_id = auth.uid() and m.role = 'leader'
    );
end;
$$;

-- Invitations waiting for the caller.
create or replace function public.my_invites()
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
      'id', i.id,
      'team_name', t.name,
      'invited_by_name', public.team_person_name(i.invited_by),
      'invited_by_id', (select employee_number from public.user_profiles where user_id = i.invited_by),
      'member_count', (select count(*) from public.technician_team_members where team_id = i.team_id),
      'created_at', i.created_at
    ) order by i.created_at desc)
    from public.technician_team_invites i
    join public.technician_teams t on t.id = i.team_id
    where i.invited_user = auth.uid() and i.status = 'pending'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.team_respond(p_invite uuid, p_accept boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.technician_team_invites%rowtype;
  v_team_name text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.team_tenant();

  select * into v_inv from public.technician_team_invites
  where id = p_invite and invited_user = auth.uid() and status = 'pending'
  for update;
  if v_inv.id is null then
    raise exception 'That invitation is no longer open.';
  end if;

  select name into v_team_name from public.technician_teams where id = v_inv.team_id;

  if p_accept then
    if exists (select 1 from public.technician_team_members where user_id = auth.uid()) then
      raise exception 'You are already in a team. Leave it first.';
    end if;
    if (select count(*) from public.technician_team_members where team_id = v_inv.team_id) >= 10 then
      raise exception 'That team is already full.';
    end if;

    insert into public.technician_team_members (team_id, user_id) values (v_inv.team_id, auth.uid());
    update public.technician_team_invites set status = 'accepted', responded_at = now() where id = v_inv.id;
    -- Their other open invitations no longer apply.
    update public.technician_team_invites set status = 'cancelled', responded_at = now()
    where invited_user = auth.uid() and status = 'pending';

    perform public.team_push(v_inv.invited_by, 'Invitation accepted',
      public.team_person_name(auth.uid()) || ' joined "' || v_team_name || '".');
  else
    if v_reason is null or char_length(v_reason) < 3 then
      raise exception 'Please tell the leader why you are declining.';
    end if;
    update public.technician_team_invites
    set status = 'declined', decline_reason = left(v_reason, 200), responded_at = now()
    where id = v_inv.id;

    perform public.team_push(v_inv.invited_by, 'Invitation declined',
      public.team_person_name(auth.uid()) || ' declined to join "' || v_team_name || '": ' || left(v_reason, 120));
  end if;
end;
$$;

-- Technicians the leader can still invite (not in a team, no open invitation from this team).
create or replace function public.team_candidates()
returns table (user_id uuid, full_name text, employee_number text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.team_tenant();
  v_team uuid;
begin
  select m.team_id into v_team from public.technician_team_members m
  where m.user_id = auth.uid() and m.role = 'leader';
  if v_team is null then
    raise exception 'Only the team leader can invite members.';
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
    and not exists (
      select 1 from public.technician_team_invites i
      where i.team_id = v_team and i.invited_user = tu.user_id and i.status = 'pending'
    )
  order by 2;
end;
$$;

-- my_team now also returns the leader's invitations (pending, and declined
-- ones from the last 14 days with their reasons).
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

revoke execute on function public.team_invite(uuid) from public, anon;
revoke execute on function public.team_cancel_invite(uuid) from public, anon;
revoke execute on function public.my_invites() from public, anon;
revoke execute on function public.team_respond(uuid, boolean, text) from public, anon;
grant execute on function public.team_invite(uuid) to authenticated;
grant execute on function public.team_cancel_invite(uuid) to authenticated;
grant execute on function public.my_invites() to authenticated;
grant execute on function public.team_respond(uuid, boolean, text) to authenticated;
