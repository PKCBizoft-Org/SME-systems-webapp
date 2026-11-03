-- 2026-11-03: data for the designed morning email, and a technician performance report.
--  * morning_report(p_day): everything the 9am email shows, in one call (service role only).
--  * technician_performance(p_days): per technician: jobs, times, ratings, missing proof,
--    undeclared materials (staff with the 'dispatch' permission).

-- A finished customer job is "missing proof" without a before photo, an after photo and a signature.
create or replace function public.job_missing_proof(p_repair uuid)
returns text[]
language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when not exists (select 1 from public.repair_photos p where p.repair_id = p_repair and p.photo_type = 'before') then 'before photo' end,
    case when not exists (select 1 from public.repair_photos p where p.repair_id = p_repair and p.photo_type = 'after') then 'after photo' end,
    case when not exists (select 1 from public.repair_photos p where p.repair_id = p_repair and p.photo_type = 'signature') then 'signature' end
  ], null);
$$;

-- Materials were taken for the job but the technician never said how much was used.
create or replace function public.job_materials_undeclared(p_repair uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from (
      select m.item_id, sum(-m.quantity_change) filter (where m.movement_type = 'installation_use') as out_qty
      from public.inventory_movements m where m.repair_id = p_repair group by m.item_id
    ) x
    left join public.job_materials jm on jm.repair_id = p_repair and jm.item_id = x.item_id
    where coalesce(x.out_qty, 0) > 0 and jm.qty_used is null and jm.return_done_at is null
  );
$$;

create or replace function public.morning_report(p_day date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_done constant text := '(complete|resolved|done|fixed)';
  v_out jsonb;
begin
  select jsonb_build_object(
    'day', p_day,
    'collected', (select coalesce(sum(amount_paid), 0) from public.payments where payment_date = p_day and amount_paid > 0),
    'collected_count', (select count(*) from public.payments where payment_date = p_day and amount_paid > 0),
    'by_method', (select coalesce(jsonb_object_agg(m, t), '{}'::jsonb) from (
        select coalesce(payment_method, 'Other') m, sum(amount_paid) t from public.payments
        where payment_date = p_day and amount_paid > 0 group by 1) s),
    'waiting_count', (select count(*) from public.payment_submissions where status = 'Pending'),
    'waiting_oldest_days', (select coalesce(max(extract(day from now() - created_at))::int, 0)
        from public.payment_submissions where status = 'Pending'),
    'overdue_clients', (select count(distinct client_id) from public.billing_balances
        where not closed and balance > 0 and days_overdue > 0),
    'overdue_total', (select coalesce(sum(balance), 0) from public.billing_balances
        where not closed and balance > 0 and days_overdue > 0),
    'cash_on_hand',
        (select coalesce(sum(amount_paid), 0) from public.payments where payment_method = 'Cash')
      - (select coalesce(sum(amount), 0) from public.expenses where paid_from = 'Cash' and voided_at is null)
      + (select coalesce(sum(change), 0) from public.cash_movements),
    'expenses_total', (select coalesce(sum(amount), 0) from public.expenses where expense_date = p_day and voided_at is null),
    'expenses_count', (select count(*) from public.expenses where expense_date = p_day and voided_at is null),
    'installs_unaccepted', (select count(*) from public.repair_records
        where job_type = 'installation' and technician_user_id is null
          and lower(coalesce(status, '')) !~ v_done and lower(coalesce(status, '')) !~ 'cancel'),
    'awaiting_signature', (select count(*) from public.repair_records
        where job_type = 'installation' and status ~* 'awaiting signature'),
    'jobs_done', (select count(*) from public.repair_records
        where (completed_at at time zone 'Asia/Manila')::date = p_day),
    'missing_proof', (select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) from (
        select jsonb_build_object('customer', coalesce(c.customer_name, 'Customer'),
                 'technician', coalesce(r.technician, 'Technician'),
                 'missing', array_to_string(public.job_missing_proof(r.id), ', '),
                 'at', r.completed_at) x
        from public.repair_records r left join public.clients c on c.id = r.client_id
        where lower(coalesce(r.status, '')) ~ v_done and r.completed_at > now() - interval '7 days'
          and cardinality(public.job_missing_proof(r.id)) > 0
        order by r.completed_at desc limit 8) s),
    'undeclared_materials', (select count(*) from public.repair_records r
        where lower(coalesce(r.status, '')) ~ v_done and r.completed_at > now() - interval '30 days'
          and public.job_materials_undeclared(r.id)),
    'low_stock', (select coalesce(jsonb_agg(x order by (x->>'gap')::numeric), '[]'::jsonb) from (
        select jsonb_build_object('name', name, 'unit', unit, 'on_hand', quantity_on_hand,
                 'reorder_level', reorder_level, 'gap', quantity_on_hand - reorder_level) x
        from public.inventory_items
        where is_active and reorder_level is not null and quantity_on_hand <= reorder_level
        order by quantity_on_hand - reorder_level limit 8) s),
    'open_tickets', (select count(*) from public.service_requests
        where issue_type is not null and lower(coalesce(status, '')) !~ '(complete|resolved|done|fixed|cancel|closed)'),
    'ratings_count', (select count(*) from public.ratings where (created_at at time zone 'Asia/Manila')::date = p_day),
    'ratings_avg', (select round(avg(stars)::numeric, 1) from public.ratings where (created_at at time zone 'Asia/Manila')::date = p_day),
    'low_ratings', (select count(*) from public.ratings where (created_at at time zone 'Asia/Manila')::date = p_day and stars <= 2)
  ) into v_out;
  return v_out;
end;
$$;

create or replace function public.technician_performance(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 366)));
  v_done constant text := '(complete|resolved|done|fixed)';
  v_out jsonb;
begin
  select tu.tenant_id into v_tenant from public.tenant_users tu
  where tu.user_id = auth.uid() and public.has_permission(tu.tenant_id, 'dispatch')
  order by tu.tenant_id limit 1;
  if v_tenant is null then raise exception 'You do not have access to this report.'; end if;

  with techs as (
    select distinct tu.user_id from public.tenant_users tu
    where tu.tenant_id = v_tenant and lower(tu.role) = 'technician'
  ),
  jobs as (
    select r.* from public.repair_records r join public.clients c on c.id = r.client_id
    where c.tenant_id = v_tenant and r.technician_user_id is not null
      and coalesce(r.accepted_at, r.created_at) > v_since
  ),
  per as (
    select t.user_id,
      (select count(*) from jobs j where j.technician_user_id = t.user_id) as assigned,
      (select count(*) from jobs j where j.technician_user_id = t.user_id and lower(coalesce(j.status, '')) ~ v_done) as finished,
      (select count(*) from jobs j where j.technician_user_id = t.user_id and lower(coalesce(j.status, '')) !~ v_done
         and lower(coalesce(j.status, '')) !~ 'cancel') as open_jobs,
      (select round(avg(extract(epoch from j.arrived_at - j.accepted_at)) / 60) from jobs j
         where j.technician_user_id = t.user_id and j.arrived_at > j.accepted_at) as mins_to_arrive,
      (select round(avg(extract(epoch from j.completed_at - j.arrived_at)) / 60) from jobs j
         where j.technician_user_id = t.user_id and j.completed_at > j.arrived_at) as mins_on_site,
      (select count(*) from jobs j where j.technician_user_id = t.user_id and lower(coalesce(j.status, '')) ~ v_done
         and cardinality(public.job_missing_proof(j.id)) > 0) as missing_proof,
      (select count(*) from jobs j where j.technician_user_id = t.user_id and lower(coalesce(j.status, '')) ~ v_done
         and public.job_materials_undeclared(j.id)) as undeclared,
      (select count(*) from public.backbone_jobs b where b.tenant_id = v_tenant and b.technician_user_id = t.user_id
         and b.status = 'done' and b.completed_at > v_since) as backbone_done,
      (select round(avg(g.stars)::numeric, 1) from public.ratings g where g.technician_user_id = t.user_id
         and g.tenant_id = v_tenant and g.created_at > v_since) as rating_avg,
      (select count(*) from public.ratings g where g.technician_user_id = t.user_id
         and g.tenant_id = v_tenant and g.created_at > v_since) as rating_count,
      (select count(*) from public.ratings g where g.technician_user_id = t.user_id
         and g.tenant_id = v_tenant and g.created_at > v_since and g.stars <= 2) as low_ratings
    from techs t
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', p.user_id,
           'name', coalesce(nullif(public.team_person_name(p.user_id), ''), 'Technician'),
           'assigned', p.assigned, 'finished', p.finished, 'open', p.open_jobs,
           'mins_to_arrive', p.mins_to_arrive, 'mins_on_site', p.mins_on_site,
           'missing_proof', p.missing_proof, 'undeclared', p.undeclared,
           'backbone_done', p.backbone_done,
           'rating_avg', p.rating_avg, 'rating_count', p.rating_count, 'low_ratings', p.low_ratings
         ) order by p.finished desc, p.assigned desc), '[]'::jsonb) into v_out
  from per p;
  return v_out;
end;
$$;

revoke all on function public.job_missing_proof(uuid) from public, anon, authenticated;
revoke all on function public.job_materials_undeclared(uuid) from public, anon, authenticated;
revoke all on function public.morning_report(date) from public, anon, authenticated;
revoke all on function public.technician_performance(int) from public, anon;
grant execute on function public.morning_report(date) to service_role;
grant execute on function public.technician_performance(int) to authenticated;
