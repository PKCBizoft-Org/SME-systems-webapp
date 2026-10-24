-- Mission control map: customer pins, active outages and the latest payments
-- for one staff tenant. Staff with the dispatch permission only.
create or replace function public.mission_control_map()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_tenant uuid;
  v_out jsonb;
begin
  select tu.tenant_id into v_tenant from public.tenant_users tu
  where tu.user_id = auth.uid() and public.has_permission(tu.tenant_id, 'dispatch')
  order by tu.tenant_id limit 1;
  if v_tenant is null then
    raise exception 'You do not have access to the map.';
  end if;

  with open_outages as (
    select o.id, o.title, o.areas, o.created_at
    from public.outages o
    where o.tenant_id = v_tenant and o.resolved_at is null
  )
  select jsonb_build_object(
    'customers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', public.short_person_name(c.customer_name),
        'lat', c.latitude,
        'lng', c.longitude,
        'area', c.area,
        'installation', c.installation_status,
        'account', c.account_status,
        'in_outage', exists (
          select 1 from open_outages o
          where coalesce(array_length(o.areas, 1), 0) = 0
             or exists (
               select 1 from unnest(o.areas) k
               where position(k in lower(coalesce(c.area, '') || ' ' || coalesce(c.address, ''))) > 0
             )
        )
      ))
      from public.clients c
      where c.tenant_id = v_tenant and c.latitude is not null and c.longitude is not null
    ), '[]'::jsonb),
    'unpinned', (
      select count(*) from public.clients c
      where c.tenant_id = v_tenant and (c.latitude is null or c.longitude is null)
    ),
    'outages', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'areas', o.areas, 'created_at', o.created_at)
                       order by o.created_at desc)
      from open_outages o
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'client_id', p.client_id, 'amount', p.amount_paid))
      from (
        select id, client_id, amount_paid from public.payments
        where tenant_id = v_tenant
        order by payment_date desc nulls last, receipt_number desc nulls last
        limit 30
      ) p
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.mission_control_map() from public, anon;
grant execute on function public.mission_control_map() to authenticated;
