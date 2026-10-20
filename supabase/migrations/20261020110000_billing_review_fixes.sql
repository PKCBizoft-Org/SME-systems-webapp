-- Billing fixes (2026-10-20 review).
-- 1. A customer who paid (payment waiting for Accounting to check) was flagged for disconnection on the
--    5th and told so. Flagging now ignores bills whose remaining balance is covered by a pending payment,
--    like automatic termination already did.
-- 2. Taking a plan off sale ("On sale in the app" off) silently stopped billing everyone on it. Billing
--    now uses the customer's plan whether or not it is still sold.
-- 3. A bill issued on the 25th of a 30-day month got "Your new bill is ready" and "Bill due in 5 days"
--    the same morning. The 5-day reminder now skips bills issued that day.
-- Otherwise the same as 20261020090000_billing_day_15_25_and_more_pushes.sql.

-- Payment recorded or verified: lift the flag when nothing past its disconnection date is still owed
-- (a payment waiting for Accounting counts as covering its amount, same as the nightly job).
create or replace function public.refresh_disconnection_flag(p_client uuid, p_flag_after_days integer DEFAULT 7)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.clients c
  set disconnection_flag = false, disconnection_flagged_at = null
  where c.id = p_client
    and c.disconnection_flag = true
    and not exists (
      select 1 from public.billing_balances b
      where b.client_id = c.id
        and not b.closed
        and b.balance > 0
        and coalesce(b.pending_review, 0) < b.balance
        and coalesce(b.disconnect_date, b.due_date + 5) <= public.today_ph()
    );
$function$;

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
  v_flagged_users uuid[] := '{}';
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
                  least(coalesce(c.billing_day, public.billing_day_for(c.install_date)), 28)),
        c.install_date
      ) as bill_date
    from public.clients c
    -- Exactly one plan row per customer (plan names are not unique), the one on sale first.
    join lateral (
      select p.price from public.internet_plans p
      where p.tenant_id = c.tenant_id and p.plan_name = c.plan_name
      order by p.active desc, p.id
      limit 1
    ) ip on true
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

  -- Reminder pushes for bills still owed (any amount above zero), each kind once per bill:
  -- 5 days before the due date, on the due date, the day after, and the last day of grace.
  -- A bill whose payment is already with Accounting is left alone.
  for r in
    select x.* from (
      select bb.id, bb.bill_id, bb.balance, bb.due_date, bb.bill_date, c.user_id,
        case
          when bb.due_date = v_today + 5 and bb.bill_date < v_today then 'due5'
          when bb.due_date = v_today then 'due0'
          when bb.due_date = v_today - 1 then 'late1'
          when bb.grace_until = v_today then 'grace'
        end as kind
      from public.billing_balances bb
      join public.clients c on c.id = bb.client_id
      where not bb.closed
        and bb.balance > 0
        and coalesce(bb.pending_review, 0) < bb.balance
        and c.user_id is not null
    ) x
    where x.kind is not null
  loop
    insert into public.bill_pushes_sent (billing_id, kind) values (r.id, r.kind) on conflict do nothing;
    if found then
      perform public.team_push(
        r.user_id,
        case r.kind
          when 'due5' then 'Bill due in 5 days'
          when 'due0' then 'Bill due today'
          when 'late1' then 'Bill overdue'
          else 'Last day to pay'
        end,
        case r.kind
          when 'grace' then format('PHP %s for bill %s is still unpaid. Pay today in Plan & Bills to avoid disconnection tomorrow.',
                                   to_char(r.balance, 'FM999,999,990.00'), r.bill_id)
          when 'late1' then format('PHP %s for bill %s was due %s. Pay in the app under Plan & Bills.',
                                   to_char(r.balance, 'FM999,999,990.00'), r.bill_id, to_char(r.due_date, 'Mon FMDD'))
          else format('PHP %s for bill %s is due %s. Pay in the app under Plan & Bills.',
                      to_char(r.balance, 'FM999,999,990.00'), r.bill_id, to_char(r.due_date, 'Mon FMDD'))
        end
      );
    end if;
  end loop;

  -- Flag for disconnection on the disconnection date if the bill is still unpaid, and tell the customer.
  with flagged as (
    update public.clients c
    set disconnection_flag = true, disconnection_flagged_at = now()
    where c.disconnection_flag = false
      and exists (
        select 1 from public.billing_balances b
        where b.client_id = c.id
          and not b.closed
          and b.balance > 0
          and coalesce(b.pending_review, 0) < b.balance
          and coalesce(b.disconnect_date, b.due_date + c_disconnect_days) <= v_today
      )
    returning c.user_id
  )
  select count(*), coalesce(array_agg(f.user_id) filter (where f.user_id is not null), '{}'::uuid[])
  into v_flagged, v_flagged_users
  from flagged f;

  foreach u in array v_flagged_users loop
    perform public.team_push(u, 'Your service is due for disconnection',
      'Your bill is still unpaid after the grace period. Pay in the app under Plan & Bills to keep your service.');
  end loop;

  update public.clients c
  set disconnection_flag = false, disconnection_flagged_at = null
  where c.disconnection_flag = true
    and not exists (
      select 1 from public.billing_balances b
      where b.client_id = c.id
        and not b.closed
        and b.balance > 0
        and coalesce(b.pending_review, 0) < b.balance
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
