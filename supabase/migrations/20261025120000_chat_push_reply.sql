-- Chat notifications with a Reply button.
--
-- chat_push() sends a push marked as a chat message for one conversation
-- (service request). send-push turns it into a notification with a "Reply"
-- text box; the app sends the typed reply with send_ticket_message().
-- send_ticket_message() now also tells crew members who accepted the job,
-- not just the lead technician.

create or replace function public.chat_push(p_user uuid, p_title text, p_body text, p_request uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $fn$
declare v_secret text;
begin
  select secret into v_secret from public.push_config limit 1;
  perform net.http_post(
    url := 'https://ylqmsghxihtzbaqgkyxi.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('user_id', p_user, 'title', p_title, 'body', p_body, 'kind', 'chat', 'request_id', p_request)
  );
exception when others then
  null;
end;
$fn$;

revoke all on function public.chat_push(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.chat_push(uuid, text, text, uuid) to service_role;

create or replace function public.send_ticket_message(p_request_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
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
    v_label := coalesce(
      nullif(v_req.issue_type, ''),
      case when v_req.request_type = 'repair' then 'your repair' else 'your installation' end
    );
    if v_role = 'customer' then
      for v_target in
        select r.technician_user_id from public.repair_records r
        where r.service_request_id = p_request_id and r.technician_user_id is not null
        union
        select c.user_id from public.repair_job_crew c
        join public.repair_records r on r.id = c.repair_id
        where r.service_request_id = p_request_id and c.status = 'accepted'
      loop
        continue when v_target is null or v_target = v_uid;
        perform public.chat_push(v_target, 'New message from ' || v_name, left(v_body, 120), p_request_id);
      end loop;
    elsif v_req.user_id is not null and v_req.user_id <> v_uid then
      perform public.chat_push(v_req.user_id, v_name || ' replied about ' || v_label, left(v_body, 120), p_request_id);
    end if;
  exception when others then
    null;
  end;

  return v_id;
end;
$fn$;
