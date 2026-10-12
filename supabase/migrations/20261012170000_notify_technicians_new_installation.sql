-- When Accounting confirms a payment the installation job opens. Tell the
-- customer, and tell every technician of the company to get to work.
create or replace function public.notify_installation_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
  v_name text;
  v_area text;
  v_tech uuid;
begin
  if NEW.job_type = 'installation' then
    select user_id, customer_name, coalesce(nullif(btrim(area), ''), 'the customer''s address')
      into v_customer, v_name, v_area
    from public.clients where id = NEW.client_id;

    begin
      if v_customer is not null then
        perform public.team_push(
          v_customer,
          'Request sent to the technicians',
          'Your payment is confirmed and your installation request is now with our technicians. Please wait a short while for one to accept it.'
        );
      end if;
    exception when others then
      null;
    end;

    begin
      for v_tech in
        select tu.user_id
        from public.tenant_users tu
        join public.clients c on c.tenant_id = tu.tenant_id
        where c.id = NEW.client_id and tu.role = 'technician'
      loop
        perform public.team_push(
          v_tech,
          'New installation job',
          'Payment confirmed for ' || coalesce(v_name, 'a customer') || ' (' || v_area || '). Open Jobs to accept it.'
        );
      end loop;
    exception when others then
      null;
    end;
  end if;
  return NEW;
exception when others then
  return NEW;
end;
$$;
