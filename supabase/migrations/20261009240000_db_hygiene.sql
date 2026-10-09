-- ============================================================================
-- Database hygiene from the Supabase advisors and an access review
--
--  * Covering indexes for foreign keys; drop identical duplicate indexes.
--  * Row-level-security policies evaluate auth.uid() once per query instead of
--    once per row (same rules, faster at scale).
--  * The stock catalog view is read-only (signed-in users had write grants).
--  * Receipt photos: size/type limits, staff only see their own tenant's
--    receipts, and a customer can no longer delete the evidence they submitted.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Foreign-key indexes
-- ---------------------------------------------------------------------------
create index if not exists audit_log_client_id_idx on public.audit_log (client_id);
create index if not exists auto_pay_enrollments_client_id_idx on public.auto_pay_enrollments (client_id);
create index if not exists auto_pay_enrollments_user_id_idx on public.auto_pay_enrollments (user_id);
create index if not exists clients_referred_by_client_id_idx on public.clients (referred_by_client_id);
create index if not exists inventory_kit_items_item_id_idx on public.inventory_kit_items (item_id);
create index if not exists inventory_movements_replaced_item_id_idx on public.inventory_movements (replaced_item_id);
create index if not exists ratings_client_id_idx on public.ratings (client_id);
create index if not exists repair_job_crew_added_by_idx on public.repair_job_crew (added_by);
create index if not exists service_requests_referred_by_client_id_idx on public.service_requests (referred_by_client_id);
create index if not exists staff_email_verified_user_id_idx on public.staff_email_verified (user_id);

-- ---------------------------------------------------------------------------
-- 2. Identical duplicate indexes (the first of each pair stays)
-- ---------------------------------------------------------------------------
drop index if exists public.idx_client_site_photos_client_id;
drop index if exists public.idx_payments_service_request_id;
drop index if exists public.idx_repair_photos_repair_id;
drop index if exists public.idx_repair_records_client_id;
drop index if exists public.idx_service_requests_plan_change;

-- ---------------------------------------------------------------------------
-- 3. auth.uid() evaluated once per query, not once per row
--    Rewrites every public policy that still calls it bare. The rule each
--    policy enforces does not change; only how often the function runs.
-- ---------------------------------------------------------------------------
do $do$
declare
  p record;
  v_sql text;
  c_bare constant text := '(?<!SELECT )auth\.uid\(\)';
  c_wrapped constant text := '( SELECT auth.uid() AS uid)';
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ c_bare or coalesce(with_check, '') ~ c_bare)
  loop
    v_sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if coalesce(p.qual, '') ~ c_bare then
      v_sql := v_sql || format(' using (%s)', regexp_replace(p.qual, c_bare, c_wrapped, 'g'));
    end if;
    if coalesce(p.with_check, '') ~ c_bare then
      v_sql := v_sql || format(' with check (%s)', regexp_replace(p.with_check, c_bare, c_wrapped, 'g'));
    end if;
    execute v_sql;
  end loop;
end
$do$;

-- ---------------------------------------------------------------------------
-- 4. The stock catalog is for reading only
--    (the earlier migration revoked from public/anon but signed-in users kept
--    Supabase's default write privileges on this auto-updatable view)
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger on public.inventory_catalog from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Receipt photos
-- ---------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'payment-proofs';

-- Customers upload into their own folder (<user id>/<client id>/file) ...
drop policy if exists payment_proofs_customer_insert on storage.objects;
create policy payment_proofs_customer_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ... read only their own, while accounting/admin staff read the receipts of
-- customers in THEIR tenant (before, any accountant could read every tenant's).
drop policy if exists payment_proofs_customer_select on storage.objects;
create policy payment_proofs_customer_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.user_is_global_admin()
      or exists (
        select 1
        from public.clients c
        join public.tenant_users tu on tu.tenant_id = c.tenant_id
        where c.id::text = (storage.foldername(name))[2]
          and tu.user_id = (select auth.uid())
          and tu.role in ('admin', 'accounting')
      )
    )
  );

-- A submitted receipt is evidence; customers cannot delete it afterwards.
drop policy if exists payment_proofs_customer_delete on storage.objects;
