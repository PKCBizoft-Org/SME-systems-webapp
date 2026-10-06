-- G1_P750 becomes the minimum plan; G1_P1250 is not offered.
-- The mobile app offers G1_P750 / G1_P1000 / G1_P1500 / G1_P2000.
-- internet_plans had 500 / 1000 / 1500 / 2000 only (no 750) for this tenant.

insert into public.internet_plans (tenant_id, plan_name, price, speed, active)
select '4eefc34f-5475-4c54-886b-9d833ef3997a', 'G1_P750', 750, '750 Mbps', true
where not exists (
  select 1 from public.internet_plans p
  where p.tenant_id = '4eefc34f-5475-4c54-886b-9d833ef3997a'
    and p.plan_name = 'G1_P750'
);

-- Stop offering G1_P500 to new purchases. Existing clients on G1_P500 keep their plan.
update public.internet_plans
set active = false
where tenant_id = '4eefc34f-5475-4c54-886b-9d833ef3997a'
  and plan_name in ('G1_P500', 'G1_P1250');
