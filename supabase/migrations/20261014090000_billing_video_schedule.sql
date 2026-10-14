-- Bill schedule from the team walkthrough:
--   * The billing period is the calendar month (1st to last day) and the due date is the last day of it.
--   * New customers are billed on the 1st. Customers installed before this change are billed on the 25th
--     (5 days before the due date), so their bill comes first.
--   * Grace period runs to the 4th of the next month; the account is disconnected on the 5th.
--   * Termination stays automatic, 30 days after disconnection.
--   * Accounting can add Installation Fee and Adjustment bills by hand; bill IDs stay automatic.
-- Bills already issued keep the dates they were issued with.

-- 1. (Billing day: 20261014085900_billing_day_new_installs_on_the_1st.sql — 1st for new installs, 25th for existing.)

-- 2. Paying a bill lifts the disconnection flag by the same rule the nightly job raises it:
--    nothing unpaid may have reached its disconnection date.
create or replace function public.refresh_disconnection_flag(p_client uuid, p_flag_after_days integer default 7)
returns void
language sql
security definer
set search_path to 'public'
as $fn$
  update public.clients c
  set disconnection_flag = false, disconnection_flagged_at = null
  where c.id = p_client
    and c.disconnection_flag = true
    and not exists (
      select 1 from public.billing_balances b
      where b.client_id = c.id
        and not b.closed
        and b.balance > 0
        and coalesce(b.disconnect_date, b.due_date + 5) <= public.today_ph()
    );
$fn$;

-- 3. Nightly job.
create or replace function public.run_billing_automation(p_flag_after_days integer DEFAULT 7)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today date := public.today_ph();
  c_grace_days constant integer := 4;       -- due date -> last day of grace (the 4th)
  c_disconnect_days constant integer := 5;  -- due date -> disconnection (the 5th)
  c_terminate_days constant integer := 30;  -- disconnection -> automatic termination
  v_activated integer := 0;
  v_generated integer := 0;
  v_overdue integer := 0;
  v_flagged integer := 0;
  v_unflagged integer := 0;
  v_released integer := 0;
  v_terminated integer := 0;
  v_terminated_users uuid[] := '{}';
  v_new jsonb;
  r record;
  u uuid;
begin
  for r in select id from public.tenants loop
    perform pg_advisory_xact_lock(hashtextextended('billing-number:' || r.id::text, 0));
  end loop;

  v_activated := public.activate_due_scheduled_plan_changes();

  -- Only this month's bill is ever issued: a missed day is caught up within the month,
  -- but a bill for a month already over is never created after the fact.
  with due_cycles as (
    select
      c.id as client_id,
      c.tenant_id,
      ip.price,
      make_date(extract(year from v_today)::int, extract(month from v_today)::int,
                least(coalesce(c.billing_day, 1), 28)) as bill_date
    from public.clients c
    join public.internet_plans ip
      on ip.tenant_id = c.tenant_id and ip.plan_name = c.plan_name and ip.active = true
    where lower(coalesce(c.account_status, '')) = 'active'
      and lower(coalesce(c.installation_status, '')) in ('installed', 'completed', 'done')
      and c.install_date is not null
  ), todo as (
    select
      d.tenant_id, d.client_id, d.price, d.bill_date,
      date_trunc('month', d.bill_date)::date as period_start,
      (date_trunc('month', d.bill_date) + interval '1 month' - interval '1 day')::date as period_end,
      row_number() over (partition by d.tenant_id order by d.client_id) as rn
    from due_cycles d
    join public.clients c on c.id = d.client_id
    where v_today >= d.bill_date
      and d.bill_date > c.install_date
      and not exists (
        select 1 from public.billing b
        where b.client_id = d.client_id
          and coalesce(b.bill_type, 'Monthly') = 'Monthly'
          and b.billing_period_start is not null
          and date_trunc('month', b.billing_period_start) = date_trunc('month', d.bill_date)
      )
  ), ins as (
    insert into public.billing (
      tenant_id, client_id, bill_id, status, bill_type, bill_date, due_date,
      grace_until, disconnect_date, terminate_date,
      amount_due, original_amount, final_amount, billing_cycle,
      billing_period_start, billing_period_end
    )
    select
      t.tenant_id, t.client_id,
      'SAM-' || lpad((
        coalesce((
          select max(substring(b.bill_id from 5)::bigint)
          from public.billing b
          where b.tenant_id = t.tenant_id and b.bill_id ~ '^SAM-[0-9]+$'
        ), 0) + t.rn
      )::text, 5, '0'),
      'Unpaid', 'Monthly', t.bill_date, t.period_end,
      (t.period_end + c_grace_days),
      (t.period_end + c_disconnect_days),
      (t.period_end + c_disconnect_days + c_terminate_days),
      t.price, t.price, t.price, 'Monthly',
      t.period_start, t.period_end
    from todo t
    returning client_id, bill_id, due_date, amount_due
  )
  select coalesce(jsonb_agg(to_jsonb(ins)), '[]'::jsonb) into v_new from ins;

  v_generated := jsonb_array_length(v_new);

  for r in
    select x.bill_id, x.due_date, x.amount_due, c.user_id
    from jsonb_to_recordset(v_new) as x(client_id uuid, bill_id text, due_date date, amount_due numeric)
    join public.clients c on c.id = x.client_id
  loop
    if r.user_id is not null then
      perform public.team_push(
        r.user_id,
        'Your new bill is ready',
        format('Bill %s: PHP %s, due %s. Pay in the app under Plan & Bills.',
               r.bill_id, to_char(r.amount_due, 'FM999,999,990.00'), to_char(r.due_date, 'Mon FMDD'))
      );
    end if;
  end loop;

  update public.billing
  set status = 'Overdue'
  where lower(coalesce(status, '')) in ('unpaid', 'partially paid', 'pending')
    and due_date is not null
    and due_date < v_today;
  get diagnostics v_overdue = row_count;

  -- Flag for disconnection on the disconnection date if the bill is still unpaid.
  update public.clients c
  set disconnection_flag = true, disconnection_flagged_at = now()
  where c.disconnection_flag = false
    and exists (
      select 1 from public.billing b
      where b.client_id = c.id
        and lower(coalesce(b.status, '')) = 'overdue'
        and coalesce(b.disconnect_date, b.due_date + c_disconnect_days) <= v_today
    );
  get diagnostics v_flagged = row_count;

  update public.clients c
  set disconnection_flag = false, disconnection_flagged_at = null
  where c.disconnection_flag = true
    and not exists (
      select 1 from public.billing b
      where b.client_id = c.id
        and lower(coalesce(b.status, '')) = 'overdue'
        and coalesce(b.disconnect_date, b.due_date + c_disconnect_days) <= v_today
    );
  get diagnostics v_unflagged = row_count;

  -- Termination date reached and still unpaid (nothing waiting with Accounting either): terminate automatically.
  with gone as (
    update public.clients c
    set installation_status = 'Terminated'
    where lower(coalesce(c.installation_status, '')) <> 'terminated'
      and exists (
        select 1 from public.billing_balances bb
        where bb.client_id = c.id
          and not bb.closed
          and bb.balance > 0
          and bb.pending_review < bb.balance
          and bb.terminate_date is not null
          and bb.terminate_date <= v_today
      )
    returning c.id, c.tenant_id, c.user_id
  ), logged as (
    insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
    select tenant_id, id, 'system (billing)', 'auto_terminated', 'Installed', 'Terminated: still unpaid 30 days after disconnection'
    from gone
    returning client_id
  )
  select count(*), coalesce(array_agg(g.user_id) filter (where g.user_id is not null), '{}'::uuid[])
  into v_terminated, v_terminated_users
  from gone g;

  foreach u in array v_terminated_users loop
    perform public.team_push(u, 'Your service was terminated', 'Your bill is still unpaid after disconnection. Please contact PKC BIZOFT to restore your service.');
  end loop;

  v_released := public.release_stale_jobs();

  return jsonb_build_object(
    'plans_activated', v_activated, 'generated', v_generated, 'overdue', v_overdue,
    'flagged', v_flagged, 'unflagged', v_unflagged, 'terminated', v_terminated, 'released_jobs', v_released
  );
end;
$function$;

-- 4. Accounting adds an Installation Fee or Adjustment bill by hand. Monthly bills stay automatic.
--    The due date defaults to the end of the month, but never gives the customer less than 7 days.
--    The grace period, disconnection and termination dates follow the same offsets as a monthly bill.
create or replace function public.add_manual_bill_as(
  p_actor uuid,
  p_client_id uuid,
  p_bill_type text,
  p_amount numeric,
  p_due_date date default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_today date := public.today_ph();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_due date;
  v_bill_id text;
  v_email text;
  cl public.clients%rowtype;
  bill public.billing%rowtype;
begin
  select * into cl from public.clients where id = p_client_id;
  if not found then
    raise exception 'Customer not found.';
  end if;

  if not public.actor_is_payment_staff(p_actor, cl.tenant_id) then
    raise exception 'Only accounting or admin staff can add bills.';
  end if;
  if cl.user_id is not null and cl.user_id = p_actor then
    raise exception 'You cannot add a bill to your own account.';
  end if;

  if p_bill_type is null or p_bill_type not in ('Installation Fee', 'Adjustment') then
    raise exception 'Choose Installation Fee or Adjustment. Monthly bills are created automatically.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_amount > 1000000 then
    raise exception 'Enter a valid amount (up to 2 decimals).';
  end if;
  if p_bill_type = 'Adjustment' and v_note is null then
    raise exception 'Say what the adjustment is for.';
  end if;

  if p_bill_type = 'Installation Fee' and exists (
    select 1 from public.billing b
    where b.client_id = cl.id
      and b.bill_type = 'Installation Fee'
      and lower(coalesce(b.status, '')) not in ('cancelled', 'canceled', 'void', 'waived')
  ) then
    raise exception 'This customer already has an installation fee bill.';
  end if;

  v_due := coalesce(
    p_due_date,
    greatest((date_trunc('month', v_today) + interval '1 month' - interval '1 day')::date, v_today + 7)
  );
  if v_due < v_today then
    raise exception 'The due date cannot be in the past.';
  end if;
  if v_due > v_today + 365 then
    raise exception 'The due date is too far ahead. Please check it.';
  end if;

  -- Same lock the nightly job takes, so two bills can never get the same number.
  perform pg_advisory_xact_lock(hashtextextended('billing-number:' || cl.tenant_id::text, 0));
  v_bill_id := 'SAM-' || lpad((
    coalesce((
      select max(substring(b.bill_id from 5)::bigint)
      from public.billing b
      where b.tenant_id = cl.tenant_id and b.bill_id ~ '^SAM-[0-9]+$'
    ), 0) + 1
  )::text, 5, '0');

  insert into public.billing (
    tenant_id, client_id, bill_id, status, bill_type, bill_date, due_date,
    grace_until, disconnect_date, terminate_date,
    amount_due, original_amount, final_amount, billing_cycle
  ) values (
    cl.tenant_id, cl.id, v_bill_id, 'Unpaid', p_bill_type, v_today, v_due,
    v_due + 4, v_due + 5, v_due + 5 + 30,
    p_amount, p_amount, p_amount, 'One-time'
  )
  returning * into bill;

  select email into v_email from auth.users where id = p_actor;
  insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values (
    cl.tenant_id, cl.id, coalesce(v_email, 'Unknown'), 'bill_added',
    p_bill_type,
    v_bill_id || ' / ' || p_amount::text || ' / due ' || v_due::text || coalesce(' / ' || v_note, '')
  );

  if cl.user_id is not null then
    begin
      perform public.team_push(
        cl.user_id,
        'New bill on your account',
        format('Bill %s (%s): PHP %s, due %s. Pay in the app under Plan & Bills.',
               v_bill_id, p_bill_type, to_char(p_amount, 'FM999,999,990.00'), to_char(v_due, 'Mon FMDD'))
      );
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'id', bill.id, 'bill_id', v_bill_id, 'bill_type', p_bill_type,
    'amount', p_amount, 'due_date', v_due, 'customer_name', cl.customer_name
  );
end;
$fn$;

revoke all on function public.add_manual_bill_as(uuid, uuid, text, numeric, date, text) from public, anon, authenticated;
grant execute on function public.add_manual_bill_as(uuid, uuid, text, numeric, date, text) to service_role;

revoke all on function public.run_billing_automation(integer) from public, anon, authenticated;
grant execute on function public.run_billing_automation(integer) to service_role;
revoke all on function public.refresh_disconnection_flag(uuid, integer) from public, anon, authenticated;
grant execute on function public.refresh_disconnection_flag(uuid, integer) to service_role;
