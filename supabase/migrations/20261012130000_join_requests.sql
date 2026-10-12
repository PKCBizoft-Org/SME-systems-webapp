-- A technician can ask to join a job somebody else already took. The lead
-- (the technician who took it) accepts or declines, and a decline needs a reason.
-- Accepting puts the requester on the job's crew, exactly as if the lead had invited them.

create table if not exists public.repair_join_requests (
  repair_id uuid not null references public.repair_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  decline_reason text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (repair_id, user_id)
);
create index if not exists repair_join_requests_lead_idx on public.repair_join_requests (lead_id, status);

-- Everything goes through the functions below.
alter table public.repair_join_requests enable row level security;

-- Ask to join someone else's job.
create or replace function public.request_to_join_job(p_repair uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.team_tenant();
  r public.repair_records%rowtype;
  c public.clients%rowtype;
  v_customer text;
begin
  select * into r from public.repair_records where id = p_repair;
  if r.id is null then
    raise exception 'That job was not found.';
  end if;
  select * into c from public.clients where id = r.client_id;
  if c.tenant_id is distinct from v_tenant then
    raise exception 'That job is not in your company.';
  end if;
  if lower(coalesce(r.status, '')) ~ '(complete|resolved|done|fixed|closed|cancel)' then
    raise exception 'That job is already finished.';
  end if;
  if r.technician_user_id is null then
    raise exception 'Nobody has taken this job yet. You can accept it yourself.';
  end if;
  if r.technician_user_id = auth.uid() then
    raise exception 'This is your own job.';
  end if;
  if exists (
    select 1 from public.repair_job_crew
    where repair_id = p_repair and user_id = auth.uid() and status in ('pending', 'accepted')
  ) then
    raise exception 'You are already on this job, or already invited to it.';
  end if;
  if public.tech_is_busy(auth.uid(), p_repair) then
    raise exception 'You are busy with another job. Finish it first.';
  end if;
  if 1 + (select count(*) from public.repair_job_crew where repair_id = p_repair and status = 'accepted') >= 10 then
    raise exception 'This job already has the most technicians it can have.';
  end if;
  if exists (
    select 1 from public.repair_join_requests
    where repair_id = p_repair and user_id = auth.uid() and status = 'pending' and lead_id = r.technician_user_id
  ) then
    raise exception 'You already asked to join this job. Wait for the answer.';
  end if;

  insert into public.repair_join_requests (repair_id, user_id, lead_id, status)
  values (p_repair, auth.uid(), r.technician_user_id, 'pending')
  on conflict (repair_id, user_id) do update
    set lead_id = excluded.lead_id, status = 'pending', decline_reason = null,
        created_at = now(), responded_at = null;

  select customer_name into v_customer from public.clients where id = r.client_id;
  perform public.team_push(
    r.technician_user_id,
    'A technician wants to join your job',
    public.team_person_name(auth.uid()) || ' asks to team up on ' ||
      case when r.job_type = 'installation' then 'your installation' else 'your repair' end ||
      coalesce(' for ' || split_part(v_customer, ' ', 1), '') || '. Open Crew requests to accept or decline.'
  );
end;
$$;

-- Take back a request that is still waiting.
create or replace function public.cancel_join_request(p_repair uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.team_tenant();
  update public.repair_join_requests
  set status = 'cancelled', responded_at = now()
  where repair_id = p_repair and user_id = auth.uid() and status = 'pending';
end;
$$;

-- Where my own request stands (null when I never asked, or the job changed hands).
create or replace function public.my_join_request(p_repair uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.repair_join_requests%rowtype;
begin
  perform public.team_tenant();
  select j.* into v
  from public.repair_join_requests j
  join public.repair_records r on r.id = j.repair_id
  where j.repair_id = p_repair and j.user_id = auth.uid()
    and j.lead_id is not distinct from r.technician_user_id;
  if v.repair_id is null or v.status = 'cancelled' then
    return null;
  end if;
  return jsonb_build_object('status', v.status, 'reason', v.decline_reason);
end;
$$;

-- Requests waiting for me on the jobs I lead (open jobs only).
create or replace function public.join_requests_for_me()
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
      'user_id', j.user_id,
      'name', public.team_person_name(j.user_id),
      'employee_number', (select employee_number from public.user_profiles where user_id = j.user_id),
      'job_type', r.job_type,
      'customer', split_part(coalesce(c.customer_name, ''), ' ', 1),
      'created_at', j.created_at
    ) order by j.created_at desc)
    from public.repair_join_requests j
    join public.repair_records r on r.id = j.repair_id
    join public.clients c on c.id = r.client_id
    where j.status = 'pending'
      and r.technician_user_id = auth.uid()
      and j.lead_id = auth.uid()
      and lower(coalesce(r.status, '')) !~ '(complete|resolved|done|fixed|closed|cancel)'
  ), '[]'::jsonb);
end;
$$;

-- The lead answers. A decline needs a reason; an accept adds the person to the crew.
create or replace function public.respond_join_request(
  p_repair uuid,
  p_user uuid,
  p_accept boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.repair_records%rowtype;
  j public.repair_join_requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.team_tenant();

  select * into r from public.repair_records where id = p_repair;
  if r.id is null or r.technician_user_id is distinct from auth.uid() then
    raise exception 'Only the technician who took this job can answer.';
  end if;

  select * into j from public.repair_join_requests
  where repair_id = p_repair and user_id = p_user and status = 'pending' and lead_id = auth.uid()
  for update;
  if j.repair_id is null then
    raise exception 'That request is no longer open.';
  end if;

  if p_accept then
    if lower(coalesce(r.status, '')) ~ '(complete|resolved|done|fixed|closed|cancel)' then
      raise exception 'That job is already finished.';
    end if;
    if public.tech_is_busy(p_user, p_repair) then
      raise exception '% is busy with another job now.', public.team_person_name(p_user);
    end if;
    if 1 + (select count(*) from public.repair_job_crew where repair_id = p_repair and status = 'accepted') >= 10 then
      raise exception 'A job can have at most 10 technicians including you.';
    end if;

    insert into public.repair_job_crew (repair_id, user_id, added_by, status, responded_at)
    values (p_repair, p_user, auth.uid(), 'accepted', now())
    on conflict (repair_id, user_id) do update
      set status = 'accepted', decline_reason = null, responded_at = now(), added_by = auth.uid();

    update public.repair_join_requests set status = 'accepted', responded_at = now()
    where repair_id = p_repair and user_id = p_user;

    perform public.team_push(p_user, 'You joined the job',
      public.team_person_name(auth.uid()) || ' accepted you. It now shows under Jobs.');
  else
    if v_reason is null or char_length(v_reason) < 3 then
      raise exception 'Please tell them why you are declining.';
    end if;
    update public.repair_join_requests
    set status = 'declined', decline_reason = left(v_reason, 200), responded_at = now()
    where repair_id = p_repair and user_id = p_user;

    perform public.team_push(p_user, 'Request declined',
      public.team_person_name(auth.uid()) || ' declined: ' || left(v_reason, 120));
  end if;
end;
$$;

revoke execute on function public.request_to_join_job(uuid) from public, anon;
revoke execute on function public.cancel_join_request(uuid) from public, anon;
revoke execute on function public.my_join_request(uuid) from public, anon;
revoke execute on function public.join_requests_for_me() from public, anon;
revoke execute on function public.respond_join_request(uuid, uuid, boolean, text) from public, anon;
grant execute on function public.request_to_join_job(uuid) to authenticated;
grant execute on function public.cancel_join_request(uuid) to authenticated;
grant execute on function public.my_join_request(uuid) to authenticated;
grant execute on function public.join_requests_for_me() to authenticated;
grant execute on function public.respond_join_request(uuid, uuid, boolean, text) to authenticated;
