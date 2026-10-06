-- Safe payment verification + receipts.
-- NOT YET APPLIED. Paste into the Supabase SQL editor and run once.
--
-- Adds:
--   1. verify_payment_submission(uuid)   all-or-nothing verify, staff only, audit-logged
--   2. reject_payment_submission(uuid)   staff only, cancels the plan request
--   3. a unique rule so one reference number can only be verified once per tenant
--   4. get_receipt(uuid)                 receipt data for the customer or staff
--
-- The webapp falls back to its old step-by-step path if these functions are
-- missing, so it keeps working before this is applied.

-- Receipt numbers: REC-YYYYMMDD-000123
create sequence if not exists public.payment_receipt_seq;

-- One verified payment per reference number (case-insensitive) per tenant.
create unique index if not exists payment_submissions_verified_reference_uniq
  on public.payment_submissions (tenant_id, lower(btrim(reference_number)))
  where status = 'verified' and reference_number is not null and btrim(reference_number) <> '';

-- Is the signed-in user accounting/admin staff for this tenant?
create or replace function public.is_payment_staff(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_is_global_admin()
      or exists (
        select 1
        from public.tenant_users tu
        where tu.user_id = auth.uid()
          and tu.tenant_id = target_tenant_id
          and tu.role in ('admin', 'accounting')
      );
$$;

create or replace function public.verify_payment_submission(p_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sub public.payment_submissions%rowtype;
  new_payment_id uuid;
  receipt text;
  code text;
  reviewer_email text;
begin
  select * into sub
  from public.payment_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Payment submission not found.';
  end if;

  if not public.is_payment_staff(sub.tenant_id) then
    raise exception 'Only accounting or admin staff can verify payments.';
  end if;

  if lower(coalesce(sub.status, 'pending')) in ('verified', 'rejected') then
    raise exception 'This submission was already %.', sub.status;
  end if;

  if sub.client_id is null or sub.service_request_id is null then
    raise exception 'This submission is missing its client or plan request.';
  end if;

  if coalesce(btrim(sub.reference_number), '') <> '' and exists (
    select 1 from public.payment_submissions o
    where o.id <> sub.id
      and o.tenant_id = sub.tenant_id
      and o.status = 'verified'
      and lower(btrim(o.reference_number)) = lower(btrim(sub.reference_number))
  ) then
    raise exception 'Reference % was already verified on another payment.', sub.reference_number;
  end if;

  code := to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.payment_receipt_seq')::text, 6, '0');
  receipt := 'REC-' || code;

  insert into public.payments (
    tenant_id, client_id, payment_id, receipt_number,
    amount_paid, payment_date, payment_method, service_request_id
  ) values (
    sub.tenant_id, sub.client_id, 'PAY-' || code, receipt,
    sub.amount_claimed, coalesce(sub.payment_date, current_date),
    coalesce(sub.payment_method, 'GCash'), sub.service_request_id
  )
  returning id into new_payment_id;

  update public.payment_submissions
  set status = 'verified',
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      payment_id = new_payment_id,
      updated_at = now()
  where id = sub.id;

  select email into reviewer_email from auth.users where id = auth.uid();

  insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values (
    sub.tenant_id, sub.client_id, reviewer_email, 'payment_verified',
    coalesce(sub.reference_number, ''),
    receipt || ' / ' || sub.amount_claimed::text
  );

  -- Let the existing logic schedule / activate the plan. Same transaction, so
  -- if this fails the payment and the verification are rolled back too.
  perform public.try_activate_plan_from_payment_request(sub.service_request_id);

  return jsonb_build_object(
    'payment_uuid', new_payment_id,
    'payment_id', 'PAY-' || code,
    'receipt_number', receipt
  );
end;
$$;

create or replace function public.reject_payment_submission(p_submission_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sub public.payment_submissions%rowtype;
  reviewer_email text;
begin
  select * into sub
  from public.payment_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Payment submission not found.';
  end if;

  if not public.is_payment_staff(sub.tenant_id) then
    raise exception 'Only accounting or admin staff can reject payments.';
  end if;

  if lower(coalesce(sub.status, 'pending')) in ('verified', 'rejected') then
    raise exception 'This submission was already %.', sub.status;
  end if;

  update public.payment_submissions
  set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
  where id = sub.id;

  if sub.service_request_id is not null then
    update public.service_requests
    set status = 'Cancelled', updated_at = now()
    where id = sub.service_request_id;
  end if;

  select email into reviewer_email from auth.users where id = auth.uid();

  insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values (
    sub.tenant_id, sub.client_id, reviewer_email, 'payment_rejected',
    coalesce(sub.reference_number, ''), coalesce(p_reason, 'Rejected by accounting')
  );

  return jsonb_build_object('status', 'rejected');
end;
$$;

-- Receipt for one payment. Customers can read their own; staff can read any in their tenant.
create or replace function public.get_receipt(p_payment_uuid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pay public.payments%rowtype;
  c public.clients%rowtype;
  plan_label text;
begin
  select * into pay from public.payments where id = p_payment_uuid;
  if not found then
    raise exception 'Receipt not found.';
  end if;

  select * into c from public.clients where id = pay.client_id;

  if not (c.user_id = auth.uid() or public.is_payment_staff(pay.tenant_id)) then
    raise exception 'You do not have access to this receipt.';
  end if;

  select sr.requested_plan into plan_label
  from public.service_requests sr
  where sr.id = pay.service_request_id;

  return jsonb_build_object(
    'receipt_number', pay.receipt_number,
    'payment_id', pay.payment_id,
    'amount', pay.amount_paid,
    'method', pay.payment_method,
    'payment_date', pay.payment_date,
    'customer_name', c.customer_name,
    'account_id', c.account_id,
    'plan', coalesce(plan_label, c.plan_name)
  );
end;
$$;

grant execute on function public.verify_payment_submission(uuid) to authenticated;
grant execute on function public.reject_payment_submission(uuid, text) to authenticated;
grant execute on function public.get_receipt(uuid) to authenticated;
grant execute on function public.is_payment_staff(uuid) to authenticated;

-- Make the API pick up the new functions straight away.
notify pgrst, 'reload schema';
