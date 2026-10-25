-- One receipt for all open bills.
--
-- A customer with several open bills (e.g. the monthly bill plus an extra
-- charge) pays the total in one GCash or bank transfer. submit_bills_payment
-- splits that one receipt across the bills, oldest due date first, as one
-- submission per bill that share a group_id. The group moves as one:
-- verifying, rejecting or cancelling any part does all of it.
--
-- The "lead" row of a group has id = group_id and is inserted last, so the
-- push notifications fire once per receipt (on the lead) instead of per bill.

alter table public.payment_submissions add column if not exists group_id uuid;
create index if not exists payment_submissions_group_id_idx
  on public.payment_submissions (group_id) where group_id is not null;

-- One reference number per receipt, still. Only the lead (or an ungrouped
-- row) holds the reference slot; its siblings share it.
drop index if exists public.payment_submissions_active_reference_uq;
create unique index payment_submissions_active_reference_uq
  on public.payment_submissions (tenant_id, lower(btrim(reference_number)))
  where status in ('Pending', 'Verified')
    and nullif(btrim(reference_number), '') is not null
    and (group_id is null or group_id = id);

-- A verified group records one payment per bill with the same reference.
drop index if exists public.payments_reference_uq;
create unique index payments_reference_uq
  on public.payments (
    tenant_id,
    lower(btrim(reference_number)),
    coalesce(billing_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where nullif(btrim(reference_number), '') is not null;

-- A reference counts as "in use" unless it belongs to p_except's own group.
create or replace function public.reference_in_use(p_tenant uuid, p_ref text, p_except uuid default null)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with own as (
    select group_id from public.payment_submissions where id = p_except
  )
  select nullif(btrim(coalesce(p_ref, '')), '') is not null and (
    exists (
      select 1 from public.payments x
      where x.tenant_id = p_tenant
        and lower(btrim(x.reference_number)) = lower(btrim(p_ref))
        and not exists (
          select 1 from public.payment_submissions s, own
          where s.payment_id = x.id and own.group_id is not null and s.group_id = own.group_id
        )
    )
    or exists (
      select 1 from public.payment_submissions o
      where o.tenant_id = p_tenant
        and o.status in ('Pending', 'Verified')
        and o.id is distinct from p_except
        and not exists (select 1 from own where own.group_id is not null and own.group_id = o.group_id)
        and lower(btrim(o.reference_number)) = lower(btrim(p_ref))
    )
  );
$fn$;

revoke all on function public.reference_in_use(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.reference_in_use(uuid, text, uuid) to service_role;

-- Pay the open bills of one account with a single receipt.
create or replace function public.submit_bills_payment(
  p_client_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference_number text default null,
  p_bank_name text default null,
  p_gcash_mobile text default null,
  p_payment_date date default null,
  p_payment_proof_path text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_user uuid := auth.uid();
  v_today date := public.today_ph();
  v_pay_date date := coalesce(p_payment_date, public.today_ph());
  v_client public.clients%rowtype;
  v_ref text := nullif(btrim(coalesce(p_reference_number, '')), '');
  v_proof text := nullif(btrim(coalesce(p_payment_proof_path, '')), '');
  v_mobile text := nullif(btrim(coalesce(p_gcash_mobile, '')), '');
  v_bank text := nullif(btrim(coalesce(p_bank_name, '')), '');
  v_group uuid := gen_random_uuid();
  v_left numeric;
  v_total numeric := 0;
  v_parts jsonb := '[]'::jsonb;
  v_part jsonb;
  v_count int;
  v_i int := 0;
  b record;
begin
  if v_user is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_client from public.clients where id = p_client_id and user_id = v_user;
  if not found then
    raise exception 'That account could not be found.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter the amount you paid.';
  end if;

  if p_amount <> round(p_amount, 2) then
    raise exception 'The amount can have at most 2 decimal places.';
  end if;

  if p_payment_method not in ('GCash', 'Bank Transfer', 'Cash') then
    raise exception 'Unsupported payment method.';
  end if;

  if p_payment_method <> 'Cash' and v_ref is null then
    raise exception 'Enter the transaction reference number from your receipt.';
  end if;

  if p_payment_method = 'GCash' and (v_mobile is null or v_mobile !~ '^09[0-9]{9}$') then
    raise exception 'Enter the GCash mobile number you paid from (09XXXXXXXXX).';
  end if;

  if p_payment_method = 'Bank Transfer' and v_bank is null then
    raise exception 'Enter the bank name.';
  end if;

  if v_proof is null then
    raise exception 'Attach a photo of your receipt so Accounting can check the payment.';
  end if;

  if v_proof not like v_user::text || '/%' then
    raise exception 'That receipt photo does not belong to your account. Upload it again.';
  end if;

  if v_pay_date > v_today then
    raise exception 'The payment date cannot be in the future.';
  end if;

  if v_pay_date < v_today - 365 then
    raise exception 'The payment date is too far in the past. Please check it.';
  end if;

  if public.reference_in_use(v_client.tenant_id, v_ref) then
    raise exception 'That reference number was already submitted. Check the number on your receipt, or contact Accounting if you think this is a mistake.';
  end if;

  -- Split the amount over the open bills, the one due soonest first.
  -- Locking the bills stops two quick taps from both passing the check.
  v_left := p_amount;
  for b in
    select bl.id, bl.bill_id,
           coalesce(bl.final_amount, bl.amount_due, bl.original_amount, 0)
             - coalesce((select sum(amount_paid) filter (where amount_paid > 0) from public.payments p where p.billing_id = bl.id), 0)
             - coalesce((select sum(amount_claimed) from public.payment_submissions s where s.billing_id = bl.id and s.status = 'Pending'), 0)
             as payable
    from public.billing bl
    where bl.client_id = v_client.id
      and lower(coalesce(bl.status, '')) not in ('cancelled', 'canceled', 'void', 'waived')
    order by bl.due_date nulls last, bl.bill_date nulls last, bl.bill_id
    for update of bl
  loop
    continue when b.payable <= 0;
    v_total := v_total + b.payable;
    if v_left > 0 then
      v_parts := v_parts || jsonb_build_object('billing_id', b.id, 'amount', least(v_left, b.payable));
      v_left := v_left - least(v_left, b.payable);
    end if;
  end loop;

  if v_total <= 0 then
    raise exception 'There is nothing left to pay. A payment may already be waiting for Accounting.';
  end if;

  if v_left > 0 then
    raise exception 'The amount is more than what is left on your bills (PHP %).', to_char(v_total, 'FM999,999,990.00');
  end if;

  v_count := jsonb_array_length(v_parts);

  -- Siblings first, the lead (id = group_id) last.
  for v_part in select value from jsonb_array_elements(v_parts) loop
    v_i := v_i + 1;
    insert into public.payment_submissions (
      id, group_id, client_id, user_id, billing_id, amount_claimed, payment_method, reference_number,
      bank_name, gcash_mobile, payment_date, proof_path, status
    ) values (
      case when v_i = v_count then v_group else gen_random_uuid() end,
      case when v_count > 1 then v_group end,
      v_client.id, v_user, (v_part->>'billing_id')::uuid, (v_part->>'amount')::numeric,
      p_payment_method, v_ref, v_bank,
      case when p_payment_method = 'GCash' then v_mobile end,
      v_pay_date, v_proof, 'Pending'
    );
  end loop;

  return v_group;
end;
$fn$;

revoke all on function public.submit_bills_payment(uuid, numeric, text, text, text, text, date, text) from public, anon;
grant execute on function public.submit_bills_payment(uuid, numeric, text, text, text, text, date, text) to authenticated;

-- Cancelling any part of a group cancels the whole receipt.
create or replace function public.cancel_bill_payment(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_user uuid := auth.uid();
  v_sub public.payment_submissions%rowtype;
  v_email text;
  v_amount numeric;
begin
  if v_user is null then
    raise exception 'You must be signed in.';
  end if;

  select s.* into v_sub
  from public.payment_submissions s
  left join public.clients c on c.id = s.client_id
  where s.id = p_submission_id
    and (s.user_id = v_user or c.user_id = v_user)
  for update of s;

  if not found then
    raise exception 'That payment could not be found on your account.';
  end if;

  if v_sub.billing_id is null then
    raise exception 'Only bill payments can be cancelled here. Cancel a plan application from the Plan section.';
  end if;

  if lower(coalesce(v_sub.status, '')) <> 'pending' then
    raise exception 'This payment was already %, so it cannot be cancelled.', lower(v_sub.status);
  end if;

  with done as (
    update public.payment_submissions
    set status = 'Cancelled',
        reject_note = 'Cancelled by the customer',
        reviewed_at = now(),
        updated_at = now()
    where status = 'Pending'
      and (id = v_sub.id or (v_sub.group_id is not null and group_id = v_sub.group_id))
    returning amount_claimed
  )
  select sum(amount_claimed) into v_amount from done;

  select email into v_email from auth.users where id = v_user;
  insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values (
    v_sub.tenant_id, v_sub.client_id, coalesce(v_email, 'Unknown'), 'payment_cancelled',
    coalesce(v_sub.reference_number, ''), v_amount::text
  );
end;
$fn$;

-- Rejecting any part of a group rejects the whole receipt.
create or replace function public.reject_payment_submission_as(p_submission_id uuid, p_actor uuid, p_reason text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  sub public.payment_submissions%rowtype;
  cl public.clients%rowtype;
  req public.service_requests%rowtype;
  v_bill_ref text;
  v_amount numeric;
  v_email text;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Choose a reason for rejecting this payment.';
  end if;

  select * into sub from public.payment_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Payment submission not found.';
  end if;

  if not public.actor_is_payment_staff(p_actor, sub.tenant_id) then
    raise exception 'Only accounting or admin staff can reject payments.';
  end if;

  if lower(coalesce(sub.status, 'pending')) <> 'pending' then
    raise exception 'This submission was already %.', lower(sub.status);
  end if;

  select * into cl from public.clients where id = sub.client_id;
  select * into req from public.service_requests where id = sub.service_request_id;

  select string_agg(b.bill_id, ', ' order by b.due_date), sum(s.amount_claimed)
  into v_bill_ref, v_amount
  from public.payment_submissions s
  left join public.billing b on b.id = s.billing_id
  where s.status = 'Pending'
    and (s.id = sub.id or (sub.group_id is not null and s.group_id = sub.group_id));

  update public.payment_submissions
  set status = 'Rejected', reviewed_at = now(), reviewed_by = p_actor,
      reject_reason = btrim(p_reason), reject_note = nullif(btrim(coalesce(p_note, '')), '')
  where status = 'Pending'
    and (id = sub.id or (sub.group_id is not null and group_id = sub.group_id));

  if sub.service_request_id is not null then
    update public.service_requests
    set status = 'Cancelled', updated_at = now()
    where id = sub.service_request_id;
  end if;

  select email into v_email from auth.users where id = p_actor;
  insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values (
    sub.tenant_id, sub.client_id, coalesce(v_email, 'Unknown'), 'payment_rejected',
    coalesce(sub.reference_number, ''),
    btrim(p_reason) || coalesce(' - ' || nullif(btrim(coalesce(p_note, '')), ''), '')
  );

  return jsonb_build_object(
    'kind', case when sub.billing_id is not null then 'bill' else 'plan' end,
    'status', 'Rejected',
    'amount', v_amount,
    'plan', req.requested_plan,
    'bill_id', v_bill_ref,
    'customer_name', cl.customer_name,
    'customer_email', cl.email,
    'reference', sub.reference_number,
    'reason', btrim(p_reason),
    'note', nullif(btrim(coalesce(p_note, '')), '')
  );
end;
$fn$;

-- Verifying any part of a group verifies the whole receipt (all or nothing).
create or replace function public.verify_payment_submission_as(p_submission_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  sub public.payment_submissions%rowtype;
  part public.payment_submissions%rowtype;
  req public.service_requests%rowtype;
  cl public.clients%rowtype;
  bill public.billing%rowtype;
  pay public.payments%rowtype;
  v_email text;
  v_new_customer boolean;
  v_total numeric;
  v_paid numeric;
  v_remaining numeric;
  v_amount numeric := 0;
  v_left_after numeric := 0;
  v_bills text;
  v_receipts text;
  v_first_payment uuid;
begin
  select * into sub from public.payment_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Payment submission not found.';
  end if;

  if not public.actor_is_payment_staff(p_actor, sub.tenant_id) then
    raise exception 'Only accounting or admin staff can verify payments.';
  end if;

  if lower(coalesce(sub.status, 'pending')) <> 'pending' then
    raise exception 'This submission was already %.', lower(sub.status);
  end if;

  if sub.client_id is null or (sub.service_request_id is null and sub.billing_id is null) then
    raise exception 'This submission is missing its client, plan application or bill.';
  end if;

  select * into cl from public.clients where id = sub.client_id;

  if sub.user_id = p_actor or cl.user_id = p_actor then
    raise exception 'You cannot approve a payment for your own account.';
  end if;

  if public.reference_in_use(sub.tenant_id, sub.reference_number, sub.id) then
    raise exception 'Reference % was already used on another payment (a reused receipt?).', sub.reference_number;
  end if;

  if sub.billing_id is not null then
    -- One row, or every pending part of the receipt (siblings first, lead last).
    for part in
      select * from public.payment_submissions
      where status = 'Pending'
        and (id = sub.id or (sub.group_id is not null and group_id = sub.group_id))
      order by (id = coalesce(group_id, id)), created_at
      for update
    loop
      select * into bill from public.billing where id = part.billing_id for update;
      if not found then
        raise exception 'The bill for this payment no longer exists.';
      end if;

      if lower(coalesce(bill.status, '')) in ('cancelled', 'canceled', 'void', 'waived') then
        raise exception 'Bill % is no longer open (%).', bill.bill_id, bill.status;
      end if;

      v_total := coalesce(bill.final_amount, bill.amount_due, bill.original_amount, 0);
      select coalesce(sum(amount_paid) filter (where amount_paid > 0), 0) into v_paid
      from public.payments where billing_id = bill.id;
      v_remaining := v_total - v_paid;

      if v_remaining <= 0 then
        raise exception 'Bill % is already fully paid. Reject this payment.', bill.bill_id;
      end if;

      if part.amount_claimed > v_remaining then
        raise exception 'The customer claims % but only % is left on bill %. Reject it and ask them to resubmit the right amount.',
          part.amount_claimed, v_remaining, bill.bill_id;
      end if;

      update public.payment_submissions
      set status = 'Verified', reviewed_at = now(), reviewed_by = p_actor
      where id = part.id;

      select p.* into pay
      from public.payments p
      join public.payment_submissions s on s.payment_id = p.id
      where s.id = part.id;

      v_first_payment := coalesce(v_first_payment, pay.id);
      v_amount := v_amount + part.amount_claimed;
      v_left_after := v_left_after + (v_remaining - part.amount_claimed);
      v_bills := concat_ws(', ', v_bills, bill.bill_id);
      v_receipts := concat_ws(', ', v_receipts, pay.receipt_number);

      select email into v_email from auth.users where id = p_actor;
      insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
      values (
        part.tenant_id, part.client_id, coalesce(v_email, 'Unknown'), 'payment_verified',
        coalesce(part.reference_number, ''),
        coalesce(pay.receipt_number, '') || ' / ' || part.amount_claimed::text || ' / bill ' || coalesce(bill.bill_id, '')
      );
    end loop;

    perform public.refresh_disconnection_flag(cl.id);

    return jsonb_build_object(
      'kind', 'bill',
      'payment_uuid', v_first_payment,
      'receipt_number', v_receipts,
      'amount', v_amount,
      'plan', null,
      'bill_id', v_bills,
      'remaining', v_left_after,
      'new_customer', false,
      'customer_name', cl.customer_name,
      'customer_email', cl.email,
      'reference', sub.reference_number
    );
  end if;

  select * into req from public.service_requests where id = sub.service_request_id;

  if lower(coalesce(req.status, '')) in ('cancelled', 'canceled', 'completed', 'for installation') then
    raise exception 'This plan application is no longer open (%).', req.status;
  end if;

  if coalesce(req.requested_amount, 0) > 0 and sub.amount_claimed <> req.requested_amount then
    raise exception 'Amount mismatch: the customer entered % but % costs %. Reject it and ask them to pay the exact amount.',
      sub.amount_claimed, req.requested_plan, req.requested_amount;
  end if;

  v_new_customer :=
    lower(coalesce(cl.account_status, '')) <> 'active'
    and lower(coalesce(cl.installation_status, 'pending')) not in ('installed', 'completed', 'done');

  if not exists (select 1 from public.client_services where client_id = cl.id) then
    insert into public.client_services (tenant_id, client_id, status, installation_status)
    values (cl.tenant_id, cl.id, 'pending', case when v_new_customer then 'For installation' else cl.installation_status end);
  end if;

  update public.payment_submissions
  set status = 'Verified', reviewed_at = now(), reviewed_by = p_actor
  where id = sub.id;

  select p.* into pay
  from public.payments p
  join public.payment_submissions s on s.payment_id = p.id
  where s.id = sub.id;

  if v_new_customer then
    update public.clients set installation_status = 'For installation' where id = cl.id;

    update public.service_requests
    set status = 'For installation', updated_at = now()
    where id = req.id;

    insert into public.repair_records (
      client_id, repair_date, problem_description, status, service_request_id,
      job_type, latitude, longitude
    ) values (
      cl.id, current_date,
      'New installation: ' || coalesce(req.requested_plan, 'internet plan')
        || case when req.installation_location_type = 'other' and coalesce(req.installation_area, '') <> ''
                then ' at ' || req.installation_area else '' end,
      'Pending', req.id, 'installation',
      case when req.installation_location_type = 'other' then req.latitude else coalesce(req.latitude, cl.latitude) end,
      case when req.installation_location_type = 'other' then req.longitude else coalesce(req.longitude, cl.longitude) end
    )
    on conflict (service_request_id) where service_request_id is not null do nothing;
  end if;

  select email into v_email from auth.users where id = p_actor;
  insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values (
    sub.tenant_id, sub.client_id, coalesce(v_email, 'Unknown'), 'payment_verified',
    coalesce(sub.reference_number, ''),
    coalesce(pay.receipt_number, '') || ' / ' || sub.amount_claimed::text || ' / ' || coalesce(req.requested_plan, '')
  );

  return jsonb_build_object(
    'kind', 'plan',
    'payment_uuid', pay.id,
    'receipt_number', pay.receipt_number,
    'amount', sub.amount_claimed,
    'plan', req.requested_plan,
    'new_customer', v_new_customer,
    'customer_name', cl.customer_name,
    'customer_email', cl.email,
    'reference', sub.reference_number
  );
end;
$fn$;

-- One push per receipt: only the lead row of a group notifies.
create or replace function public.notify_payment_result()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $fn$
declare
  v_user uuid;
  v_old text := lower(coalesce(OLD.status, ''));
  v_new text := lower(coalesce(NEW.status, ''));
  v_title text;
  v_body text;
  v_secret text;
begin
  if v_old = v_new then
    return NEW;
  end if;

  if NEW.group_id is not null and NEW.group_id <> NEW.id then
    return NEW;
  end if;

  if v_new ~ '(verif|approv)' then
    v_title := 'Payment verified';
    v_body := case when NEW.billing_id is not null
                   then 'Accounting verified your bill payment. Thank you!'
                   else 'Accounting verified your payment. Thank you!' end;
  elsif v_new ~ '(reject|declin)' then
    if NEW.reject_reason = 'Withdrawn by customer' then
      return NEW;
    end if;
    v_title := 'Payment was not accepted';
    v_body := case when coalesce(NEW.reject_reason, '') <> ''
                   then 'Reason: ' || NEW.reject_reason || '. Open the app to submit it again.'
                   else 'Accounting could not verify your payment. Open the app to see why and submit it again.' end;
  else
    return NEW;
  end if;

  select coalesce(NEW.user_id, c.user_id) into v_user
  from (select 1) x left join public.clients c on c.id = NEW.client_id;
  if v_user is null then
    return NEW;
  end if;

  select secret into v_secret from public.push_config limit 1;

  perform net.http_post(
    url := 'https://ylqmsghxihtzbaqgkyxi.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('user_id', v_user, 'title', v_title, 'body', v_body)
  );
  return NEW;
exception when others then
  return NEW;
end;
$fn$;

create or replace function public.notify_payment_submitted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_name text;
  v_amount numeric := coalesce(NEW.amount_claimed, 0);
begin
  if NEW.group_id is not null then
    if NEW.group_id <> NEW.id then
      return NEW;
    end if;
    -- The lead is inserted last, so the whole receipt is visible here.
    select coalesce(sum(amount_claimed), 0) into v_amount
    from public.payment_submissions where group_id = NEW.group_id;
  end if;

  select customer_name into v_name from public.clients where id = NEW.client_id;
  perform public.push_billing_staff(
    NEW.tenant_id,
    'Payment to check',
    format('%s sent PHP %s by %s. Check it in Accounting.',
           coalesce(nullif(btrim(v_name), ''), 'A customer'),
           to_char(v_amount, 'FM999,999,990.00'),
           coalesce(nullif(btrim(NEW.payment_method), ''), 'payment'))
  );
  return NEW;
exception when others then
  return NEW;
end;
$fn$;
