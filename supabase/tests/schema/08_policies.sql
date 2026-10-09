create policy tenant_isolation_select on public.audit_log as permissive for select to public using (user_has_tenant_access(tenant_id));
create policy auto_pay_customer_select on public.auto_pay_enrollments as permissive for select to authenticated using ((user_id = auth.uid()));
create policy auto_pay_accounting_select on public.auto_pay_enrollments as permissive for select to public using (((user_has_tenant_access(tenant_id) AND (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.user_id = auth.uid()) AND (tu.tenant_id = auto_pay_enrollments.tenant_id) AND (tu.role = ANY (ARRAY['admin'::text, 'accounting'::text])))))) OR user_is_global_admin()));
create policy "customers can read own billing" on public.billing as permissive for select to authenticated using ((client_id IN ( SELECT c.id
   FROM clients c
  WHERE (c.user_id = auth.uid()))));
create policy tenant_isolation_select on public.billing as permissive for select to public using (user_has_tenant_access(tenant_id));
create policy client_services_select_tenant on public.client_services as permissive for select to authenticated using ((user_has_tenant_access(tenant_id) OR (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_services.client_id) AND (c.user_id = ( SELECT auth.uid() AS uid)))))));
create policy client_services_delete_staff on public.client_services as permissive for delete to authenticated using (user_has_tenant_access(tenant_id));
create policy client_services_insert_staff on public.client_services as permissive for insert to authenticated with check (user_has_tenant_access(tenant_id));
create policy client_services_update_staff on public.client_services as permissive for update to authenticated using (user_has_tenant_access(tenant_id)) with check (user_has_tenant_access(tenant_id));
create policy "users can insert own client" on public.clients as permissive for insert to authenticated with check ((user_id = auth.uid()));
create policy clients_admin_insert on public.clients as permissive for insert to public with check ((user_is_global_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.user_id = auth.uid()) AND (tu.tenant_id = clients.tenant_id) AND (tu.role = 'admin'::text))))));
create policy clients_select_tenant_isolation on public.clients as permissive for select to authenticated using (user_has_tenant_access(tenant_id));
create policy clients_admin_update on public.clients as permissive for update to public using ((user_is_global_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.user_id = auth.uid()) AND (tu.tenant_id = clients.tenant_id) AND (tu.role = 'admin'::text)))))) with check ((user_is_global_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.user_id = auth.uid()) AND (tu.tenant_id = clients.tenant_id) AND (tu.role = 'admin'::text))))));
create policy clients_technician_update on public.clients as permissive for update to authenticated using ((tenant_id IN ( SELECT tu.tenant_id
   FROM tenant_users tu
  WHERE ((tu.user_id = auth.uid()) AND (tu.role = 'technician'::text))))) with check ((tenant_id IN ( SELECT tu.tenant_id
   FROM tenant_users tu
  WHERE ((tu.user_id = auth.uid()) AND (tu.role = 'technician'::text)))));
create policy "customers can read own client" on public.clients as permissive for select to authenticated using ((user_id = auth.uid()));
create policy "customers can update own client" on public.clients as permissive for update to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy payment_submissions_customer_select on public.payment_submissions as permissive for select to authenticated using ((user_id = auth.uid()));
create policy payment_submissions_customer_insert on public.payment_submissions as permissive for insert to authenticated with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = payment_submissions.client_id) AND (c.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM service_requests sr
  WHERE ((sr.id = payment_submissions.service_request_id) AND (sr.client_id = payment_submissions.client_id) AND (sr.user_id = auth.uid()) AND (sr.request_type = 'plan_change'::text))))));
create policy payment_submissions_staff_select on public.payment_submissions as permissive for select to public using ((user_is_global_admin() OR (EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.user_id = auth.uid()) AND (tu.tenant_id = payment_submissions.tenant_id) AND (tu.role = ANY (ARRAY['admin'::text, 'accounting'::text])))))));
create policy tenant_isolation_select on public.payments as permissive for select to public using (user_has_tenant_access(tenant_id));
create policy "customers can read own payments" on public.payments as permissive for select to authenticated using ((client_id IN ( SELECT c.id
   FROM clients c
  WHERE (c.user_id = auth.uid()))));
create policy "customers can view own referral rewards" on public.referral_rewards as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = referral_rewards.referrer_client_id) AND (c.user_id = auth.uid())))));
create policy "customers can view own referral withdrawals" on public.referral_withdrawals as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = referral_withdrawals.referrer_client_id) AND (c.user_id = auth.uid())))));
create policy "payment staff can view referrals" on public.referrals as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = referrals.referrer_client_id) AND is_payment_staff(c.tenant_id)))));
create policy "referrers can view own referrals" on public.referrals as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = referrals.referrer_client_id) AND (c.user_id = auth.uid())))));
create policy "technicians can update assigned repairs" on public.repair_records as permissive for update to authenticated using ((technician_user_id = auth.uid())) with check ((technician_user_id = auth.uid()));
create policy "crew can read assigned repairs" on public.repair_records as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM repair_job_crew c
  WHERE ((c.repair_id = repair_records.id) AND (c.user_id = auth.uid()) AND (c.status = 'accepted'::text)))));
create policy "customers can read own repairs" on public.repair_records as permissive for select to authenticated using ((client_id IN ( SELECT c.id
   FROM clients c
  WHERE (c.user_id = auth.uid()))));
create policy repair_records_admin_all on public.repair_records as permissive for all to public using ((user_is_global_admin() OR (EXISTS ( SELECT 1
   FROM (clients c
     JOIN tenant_users tu ON ((tu.tenant_id = c.tenant_id)))
  WHERE ((c.id = repair_records.client_id) AND (tu.user_id = auth.uid()) AND (tu.role = 'admin'::text)))))) with check ((user_is_global_admin() OR (EXISTS ( SELECT 1
   FROM (clients c
     JOIN tenant_users tu ON ((tu.tenant_id = c.tenant_id)))
  WHERE ((c.id = repair_records.client_id) AND (tu.user_id = auth.uid()) AND (tu.role = 'admin'::text))))));
create policy "technicians can accept open issues" on public.repair_records as permissive for update to authenticated using (((technician_user_id IS NULL) AND is_client_technician(client_id))) with check ((technician_user_id = auth.uid()));
create policy "technicians can read assigned repairs" on public.repair_records as permissive for select to authenticated using ((technician_user_id = auth.uid()));
create policy "technicians can see open issues" on public.repair_records as permissive for select to authenticated using (((technician_user_id IS NULL) AND is_client_technician(client_id)));
create policy "customers can update own service requests" on public.service_requests as permissive for update to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "customers can read own service requests" on public.service_requests as permissive for select to authenticated using ((user_id = auth.uid()));
create policy "customers can create own service requests" on public.service_requests as permissive for insert to authenticated with check ((user_id = auth.uid()));
create policy own_membership_select on public.tenant_users as permissive for select to public using (((user_id = auth.uid()) OR user_is_global_admin()));
create policy tenants_member_select on public.tenants as permissive for select to public using ((EXISTS ( SELECT 1
   FROM tenant_users tu
  WHERE ((tu.user_id = auth.uid()) AND (tu.tenant_id = tenants.id)))));
create policy tenants_global_admin_select on public.tenants as permissive for select to public using (user_is_global_admin());
