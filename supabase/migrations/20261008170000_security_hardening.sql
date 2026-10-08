-- Security hardening found by the 2026-10-08 audit.
-- (clients is already protected for customers by guard_technician_client_update.)

-- 1. Customers must not change their own role.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only direct API calls (PostgREST roles) are restricted; the service role,
  -- cron and SECURITY DEFINER functions run as other roles.
  if current_user in ('authenticated', 'anon')
     and NEW.role is distinct from OLD.role
     and not public.user_is_global_admin() then
    raise exception 'You cannot change your own role.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- 2. Customers may only add location details to their own service requests.
--    Status, amount, plan, payment fields, etc. change through the RPCs.
create or replace function public.guard_service_request_update()
returns trigger
language plpgsql
set search_path = public
as $$
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
$$;

drop trigger if exists service_request_customer_guard on public.service_requests;
create trigger service_request_customer_guard
  before update on public.service_requests
  for each row execute function public.guard_service_request_update();

-- 3. The anonymous role never writes to the database directly.
revoke insert, update, delete, truncate on all tables in schema public from anon;

-- 4. Trigger and internal functions are not part of the public API.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

revoke execute on function public.activate_due_scheduled_plan_changes() from public, anon, authenticated;
revoke execute on function public.generate_billing_for_service(uuid, date) from public, anon, authenticated;
revoke execute on function public.recalculate_billing_status(uuid) from public, anon, authenticated;
revoke execute on function public.try_activate_plan_from_payment_request(uuid) from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- 5. Customer-facing RPCs need a signed-in user.
revoke execute on function public.submit_plan_purchase(uuid, text, numeric, text, text, text, text, text, text, text, date, text, uuid) from public, anon;
revoke execute on function public.cancel_scheduled_plan_change(uuid) from public, anon;
revoke execute on function public.get_receipt(uuid) from public, anon;
revoke execute on function public.submit_rating(text, uuid, integer, text) from public, anon;
revoke execute on function public.review_rating(uuid) from public, anon;
revoke execute on function public.register_push_token(text, text) from public, anon;
revoke execute on function public.update_my_mobile(text) from public, anon;
revoke execute on function public.ensure_customer_client() from public, anon;

-- 6. Fixed search_path on the two functions that lacked one.
alter function public.generate_client_referral_code() set search_path = public;
alter function public.update_service_request_timestamp() set search_path = public;
