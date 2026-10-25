-- Fortify + enhance batch (2026-10-25).
--   1. Login lockout counts failures per email AND network address, so someone
--      else cannot lock a person out by sending fake failures. A high cap across
--      all addresses still stops a spread-out guessing attack.
--   2. inventory_catalog becomes a security-invoker view over a definer
--      function (same rows and columns for technicians; no definer view left).
--   3. Trigger functions can no longer be called through the API.
--   4. plan_catalog(): plan names and speeds for anyone in the tenant, so the
--      apps stop guessing speeds from prices.
--   5. Photos in job chats (ticket_messages.photo_path + chat-photos bucket).
--   6. Technician day summary push at 7 PM (Philippine time), plus one for admins.
--   7. Speed: auth.uid() evaluated once per query in three policies; two
--      missing foreign-key indexes.

-- 1. Login lockout ------------------------------------------------------------

alter table public.login_attempts add column if not exists ip_key text;
create index if not exists login_attempts_email_ip_idx on public.login_attempts (email_key, ip_key, at desc);

-- The caller's network address as the API saw it ('' when unknown).
create or replace function public.request_ip()
returns text
language sql
stable
set search_path to 'public'
as $fn$
  select coalesce(
    nullif(btrim(split_part(coalesce(
      (nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip'),
      (nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for'),
      (nullif(current_setting('request.headers', true), '')::json ->> 'x-real-ip'),
      ''), ',', 1)), ''),
    '');
$fn$;

create or replace function public.login_status(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_key text := public.login_email_key(p_email);
  v_ip text := public.request_ip();
  v_since timestamptz := now() - interval '15 minutes';
  v_fails integer;
  v_all integer;
  v_last_fail timestamptz;
  v_until timestamptz;
begin
  if v_key = '' then
    return jsonb_build_object('locked', false, 'seconds_left', 0, 'attempts_left', 5);
  end if;

  -- Failures from this caller's address only: a stranger's fake failures do not count.
  select count(*), max(at) into v_fails, v_last_fail
  from public.login_attempts
  where email_key = v_key and not success and at > v_since and coalesce(ip_key, '') = v_ip;

  -- Many addresses guessing the same account: lock it for everyone.
  select count(*) into v_all
  from public.login_attempts
  where email_key = v_key and not success and at > v_since;

  if v_all >= 50 then
    select max(at) into v_last_fail from public.login_attempts where email_key = v_key and not success and at > v_since;
    v_fails := greatest(v_fails, 5);
  end if;

  if v_fails >= 5 then
    v_until := v_last_fail + interval '15 minutes';
    if v_until > now() then
      return jsonb_build_object('locked', true,
        'seconds_left', ceil(extract(epoch from (v_until - now())))::integer, 'attempts_left', 0);
    end if;
  end if;

  return jsonb_build_object('locked', false, 'seconds_left', 0,
    'attempts_left', greatest(0, 5 - v_fails));
end;
$fn$;

create or replace function public.record_login_attempt(p_email text, p_success boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_key text := public.login_email_key(p_email);
  v_status jsonb;
begin
  if v_key = '' then return public.login_status(p_email); end if;
  v_status := public.login_status(v_key);
  if (v_status->>'locked')::boolean then return v_status; end if;

  -- Only failures are recorded; p_success is never trusted to clear the window.
  if p_success is not true
     and (select count(*) from public.login_attempts
          where email_key = v_key and at > now() - interval '1 hour') < 200 then
    insert into public.login_attempts (email_key, success, ip_key) values (v_key, false, public.request_ip());
  end if;

  if random() < 0.02 then
    delete from public.login_attempts where at < now() - interval '2 days';
  end if;

  return public.login_status(v_key);
end;
$fn$;

-- 2. inventory_catalog ----------------------------------------------------------

create or replace function public.inventory_catalog_rows()
returns table (
  id uuid, tenant_id uuid, sku text, name text, category text, unit text,
  quantity_on_hand numeric, reorder_level numeric, location text
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select i.id, i.tenant_id, i.sku, i.name, i.category, i.unit, i.quantity_on_hand, i.reorder_level, i.location
  from public.inventory_items i
  where i.is_active and (public.inventory_has_access(i.tenant_id) or public.inventory_is_technician(i.tenant_id));
$fn$;

revoke all on function public.inventory_catalog_rows() from public, anon;
grant execute on function public.inventory_catalog_rows() to authenticated;

-- Same column types as before (a replaced view may not change them).
create or replace view public.inventory_catalog with (security_invoker = true) as
  select id, tenant_id, sku, name, category, unit,
         quantity_on_hand::numeric(12,2) as quantity_on_hand,
         reorder_level::numeric(12,2) as reorder_level,
         location
  from public.inventory_catalog_rows();

revoke all on public.inventory_catalog from anon;
grant select on public.inventory_catalog to authenticated;

-- 3. Trigger functions are not API endpoints ------------------------------------

do $revoke$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end
$revoke$;

-- 4. Plan names --------------------------------------------------------------------

create or replace function public.plan_catalog()
returns table (plan_name text, price numeric, speed text)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select distinct ip.plan_name, ip.price, ip.speed
  from public.internet_plans ip
  where ip.active
    and ip.tenant_id in (
      select c.tenant_id from public.clients c where c.user_id = auth.uid()
      union
      select tu.tenant_id from public.tenant_users tu where tu.user_id = auth.uid()
    )
  order by ip.price, ip.plan_name;
$fn$;

revoke all on function public.plan_catalog() from public, anon;
grant execute on function public.plan_catalog() to authenticated;

-- 5. Photos in job chats -------------------------------------------------------------

alter table public.ticket_messages add column if not exists photo_path text;
alter table public.ticket_messages drop constraint if exists ticket_messages_body_check;
alter table public.ticket_messages add constraint ticket_messages_body_check
  check (char_length(body) <= 1000 and (char_length(body) >= 1 or photo_path is not null));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-photos', 'chat-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Files live at <request id>/<anything>.jpg; whoever is in that conversation may add and read them.
drop policy if exists chat_photos_insert on storage.objects;
create policy chat_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-photos'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.ticket_role(((storage.foldername(name))[1])::uuid) is not null
  );

drop policy if exists chat_photos_select on storage.objects;
create policy chat_photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-photos'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.ticket_role(((storage.foldername(name))[1])::uuid) is not null
  );

drop function if exists public.send_ticket_message(uuid, text);

create or replace function public.send_ticket_message(p_request_id uuid, p_body text, p_photo_path text default null)
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
  v_photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
  v_name text;
  v_tenant uuid;
  v_id uuid;
  v_label text;
  v_target uuid;
  v_preview text;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  v_role := public.ticket_role(p_request_id);
  if v_role is null then
    raise exception 'You are not part of this conversation.';
  end if;

  if char_length(v_body) = 0 and v_photo is null then
    raise exception 'Type a message first.';
  end if;
  if char_length(v_body) > 1000 then
    raise exception 'Please keep a message under 1000 characters.';
  end if;
  -- A photo must be one uploaded into this conversation's own folder.
  if v_photo is not null and v_photo not like p_request_id::text || '/%' then
    raise exception 'That photo does not belong to this conversation.';
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

  insert into public.ticket_messages (tenant_id, request_id, sender_user_id, sender_role, sender_name, body, photo_path)
  values (v_tenant, p_request_id, v_uid, v_role, v_name, v_body, v_photo)
  returning id into v_id;

  v_preview := case
    when char_length(v_body) = 0 then '📷 Photo'
    when v_photo is not null then '📷 ' || left(v_body, 110)
    else left(v_body, 120)
  end;

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
        perform public.chat_push(v_target, 'New message from ' || v_name, v_preview, p_request_id);
      end loop;
    elsif v_req.user_id is not null and v_req.user_id <> v_uid then
      perform public.chat_push(v_req.user_id, v_name || ' replied about ' || v_label, v_preview, p_request_id);
    end if;
  exception when others then
    null;
  end;

  return v_id;
end;
$fn$;

revoke all on function public.send_ticket_message(uuid, text, text) from public, anon;
grant execute on function public.send_ticket_message(uuid, text, text) to authenticated;

-- 6. Technician day summary -------------------------------------------------------------

create or replace function public.send_day_summaries()
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $fn$
declare
  v_day date := public.today_ph();
  v_start timestamptz := (v_day::timestamp at time zone 'Asia/Manila');
  v_end timestamptz := ((v_day + 1)::timestamp at time zone 'Asia/Manila');
  t record;
  a record;
  v_sent integer := 0;
begin
  -- Each technician who finished at least one job today.
  for t in
    select r.technician_user_id as uid,
           count(*) as jobs,
           count(*) filter (where r.job_type = 'installation') as installs,
           (select coalesce(sum(-l.change), 0) from public.truck_stock_log l
             where l.user_id = r.technician_user_id and l.kind = 'use' and l.created_at >= v_start and l.created_at < v_end) as materials,
           (select round(avg(g.stars)::numeric, 1) from public.ratings g
             where g.technician_user_id = r.technician_user_id and g.created_at >= v_start and g.created_at < v_end) as stars
    from public.repair_records r
    where r.technician_user_id is not null
      and r.completed_at >= v_start and r.completed_at < v_end
    group by r.technician_user_id
  loop
    perform public.team_push(
      t.uid,
      'Your day: ' || t.jobs || ' job' || case when t.jobs = 1 then '' else 's' end || ' done',
      concat_ws(' · ',
        case when t.installs > 0 then t.installs || ' installation' || case when t.installs = 1 then '' else 's' end end,
        case when t.materials > 0 then trim(to_char(t.materials, 'FM999990.##')) || ' materials used' end,
        case when t.stars is not null then t.stars || '★ from customers' end,
        'Thank you for today!')
    );
    v_sent := v_sent + 1;
  end loop;

  -- One line per tenant for the admins.
  for a in
    select c.tenant_id,
           count(*) as jobs,
           count(distinct r.technician_user_id) as techs,
           (select count(*) from public.repair_records o join public.clients oc on oc.id = o.client_id
             where oc.tenant_id = c.tenant_id and o.technician_user_id is null
               and o.status !~* '(complete|resolved|done|fixed|cancel)') as waiting
    from public.repair_records r
    join public.clients c on c.id = r.client_id
    where r.completed_at >= v_start and r.completed_at < v_end
    group by c.tenant_id
  loop
    perform public.team_push(
      tu.user_id,
      'Field work today: ' || a.jobs || ' job' || case when a.jobs = 1 then '' else 's' end || ' done',
      a.techs || ' technician' || case when a.techs = 1 then '' else 's' end || ' worked today. '
        || case when a.waiting > 0 then a.waiting || ' open job' || case when a.waiting = 1 then ' is' else 's are' end || ' still waiting.' else 'No open jobs waiting.' end
    )
    from public.tenant_users tu
    where tu.tenant_id = a.tenant_id and tu.role = 'admin';
  end loop;

  return v_sent;
end;
$fn$;

revoke all on function public.send_day_summaries() from public, anon, authenticated;

-- 7 PM in Manila is 11:00 UTC.
select cron.unschedule('pkc-day-summaries') where exists (select 1 from cron.job where jobname = 'pkc-day-summaries');
select cron.schedule('pkc-day-summaries', '0 11 * * *', 'select public.send_day_summaries()');

-- 7. Speed ------------------------------------------------------------------------------------

alter policy "own or inventory staff read truck log" on public.truck_stock_log
  using ((user_id = (select auth.uid())) or public.inventory_has_access(tenant_id));
alter policy "own or inventory staff read truck stock" on public.truck_stock
  using ((user_id = (select auth.uid())) or public.inventory_has_access(tenant_id));
alter policy "members read their tenant permissions" on public.role_permissions
  using (exists (select 1 from public.tenant_users tu
                 where tu.user_id = (select auth.uid()) and tu.tenant_id = role_permissions.tenant_id));

create index if not exists repair_join_requests_user_id_idx on public.repair_join_requests (user_id);
create index if not exists truck_stock_item_id_idx on public.truck_stock (item_id);
