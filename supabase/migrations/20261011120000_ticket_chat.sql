-- Ticket chat: a message thread on every issue report (service_requests row)
-- between the customer, the technician on the linked job (or crew member who
-- accepted) and support staff (anyone in the customer's tenant who has the
-- 'tickets' permission: admins, and accounting by default).
--   * ticket_messages: rows are only ever added through send_ticket_message()
--     and are never edited or deleted by users.
--   * ticket_role(): who the signed-in person is on a given ticket
--     ('customer' | 'technician' | 'staff' | null); also the read rule.
--   * send_ticket_message(): checks the role, cleans the text, limits bursts
--     and pushes a notification to the people on the other side.

create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  request_id uuid not null references public.service_requests(id) on delete cascade,
  sender_user_id uuid not null,
  sender_role text not null check (sender_role in ('customer', 'technician', 'staff')),
  sender_name text,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists ticket_messages_request_idx on public.ticket_messages (request_id, created_at);
create index if not exists ticket_messages_sender_idx on public.ticket_messages (sender_user_id, created_at desc);

alter table public.ticket_messages enable row level security;

create or replace function public.ticket_role(p_request_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_req public.service_requests%rowtype;
  v_tenant uuid;
begin
  if v_uid is null then
    return null;
  end if;

  select * into v_req from public.service_requests where id = p_request_id;
  if not found then
    return null;
  end if;

  if v_req.user_id = v_uid then
    return 'customer';
  end if;

  if exists (
    select 1 from public.repair_records r
    where r.service_request_id = p_request_id
      and (
        r.technician_user_id = v_uid
        or exists (
          select 1 from public.repair_job_crew c
          where c.repair_id = r.id and c.user_id = v_uid and c.status = 'accepted'
        )
      )
  ) then
    return 'technician';
  end if;

  select tenant_id into v_tenant from public.clients where id = v_req.client_id;
  if v_tenant is not null and public.has_permission(v_tenant, 'tickets') then
    return 'staff';
  end if;

  return null;
end;
$fn$;

revoke all on function public.ticket_role(uuid) from public, anon;
grant execute on function public.ticket_role(uuid) to authenticated, service_role;

drop policy if exists "ticket participants read messages" on public.ticket_messages;
create policy "ticket participants read messages" on public.ticket_messages
  for select to authenticated using (public.ticket_role(request_id) is not null);

create or replace function public.send_ticket_message(p_request_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_req public.service_requests%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_name text;
  v_tenant uuid;
  v_id uuid;
  v_label text;
  v_target uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  v_role := public.ticket_role(p_request_id);
  if v_role is null then
    raise exception 'You are not part of this conversation.';
  end if;

  if char_length(v_body) = 0 then
    raise exception 'Type a message first.';
  end if;
  if char_length(v_body) > 1000 then
    raise exception 'Please keep a message under 1000 characters.';
  end if;

  select * into v_req from public.service_requests where id = p_request_id;
  if lower(coalesce(v_req.status, '')) in ('cancelled', 'canceled') then
    raise exception 'This request was cancelled, so the chat is closed.';
  end if;

  if (
    select count(*) from public.ticket_messages
    where sender_user_id = v_uid and request_id = p_request_id and created_at > now() - interval '10 minutes'
  ) >= 30 then
    raise exception 'You are sending messages very fast. Please wait a few minutes.';
  end if;

  select tenant_id into v_tenant from public.clients where id = v_req.client_id;
  v_name := case v_role
    when 'customer' then coalesce(
      (select customer_name from public.clients where id = v_req.client_id), 'Customer')
    else coalesce(nullif(public.team_person_name(v_uid), ''), case v_role when 'technician' then 'Technician' else 'Support' end)
  end;

  insert into public.ticket_messages (tenant_id, request_id, sender_user_id, sender_role, sender_name, body)
  values (v_tenant, p_request_id, v_uid, v_role, v_name, v_body)
  returning id into v_id;

  -- Tell the other side. A failed push must never fail the message.
  begin
    v_label := coalesce(nullif(v_req.issue_type, ''), 'your request');
    if v_role = 'customer' then
      for v_target in
        select distinct r.technician_user_id from public.repair_records r
        where r.service_request_id = p_request_id and r.technician_user_id is not null and r.technician_user_id <> v_uid
      loop
        perform public.team_push(v_target, 'New message from ' || v_name, left(v_body, 120));
      end loop;
    elsif v_req.user_id is not null and v_req.user_id <> v_uid then
      perform public.team_push(v_req.user_id, v_name || ' replied about ' || v_label, left(v_body, 120));
    end if;
  exception when others then
    null;
  end;

  return v_id;
end;
$fn$;

revoke all on function public.send_ticket_message(uuid, text) from public, anon;
grant execute on function public.send_ticket_message(uuid, text) to authenticated, service_role;

-- No direct writes: only the function above adds messages.
revoke insert, update, delete on public.ticket_messages from anon, authenticated;
