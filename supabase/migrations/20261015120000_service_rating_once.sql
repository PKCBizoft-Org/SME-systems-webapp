-- The overall service rating is given once. Changing it goes through the help bot in the app,
-- which calls change_my_service_rating(). Job (technician) ratings stay one per job.

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
    if exists (select 1 from public.ratings where user_id = v_uid and kind = 'service') then
      raise exception 'You already rated our service. To change your rating, ask the help bot.';
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

-- Replaces the customer's one overall rating (the app offers this only through the help bot).
create or replace function public.change_my_service_rating(p_stars integer, p_comment text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'Please choose 1 to 5 stars.';
  end if;
  if v_comment is not null and char_length(v_comment) > 500 then
    raise exception 'Please keep your comment under 500 characters.';
  end if;

  select id into v_id from public.ratings
  where user_id = v_uid and kind = 'service'
  order by created_at desc limit 1;
  if v_id is null then
    raise exception 'You have not rated our service yet.';
  end if;

  update public.ratings
  set stars = p_stars, comment = v_comment, reviewed_at = null, reviewed_by = null
  where id = v_id;

  return v_id;
end;
$$;
revoke execute on function public.change_my_service_rating(integer, text) from public, anon;
grant execute on function public.change_my_service_rating(integer, text) to authenticated;
