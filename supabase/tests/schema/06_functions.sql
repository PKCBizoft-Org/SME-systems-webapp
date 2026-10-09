CREATE OR REPLACE FUNCTION public.activate_due_scheduled_plan_changes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_count integer := 0;

    v_request public.service_requests%ROWTYPE;
    v_plan_id uuid;
    v_service public.client_services%ROWTYPE;
    v_total_paid numeric := 0;

BEGIN

    /*
      Process only scheduled plan-change requests whose
      effective time has arrived.

      SKIP LOCKED prevents two concurrent executions from
      processing the same request at the same time.
    */
    FOR v_request IN
        SELECT sr.*
        FROM public.service_requests sr
        WHERE sr.request_type = 'plan_change'
          AND lower(COALESCE(sr.status, '')) = 'scheduled'
          AND sr.effective_at IS NOT NULL
          AND sr.effective_at <= now()
        ORDER BY sr.effective_at ASC
        FOR UPDATE SKIP LOCKED
    LOOP

        /*
          A scheduled request must have a valid requested plan
          and payment amount.
        */
        IF v_request.requested_plan IS NULL
           OR v_request.requested_amount IS NULL
           OR v_request.requested_amount <= 0 THEN
            CONTINUE;
        END IF;


        /*
          Confirm that the required payment has actually
          been received.

          payments uses amount_paid.
        */
        SELECT
            COALESCE(
                SUM(
                    CASE
                        WHEN p.amount_paid > 0
                        THEN p.amount_paid
                        ELSE 0
                    END
                ),
                0
            )
        INTO v_total_paid
        FROM public.payments p
        WHERE p.service_request_id = v_request.id;


        /*
          Do not activate the scheduled change until
          the required amount has been fully paid.
        */
        IF v_total_paid < v_request.requested_amount THEN
            CONTINUE;
        END IF;


        /*
          Resolve the requested plan inside the client's tenant.
        */
        SELECT ip.id
        INTO v_plan_id
        FROM public.internet_plans ip
        WHERE ip.tenant_id = (
            SELECT c.tenant_id
            FROM public.clients c
            WHERE c.id = v_request.client_id
        )
          AND ip.plan_name = v_request.requested_plan
          AND ip.active = true
        LIMIT 1;


        /*
          Never silently activate a plan that does not exist
          or is inactive.
        */
        IF v_plan_id IS NULL THEN
            CONTINUE;
        END IF;


        /*
          Find the client's most recent service.

          We intentionally don't require the service to already
          be active. A suspended service may legitimately receive
          a scheduled plan change.
        */
        SELECT *
        INTO v_service
        FROM public.client_services cs
        WHERE cs.client_id = v_request.client_id
        ORDER BY cs.created_at DESC
        LIMIT 1
        FOR UPDATE;


        /*
          If the customer has no service record yet, leave
          the request scheduled rather than marking it completed.
        */
        IF NOT FOUND THEN
            CONTINUE;
        END IF;


        /*
          Update the actual service record.
        */
        UPDATE public.client_services
        SET
            plan_id = v_plan_id,
            status = 'active',
            started_at = COALESCE(started_at, now()),
            ended_at = NULL,
            updated_at = now()
        WHERE id = v_service.id;


        /*
          Keep the legacy client-level plan field synchronized.
        */
        UPDATE public.clients
        SET
            plan_name = v_request.requested_plan
        WHERE id = v_request.client_id;


        /*
          The scheduled plan change has now been successfully
          applied.
        */
        UPDATE public.service_requests
        SET
            status = 'Completed',
            updated_at = now()
        WHERE id = v_request.id;


        v_count := v_count + 1;

    END LOOP;


    RETURN v_count;

END;

$function$
;
CREATE OR REPLACE FUNCTION public.activate_plan_after_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    /*
      Legacy compatibility trigger.

      Plan activation must only happen through the centralized
      payment-verification logic. This prevents a payment from
      activating a pending plan-change request without first
      confirming the required payment amount.
    */

    IF NEW.service_request_id IS NOT NULL THEN
        PERFORM public.try_activate_plan_from_payment_request(
            NEW.service_request_id
        );
    END IF;

    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.actor_is_payment_staff(p_actor uuid, p_tenant uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.tenant_users tu
    where tu.user_id = p_actor
      and tu.tenant_id = p_tenant
      and tu.role in ('admin', 'accounting')
  );
$function$
;
CREATE OR REPLACE FUNCTION public.assign_client_account_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if NEW.account_id is null or btrim(NEW.account_id) = '' then
    NEW.account_id := 'PKC-' || lpad(nextval('public.client_account_seq')::text, 5, '0');
  end if;
  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.assign_employee_number(p_user uuid, p_role text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_number text;
  v_prefix text;
  v_next integer;
begin
  select employee_number into v_number from public.user_profiles where user_id = p_user;
  if v_number is not null and v_number !~ '^EMP-' then
    return v_number;
  end if;

  v_prefix := case lower(coalesce(p_role, ''))
    when 'admin' then 'ADM'
    when 'technician' then 'TEC'
    when 'accounting' then 'ACC'
    when 'inventory' then 'INV'
    else null
  end;
  if v_prefix is null then
    return v_number;
  end if;

  insert into public.employee_counters (prefix, last_number) values (v_prefix, 1)
  on conflict (prefix) do update set last_number = public.employee_counters.last_number + 1
  returning last_number into v_next;

  v_number := v_prefix || '-' || lpad(v_next::text, 4, '0');

  insert into public.user_profiles (user_id, employee_number, date_hired, approval_status)
  values (p_user, v_number, current_date, 'approved')
  on conflict (user_id) do update
    set employee_number = excluded.employee_number,
        date_hired = coalesce(public.user_profiles.date_hired, excluded.date_hired),
        updated_at = now();

  return v_number;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.award_referral(p_client_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_referrer uuid;
  v_code text;
  v_referral uuid;
begin
  select referred_by_client_id into v_referrer from public.clients where id = p_client_id;
  if v_referrer is null or v_referrer = p_client_id then
    return;
  end if;

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
$function$
;
CREATE OR REPLACE FUNCTION public.cancel_scheduled_plan_change(p_service_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  SELECT sr.status
    INTO v_status
  FROM public.service_requests sr
  WHERE sr.id = p_service_request_id
    AND sr.user_id = v_user_id
    AND sr.request_type = 'plan_change';

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Scheduled plan change not found.';
  END IF;

  IF lower(v_status) IN ('verified', 'paid', 'completed') THEN
    RAISE EXCEPTION 'A verified/paid plan change cannot be removed automatically because its payment must be reconciled first.';
  END IF;

  UPDATE public.service_requests
  SET status = 'Cancelled', updated_at = now()
  WHERE id = p_service_request_id
    AND user_id = v_user_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.client_full_address(p_client uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.clients%rowtype;
  up public.user_profiles%rowtype;
  v_allowed boolean;
begin
  select * into c from public.clients where id = p_client;
  if c.id is null then
    return null;
  end if;

  v_allowed := c.user_id = auth.uid()
    or exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.tenant_id = c.tenant_id
    );
  if not v_allowed then
    return null;
  end if;

  select * into up from public.user_profiles where user_id = c.user_id;

  return nullif(concat_ws(', ',
    nullif(btrim(coalesce(up.purok, c.area, '')), ''),
    (select btrim(name) from public.ph_locations where code = up.barangay_code),
    (select btrim(name) from public.ph_locations where code = up.city_municipality_code),
    (select btrim(name) from public.ph_locations where code = up.province_code)
  ), '');
end;
$function$
;
CREATE OR REPLACE FUNCTION public.create_customer_client(p_uid uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  v_mobile := coalesce(nullif(btrim(up.mobile_number), ''), nullif(btrim(v_meta ->> 'mobile_number'), ''));

  if up.user_id is not null and up.mobile_number is null and v_mobile is not null then
    update public.user_profiles set mobile_number = v_mobile where user_id = p_uid;
  end if;

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
$function$
;
CREATE OR REPLACE FUNCTION public.ensure_customer_client()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  return public.create_customer_client(auth.uid());
end;
$function$
;
CREATE OR REPLACE FUNCTION public.generate_billing_for_service(p_client_service_id uuid, p_bill_date date)
 RETURNS billing
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_service public.client_services%ROWTYPE;
    v_plan public.internet_plans%ROWTYPE;
    v_cycle public.billing_cycle_settings%ROWTYPE;
    v_client_tenant_id uuid;

    v_period_start date;
    v_period_end date;
    v_next_bill_date date;

    v_due_date date;
    v_disconnect_date date;
    v_terminate_date date;

    v_amount numeric;

    v_existing public.billing%ROWTYPE;
    v_bill public.billing%ROWTYPE;

    v_next_number integer;
BEGIN

    -- =========================================================
    -- 1. LOCK SERVICE
    -- =========================================================

    SELECT *
    INTO v_service
    FROM public.client_services
    WHERE id = p_client_service_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Client service % does not exist',
            p_client_service_id;
    END IF;


    -- =========================================================
    -- 2. SERVICE MUST BE ACTIVE
    -- =========================================================

    IF LOWER(COALESCE(v_service.status, '')) NOT IN (
        'active',
        'activated'
    ) THEN
        RAISE EXCEPTION
            'Client service % is not active (status=%)',
            p_client_service_id,
            v_service.status;
    END IF;


    -- =========================================================
    -- 3. LOAD ACTIVE PLAN
    -- =========================================================

    IF v_service.plan_id IS NULL THEN
        RAISE EXCEPTION
            'Client service % has no plan_id',
            p_client_service_id;
    END IF;

    SELECT *
    INTO v_plan
    FROM public.internet_plans
    WHERE id = v_service.plan_id
      AND tenant_id = v_service.tenant_id
      AND active = TRUE
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Active plan % not found for tenant %',
            v_service.plan_id,
            v_service.tenant_id;
    END IF;


    -- =========================================================
    -- 4. LOAD BILLING CYCLE
    -- =========================================================

    IF v_service.billing_cycle_id IS NULL THEN
        RAISE EXCEPTION
            'Client service % has no billing cycle',
            p_client_service_id;
    END IF;

    SELECT *
    INTO v_cycle
    FROM public.billing_cycle_settings
    WHERE id = v_service.billing_cycle_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Billing cycle % not found',
            v_service.billing_cycle_id;
    END IF;


    -- =========================================================
    -- 5. VERIFY CLIENT / TENANT
    -- =========================================================

    SELECT tenant_id
    INTO v_client_tenant_id
    FROM public.clients
    WHERE id = v_service.client_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Client % does not exist',
            v_service.client_id;
    END IF;

    IF v_client_tenant_id IS DISTINCT FROM v_service.tenant_id THEN
        RAISE EXCEPTION
            'Tenant mismatch: service tenant % vs client tenant %',
            v_service.tenant_id,
            v_client_tenant_id;
    END IF;


    -- =========================================================
    -- 6. BILLING PERIOD
    --
    -- Current business rule:
    -- bill date → day before next billing date
    --
    -- Example:
    -- Oct 15 → Nov 14
    -- Nov 15 → Dec 14
    -- =========================================================

    v_period_start := p_bill_date;

    v_next_bill_date :=
        p_bill_date + INTERVAL '1 month';

    v_period_end :=
        v_next_bill_date - INTERVAL '1 day';


    -- =========================================================
    -- 7. DUE DATE
    -- =========================================================

    IF v_cycle.due_day IS NOT NULL THEN

        v_due_date := make_date(
            EXTRACT(YEAR FROM p_bill_date)::integer,
            EXTRACT(MONTH FROM p_bill_date)::integer,
            LEAST(
                v_cycle.due_day,
                EXTRACT(
                    DAY FROM (
                        date_trunc('month', p_bill_date)
                        + INTERVAL '1 month - 1 day'
                    )
                )::integer
            )
        );

    ELSE

        v_due_date := p_bill_date;

    END IF;


    -- =========================================================
    -- 8. DISCONNECT DATE
    -- =========================================================

    IF v_cycle.disconnect_day IS NOT NULL THEN

        v_disconnect_date := make_date(
            EXTRACT(YEAR FROM p_bill_date)::integer,
            EXTRACT(MONTH FROM p_bill_date)::integer,
            LEAST(
                v_cycle.disconnect_day,
                EXTRACT(
                    DAY FROM (
                        date_trunc('month', p_bill_date)
                        + INTERVAL '1 month - 1 day'
                    )
                )::integer
            )
        );

    ELSE

        v_disconnect_date := NULL;

    END IF;


    -- =========================================================
    -- 9. TERMINATION DATE
    -- =========================================================

    IF v_cycle.terminate_day IS NOT NULL THEN

        v_terminate_date := make_date(
            EXTRACT(YEAR FROM p_bill_date)::integer,
            EXTRACT(MONTH FROM p_bill_date)::integer,
            LEAST(
                v_cycle.terminate_day,
                EXTRACT(
                    DAY FROM (
                        date_trunc('month', p_bill_date)
                        + INTERVAL '1 month - 1 day'
                    )
                )::integer
            )
        );

    ELSE

        v_terminate_date := NULL;

    END IF;


    -- =========================================================
    -- 10. CURRENT PLAN PRICE
    --
    -- Historical bills are untouched.
    -- =========================================================

    v_amount := COALESCE(v_plan.price, 0);


    -- =========================================================
    -- 11. IDEMPOTENCY CHECK
    -- =========================================================

    SELECT *
    INTO v_existing
    FROM public.billing
    WHERE tenant_id = v_service.tenant_id
      AND client_id = v_service.client_id
      AND billing_period_start = v_period_start
      AND billing_period_end = v_period_end
    LIMIT 1;

    IF FOUND THEN
        RETURN v_existing;
    END IF;


    -- =========================================================
    -- 12. TENANT-SCOPED BILL NUMBER LOCK
    --
    -- Advisory transaction lock prevents two concurrent
    -- generators for the same tenant from choosing the
    -- same SAM number.
    -- =========================================================

    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'billing-number:' || v_service.tenant_id::text,
            0
        )
    );


    -- Re-check after acquiring the lock.
    -- Another transaction may have created the bill.
    SELECT *
    INTO v_existing
    FROM public.billing
    WHERE tenant_id = v_service.tenant_id
      AND client_id = v_service.client_id
      AND billing_period_start = v_period_start
      AND billing_period_end = v_period_end
    LIMIT 1;

    IF FOUND THEN
        RETURN v_existing;
    END IF;


    -- =========================================================
    -- 13. GENERATE NEXT SAM NUMBER
    -- =========================================================

    SELECT
        COALESCE(
            MAX(
                CASE
                    WHEN bill_id ~ '^SAM-[0-9]+$'
                    THEN SUBSTRING(bill_id FROM 5)::integer
                    ELSE NULL
                END
            ),
            0
        ) + 1
    INTO v_next_number
    FROM public.billing
    WHERE tenant_id = v_service.tenant_id;


    -- =========================================================
    -- 14. INSERT
    -- =========================================================

    INSERT INTO public.billing (
        tenant_id,
        client_id,
        bill_id,
        status,
        bill_type,
        bill_date,
        due_date,
        amount_due,
        billing_cycle,
        billing_period_start,
        billing_period_end,
        disconnect_date,
        terminate_date,
        original_amount,
        discount_amount,
        final_amount,
        discount_reason,
        paid_at
    )
    VALUES (
        v_service.tenant_id,
        v_service.client_id,

        'SAM-' ||
        LPAD(v_next_number::text, 5, '0'),

        'Unpaid',

        'Monthly Subscription',

        p_bill_date,
        v_due_date,

        v_amount,

        v_cycle.cycle_code,

        v_period_start,
        v_period_end,

        v_disconnect_date,
        v_terminate_date,

        v_amount,
        0,
        v_amount,

        NULL,
        NULL
    )
    RETURNING *
    INTO v_bill;


    RETURN v_bill;

END;
$function$
;
CREATE OR REPLACE FUNCTION public.generate_client_referral_code()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    new_code text;
BEGIN
    LOOP
        new_code :=
            'PKC-' ||
            upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

        EXIT WHEN NOT EXISTS (
            SELECT 1
            FROM public.clients
            WHERE referral_code = new_code
        );
    END LOOP;

    RETURN new_code;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_receipt(p_payment_uuid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pay public.payments%rowtype;
  c public.clients%rowtype;
  plan_label text;
  ref text;
begin
  select * into pay from public.payments where id = p_payment_uuid;
  if not found then
    raise exception 'Receipt not found.';
  end if;

  select * into c from public.clients where id = pay.client_id;

  if not (c.user_id = auth.uid() or public.is_payment_staff(pay.tenant_id)) then
    raise exception 'You do not have access to this receipt.';
  end if;

  select sr.requested_plan into plan_label from public.service_requests sr where sr.id = pay.service_request_id;
  select s.reference_number into ref from public.payment_submissions s where s.payment_id = pay.id limit 1;

  return jsonb_build_object(
    'receipt_number', pay.receipt_number,
    'payment_id', pay.payment_id,
    'amount', pay.amount_paid,
    'method', pay.payment_method,
    'payment_date', pay.payment_date,
    'customer_name', c.customer_name,
    'account_id', c.account_id,
    'plan', coalesce(plan_label, c.plan_name),
    'reference', ref
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.guard_profile_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user in ('authenticated', 'anon')
     and NEW.role is distinct from OLD.role
     and not public.user_is_global_admin() then
    raise exception 'You cannot change your own role.';
  end if;
  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.guard_service_request_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  editable text[] := array[
    'latitude', 'longitude', 'updated_at',
    'installation_location_type', 'installation_area', 'installation_region_code',
    'installation_province_code', 'installation_city_code',
    'installation_barangay_code', 'installation_purok'
  ];
begin
  if current_user in ('authenticated', 'anon')
     and not public.user_is_global_admin()
     and (to_jsonb(NEW) - editable) is distinct from (to_jsonb(OLD) - editable) then
    raise exception 'You can only change the location details of a request.';
  end if;
  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.guard_technician_client_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    return NEW;
  end if;

  if coalesce(current_setting('app.bypass_client_guard', true), '') = 'on' then
    return NEW;
  end if;

  if public.user_is_global_admin() then
    return NEW;
  end if;

  if exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = OLD.tenant_id and tu.role = 'admin'
  ) then
    return NEW;
  end if;

  if exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = OLD.tenant_id and tu.role = 'technician'
  ) then
    if (to_jsonb(NEW) - array['installation_status', 'latitude', 'longitude', 'map_location'])
       is distinct from
       (to_jsonb(OLD) - array['installation_status', 'latitude', 'longitude', 'map_location']) then
      raise exception 'Technicians can only change installation status and location fields.';
    end if;
    return NEW;
  end if;

  if OLD.user_id = auth.uid() then
    if (to_jsonb(NEW) - array['mobile_number', 'latitude', 'longitude', 'map_location', 'address'])
       is distinct from
       (to_jsonb(OLD) - array['mobile_number', 'latitude', 'longitude', 'map_location', 'address']) then
      raise exception 'You can only change your contact and location details.';
    end if;
  end if;

  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_pkc_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN

    -- --------------------------------------------------------
    -- Create the application role
    -- New registrations are customers by default.
    -- Technician accounts should be promoted separately.
    -- --------------------------------------------------------

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = NEW.id
    ) THEN

        INSERT INTO public.profiles (
            id,
            email,
            role
        )
        VALUES (
            NEW.id,
            NEW.email,
            'customer'
        );

    END IF;


    -- --------------------------------------------------------
    -- Save the signup information/location
    -- --------------------------------------------------------

    IF NOT EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE user_id = NEW.id
    ) THEN

        INSERT INTO public.user_profiles (
            user_id,
            full_name,
            purok,
            barangay_code,
            city_municipality_code,
            province_code,
            region_code,
            approval_status
        )
        VALUES (
            NEW.id,

            NULLIF(
                NEW.raw_user_meta_data ->> 'full_name',
                ''
            ),

            NULLIF(
                NEW.raw_user_meta_data ->> 'purok',
                ''
            ),

            NULLIF(
                NEW.raw_user_meta_data ->> 'barangay_code',
                ''
            ),

            NULLIF(
                NEW.raw_user_meta_data ->> 'city_municipality_code',
                ''
            ),

            NULLIF(
                NEW.raw_user_meta_data ->> 'province_code',
                ''
            ),

            NULLIF(
                NEW.raw_user_meta_data ->> 'region_code',
                ''
            ),

            'pending'
        );

    END IF;


    RETURN NEW;

END;
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.user_profiles (user_id, full_name, purok, barangay_code, city_municipality_code, province_code, region_code)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name','')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'purok','')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'barangay_code','')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'city_municipality_code','')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'province_code','')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'region_code','')), '')
  ) on conflict (user_id) do nothing;
  return new;
end; $function$
;
CREATE OR REPLACE FUNCTION public.installation_job_done()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.inventory_has_access(p_tenant uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid() and tu.tenant_id = p_tenant and tu.role in ('admin','inventory')
  );
$function$
;
CREATE OR REPLACE FUNCTION public.inventory_is_technician(p_tenant uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = p_tenant and tu.role = 'technician');
$function$
;
CREATE OR REPLACE FUNCTION public.inventory_items_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    NEW.quantity_on_hand := 0;
    NEW.created_at := now();
    NEW.updated_at := now();
    return NEW;
  end if;
  if NEW.quantity_on_hand is distinct from OLD.quantity_on_hand and pg_trigger_depth() < 2 then
    raise exception 'Stock quantity cannot be edited directly. Record a stock movement instead.';
  end if;
  if NEW.tenant_id is distinct from OLD.tenant_id then
    raise exception 'An inventory item cannot be moved to another tenant.';
  end if;
  NEW.updated_at := now();
  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.inventory_kit_items_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tenant uuid; v_item_tenant uuid;
begin
  select k.tenant_id into v_tenant from public.inventory_kits k where k.id = NEW.kit_id;
  select i.tenant_id into v_item_tenant from public.inventory_items i where i.id = NEW.item_id;
  if v_tenant is null or v_item_tenant is distinct from v_tenant then
    raise exception 'That item does not belong to this kit''s tenant.';
  end if;
  NEW.tenant_id := v_tenant;
  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.inventory_movements_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.inventory_items set quantity_on_hand = quantity_on_hand + NEW.quantity_change where id = NEW.item_id;
  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.inventory_movements_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant uuid;
  v_active boolean;
  v_on_hand numeric;
  v_client_tenant uuid;
  v_taken numeric;
begin
  select i.tenant_id, i.is_active, i.quantity_on_hand into v_tenant, v_active, v_on_hand
  from public.inventory_items i where i.id = NEW.item_id for update;
  if v_tenant is null then raise exception 'Inventory item not found.'; end if;

  NEW.tenant_id := v_tenant;
  NEW.created_by := coalesce(auth.uid(), NEW.created_by);
  NEW.created_at := now();
  select u.email into NEW.created_by_email from auth.users u where u.id = NEW.created_by;
  select p.full_name into NEW.created_by_name from public.user_profiles p where p.user_id = NEW.created_by;

  if not v_active then raise exception 'This item is archived. Reactivate it before recording stock.'; end if;
  if NEW.movement_type in ('stock_in','return') and NEW.quantity_change <= 0 then
    raise exception '% must add stock (positive quantity).', NEW.movement_type;
  end if;
  if NEW.movement_type in ('installation_use','stock_out') and NEW.quantity_change >= 0 then
    raise exception '% must remove stock (negative quantity).', NEW.movement_type;
  end if;
  if NEW.movement_type = 'installation_use' and NEW.client_id is null then
    raise exception 'Select the client installation these materials were used on.';
  end if;
  if NEW.client_id is not null then
    select c.tenant_id into v_client_tenant from public.clients c where c.id = NEW.client_id;
    if v_client_tenant is distinct from v_tenant then raise exception 'That client does not belong to this tenant.'; end if;
  end if;

  if auth.uid() is not null and not public.inventory_has_access(v_tenant) then
    if NEW.movement_type not in ('installation_use','return') then
      raise exception 'Technicians can only take materials for a job or return unused ones.';
    end if;
    if NEW.movement_type = 'return' then
      if NEW.client_id is null then raise exception 'Select the client job these materials are being returned from.'; end if;
      select coalesce(sum(-m.quantity_change), 0) into v_taken
      from public.inventory_movements m
      where m.item_id = NEW.item_id and m.client_id = NEW.client_id and m.created_by = NEW.created_by
        and m.movement_type in ('installation_use','return');
      if NEW.quantity_change > v_taken then
        raise exception 'You can only return up to % that you took for this client.', v_taken;
      end if;
    end if;
  end if;

  if v_on_hand + NEW.quantity_change < 0 then
    raise exception 'Insufficient stock: % on hand, cannot remove %.', v_on_hand, abs(NEW.quantity_change);
  end if;
  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.inventory_movements_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'UPDATE' and OLD.client_id is not null and NEW.client_id is null
     and (to_jsonb(NEW) - 'client_id') = (to_jsonb(OLD) - 'client_id') then
    return NEW;
  end if;
  raise exception 'Inventory movements cannot be changed or deleted. Record an adjustment instead.';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.is_client_technician(p_client uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.clients c
    join public.tenant_users tu on tu.tenant_id = c.tenant_id
    where c.id = p_client and tu.user_id = auth.uid() and tu.role = 'technician'
  );
$function$
;
CREATE OR REPLACE FUNCTION public.is_payment_staff(target_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.user_is_global_admin()
      or exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid()
          and tu.tenant_id = target_tenant_id
          and tu.role in ('admin', 'accounting')
      );
$function$
;
CREATE OR REPLACE FUNCTION public.job_crew(p_repair uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.repair_records%rowtype;
  c public.clients%rowtype;
  v_ok boolean;
begin
  select * into r from public.repair_records where id = p_repair;
  if r.id is null then
    return '[]'::jsonb;
  end if;
  select * into c from public.clients where id = r.client_id;

  v_ok := c.user_id = auth.uid()
    or r.technician_user_id = auth.uid()
    or exists (select 1 from public.repair_job_crew x where x.repair_id = p_repair and x.user_id = auth.uid() and x.status = 'accepted')
    or exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = c.tenant_id);
  if not v_ok then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', t.user_id,
      'name', coalesce(nullif(btrim(up.full_name), ''), public.team_person_name(t.user_id)),
      'employee_number', up.employee_number,
      'phone', up.mobile_number,
      'role', t.role
    ) order by (t.role = 'lead') desc, t.sort)
    from (
      select r.technician_user_id as user_id, 'lead'::text as role, 0 as sort
      where r.technician_user_id is not null
      union all
      select x.user_id, 'helper', 1 from public.repair_job_crew x where x.repair_id = p_repair and x.status = 'accepted'
    ) t
    left join public.user_profiles up on up.user_id = t.user_id
  ), '[]'::jsonb);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.job_crew_requests(p_repair uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.team_tenant();
  if not exists (select 1 from public.repair_records where id = p_repair and technician_user_id = auth.uid()) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', c.user_id,
      'name', public.team_person_name(c.user_id),
      'employee_number', (select employee_number from public.user_profiles where user_id = c.user_id),
      'status', c.status,
      'reason', c.decline_reason
    ) order by c.added_at)
    from public.repair_job_crew c
    where c.repair_id = p_repair and c.status in ('pending', 'accepted', 'declined')
  ), '[]'::jsonb);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.log_client_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    user_email text;
BEGIN
    -- Get the email of the authenticated Supabase user
    SELECT email
    INTO user_email
    FROM auth.users
    WHERE id = auth.uid();

    -- Log installation status changes
    IF OLD.installation_status IS DISTINCT FROM NEW.installation_status THEN
        INSERT INTO public.audit_log (
            tenant_id,
            client_id,
            changed_by_email,
            field_name,
            old_value,
            new_value
        )
        VALUES (
            NEW.tenant_id,
            NEW.id,
            COALESCE(user_email, 'Unknown'),
            'installation_status',
            OLD.installation_status::text,
            NEW.installation_status::text
        );
    END IF;

    -- Log account status changes
    IF OLD.account_status IS DISTINCT FROM NEW.account_status THEN
        INSERT INTO public.audit_log (
            tenant_id,
            client_id,
            changed_by_email,
            field_name,
            old_value,
            new_value
        )
        VALUES (
            NEW.tenant_id,
            NEW.id,
            COALESCE(user_email, 'Unknown'),
            'account_status',
            OLD.account_status::text,
            NEW.account_status::text
        );
    END IF;

    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.my_crew_requests()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.team_tenant();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'repair_id', r.id,
      'job_type', r.job_type,
      'customer', split_part(coalesce(c.customer_name, ''), ' ', 1),
      'address', public.client_full_address(r.client_id),
      'requested_by', public.team_person_name(r.technician_user_id),
      'requested_by_id', (select employee_number from public.user_profiles where user_id = r.technician_user_id),
      'created_at', crew.added_at
    ) order by crew.added_at desc)
    from public.repair_job_crew crew
    join public.repair_records r on r.id = crew.repair_id
    join public.clients c on c.id = r.client_id
    where crew.user_id = auth.uid()
      and crew.status = 'pending'
      and lower(coalesce(r.status, '')) !~ '(complete|resolved|done|fixed|closed|cancel)'
  ), '[]'::jsonb);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.notify_crew_joined()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_customer uuid;
begin
  if NEW.status = 'accepted' and OLD.status is distinct from 'accepted' then
    select c.user_id into v_customer
    from public.repair_records r
    join public.clients c on c.id = r.client_id
    where r.id = NEW.repair_id;

    if v_customer is not null then
      perform public.team_push(
        v_customer,
        'Your crew is set',
        public.team_person_name(NEW.user_id) || ' will also be coming to help with your job.'
      );
    end if;
  end if;
  return NEW;
exception when others then
  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.notify_job_accepted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_secret text;
  v_customer uuid;
begin
  if OLD.technician_user_id is null and NEW.technician_user_id is not null then
    select secret into v_secret from public.push_config limit 1;

    perform net.http_post(
      url := 'https://sme-systems-webapp.vercel.app/api/sms/job-accepted',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('repair_id', NEW.id)
    );

    select user_id into v_customer from public.clients where id = NEW.client_id;
    if v_customer is not null then
      perform public.team_push(
        v_customer,
        'A technician accepted your request',
        public.team_person_name(NEW.technician_user_id) || ' accepted your ' ||
          case when NEW.job_type = 'installation' then 'installation' else 'repair' end ||
          ' request and will visit you soon.'
      );
    end if;
  end if;
  return NEW;
exception when others then
  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.notify_low_rating()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_secret text;
  v_staff record;
  v_name text;
begin
  if NEW.stars > 2 then
    return NEW;
  end if;

  select secret into v_secret from public.push_config limit 1;
  select customer_name into v_name from public.clients where id = NEW.client_id;

  for v_staff in
    select distinct tu.user_id
    from public.tenant_users tu
    where tu.tenant_id = NEW.tenant_id and tu.role in ('admin', 'accounting')
  loop
    perform net.http_post(
      url := 'https://ylqmsghxihtzbaqgkyxi.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object(
        'user_id', v_staff.user_id,
        'title', 'Low rating received',
        'body', coalesce(v_name, 'A customer') || ' gave ' || NEW.stars || ' star' || case when NEW.stars = 1 then '' else 's' end
          || case when NEW.technician_name is not null then ' for ' || NEW.technician_name else '' end || '.'
      )
    );
  end loop;
  return NEW;
exception when others then
  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.notify_payment_result()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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

  if v_new ~ '(verif|approv)' then
    v_title := 'Payment verified';
    v_body := 'Accounting verified your payment. Thank you!';
  elsif v_new ~ '(reject|declin)' then
    v_title := 'Payment was not accepted';
    v_body := 'Accounting could not verify your payment. Open the app to see why and submit it again.';
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
$function$
;
CREATE OR REPLACE FUNCTION public.payment_submission_verification_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment_id uuid;
  v_request_status text;
BEGIN
  IF NEW.status = 'Verified'
     AND OLD.status IS DISTINCT FROM 'Verified'
     AND NEW.payment_id IS NULL THEN

    SELECT sr.status
    INTO v_request_status
    FROM public.service_requests sr
    WHERE sr.id = NEW.service_request_id;

    IF lower(coalesce(v_request_status, '')) = 'completed' THEN
      RAISE EXCEPTION 'This plan request has already been completed.';
    END IF;

    INSERT INTO public.payments (
      tenant_id,
      client_id,
      service_request_id,
      payment_id,
      receipt_number,
      amount_paid,
      payment_date,
      payment_method
    )
    VALUES (
      NEW.tenant_id,
      NEW.client_id,
      NEW.service_request_id,
      'PS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
      'RCPT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
      NEW.amount_claimed,
      NEW.payment_date,
      NEW.payment_method
    )
    RETURNING id INTO v_payment_id;

    NEW.payment_id := v_payment_id;
    NEW.reviewed_at := coalesce(NEW.reviewed_at, now());
    NEW.reviewed_by := coalesce(NEW.reviewed_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.payments_plan_activation_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.service_request_id IS NOT NULL THEN
    PERFORM public.try_activate_plan_from_payment_request(
      NEW.service_request_id
    );
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.pending_billing_reminders()
 RETURNS TABLE(billing_id uuid, kind text, customer_name text, customer_email text, amount numeric, due_date date, bill_ref text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from (
    select
      b.id as billing_id,
      case
        when b.due_date = current_date + 5 then 'due5'
        when b.due_date = current_date then 'due0'
        when b.due_date = current_date - 1 then 'late1'
        when b.due_date = current_date - 7 then 'late7'
      end as kind,
      c.customer_name, c.email as customer_email,
      coalesce(b.final_amount, b.amount_due, b.original_amount, 0) as amount,
      b.due_date, b.bill_id as bill_ref
    from public.billing b
    join public.clients c on c.id = b.client_id
    where lower(coalesce(b.status, '')) in ('unpaid', 'partially paid', 'overdue', 'pending')
      and c.email is not null
  ) r
  where r.kind is not null
    and not exists (
      select 1 from public.billing_reminders_sent s where s.billing_id = r.billing_id and s.kind = r.kind
    );
$function$
;
CREATE OR REPLACE FUNCTION public.plan_application_cancelled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if lower(coalesce(NEW.status, '')) in ('cancelled', 'canceled')
     and lower(coalesce(OLD.status, '')) not in ('cancelled', 'canceled') then
    update public.payment_submissions
    set status = 'Rejected', reviewed_at = now(), reject_reason = 'Withdrawn by customer'
    where service_request_id = NEW.id and status = 'Pending';
  end if;
  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.plan_application_to_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.request_type = 'plan_change'
     and NEW.client_id is not null
     and coalesce(NEW.requested_amount, 0) > 0
     and NEW.payment_method in ('GCash', 'Bank Transfer', 'Cash') then
    insert into public.payment_submissions (
      client_id, user_id, service_request_id, amount_claimed, payment_method,
      reference_number, bank_name, payment_date, proof_path, status
    ) values (
      NEW.client_id, NEW.user_id, NEW.id, NEW.requested_amount, NEW.payment_method,
      NEW.payment_reference, NEW.bank_name, current_date, NEW.payment_proof_path, 'Pending'
    );
  end if;
  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.populate_service_request_referral()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    referrer public.clients%ROWTYPE;
BEGIN

    -- No referral code means no referral.
    IF NEW.referral_code IS NULL
       OR trim(NEW.referral_code) = '' THEN

        NEW.referral_code := NULL;
        NEW.referred_by_client_id := NULL;
        NEW.referred_by_client_name := NULL;

        RETURN NEW;
    END IF;


    -- Find the client who owns the referral code.
    SELECT *
    INTO referrer
    FROM public.clients
    WHERE upper(referral_code) =
          upper(trim(NEW.referral_code))
    LIMIT 1;


    -- Invalid referral code.
    IF referrer.id IS NULL THEN
        RAISE EXCEPTION
            'Invalid referral code.';
    END IF;


    -- Prevent self-referral.
    IF NEW.client_id IS NOT NULL
       AND referrer.id = NEW.client_id THEN

        RAISE EXCEPTION
            'You cannot use your own referral code.';
    END IF;


    -- Store the referral information permanently
    -- with the request.
    NEW.referral_code :=
        upper(trim(referrer.referral_code));

    NEW.referred_by_client_id :=
        referrer.id;

    NEW.referred_by_client_name :=
        referrer.customer_name;

    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.recalculate_billing_status(p_billing_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_amount_due numeric := 0;
    v_amount_paid numeric := 0;
    v_status text;
BEGIN
    /*
      Determine the authoritative amount for the bill.

      Priority:
      1. final_amount
      2. amount_due
      3. original_amount
      4. 0

      Unlike the previous version, a legitimate
      final_amount = 0 is preserved.
    */
    SELECT
        COALESCE(
            final_amount,
            amount_due,
            original_amount,
            0
        )
    INTO v_amount_due
    FROM public.billing
    WHERE id = p_billing_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Billing record % does not exist',
            p_billing_id;
    END IF;

    /*
      Sum all positive payments attached to this bill.
    */
    SELECT
        COALESCE(SUM(
            CASE
                WHEN amount_paid > 0 THEN amount_paid
                ELSE 0
            END
        ), 0)
    INTO v_amount_paid
    FROM public.payments
    WHERE billing_id = p_billing_id;

    /*
      Determine settlement state.
    */
    IF v_amount_due <= 0 THEN
        v_status := 'Paid';

    ELSIF v_amount_paid >= v_amount_due THEN
        v_status := 'Paid';

    ELSIF v_amount_paid > 0 THEN
        v_status := 'Partially Paid';

    ELSE
        v_status := 'Unpaid';
    END IF;

    /*
      Update only the calculated settlement fields.
      Historical billing amounts remain untouched.
    */
    UPDATE public.billing
    SET
        status = v_status,
        paid_at = CASE
            WHEN v_status = 'Paid'
            THEN COALESCE(paid_at, NOW())
            ELSE NULL
        END
    WHERE id = p_billing_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text DEFAULT 'android'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if coalesce(btrim(p_token), '') = '' then
    return;
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), coalesce(p_platform, 'android'), now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$function$
;
CREATE OR REPLACE FUNCTION public.reject_payment_submission_as(p_submission_id uuid, p_actor uuid, p_reason text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  sub public.payment_submissions%rowtype;
  cl public.clients%rowtype;
  req public.service_requests%rowtype;
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

  update public.payment_submissions
  set status = 'Rejected', reviewed_at = now(), reviewed_by = p_actor,
      reject_reason = btrim(p_reason), reject_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = sub.id;

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
    'status', 'Rejected',
    'amount', sub.amount_claimed,
    'plan', req.requested_plan,
    'customer_name', cl.customer_name,
    'customer_email', cl.email,
    'reference', sub.reference_number,
    'reason', btrim(p_reason),
    'note', nullif(btrim(coalesce(p_note, '')), '')
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.release_stale_jobs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer;
begin
  update public.repair_records
  set technician_user_id = null, status = 'Pending'
  where technician_user_id is not null
    and accepted_at is not null
    and accepted_at < now() - interval '24 hours'
    and lower(status) in ('assigned', 'accepted');
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.remove_job_crew_member(p_repair uuid, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.team_tenant();
  update public.repair_job_crew c
  set status = 'cancelled', responded_at = now()
  where c.repair_id = p_repair and c.user_id = p_user and c.status in ('pending', 'accepted')
    and exists (select 1 from public.repair_records r where r.id = p_repair and r.technician_user_id = auth.uid());
end;
$function$
;
CREATE OR REPLACE FUNCTION public.repair_record_status_to_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.service_request_id is not null and NEW.status is distinct from OLD.status then
    update public.service_requests set status = NEW.status where id = NEW.service_request_id;
  end if;
  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.repair_record_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name text;
  v_phone text;
  v_active int;
begin
  if OLD.technician_user_id is null and NEW.technician_user_id is not null then
    select count(*) into v_active
    from public.repair_records r
    where r.technician_user_id = NEW.technician_user_id
      and r.id <> NEW.id
      and lower(r.status) !~ '(complete|resolved|done|fixed|cancel)';

    if v_active >= 3 then
      raise exception 'You already have 3 active jobs. Finish one before accepting another.';
    end if;

    select full_name, mobile_number into v_name, v_phone
    from public.user_profiles where user_id = NEW.technician_user_id;

    NEW.accepted_at := now();
    NEW.technician := coalesce(NEW.technician, v_name, 'Technician');
    NEW.technician_phone := v_phone;
  elsif OLD.technician_user_id is not null and NEW.technician_user_id is null then
    NEW.accepted_at := null;
    NEW.technician := null;
    NEW.technician_phone := null;
  end if;
  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.repair_request_to_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.request_type = 'repair' and NEW.client_id is not null then
    insert into public.repair_records (client_id, repair_date, problem_description, status, service_request_id, job_type, latitude, longitude)
    values (
      NEW.client_id, current_date,
      btrim(coalesce(NEW.issue_type, 'Issue') || case when coalesce(btrim(NEW.description), '') <> '' then ': ' || btrim(NEW.description) else '' end),
      'Pending', NEW.id, 'repair', NEW.latitude, NEW.longitude
    );
  end if;
  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.request_job_crew(p_repair uuid, p_users uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant uuid := public.team_tenant();
  r public.repair_records%rowtype;
  v_user uuid;
  v_customer text;
  v_total int;
  v_new uuid[] := '{}';
begin
  select * into r from public.repair_records where id = p_repair;
  if r.id is null or r.technician_user_id is distinct from auth.uid() then
    raise exception 'Accept the job first, then choose who joins you.';
  end if;
  if lower(coalesce(r.status, '')) ~ '(complete|resolved|done|fixed|closed|cancel)' then
    raise exception 'That job is already finished.';
  end if;

  p_users := coalesce(p_users, '{}'::uuid[]);

  v_total := 1 + coalesce(array_length(p_users, 1), 0) + (
    select count(*) from public.repair_job_crew
    where repair_id = p_repair and status = 'accepted' and not (user_id = any (p_users))
  );
  if v_total > 10 then
    raise exception 'A job can have at most 10 technicians including you.';
  end if;

  foreach v_user in array p_users loop
    if v_user = auth.uid() then
      raise exception 'You are already on this job.';
    end if;
    if not exists (
      select 1 from public.tenant_users where user_id = v_user and tenant_id = v_tenant and role = 'technician'
    ) then
      raise exception 'That person is not a technician in your company.';
    end if;
    if public.tech_is_busy(v_user, p_repair) then
      raise exception '% is busy with another job.', public.team_person_name(v_user);
    end if;

    if not exists (
      select 1 from public.repair_job_crew where repair_id = p_repair and user_id = v_user and status in ('pending', 'accepted')
    ) then
      v_new := v_new || v_user;
    end if;

    insert into public.repair_job_crew (repair_id, user_id, added_by, status)
    values (p_repair, v_user, auth.uid(), 'pending')
    on conflict (repair_id, user_id) do update
      set status = case when public.repair_job_crew.status = 'accepted' then 'accepted' else 'pending' end,
          decline_reason = null,
          responded_at = case when public.repair_job_crew.status = 'accepted' then public.repair_job_crew.responded_at else null end,
          added_by = auth.uid();
  end loop;

  update public.repair_job_crew
  set status = 'cancelled', responded_at = now()
  where repair_id = p_repair and status = 'pending' and not (user_id = any (p_users));

  select customer_name into v_customer from public.clients where id = r.client_id;
  foreach v_user in array v_new loop
    perform public.team_push(
      v_user,
      'Help requested on a job',
      public.team_person_name(auth.uid()) || ' wants you on ' ||
        case when r.job_type = 'installation' then 'an installation' else 'a repair' end ||
        coalesce(' for ' || split_part(v_customer, ' ', 1), '') || '. Open Crew requests to accept or decline.'
    );
  end loop;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.request_referral_withdrawal(p_amount numeric, p_method text, p_account_name text, p_account_number text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.resolve_referral_code(input_code text)
 RETURNS TABLE(client_id uuid, customer_name text, referral_code text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT
        c.id,
        c.customer_name,
        c.referral_code
    FROM public.clients c
    WHERE upper(c.referral_code) =
          upper(trim(input_code))
    LIMIT 1;
$function$
;
CREATE OR REPLACE FUNCTION public.respond_job_crew(p_repair uuid, p_accept boolean, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.repair_job_crew%rowtype;
  r public.repair_records%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.team_tenant();

  select * into v_row from public.repair_job_crew
  where repair_id = p_repair and user_id = auth.uid() and status = 'pending'
  for update;
  if v_row.repair_id is null then
    raise exception 'That request is no longer open.';
  end if;
  select * into r from public.repair_records where id = p_repair;

  if p_accept then
    if public.tech_is_busy(auth.uid(), p_repair) then
      raise exception 'You are busy with another job. Finish it first.';
    end if;
    update public.repair_job_crew set status = 'accepted', responded_at = now()
    where repair_id = p_repair and user_id = auth.uid();

    perform public.team_push(r.technician_user_id, 'Request accepted',
      public.team_person_name(auth.uid()) || ' joined your job.');
  else
    if v_reason is null or char_length(v_reason) < 3 then
      raise exception 'Please tell them why you are declining.';
    end if;
    update public.repair_job_crew
    set status = 'declined', decline_reason = left(v_reason, 200), responded_at = now()
    where repair_id = p_repair and user_id = auth.uid();

    perform public.team_push(r.technician_user_id, 'Request declined',
      public.team_person_name(auth.uid()) || ' declined: ' || left(v_reason, 120));
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.review_rating(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.ratings where id = p_id;
  if v_tenant is null or not public.is_payment_staff(v_tenant) then
    raise exception 'Not allowed.';
  end if;
  update public.ratings
  set reviewed_at = coalesce(reviewed_at, now()), reviewed_by = coalesce(reviewed_by, auth.uid())
  where id = p_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.run_billing_automation(p_flag_after_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_generated integer := 0;
  v_overdue integer := 0;
  v_flagged integer := 0;
  v_unflagged integer := 0;
  v_released integer := 0;
begin
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
  ), ins as (
    insert into public.billing (
      tenant_id, client_id, bill_id, status, bill_type, bill_date, due_date,
      amount_due, original_amount, final_amount, billing_cycle,
      billing_period_start, billing_period_end
    )
    select
      d.tenant_id, d.client_id,
      'BILL-' || to_char(d.cycle_start, 'YYYYMM') || '-' || upper(substr(replace(d.client_id::text, '-', ''), 1, 6)),
      'Unpaid', 'Monthly', d.cycle_start, (d.cycle_start + 7),
      d.price, d.price, d.price, 'Monthly',
      d.cycle_start, (d.cycle_start + interval '1 month' - interval '1 day')::date
    from due_cycles d
    join public.clients c on c.id = d.client_id
    where d.cycle_start > c.install_date
      and not exists (
        select 1 from public.billing b
        where b.client_id = d.client_id and b.billing_period_start = d.cycle_start
      )
    returning 1
  )
  select count(*) into v_generated from ins;

  update public.billing
  set status = 'Overdue'
  where lower(coalesce(status, '')) in ('unpaid', 'partially paid', 'pending')
    and due_date is not null
    and due_date < current_date;
  get diagnostics v_overdue = row_count;

  update public.clients c
  set disconnection_flag = true, disconnection_flagged_at = now()
  where c.disconnection_flag = false
    and exists (
      select 1 from public.billing b
      where b.client_id = c.id
        and lower(coalesce(b.status, '')) = 'overdue'
        and b.due_date < current_date - p_flag_after_days
    );
  get diagnostics v_flagged = row_count;

  update public.clients c
  set disconnection_flag = false, disconnection_flagged_at = null
  where c.disconnection_flag = true
    and not exists (
      select 1 from public.billing b
      where b.client_id = c.id
        and lower(coalesce(b.status, '')) = 'overdue'
        and b.due_date < current_date - p_flag_after_days
    );
  get diagnostics v_unflagged = row_count;

  v_released := public.release_stale_jobs();

  return jsonb_build_object(
    'generated', v_generated, 'overdue', v_overdue,
    'flagged', v_flagged, 'unflagged', v_unflagged, 'released_jobs', v_released
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.schedule_plan_after_verified_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.service_request_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- The authoritative activation workflow handles
    -- payment verification, plan activation, and completion.
    PERFORM public.try_activate_plan_from_payment_request(
        NEW.service_request_id
    );

    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_my_location_pin(p_lat double precision, p_lon double precision)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_client uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if p_lat is null or p_lon is null or p_lat not between 4 and 22 or p_lon not between 116 and 128 then
    raise exception 'That location is not in the Philippines.';
  end if;

  select id into v_client from public.clients where user_id = auth.uid() limit 1;
  if v_client is null then
    raise exception 'Your customer account could not be found.';
  end if;

  update public.clients set latitude = p_lat, longitude = p_lon where id = v_client;

  update public.repair_records
  set latitude = p_lat, longitude = p_lon
  where client_id = v_client
    and lower(coalesce(status, '')) !~ '(complete|resolved|done|fixed|closed|cancel)';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_payment_submission_tenant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT c.tenant_id
  INTO v_tenant_id
  FROM public.clients c
  WHERE c.id = NEW.client_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Customer account does not have a tenant.';
  END IF;

  NEW.tenant_id := v_tenant_id;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_user_profiles_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.updated_at = now(); return new; end; $function$
;
CREATE OR REPLACE FUNCTION public.snapshot_plan_change_amount()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_plan_price numeric;
BEGIN
    /*
      Only plan-change requests need a requested amount.
      Other service request types are left untouched.
    */
    IF NEW.request_type <> 'plan_change' THEN
        RETURN NEW;
    END IF;

    /*
      Do not overwrite an amount that was explicitly supplied.
      This preserves the original transaction amount once
      a request has been created.
    */
    IF NEW.requested_amount IS NOT NULL THEN
        RETURN NEW;
    END IF;

    /*
      A plan-change request without a requested plan cannot
      have its amount determined.
    */
    IF NEW.requested_plan IS NULL
       OR trim(NEW.requested_plan) = '' THEN
        RETURN NEW;
    END IF;

    /*
      Resolve the plan using the customer's tenant.

      This prevents accidentally using a plan with the same
      name belonging to another tenant.
    */
    SELECT ip.price
    INTO v_plan_price
    FROM public.internet_plans ip
    JOIN public.clients c
      ON c.id = NEW.client_id
    WHERE ip.plan_name = trim(NEW.requested_plan)
      AND ip.tenant_id = c.tenant_id
      AND ip.active = true
    ORDER BY ip.id
    LIMIT 1;

    /*
      If the plan does not exist in the customer's tenant,
      fail closed instead of creating a request with an
      unknown payment requirement.
    */
    IF v_plan_price IS NULL THEN
        RAISE EXCEPTION
            'Cannot determine price for requested plan "%".',
            NEW.requested_plan;
    END IF;

    /*
      Snapshot the current catalog price into the request.
    */
    NEW.requested_amount := v_plan_price;

    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.submit_plan_purchase(p_client_id uuid, p_requested_plan text, p_amount numeric, p_payment_mode text, p_payment_method text, p_reference_number text DEFAULT NULL::text, p_bank_name text DEFAULT NULL::text, p_bank_account_name text DEFAULT NULL::text, p_bank_account_number text DEFAULT NULL::text, p_gcash_mobile text DEFAULT NULL::text, p_payment_date date DEFAULT CURRENT_DATE, p_payment_proof_path text DEFAULT NULL::text, p_replace_service_request_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_tenant_id uuid;
    v_current_plan text;
    v_plan_price numeric;
    v_plan_count integer;
    v_effective_at timestamptz;
    v_request_id uuid;
    v_old_status text;
BEGIN

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'You must be signed in.';
    END IF;


    -- ========================================================
    -- CUSTOMER OWNERSHIP
    -- ========================================================

    SELECT
        c.tenant_id,
        c.plan_name
    INTO
        v_tenant_id,
        v_current_plan
    FROM public.clients c
    WHERE c.id = p_client_id
      AND c.user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer account not found.';
    END IF;


    -- ========================================================
    -- DYNAMIC PLAN CATALOG
    --
    -- Price MUST come from internet_plans for this tenant.
    -- Only active plans are purchasable.
    -- ========================================================

    SELECT
        COUNT(*),
        MIN(ip.price)
    INTO
        v_plan_count,
        v_plan_price
    FROM public.internet_plans ip
    WHERE ip.tenant_id = v_tenant_id
      AND ip.plan_name = p_requested_plan
      AND ip.active = true;

    IF v_plan_count = 0 THEN
        RAISE EXCEPTION 'Selected plan is not available.';
    END IF;

    IF v_plan_count > 1 THEN
        RAISE EXCEPTION
            'Multiple active plans with the same name exist for this tenant.';
    END IF;

    IF v_plan_price IS NULL THEN
        RAISE EXCEPTION 'Selected plan does not have a valid price.';
    END IF;


    -- ========================================================
    -- SERVER-SIDE AMOUNT VALIDATION
    -- ========================================================

    IF p_amount IS NULL
       OR p_amount <> v_plan_price THEN
        RAISE EXCEPTION
            'Payment amount does not match the selected plan.';
    END IF;


    -- ========================================================
    -- PREVENT SAME PLAN PURCHASE
    -- ========================================================

    IF v_current_plan IS NOT NULL
       AND btrim(v_current_plan) = p_requested_plan THEN

        RAISE EXCEPTION
            'This is already your current plan.';

    END IF;


    -- ========================================================
    -- PAYMENT METHOD VALIDATION
    -- ========================================================

    IF p_payment_method NOT IN (
        'GCash',
        'Bank Transfer',
        'Cash'
    ) THEN
        RAISE EXCEPTION
            'Unsupported payment method.';
    END IF;


    -- ========================================================
    -- PAYMENT MODE VALIDATION
    -- ========================================================

    IF p_payment_mode NOT IN (
        'Manual',
        'Automatic'
    ) THEN
        RAISE EXCEPTION
            'Unsupported payment mode.';
    END IF;


    IF p_payment_method = 'Cash'
       AND p_payment_mode = 'Automatic' THEN

        RAISE EXCEPTION
            'Cash payments must be manual.';

    END IF;


    -- ========================================================
    -- MANUAL REFERENCE
    -- ========================================================

    IF p_payment_mode = 'Manual'
       AND p_payment_method <> 'Cash'
       AND NULLIF(btrim(p_reference_number), '') IS NULL THEN

        RAISE EXCEPTION
            'Manual GCash and bank payments require a transaction reference.';

    END IF;


    -- ========================================================
    -- MANUAL PROOF
    -- ========================================================

    IF p_payment_mode = 'Manual'
       AND NULLIF(btrim(p_payment_proof_path), '') IS NULL THEN

        RAISE EXCEPTION
            'Manual payments require transaction proof.';

    END IF;


    -- ========================================================
    -- GCASH VALIDATION
    -- ========================================================

    IF p_payment_method = 'GCash'
       AND NULLIF(btrim(p_gcash_mobile), '') IS NULL THEN

        RAISE EXCEPTION
            'GCash mobile number is required.';

    END IF;


    -- ========================================================
    -- BANK VALIDATION
    -- ========================================================

    IF p_payment_method = 'Bank Transfer'
       AND (
           NULLIF(btrim(p_bank_name), '') IS NULL
           OR NULLIF(btrim(p_bank_account_name), '') IS NULL
           OR NULLIF(btrim(p_bank_account_number), '') IS NULL
       ) THEN

        RAISE EXCEPTION
            'Bank name, account name, and account number are required.';

    END IF;


    -- ========================================================
    -- REPLACE EXISTING PENDING PLAN CHANGE
    -- ========================================================

    IF p_replace_service_request_id IS NOT NULL THEN

        SELECT status
        INTO v_old_status
        FROM public.service_requests
        WHERE id = p_replace_service_request_id
          AND client_id = p_client_id
          AND request_type = 'plan_change';

        IF v_old_status IS NULL THEN
            RAISE EXCEPTION
                'The previous scheduled plan change could not be found.';
        END IF;

        IF lower(v_old_status) IN (
            'scheduled',
            'verified',
            'paid',
            'completed'
        ) THEN

            RAISE EXCEPTION
                'The existing paid plan change cannot be replaced. Remove it first or wait for it to take effect.';

        END IF;

        UPDATE public.service_requests
        SET
            status = 'Cancelled',
            updated_at = now()
        WHERE id = p_replace_service_request_id;

    END IF;


    -- ========================================================
    -- EFFECTIVE DATE
    --
    -- Plan changes take effect after the current billing
    -- period unless the current period has already ended.
    -- ========================================================

    SELECT
        max(b.billing_period_end)::timestamptz
    INTO v_effective_at
    FROM public.billing b
    WHERE b.client_id = p_client_id
      AND COALESCE(lower(b.status), '')
          NOT IN ('cancelled', 'void')
      AND b.billing_period_end IS NOT NULL;


    IF v_current_plan IS NOT NULL
       AND v_effective_at IS NULL THEN

        RAISE EXCEPTION
            'Your current billing period has no end date. Please contact Accounting before scheduling a plan change.';

    END IF;


    IF v_effective_at IS NULL
       OR v_effective_at < now() THEN

        v_effective_at := now();

    END IF;


    -- ========================================================
    -- CREATE PLAN CHANGE REQUEST
    -- ========================================================

    INSERT INTO public.service_requests (
        user_id,
        client_id,
        request_type,
        requested_plan,
        requested_amount,
        description,
        status,
        created_at,
        updated_at,
        effective_at,
        payment_mode,
        payment_method,
        payment_reference,
        bank_name,
        bank_account_name,
        bank_account_number,
        gcash_mobile,
        payment_proof_path
    )
    VALUES (
        v_user_id,
        p_client_id,
        'plan_change',
        p_requested_plan,
        v_plan_price,
        format(
            'Customer scheduled %s plan change from %s. Current plan remains active until the current billing period ends.',
            p_requested_plan,
            COALESCE(v_current_plan, 'No current plan')
        ),
        'Payment Pending',
        now(),
        now(),
        v_effective_at,
        p_payment_mode,
        p_payment_method,
        NULLIF(btrim(p_reference_number), ''),
        NULLIF(btrim(p_bank_name), ''),
        NULLIF(btrim(p_bank_account_name), ''),
        NULLIF(btrim(p_bank_account_number), ''),
        NULLIF(btrim(p_gcash_mobile), ''),
        NULLIF(btrim(p_payment_proof_path), '')
    )
    RETURNING id
    INTO v_request_id;


    -- ========================================================
    -- AUTOMATIC PAYMENT ENROLLMENT
    -- ========================================================

    IF p_payment_mode = 'Automatic' THEN

        INSERT INTO public.auto_pay_enrollments (
            tenant_id,
            client_id,
            user_id,
            payment_method,
            gcash_mobile,
            bank_name,
            bank_account_name,
            bank_account_number,
            status
        )
        VALUES (
            v_tenant_id,
            p_client_id,
            v_user_id,
            p_payment_method,
            NULLIF(btrim(p_gcash_mobile), ''),
            NULLIF(btrim(p_bank_name), ''),
            NULLIF(btrim(p_bank_account_name), ''),
            NULLIF(btrim(p_bank_account_number), ''),
            'Setup Pending'
        );

    END IF;


    RETURN v_request_id;

END;
$function$
;
CREATE OR REPLACE FUNCTION public.submit_rating(p_kind text, p_repair_id uuid, p_stars integer, p_comment text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_client public.clients%rowtype;
  v_repair public.repair_records%rowtype;
  v_id uuid;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;
  if p_kind not in ('technician', 'service') then
    raise exception 'Unknown rating type.';
  end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'Please choose 1 to 5 stars.';
  end if;
  if v_comment is not null and char_length(v_comment) > 500 then
    raise exception 'Please keep your comment under 500 characters.';
  end if;

  select * into v_client from public.clients where user_id = v_uid limit 1;
  if not found then
    raise exception 'Customer account not found.';
  end if;

  if p_kind = 'technician' then
    select * into v_repair from public.repair_records
    where id = p_repair_id and client_id = v_client.id;
    if not found then
      raise exception 'That job could not be found.';
    end if;
    if lower(coalesce(v_repair.status, '')) !~ '(complete|resolved|done|fixed)' then
      raise exception 'You can rate a job once it is completed.';
    end if;
    if exists (select 1 from public.ratings where repair_record_id = v_repair.id and user_id = v_uid) then
      raise exception 'You already rated this job. Thank you!';
    end if;
  else
    if exists (
      select 1 from public.ratings
      where user_id = v_uid and kind = 'service' and created_at > now() - interval '7 days'
    ) then
      raise exception 'You already rated our service this week. Thank you!';
    end if;
  end if;

  insert into public.ratings (
    tenant_id, client_id, user_id, kind, repair_record_id,
    technician_user_id, technician_name, stars, comment
  ) values (
    v_client.tenant_id, v_client.id, v_uid, p_kind,
    case when p_kind = 'technician' then v_repair.id end,
    case when p_kind = 'technician' then v_repair.technician_user_id end,
    case when p_kind = 'technician' then v_repair.technician end,
    p_stars, v_comment
  )
  returning id into v_id;

  return v_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_billing_status_from_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.billing_id IS NOT NULL THEN
        PERFORM public.recalculate_billing_status(NEW.billing_id);
    END IF;

    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.team_person_name(p_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(nullif(btrim(up.full_name), ''), split_part(coalesce(u.email, ''), '@', 1))
  from auth.users u
  left join public.user_profiles up on up.user_id = u.id
  where u.id = p_user;
$function$
;
CREATE OR REPLACE FUNCTION public.team_push(p_user uuid, p_title text, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_secret text;
begin
  select secret into v_secret from public.push_config limit 1;
  perform net.http_post(
    url := 'https://ylqmsghxihtzbaqgkyxi.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('user_id', p_user, 'title', p_title, 'body', p_body)
  );
exception when others then
  null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.team_tenant()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select tenant_id into v from public.tenant_users
  where user_id = auth.uid() and role = 'technician' limit 1;
  if v is null then
    raise exception 'Only technicians can use teams.';
  end if;
  return v;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.tech_directory()
 RETURNS TABLE(user_id uuid, full_name text, employee_number text, status text, job_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tenant uuid := public.team_tenant();
begin
  return query
  select tu.user_id,
         coalesce(nullif(btrim(up.full_name), ''), split_part(coalesce(u.email, ''), '@', 1)),
         up.employee_number,
         case when public.tech_is_busy(tu.user_id) then 'busy' else 'available' end,
         (select r.job_type from public.repair_records r
          where lower(coalesce(r.status, '')) !~ '(complete|resolved|done|fixed|closed|cancel)'
            and (r.technician_user_id = tu.user_id
                 or exists (select 1 from public.repair_job_crew c
                            where c.repair_id = r.id and c.user_id = tu.user_id and c.status = 'accepted'))
          order by r.created_at desc limit 1)
  from public.tenant_users tu
  join auth.users u on u.id = tu.user_id
  left join public.user_profiles up on up.user_id = tu.user_id
  where tu.tenant_id = v_tenant
    and tu.role = 'technician'
    and tu.user_id <> auth.uid()
  order by 4, 2;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.tech_is_busy(p_user uuid, p_except uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.repair_records r
    where r.id is distinct from p_except
      and lower(coalesce(r.status, '')) !~ '(complete|resolved|done|fixed|closed|cancel)'
      and (r.technician_user_id = p_user
           or exists (
             select 1 from public.repair_job_crew c
             where c.repair_id = r.id and c.user_id = p_user and c.status = 'accepted'
           ))
  );
$function$
;
CREATE OR REPLACE FUNCTION public.try_activate_plan_from_payment_request(p_service_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
    v_request public.service_requests%ROWTYPE;
    v_plan_id uuid;
    v_service public.client_services%ROWTYPE;
    v_total_paid numeric := 0;

BEGIN

    /*
      Lock the request so concurrent payment events
      cannot process it twice.
    */
    SELECT *
    INTO v_request
    FROM public.service_requests
    WHERE id = p_service_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN;
    END IF;


    /*
      Only plan-change requests belong here.
    */
    IF COALESCE(v_request.request_type, '') <> 'plan_change' THEN
        RETURN;
    END IF;


    /*
      Completed/cancelled requests must never be
      activated again.
    */
    IF lower(COALESCE(v_request.status, '')) IN
       ('completed', 'cancelled', 'canceled') THEN
        RETURN;
    END IF;


    /*
      Valid plan-change request must have a plan
      and a positive amount.
    */
    IF v_request.requested_plan IS NULL
       OR v_request.requested_amount IS NULL
       OR v_request.requested_amount <= 0 THEN
        RETURN;
    END IF;


    /*
      Resolve the requested plan inside the
      customer's tenant.
    */
    SELECT ip.id
    INTO v_plan_id
    FROM public.internet_plans ip
    WHERE ip.tenant_id = (
        SELECT c.tenant_id
        FROM public.clients c
        WHERE c.id = v_request.client_id
    )
      AND ip.plan_name = v_request.requested_plan
      AND ip.active = true
    LIMIT 1;


    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION
            'Requested plan "%" was not found or is inactive',
            v_request.requested_plan;
    END IF;


    /*
      payments uses amount_paid.
    */
    SELECT
        COALESCE(
            SUM(
                CASE
                    WHEN p.amount_paid > 0
                    THEN p.amount_paid
                    ELSE 0
                END
            ),
            0
        )
    INTO v_total_paid
    FROM public.payments p
    WHERE p.service_request_id = p_service_request_id;


    /*
      Not fully paid yet.
    */
    IF v_total_paid < v_request.requested_amount THEN
        RETURN;
    END IF;


    /*
      CRITICAL:

      If the request is fully paid but its effective
      date is still in the future, schedule it instead
      of activating it immediately.
    */
    IF v_request.effective_at IS NOT NULL
       AND v_request.effective_at > now() THEN

        UPDATE public.service_requests
        SET
            status = 'Scheduled',
            updated_at = now()
        WHERE id = p_service_request_id
          AND lower(COALESCE(status, '')) NOT IN
              ('completed', 'cancelled', 'canceled');

        RETURN;
    END IF;


    /*
      Effective date has arrived.

      Find latest service.
    */
    SELECT *
    INTO v_service
    FROM public.client_services cs
    WHERE cs.client_id = v_request.client_id
    ORDER BY cs.created_at DESC
    LIMIT 1
    FOR UPDATE;


    IF NOT FOUND THEN
        RAISE EXCEPTION
            'No client service found for client %',
            v_request.client_id;
    END IF;


    /*
      Activate requested plan.
    */
    UPDATE public.client_services
    SET
        plan_id = v_plan_id,
        status = 'active',
        started_at = COALESCE(started_at, now()),
        ended_at = NULL,
        updated_at = now()
    WHERE id = v_service.id;


    /*
      Synchronize legacy client-level plan field.

      clients does NOT have updated_at.
    */
    UPDATE public.clients
    SET
        plan_name = v_request.requested_plan
    WHERE id = v_request.client_id;


    /*
      Mark request completed.
    */
    UPDATE public.service_requests
    SET
        status = 'Completed',
        updated_at = now()
    WHERE id = p_service_request_id;

END;

$function$
;
CREATE OR REPLACE FUNCTION public.update_my_mobile(p_mobile text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_clean text;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  v_clean := regexp_replace(coalesce(p_mobile, ''), '[\s-]', '', 'g');
  if v_clean ~ '^\+63' then
    v_clean := '0' || substr(v_clean, 4);
  end if;
  if v_clean !~ '^09[0-9]{9}$' then
    raise exception 'Enter a valid mobile number, like 09123456789.';
  end if;

  update public.user_profiles set mobile_number = v_clean, updated_at = now() where user_id = v_uid;
  update public.clients set mobile_number = v_clean where user_id = v_uid;

  return v_clean;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.update_payment_submission_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_service_request_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.user_has_tenant_access(target_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT
        public.user_is_global_admin()
        OR EXISTS (
            SELECT 1
            FROM public.tenant_users tu
            WHERE tu.user_id = auth.uid()
              AND tu.tenant_id = target_tenant_id
        );
$function$
;
CREATE OR REPLACE FUNCTION public.user_is_global_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.tenant_users tu
        WHERE tu.user_id = auth.uid()
          AND lower(coalesce(tu.role, '')) = 'admin'
    );
$function$
;
CREATE OR REPLACE FUNCTION public.user_profile_creates_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.create_customer_client(NEW.user_id);
  return NEW;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_user_profile_location()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.barangay_code is not null and new.city_municipality_code is not null and not exists (
    select 1 from public.ph_locations b where b.code = new.barangay_code and b.location_type='barangay' and b.parent_code=new.city_municipality_code
  ) then raise exception 'Barangay does not belong to selected city/municipality'; end if;
  if new.city_municipality_code is not null and new.province_code is not null and not exists (
    select 1 from public.ph_locations c where c.code = new.city_municipality_code and c.location_type='city_municipality' and c.parent_code=new.province_code
  ) then raise exception 'City/municipality does not belong to selected province'; end if;
  if new.province_code is not null and new.region_code is not null and not exists (
    select 1 from public.ph_locations p where p.code = new.province_code and p.location_type='province' and p.parent_code=new.region_code
  ) then raise exception 'Province does not belong to selected region'; end if;
  return new;
end; $function$
;
CREATE OR REPLACE FUNCTION public.verify_payment_submission_as(p_submission_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
