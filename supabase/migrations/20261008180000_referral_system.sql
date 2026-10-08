-- Referral system end-to-end + installation address fix.
--
-- * clients.referred_by_client_id remembers who referred a customer (taken from
--   the referral code typed at sign-up).
-- * When a referred customer's installation is completed (which only happens
--   after Accounting verified their first payment), the referrer gets a
--   Successful referral and a PHP 250 Eligible reward.
-- * Withdrawals go through request_referral_withdrawal(), which checks the real
--   balance server-side and reserves the rewards. Customers can no longer
--   insert withdrawals directly.
-- * Referral tables get read policies (they had none, so the app saw nothing).
-- * New-install jobs for "another location" applications no longer fall back to
--   the account address's GPS point.

alter table public.clients
  add column if not exists referred_by_client_id uuid references public.clients(id) on delete set null;

-- ------------------------------------------------ remember the referrer
create or replace function public.create_customer_client(p_uid uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_role text;
  v_email text;
  v_meta jsonb;
  v_mobile text;
  v_referrer uuid;
  up public.user_profiles%rowtype;
begin
  select id into v_id from public.clients where user_id = p_uid limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select role into v_role from public.profiles where id = p_uid;
  if coalesce(v_role, 'customer') <> 'customer' then
    return null;
  end if;

  select email, raw_user_meta_data into v_email, v_meta from auth.users where id = p_uid;
  select * into up from public.user_profiles where user_id = p_uid;

  -- The mobile number typed at sign-up is the GCash / online payment number.
  v_mobile := coalesce(nullif(btrim(up.mobile_number), ''), nullif(btrim(v_meta ->> 'mobile_number'), ''));

  if up.user_id is not null and up.mobile_number is null and v_mobile is not null then
    update public.user_profiles set mobile_number = v_mobile where user_id = p_uid;
  end if;

  -- Referral code typed at sign-up (an unknown code is simply ignored).
  select c.id into v_referrer
  from public.clients c
  where nullif(btrim(v_meta ->> 'referral_code'), '') is not null
    and upper(c.referral_code) = upper(btrim(v_meta ->> 'referral_code'))
  limit 1;

  insert into public.clients (
    tenant_id, user_id, customer_name, email, mobile_number,
    area, address, account_status, installation_status, referred_by_client_id
  ) values (
    '4eefc34f-5475-4c54-886b-9d833ef3997a', p_uid,
    coalesce(nullif(btrim(up.full_name), ''), split_part(v_email, '@', 1)),
    v_email, v_mobile, up.purok, up.purok, 'Inactive', 'Pending', v_referrer
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ------------------------------------------------ award on installation
create or replace function public.award_referral(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer uuid;
  v_code text;
  v_referral uuid;
begin
  select referred_by_client_id into v_referrer from public.clients where id = p_client_id;
  if v_referrer is null or v_referrer = p_client_id then
    return;
  end if;

  -- Only after Accounting confirmed a payment for this customer.
  if not exists (
    select 1 from public.payment_submissions
    where client_id = p_client_id and lower(status) = 'verified'
  ) then
    return;
  end if;

  if exists (select 1 from public.referrals where referred_client_id = p_client_id) then
    return;
  end if;

  select referral_code into v_code from public.clients where id = v_referrer;

  insert into public.referrals (
    referrer_client_id, referred_client_id, referral_code,
    status, bonus_amount, bonus_status, bonus_eligible_at
  ) values (
    v_referrer, p_client_id, v_code,
    'Successful', 250, 'Eligible', now()
  )
  returning id into v_referral;

  insert into public.referral_rewards (referral_id, referrer_client_id, amount, status, eligible_at)
  values (v_referral, v_referrer, 250, 'Eligible', now());
end;
$$;
revoke execute on function public.award_referral(uuid) from public, anon, authenticated;

create or replace function public.installation_job_done()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_done constant text := '(complete|resolved|done|fixed)';
  v_tenant uuid;
  v_email text;
begin
  if NEW.job_type = 'installation'
     and lower(coalesce(NEW.status, '')) ~ v_done
     and lower(coalesce(OLD.status, '')) !~ v_done then

    perform set_config('app.bypass_client_guard', 'on', true);

    update public.clients
    set installation_status = 'Installed',
        account_status = 'Active',
        install_date = coalesce(install_date, current_date),
        account_id = coalesce(nullif(account_id, ''), 'PKC-' || lpad(nextval('public.client_account_seq')::text, 5, '0')),
        technicians = coalesce(nullif(technicians, ''), NEW.technician)
    where id = NEW.client_id
    returning tenant_id into v_tenant;

    update public.client_services
    set installation_status = 'Installed',
        install_date = coalesce(install_date, current_date),
        technician_user_id = coalesce(technician_user_id, NEW.technician_user_id),
        status = 'active',
        started_at = coalesce(started_at, now()),
        updated_at = now()
    where client_id = NEW.client_id;

    perform set_config('app.bypass_client_guard', 'off', true);

    perform public.award_referral(NEW.client_id);

    select email into v_email from auth.users where id = NEW.technician_user_id;
    insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
    values (v_tenant, NEW.client_id, coalesce(v_email, 'Unknown'), 'installation_completed', '', coalesce(NEW.problem_description, ''));
  end if;
  return NEW;
end;
$$;
revoke execute on function public.installation_job_done() from public, anon, authenticated;

-- ------------------------------------------------ read access
drop policy if exists "referrers can view own referrals" on public.referrals;
create policy "referrers can view own referrals" on public.referrals
  for select to authenticated
  using (exists (
    select 1 from public.clients c
    where c.id = referrals.referrer_client_id and c.user_id = auth.uid()
  ));

drop policy if exists "payment staff can view referrals" on public.referrals;
create policy "payment staff can view referrals" on public.referrals
  for select to authenticated
  using (exists (
    select 1 from public.clients c
    where c.id = referrals.referrer_client_id and public.is_payment_staff(c.tenant_id)
  ));

-- ------------------------------------------------ withdrawals via function
drop policy if exists "customers can request own referral withdrawals" on public.referral_withdrawals;
revoke insert, update, delete, truncate on public.referrals, public.referral_rewards, public.referral_withdrawals from anon, authenticated;

create or replace function public.request_referral_withdrawal(
  p_amount numeric,
  p_method text,
  p_account_name text,
  p_account_number text,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c_fee constant numeric := 5;
  v_client uuid;
  v_gross numeric := 0;
  v_withdrawal uuid;
  r record;
  v_ids uuid[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select id into v_client from public.clients where user_id = auth.uid() limit 1;
  if v_client is null then
    raise exception 'Your customer account could not be found.';
  end if;

  if coalesce(btrim(p_account_name), '') = '' or coalesce(btrim(p_account_number), '') = '' then
    raise exception 'Enter your payout account name and number.';
  end if;

  if p_amount is null or p_amount <= c_fee then
    raise exception 'The withdrawal must be more than the PHP % transfer fee.', c_fee;
  end if;

  if exists (
    select 1 from public.referral_withdrawals
    where referrer_client_id = v_client and lower(status) = 'pending'
  ) then
    raise exception 'You already have a withdrawal waiting for Accounting.';
  end if;

  -- Reserve the oldest Eligible rewards until the requested amount is covered.
  for r in
    select id, amount from public.referral_rewards
    where referrer_client_id = v_client and lower(status) = 'eligible'
    order by eligible_at nulls last, created_at
    for update
  loop
    exit when v_gross >= p_amount;
    v_gross := v_gross + r.amount;
    v_ids := v_ids || r.id;
  end loop;

  if v_gross < p_amount then
    raise exception 'Your available referral balance is PHP %.',
      coalesce((select sum(amount) from public.referral_rewards
                where referrer_client_id = v_client and lower(status) = 'eligible'), 0);
  end if;

  insert into public.referral_withdrawals (
    referrer_client_id, gross_amount, transfer_fee, net_amount,
    payout_method, payout_account_name, payout_account_number, payout_notes, status
  ) values (
    v_client, v_gross, c_fee, v_gross - c_fee,
    p_method, btrim(p_account_name), btrim(p_account_number), nullif(btrim(coalesce(p_notes, '')), ''), 'Pending'
  )
  returning id into v_withdrawal;

  update public.referral_rewards
  set status = 'Reserved', withdrawal_id = v_withdrawal, updated_at = now()
  where id = any (v_ids);

  return v_withdrawal;
end;
$$;
revoke execute on function public.request_referral_withdrawal(numeric, text, text, text, text) from public, anon;
grant execute on function public.request_referral_withdrawal(numeric, text, text, text, text) to authenticated;

-- ------------------------------------------------ install address on jobs
create or replace function public.verify_payment_submission_as(p_submission_id uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sub public.payment_submissions%rowtype;
  req public.service_requests%rowtype;
  cl public.clients%rowtype;
  pay public.payments%rowtype;
  v_email text;
  v_new_customer boolean;
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

  if sub.client_id is null or sub.service_request_id is null then
    raise exception 'This submission is missing its client or plan application.';
  end if;

  select * into cl from public.clients where id = sub.client_id;
  select * into req from public.service_requests where id = sub.service_request_id;

  if sub.user_id = p_actor or cl.user_id = p_actor then
    raise exception 'You cannot approve a payment for your own account.';
  end if;

  if lower(coalesce(req.status, '')) in ('cancelled', 'canceled', 'completed', 'for installation') then
    raise exception 'This plan application is no longer open (%).', req.status;
  end if;

  if coalesce(req.requested_amount, 0) > 0 and sub.amount_claimed <> req.requested_amount then
    raise exception 'Amount mismatch: the customer entered % but % costs %. Reject it and ask them to pay the exact amount.',
      sub.amount_claimed, req.requested_plan, req.requested_amount;
  end if;

  if coalesce(btrim(sub.reference_number), '') <> '' and exists (
    select 1 from public.payment_submissions o
    where o.id <> sub.id
      and o.tenant_id = sub.tenant_id
      and o.status = 'Verified'
      and lower(btrim(o.reference_number)) = lower(btrim(sub.reference_number))
  ) then
    raise exception 'Reference % was already verified on another payment (a reused receipt?).', sub.reference_number;
  end if;

  v_new_customer :=
    lower(coalesce(cl.account_status, '')) <> 'active'
    and lower(coalesce(cl.installation_status, 'pending')) not in ('installed', 'completed', 'done');

  -- The plan trigger needs a service record to attach the plan to.
  if not exists (select 1 from public.client_services where client_id = cl.id) then
    insert into public.client_services (tenant_id, client_id, status, installation_status)
    values (cl.tenant_id, cl.id, 'pending', case when v_new_customer then 'For installation' else cl.installation_status end);
  end if;

  -- Existing triggers record the payment (receipt number) and activate the plan.
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
      -- A different install address has no saved GPS point; never fall back to the account address.
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
$$;
revoke execute on function public.verify_payment_submission_as(uuid, uuid) from public, anon, authenticated;
grant execute on function public.verify_payment_submission_as(uuid, uuid) to service_role;
