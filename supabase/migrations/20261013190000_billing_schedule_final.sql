-- Final schedule: bill date -> due (+7) -> grace period (+3) -> disconnection (day after grace)
-- -> termination, automatic, 30 days after disconnection. Replaces the shorter version in 20261013180000.
update public.billing
set disconnect_date = grace_until + 1,
    terminate_date  = grace_until + 1 + 30
where grace_until is not null;

create or replace view public.billing_balances
with (security_invoker = true) as
 SELECT b.id,
    b.tenant_id,
    b.client_id,
    b.bill_id,
    b.bill_type,
    b.bill_date,
    b.due_date,
    b.billing_period_start,
    b.billing_period_end,
    x.amount,
    COALESCE(p.paid, 0::numeric) AS paid,
    x.balance,
    COALESCE(s.pending, 0::numeric) AS pending_review,
    x.closed,
        CASE
            WHEN x.closed THEN b.status
            WHEN x.balance <= 0::numeric THEN 'Paid'::text
            WHEN b.due_date IS NOT NULL AND b.due_date < today_ph() THEN 'Overdue'::text
            WHEN COALESCE(p.paid, 0::numeric) > 0::numeric THEN 'Partially Paid'::text
            ELSE 'Unpaid'::text
        END AS status,
        CASE
            WHEN NOT x.closed AND x.balance > 0::numeric AND b.due_date IS NOT NULL AND b.due_date < today_ph() THEN today_ph() - b.due_date
            ELSE 0
        END AS days_overdue,
    b.grace_until,
    b.disconnect_date,
    b.terminate_date,
        CASE
            WHEN x.closed OR x.balance <= 0::numeric THEN 'Settled'::text
            WHEN b.terminate_date IS NOT NULL AND today_ph() >= b.terminate_date THEN 'Terminated'::text
            WHEN b.disconnect_date IS NOT NULL AND today_ph() >= b.disconnect_date THEN 'For disconnection'::text
            WHEN b.due_date IS NOT NULL AND today_ph() > b.due_date THEN 'Grace period'::text
            ELSE 'Open'::text
        END AS stage
   FROM billing b
     LEFT JOIN LATERAL ( SELECT sum(pay.amount_paid) FILTER (WHERE pay.amount_paid > 0::numeric) AS paid
           FROM payments pay
          WHERE pay.billing_id = b.id) p ON true
     LEFT JOIN LATERAL ( SELECT sum(sub.amount_claimed) AS pending
           FROM payment_submissions sub
          WHERE sub.billing_id = b.id AND sub.status = 'Pending'::text) s ON true
     CROSS JOIN LATERAL ( SELECT COALESCE(b.final_amount, b.amount_due, b.original_amount, 0::numeric) AS amount,
            GREATEST(COALESCE(b.final_amount, b.amount_due, b.original_amount, 0::numeric) - COALESCE(p.paid, 0::numeric), 0::numeric) AS balance,
            lower(COALESCE(b.status, ''::text)) = ANY (ARRAY['cancelled'::text, 'canceled'::text, 'void'::text, 'waived'::text]) AS closed) x;

-- Nightly job: new bills carry the full schedule; disconnection is flagged after grace; the account is terminated automatically 30 days later.
create or replace function public.run_billing_automation(p_flag_after_days integer DEFAULT 7)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c_due_days constant integer := 7;    -- bill date -> due
  c_grace_days constant integer := 3;  -- due -> grace ends
  c_terminate_days constant integer := 30; -- disconnection -> automatic termination
  v_activated integer := 0;
  v_generated integer := 0;
  v_overdue integer := 0;
  v_flagged integer := 0;
  v_unflagged integer := 0;
  v_released integer := 0;
  v_terminated integer := 0;
  v_new jsonb;
  r record;
begin
  for r in select id from public.tenants loop
    perform pg_advisory_xact_lock(hashtextextended('billing-number:' || r.id::text, 0));
  end loop;

  v_activated := public.activate_due_scheduled_plan_changes();

  with due_cycles as (
    select
      c.id as client_id,
      c.tenant_id,
      ip.price,
      case
        when current_date >= make_date(extract(year from current_date)::int, extract(month from current_date)::int,
               least(coalesce(c.billing_day, extract(day from c.install_date)::int, 1), 28))
        then make_date(extract(year from current_date)::int, extract(month from current_date)::int,
               least(coalesce(c.billing_day, extract(day from c.install_date)::int, 1), 28))
        else (make_date(extract(year from current_date)::int, extract(month from current_date)::int,
               least(coalesce(c.billing_day, extract(day from c.install_date)::int, 1), 28)) - interval '1 month')::date
      end as cycle_start
    from public.clients c
    join public.internet_plans ip
      on ip.tenant_id = c.tenant_id and ip.plan_name = c.plan_name and ip.active = true
    where lower(coalesce(c.account_status, '')) = 'active'
      and lower(coalesce(c.installation_status, '')) in ('installed', 'completed', 'done')
      and c.install_date is not null
  ), todo as (
    select
      d.tenant_id, d.client_id, d.price, d.cycle_start,
      row_number() over (partition by d.tenant_id order by d.client_id) as rn
    from due_cycles d
    join public.clients c on c.id = d.client_id
    where d.cycle_start > c.install_date
      and not exists (
        select 1 from public.billing b
        where b.client_id = d.client_id and b.billing_period_start = d.cycle_start
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
      'Unpaid', 'Monthly', t.cycle_start, (t.cycle_start + c_due_days),
      (t.cycle_start + c_due_days + c_grace_days),
      (t.cycle_start + c_due_days + c_grace_days + 1),
      (t.cycle_start + c_due_days + c_grace_days + 1 + c_terminate_days),
      t.price, t.price, t.price, 'Monthly',
      t.cycle_start, (t.cycle_start + interval '1 month' - interval '1 day')::date
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
    and due_date < current_date;
  get diagnostics v_overdue = row_count;

  -- Flag for disconnection once the grace period has ended and the bill is still unpaid.
  update public.clients c
  set disconnection_flag = true, disconnection_flagged_at = now()
  where c.disconnection_flag = false
    and exists (
      select 1 from public.billing b
      where b.client_id = c.id
        and lower(coalesce(b.status, '')) = 'overdue'
        and coalesce(b.disconnect_date, b.due_date + c_grace_days + 1) <= current_date
    );
  get diagnostics v_flagged = row_count;

  update public.clients c
  set disconnection_flag = false, disconnection_flagged_at = null
  where c.disconnection_flag = true
    and not exists (
      select 1 from public.billing b
      where b.client_id = c.id
        and lower(coalesce(b.status, '')) = 'overdue'
        and coalesce(b.disconnect_date, b.due_date + c_grace_days + 1) <= current_date
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
          and bb.terminate_date <= current_date
      )
    returning c.id, c.tenant_id, c.user_id
  ), logged as (
    insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
    select tenant_id, id, 'system (billing)', 'auto_terminated', 'Installed', 'Terminated: still unpaid 30 days after disconnection'
    from gone
    returning client_id
  )
  select count(*) into v_terminated from logged;

  for r in
    select c.user_id from public.clients c
    join public.audit_log a on a.client_id = c.id and a.field_name = 'auto_terminated' and a.changed_at > now() - interval '1 minute'
    where c.user_id is not null
  loop
    perform public.team_push(r.user_id, 'Your service was terminated', 'Your bill is still unpaid after disconnection. Please contact PKC BIZOFT to restore your service.');
  end loop;

  v_released := public.release_stale_jobs();

  return jsonb_build_object(
    'plans_activated', v_activated, 'generated', v_generated, 'overdue', v_overdue,
    'flagged', v_flagged, 'unflagged', v_unflagged, 'terminated', v_terminated, 'released_jobs', v_released
  );
end;
$function$;
