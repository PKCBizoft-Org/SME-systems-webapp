-- Technician performance ("My performance" card in the mobile app).
--   * repair_records.completed_at: set automatically the moment a job becomes
--     Completed/Resolved/Done/Fixed (cleared again if the job is reopened).
--     Jobs finished before this migration keep it empty; the stats fall back to
--     the job's repair_date for those, and leave them out of average times.
--   * my_technician_stats(): the signed-in technician's own numbers only
--     (jobs finished, jobs still open, average hours from accepting a job to
--     finishing it, and the average star rating customers gave them).

alter table public.repair_records add column if not exists completed_at timestamptz;

create or replace function public.repair_set_completed_at()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_done constant text := '(complete|resolved|done|fixed)';
  v_was_done boolean := tg_op = 'UPDATE' and coalesce(old.status, '') ~* v_done;
begin
  if coalesce(new.status, '') ~* v_done then
    if not v_was_done and new.completed_at is null then
      new.completed_at := now();
    end if;
  elsif v_was_done then
    -- Reopened: it is no longer finished.
    new.completed_at := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists repair_records_completed_at on public.repair_records;
create trigger repair_records_completed_at
  before insert or update of status on public.repair_records
  for each row execute function public.repair_set_completed_at();

create or replace function public.my_technician_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_done constant text := '(complete|resolved|done|fixed)';
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select jsonb_build_object(
    'completed_7d', count(*) filter (
      where r.status ~* v_done and coalesce(r.completed_at, r.repair_date::timestamptz) >= now() - interval '7 days'),
    'completed_30d', count(*) filter (
      where r.status ~* v_done and coalesce(r.completed_at, r.repair_date::timestamptz) >= now() - interval '30 days'),
    'completed_total', count(*) filter (where r.status ~* v_done),
    'active', count(*) filter (where coalesce(r.status, '') !~* v_done),
    'avg_hours', (
      select round(avg(extract(epoch from (x.completed_at - x.accepted_at)) / 3600.0)::numeric, 1)
      from public.repair_records x
      where x.technician_user_id = v_uid
        and x.completed_at is not null and x.accepted_at is not null
        and x.completed_at >= x.accepted_at
        and x.completed_at >= now() - interval '90 days'
    )
  )
  into v_result
  from public.repair_records r
  where r.technician_user_id = v_uid;

  return v_result || (
    select jsonb_build_object(
      'avg_stars', round(avg(g.stars)::numeric, 1),
      'rating_count', count(*)
    )
    from public.ratings g
    where g.technician_user_id = v_uid
      and g.kind = 'technician'
      and g.created_at >= now() - interval '90 days'
  );
end;
$fn$;

revoke all on function public.my_technician_stats() from public, anon;
grant execute on function public.my_technician_stats() to authenticated, service_role;

-- Trigger-only function: nobody needs to call it directly.
revoke all on function public.repair_set_completed_at() from public, anon, authenticated;
