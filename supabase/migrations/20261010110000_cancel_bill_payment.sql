-- A customer can take back a bill payment that Accounting has not checked yet
-- (a mistyped reference or amount). The submission is kept as 'Cancelled' for
-- the record, the bill is free to pay again, and the reference number can be
-- reused because only Pending/Verified submissions hold a reference.
alter table public.payment_submissions drop constraint if exists payment_submissions_status_check;
alter table public.payment_submissions
  add constraint payment_submissions_status_check
  check (status = any (array['Pending'::text, 'Verified'::text, 'Rejected'::text, 'Cancelled'::text]));

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

  update public.payment_submissions
  set status = 'Cancelled',
      reject_note = 'Cancelled by the customer',
      reviewed_at = now(),
      updated_at = now()
  where id = v_sub.id;

  select email into v_email from auth.users where id = v_user;
  insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values (
    v_sub.tenant_id, v_sub.client_id, coalesce(v_email, 'Unknown'), 'payment_cancelled',
    coalesce(v_sub.reference_number, ''), v_sub.amount_claimed::text
  );
end;
$fn$;

revoke all on function public.cancel_bill_payment(uuid) from public, anon;
grant execute on function public.cancel_bill_payment(uuid) to authenticated, service_role;
