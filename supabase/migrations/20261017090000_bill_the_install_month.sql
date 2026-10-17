-- The month a customer is installed is billed too (user, 2026-10-17): the billing month is fixed,
-- so a customer installed on Oct 17 owes October's bill, due Oct 31; one installed on Nov 1 owes
-- November's, due Nov 30. Full monthly price, no prorating. The bill goes out on the billing day,
-- or on the install day when that is later (new customers, billed on the 1st, get it the night of
-- their installation). Bills already issued keep their dates.

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
      -- In the install month the bill waits for the installation itself.
      greatest(
        make_date(extract(year from v_today)::int, extract(month from v_today)::int,
                  least(coalesce(c.billing_day, 1), 28)),
        c.install_date
      ) as bill_date
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
      and date_trunc('month', d.bill_date) >= date_trunc('month', c.install_date)
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
