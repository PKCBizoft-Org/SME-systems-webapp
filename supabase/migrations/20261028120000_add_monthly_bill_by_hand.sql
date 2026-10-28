-- Accounting can add a Monthly bill by hand too (a missed month, or billing early). It covers the
-- month of its due date (end of this month when left blank), so the nightly job sees that month as
-- billed and does not issue a second one. One Monthly bill per month per customer.
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
as $function$
declare
  v_today date := public.today_ph();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_monthly boolean := p_bill_type = 'Monthly';
  v_due date;
  v_period_start date;
  v_period_end date;
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

  if p_bill_type is null or p_bill_type not in ('Monthly', 'Installation Fee', 'Adjustment') then
    raise exception 'Choose Monthly, Installation Fee or Adjustment.';
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
    case when v_monthly
      then (date_trunc('month', v_today) + interval '1 month' - interval '1 day')::date
      else greatest((date_trunc('month', v_today) + interval '1 month' - interval '1 day')::date, v_today + 7)
    end
  );
  if v_due < v_today then
    raise exception 'The due date cannot be in the past.';
  end if;
  if v_due > v_today + 365 then
    raise exception 'The due date is too far ahead. Please check it.';
  end if;

  if v_monthly then
    v_period_start := date_trunc('month', v_due)::date;
    v_period_end := (v_period_start + interval '1 month' - interval '1 day')::date;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('billing-number:' || cl.tenant_id::text, 0));

  if v_monthly and exists (
    select 1 from public.billing b
    where b.client_id = cl.id
      and coalesce(b.bill_type, 'Monthly') = 'Monthly'
      and b.billing_period_start is not null
      and date_trunc('month', b.billing_period_start) = v_period_start
      and lower(coalesce(b.status, '')) not in ('cancelled', 'canceled', 'void', 'waived')
  ) then
    raise exception 'This customer already has a monthly bill for %.', to_char(v_period_start, 'FMMonth YYYY');
  end if;

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
    amount_due, original_amount, final_amount, billing_cycle,
    billing_period_start, billing_period_end
  ) values (
    cl.tenant_id, cl.id, v_bill_id, 'Unpaid', p_bill_type, v_today, v_due,
    v_due + 4, v_due + 5, v_due + 5 + 30,
    p_amount, p_amount, p_amount, case when v_monthly then 'Monthly' else 'One-time' end,
    v_period_start, v_period_end
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
$function$;
