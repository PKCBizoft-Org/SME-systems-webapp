-- Web / admin upgrades: satisfaction survey, role permissions, revenue
-- analytics and the staff view of tickets.
--
-- 1. Satisfaction survey: three yes/no answers saved on the customer's own
--    rating (arrived on time? explained clearly? left tidy?).
-- 2. revenue_report(): billed vs collected per month, MRR, overdue, plan mix.
-- 3. staff_tickets(): recent issue reports with their chat activity.
-- (Role permissions live in 20261011115000_role_permissions.sql.)

-- ---------------------------------------------------------------- 1. survey
alter table public.ratings add column if not exists on_time boolean;
alter table public.ratings add column if not exists explained boolean;
alter table public.ratings add column if not exists tidy boolean;
alter table public.ratings add column if not exists survey_at timestamptz;

create or replace function public.add_rating_survey(
  p_rating_id uuid,
  p_on_time boolean,
  p_explained boolean,
  p_tidy boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_rating public.ratings%rowtype;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_rating from public.ratings where id = p_rating_id and user_id = v_uid;
  if not found then
    raise exception 'That rating could not be found on your account.';
  end if;
  if v_rating.survey_at is not null then
    raise exception 'You already answered the survey for this rating.';
  end if;
  if p_on_time is null and p_explained is null and p_tidy is null then
    raise exception 'Please answer at least one question.';
  end if;

  update public.ratings
  set on_time = p_on_time, explained = p_explained, tidy = p_tidy, survey_at = now()
  where id = v_rating.id;
end;
$fn$;

revoke all on function public.add_rating_survey(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.add_rating_survey(uuid, boolean, boolean, boolean) to authenticated, service_role;

-- ------------------------------------------------------ 2. revenue analytics
create or replace function public.revenue_report(p_months integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_months integer := least(greatest(coalesce(p_months, 12), 1), 24);
  v_start date;
  v_settled constant text := '^(paid|cancel|void|waive)';
  v_cancelled constant text := '^(cancel|void|waive)';
  v_monthly jsonb;
  v_totals jsonb;
  v_plans jsonb;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select tu.tenant_id into v_tenant from public.tenant_users tu
  where tu.user_id = v_uid and public.has_permission(tu.tenant_id, 'analytics')
  order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'You do not have access to revenue analytics.';
  end if;

  v_start := (date_trunc('month', current_date) - ((v_months - 1) || ' months')::interval)::date;

  select coalesce(jsonb_agg(jsonb_build_object(
      'month', to_char(m.month, 'YYYY-MM'),
      'billed', coalesce((select sum(coalesce(b.final_amount, b.amount_due, 0)) from public.billing b
                          where b.tenant_id = v_tenant and date_trunc('month', b.bill_date) = m.month
                            and coalesce(b.status, '') !~* v_cancelled), 0),
      'collected', coalesce((select sum(p.amount_paid) from public.payments p
                             where p.tenant_id = v_tenant and date_trunc('month', p.payment_date) = m.month), 0),
      'new_customers', (select count(*) from public.clients c
                        where c.tenant_id = v_tenant and c.install_date is not null
                          and date_trunc('month', c.install_date) = m.month)
    ) order by m.month), '[]'::jsonb)
  into v_monthly
  from generate_series(v_start, date_trunc('month', current_date)::date, interval '1 month') as m(month);

  select jsonb_build_object(
    'active_customers', (select count(*) from public.clients c
                         where c.tenant_id = v_tenant and lower(coalesce(c.account_status, '')) = 'active'),
    'flagged_for_disconnection', (select count(*) from public.clients c
                                  where c.tenant_id = v_tenant and c.disconnection_flag),
    'mrr', coalesce((select sum(ip.price) from public.client_services cs
                     join public.internet_plans ip on ip.id = cs.plan_id
                     where cs.tenant_id = v_tenant and cs.status = 'active'), 0),
    'overdue_amount', coalesce((select sum(greatest(coalesce(b.final_amount, b.amount_due, 0)
                                  - coalesce((select sum(p.amount_paid) from public.payments p where p.billing_id = b.id), 0), 0))
                                from public.billing b
                                where b.tenant_id = v_tenant and b.due_date < current_date
                                  and coalesce(b.status, '') !~* v_settled), 0),
    'overdue_bills', (select count(*) from public.billing b
                      where b.tenant_id = v_tenant and b.due_date < current_date
                        and coalesce(b.status, '') !~* v_settled),
    'collected_30d', coalesce((select sum(p.amount_paid) from public.payments p
                               where p.tenant_id = v_tenant and p.payment_date >= current_date - 30), 0)
  )
  into v_totals;

  select coalesce(jsonb_agg(jsonb_build_object('plan', x.plan_name, 'customers', x.n, 'mrr', x.mrr) order by x.mrr desc), '[]'::jsonb)
  into v_plans
  from (
    select ip.plan_name, count(*) as n, sum(ip.price) as mrr
    from public.client_services cs
    join public.internet_plans ip on ip.id = cs.plan_id
    where cs.tenant_id = v_tenant and cs.status = 'active'
    group by ip.plan_name
  ) x;

  return jsonb_build_object('months', v_monthly, 'totals', v_totals, 'plans', v_plans);
end;
$fn$;

revoke all on function public.revenue_report(integer) from public, anon;
grant execute on function public.revenue_report(integer) to authenticated, service_role;

-- ------------------------------------------------------------ 3. tickets (staff)
create or replace function public.staff_tickets(p_limit integer default 60)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_out jsonb;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select tu.tenant_id into v_tenant from public.tenant_users tu
  where tu.user_id = v_uid and public.has_permission(tu.tenant_id, 'tickets')
  order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'You do not have access to tickets.';
  end if;

  select coalesce(jsonb_agg(row_to_json(x) order by x.last_activity desc), '[]'::jsonb) into v_out
  from (
    select sr.id,
           c.customer_name,
           c.account_id,
           sr.issue_type,
           sr.description,
           sr.status,
           sr.created_at,
           (select count(*) from public.ticket_messages m where m.request_id = sr.id) as messages,
           coalesce((select max(m.created_at) from public.ticket_messages m where m.request_id = sr.id), sr.created_at) as last_activity,
           (select m.sender_role from public.ticket_messages m where m.request_id = sr.id order by m.created_at desc limit 1) as last_sender_role,
           (select public.team_person_name(r.technician_user_id) from public.repair_records r
             where r.service_request_id = sr.id and r.technician_user_id is not null limit 1) as technician_name
    from public.service_requests sr
    join public.clients c on c.id = sr.client_id
    where c.tenant_id = v_tenant and sr.request_type in ('repair', 'help')
    order by coalesce((select max(m.created_at) from public.ticket_messages m where m.request_id = sr.id), sr.created_at) desc
    limit least(greatest(coalesce(p_limit, 60), 1), 200)
  ) x;

  return v_out;
end;
$fn$;

revoke all on function public.staff_tickets(integer) from public, anon;
grant execute on function public.staff_tickets(integer) to authenticated, service_role;
