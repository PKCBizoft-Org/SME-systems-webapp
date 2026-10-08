-- Customer ratings & feedback.
--   * ratings: 1-5 stars + optional comment, either for a completed job
--     (kind 'technician') or for the service overall (kind 'service')
--   * submit_rating(): the only way a customer adds one (checks ownership,
--     completed job, one rating per job, one overall rating per week)
--   * review_rating(): staff marks a rating as handled
--   * low ratings (1-2 stars) push an alert to admin/accounting phones

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null,
  kind text not null check (kind in ('technician', 'service')),
  repair_record_id uuid references public.repair_records(id) on delete set null,
  technician_user_id uuid,
  technician_name text,
  stars smallint not null check (stars between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists ratings_one_per_job
  on public.ratings (repair_record_id, user_id) where repair_record_id is not null;
create index if not exists ratings_tenant_created_idx on public.ratings (tenant_id, created_at desc);
create index if not exists ratings_user_idx on public.ratings (user_id, created_at desc);

alter table public.ratings enable row level security;

drop policy if exists "customers read own ratings" on public.ratings;
create policy "customers read own ratings" on public.ratings
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "staff read tenant ratings" on public.ratings;
create policy "staff read tenant ratings" on public.ratings
  for select to authenticated using (public.is_payment_staff(tenant_id));

create or replace function public.submit_rating(
  p_kind text,
  p_repair_id uuid,
  p_stars integer,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_client public.clients%rowtype;
  v_repair public.repair_records%rowtype;
  v_id uuid;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;
  if p_kind not in ('technician', 'service') then
    raise exception 'Unknown rating type.';
  end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'Please choose 1 to 5 stars.';
  end if;
  if v_comment is not null and char_length(v_comment) > 500 then
    raise exception 'Please keep your comment under 500 characters.';
  end if;

  select * into v_client from public.clients where user_id = v_uid limit 1;
  if not found then
    raise exception 'Customer account not found.';
  end if;

  if p_kind = 'technician' then
    select * into v_repair from public.repair_records
    where id = p_repair_id and client_id = v_client.id;
    if not found then
      raise exception 'That job could not be found.';
    end if;
    if lower(coalesce(v_repair.status, '')) !~ '(complete|resolved|done|fixed)' then
      raise exception 'You can rate a job once it is completed.';
    end if;
    if exists (select 1 from public.ratings where repair_record_id = v_repair.id and user_id = v_uid) then
      raise exception 'You already rated this job. Thank you!';
    end if;
  else
    if exists (
      select 1 from public.ratings
      where user_id = v_uid and kind = 'service' and created_at > now() - interval '7 days'
    ) then
      raise exception 'You already rated our service this week. Thank you!';
    end if;
  end if;

  insert into public.ratings (
    tenant_id, client_id, user_id, kind, repair_record_id,
    technician_user_id, technician_name, stars, comment
  ) values (
    v_client.tenant_id, v_client.id, v_uid, p_kind,
    case when p_kind = 'technician' then v_repair.id end,
    case when p_kind = 'technician' then v_repair.technician_user_id end,
    case when p_kind = 'technician' then v_repair.technician end,
    p_stars, v_comment
  )
  returning id into v_id;

  return v_id;
end;
$$;
revoke execute on function public.submit_rating(text, uuid, integer, text) from public, anon;
grant execute on function public.submit_rating(text, uuid, integer, text) to authenticated;

create or replace function public.review_rating(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.ratings where id = p_id;
  if v_tenant is null or not public.is_payment_staff(v_tenant) then
    raise exception 'Not allowed.';
  end if;
  update public.ratings
  set reviewed_at = coalesce(reviewed_at, now()), reviewed_by = coalesce(reviewed_by, auth.uid())
  where id = p_id;
end;
$$;
revoke execute on function public.review_rating(uuid) from public, anon;
grant execute on function public.review_rating(uuid) to authenticated;

-- Low rating -> push to every admin/accounting phone that has the app.
create or replace function public.notify_low_rating()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_staff record;
  v_name text;
begin
  if NEW.stars > 2 then
    return NEW;
  end if;

  select secret into v_secret from public.push_config limit 1;
  select customer_name into v_name from public.clients where id = NEW.client_id;

  for v_staff in
    select distinct tu.user_id
    from public.tenant_users tu
    where tu.tenant_id = NEW.tenant_id and tu.role in ('admin', 'accounting')
  loop
    perform net.http_post(
      url := 'https://ylqmsghxihtzbaqgkyxi.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object(
        'user_id', v_staff.user_id,
        'title', 'Low rating received',
        'body', coalesce(v_name, 'A customer') || ' gave ' || NEW.stars || ' star' || case when NEW.stars = 1 then '' else 's' end
          || case when NEW.technician_name is not null then ' for ' || NEW.technician_name else '' end || '.'
      )
    );
  end loop;
  return NEW;
exception when others then
  return NEW;
end;
$$;
revoke execute on function public.notify_low_rating() from public, anon, authenticated;

drop trigger if exists rating_low_push_trigger on public.ratings;
create trigger rating_low_push_trigger
  after insert on public.ratings
  for each row execute function public.notify_low_rating();
