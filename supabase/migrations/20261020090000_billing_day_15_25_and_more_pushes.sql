-- Billing day and notifications (2026-10-20).
--
-- 1. Billing day comes from the install date: installed on the 1st-14th -> the bill shows on the 15th,
--    installed on the 15th or later -> on the 25th. Due stays the last day of the month (grace to the 4th,
--    disconnection on the 5th). Accounting can change a customer's billing day (customers moved over from
--    the old system who are billed mid-month). Only Active, installed accounts are billed (unchanged).
-- 2. More events send a phone push: bill reminders (5 days before, due day, day after, last day of grace),
--    job finished, request cancelled by staff, and for Accounting: a payment to check, a withdrawal request.

create or replace function public.billing_day_for(p_install_date date)
returns integer
language sql
immutable
as $$
  select case when extract(day from p_install_date) < 15 then 15 else 25 end;
$$;

create or replace function public.installation_set_billing_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.job_type = 'installation'
     and lower(coalesce(NEW.status, '')) ~ '(complete|resolved|done|fixed)'
     and lower(coalesce(OLD.status, '')) !~ '(complete|resolved|done|fixed)' then
    perform set_config('app.bypass_client_guard', 'on', true);
    update public.clients
    set billing_day = public.billing_day_for(coalesce(install_date, public.today_ph()))
    where id = NEW.client_id and billing_day is null;
    perform set_config('app.bypass_client_guard', 'off', true);
  end if;
  return NEW;
end;
$$;

-- Customers installed under the short-lived "billed on the 1st" rule move to the new rule.
do $$
begin
  perform set_config('app.bypass_client_guard', 'on', true);
  update public.clients
  set billing_day = public.billing_day_for(install_date)
  where billing_day = 1 and install_date >= date '2026-10-14';
  perform set_config('app.bypass_client_guard', 'off', true);
end $$;

-- Accounting or admin sets the day of the month a customer's bill shows (1st-28th).
create or replace function public.set_billing_day(p_client uuid, p_day integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cl public.clients%rowtype;
begin
  select * into cl from public.clients where id = p_client;
  if not found or not public.actor_is_payment_staff(auth.uid(), cl.tenant_id) then
    raise exception 'Only accounting or admin staff can change the billing day.';
  end if;
  if p_day is null or p_day < 1 or p_day > 28 then
    raise exception 'Choose a day from the 1st to the 28th.';
  end if;
  if cl.billing_day is not distinct from p_day then
    return;
  end if;

  perform set_config('app.bypass_client_guard', 'on', true);
  update public.clients set billing_day = p_day where id = p_client;
  perform set_config('app.bypass_client_guard', 'off', true);

  insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values (cl.tenant_id, cl.id, (select email from auth.users where id = auth.uid()), 'billing_day',
          coalesce(cl.billing_day::text, ''), p_day::text);
end;
$$;
revoke execute on function public.set_billing_day(uuid, integer) from public, anon;
grant execute on function public.set_billing_day(uuid, integer) to authenticated;

create table if not exists public.bill_pushes_sent (
  billing_id uuid not null references public.billing (id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (billing_id, kind)
);
alter table public.bill_pushes_sent enable row level security;
revoke all on public.bill_pushes_sent from anon, authenticated;

-- Push to every admin and accountant of a tenant.
create or replace function public.push_billing_staff(p_tenant uuid, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare u uuid;
begin
  for u in
    select distinct tu.user_id from public.tenant_users tu
    where tu.tenant_id = p_tenant and tu.role in ('admin', 'accounting') and tu.user_id is not null
  loop
    perform public.team_push(u, p_title, p_body);
  end loop;
end;
$$;
revoke execute on function public.push_billing_staff(uuid, text, text) from public, anon, authenticated;

-- Accounting: a customer sent a payment to check.
create or replace function public.notify_payment_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_name text;
begin
  select customer_name into v_name from public.clients where id = NEW.client_id;
  perform public.push_billing_staff(
    NEW.tenant_id,
    'Payment to check',
    format('%s sent PHP %s by %s. Check it in Accounting.',
           coalesce(nullif(btrim(v_name), ''), 'A customer'),
           to_char(coalesce(NEW.amount_claimed, 0), 'FM999,999,990.00'),
           coalesce(nullif(btrim(NEW.payment_method), ''), 'payment'))
  );
  return NEW;
exception when others then
  return NEW;
end;
$$;
drop trigger if exists payment_submitted_staff_push on public.payment_submissions;
create trigger payment_submitted_staff_push
  after insert on public.payment_submissions
  for each row execute function public.notify_payment_submitted();

-- Accounting: a customer asked to withdraw referral earnings.
create or replace function public.notify_withdrawal_requested()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_tenant uuid; v_name text;
begin
  select tenant_id, customer_name into v_tenant, v_name from public.clients where id = NEW.referrer_client_id;
  if v_tenant is not null then
    perform public.push_billing_staff(
      v_tenant,
      'Referral withdrawal request',
      format('%s asked to withdraw PHP %s by %s.',
             coalesce(nullif(btrim(v_name), ''), 'A customer'),
             to_char(coalesce(NEW.net_amount, NEW.gross_amount, 0), 'FM999,999,990.00'),
             coalesce(nullif(btrim(NEW.payout_method), ''), 'payout'))
    );
  end if;
  return NEW;
exception when others then
  return NEW;
end;
$$;
drop trigger if exists withdrawal_requested_staff_push on public.referral_withdrawals;
create trigger withdrawal_requested_staff_push
  after insert on public.referral_withdrawals
  for each row execute function public.notify_withdrawal_requested();

-- Customer: their installation or repair was marked finished.
create or replace function public.notify_job_finished()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid;
begin
  if lower(coalesce(NEW.status, '')) ~ '(complete|resolved|done|fixed)'
     and lower(coalesce(OLD.status, '')) !~ '(complete|resolved|done|fixed)' then
    select user_id into v_user from public.clients where id = NEW.client_id;
    if v_user is not null then
      if NEW.job_type = 'installation' then
        perform public.team_push(v_user, 'Your installation is done', 'Your connection is installed. Welcome to PKC BIZOFT!');
      else
        perform public.team_push(v_user, 'Your repair is done', 'Your issue was marked as fixed. Tell us in the app if it comes back.');
      end if;
    end if;
  end if;
  return NEW;
exception when others then
  return NEW;
end;
$$;
drop trigger if exists job_finished_customer_push on public.repair_records;
create trigger job_finished_customer_push
  after update of status on public.repair_records
  for each row execute function public.notify_job_finished();

-- Customer: staff cancelled or rejected their request. Their own cancellations, and requests whose
-- payment was rejected (that already pushes "Payment was not accepted"), are not pushed again.
create or replace function public.notify_request_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid; v_label text;
begin
  if lower(coalesce(NEW.status, '')) ~ '(cancel|reject)'
     and lower(coalesce(OLD.status, '')) !~ '(cancel|reject)' then
    select coalesce(NEW.user_id, c.user_id) into v_user
    from (select 1) x left join public.clients c on c.id = NEW.client_id;
    if v_user is null or v_user is not distinct from auth.uid() then
      return NEW;
    end if;
    if exists (
      select 1 from public.payment_submissions s
      where s.service_request_id = NEW.id and lower(coalesce(s.status, '')) ~ '(reject|declin)'
    ) then
      return NEW;
    end if;
    v_label := case NEW.request_type
      when 'plan_change' then 'Your plan change'
      when 'repair' then 'Your repair request'
      else 'Your request'
    end;
    perform public.team_push(v_user, v_label || ' was cancelled',
      'If this was not expected, submit it again or ask for help in Requests & Help.');
  end if;
  return NEW;
exception when others then
  return NEW;
end;
$$;
drop trigger if exists request_cancelled_customer_push on public.service_requests;
create trigger request_cancelled_customer_push
  after update of status on public.service_requests
  for each row execute function public.notify_request_cancelled();

-- The nightly job: billing day falls back to the install-date rule, and bill reminder pushes.
-- Otherwise the same as 20261017110000_disconnection_push.sql.
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

  -- Reminder pushes for bills still owed (any amount above zero), each kind once per bill:
  -- 5 days before the due date, on the due date, the day after, and the last day of grace.
  -- A bill whose payment is already with Accounting is left alone.
  for r in
    select x.* from (
      select bb.id, bb.bill_id, bb.balance, bb.due_date, c.user_id,
        case
          when bb.due_date = v_today + 5 then 'due5'
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
        select 1 from public.billing b
        where b.client_id = c.id
          and lower(coalesce(b.status, '')) = 'overdue'
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
