-- Accounting does not need the service status; it needs what repairs cost and
-- who is on the job. The service status summary is replaced by these two.
drop function if exists public.account_service_summary(uuid);

-- The technician who has (or last had) the customer's job, open jobs first.
create or replace function public.account_technician(p_client uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.is_billing_staff_of_client(p_client) then
    raise exception 'Only accounting or admin staff can see this.';
  end if;

  select coalesce(nullif(btrim(up.full_name), ''), nullif(btrim(r.technician), ''))
    into v_name
  from public.repair_records r
  left join public.user_profiles up on up.user_id = r.technician_user_id
  where r.client_id = p_client
    and (r.technician_user_id is not null or nullif(btrim(r.technician), '') is not null)
  order by (lower(r.status) !~ '(complete|resolved|done|fixed|cancel)') desc, r.created_at desc
  limit 1;

  return v_name;
end;
$$;

revoke execute on function public.account_technician(uuid) from public, anon;
grant execute on function public.account_technician(uuid) to authenticated;

-- What the materials used on this customer's jobs cost: one line per item
-- used (from the technician's truck or issued by the office), at the item's
-- unit cost. Returned items count as negative.
create or replace function public.account_repair_costs(p_client uuid)
returns table (
  used_at timestamptz,
  source text,
  repair_id uuid,
  job_type text,
  job_note text,
  item_name text,
  unit text,
  qty numeric,
  unit_cost numeric,
  line_cost numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_billing_staff_of_client(p_client) then
    raise exception 'Only accounting or admin staff can see this.';
  end if;

  return query
  select l.created_at, 'truck'::text, l.repair_id, coalesce(r.job_type, 'repair'), r.problem_description,
         i.name, i.unit, -l.change, coalesce(i.unit_cost, 0), -l.change * coalesce(i.unit_cost, 0)
  from public.truck_stock_log l
  join public.inventory_items i on i.id = l.item_id
  left join public.repair_records r on r.id = l.repair_id
  where l.client_id = p_client and l.kind = 'use'
  union all
  select m.created_at, 'office'::text, null::uuid, coalesce(m.job_type, 'installation'), coalesce(m.reference, m.notes),
         i.name, i.unit, -m.quantity_change, coalesce(i.unit_cost, 0), -m.quantity_change * coalesce(i.unit_cost, 0)
  from public.inventory_movements m
  join public.inventory_items i on i.id = m.item_id
  where m.client_id = p_client and m.movement_type in ('installation_use', 'return')
  order by 1 desc;
end;
$$;

revoke execute on function public.account_repair_costs(uuid) from public, anon;
grant execute on function public.account_repair_costs(uuid) to authenticated;
