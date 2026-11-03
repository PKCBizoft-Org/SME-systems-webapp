-- 2026-11-03: referral rewards paid to customers count as money going out in profit_summary().

create or replace function public.profit_summary(p_tenant uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_collected numeric; v_methods jsonb; v_expenses numeric; v_categories jsonb;
  v_stock numeric; v_used numeric; v_referrals numeric;
begin
  if not public.actor_is_payment_staff(auth.uid(), p_tenant) then
    raise exception 'Only accounting or admin staff can see this.';
  end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a valid date range.'; end if;

  select coalesce(sum(amount_paid), 0),
         coalesce(jsonb_object_agg(method, total) filter (where method is not null), '{}'::jsonb)
    into v_collected, v_methods
  from (
    select coalesce(payment_method, 'Other') as method, sum(amount_paid) as total, sum(amount_paid) as amount_paid
    from public.payments
    where tenant_id = p_tenant and payment_date between p_from and p_to
    group by 1
  ) m;

  select coalesce(sum(total), 0),
         coalesce(jsonb_object_agg(category, total) filter (where category is not null), '{}'::jsonb)
    into v_expenses, v_categories
  from (
    select category, sum(amount) as total from public.expenses
    where tenant_id = p_tenant and voided_at is null and expense_date between p_from and p_to
    group by 1
  ) e;

  -- Stock bought = stock received (stock_in) at its cost (current item cost for old rows).
  select coalesce(sum(m.quantity_change * coalesce(m.unit_cost, i.unit_cost, 0)), 0) into v_stock
  from public.inventory_movements m join public.inventory_items i on i.id = m.item_id
  where m.tenant_id = p_tenant and m.movement_type = 'stock_in'
    and (m.created_at at time zone 'Asia/Manila')::date between p_from and p_to;

  -- For information only (already paid for when bought): materials used on jobs.
  select coalesce(sum(-m.quantity_change * coalesce(m.unit_cost, i.unit_cost, 0)), 0) into v_used
  from public.inventory_movements m join public.inventory_items i on i.id = m.item_id
  where m.tenant_id = p_tenant and m.movement_type in ('installation_use', 'return')
    and (m.repair_id is not null or m.backbone_job_id is not null or m.client_id is not null)
    and (m.created_at at time zone 'Asia/Manila')::date between p_from and p_to;
  v_used := v_used + coalesce((
    select sum(-l.change * coalesce(i.unit_cost, 0))
    from public.truck_stock_log l join public.inventory_items i on i.id = l.item_id
    where l.tenant_id = p_tenant and l.kind = 'use'
      and (l.created_at at time zone 'Asia/Manila')::date between p_from and p_to), 0);

  -- Referral rewards paid out to customers are money going out too.
  select coalesce(sum(w.gross_amount), 0) into v_referrals
  from public.referral_withdrawals w join public.clients c on c.id = w.referrer_client_id
  where c.tenant_id = p_tenant and w.status = 'Paid'
    and (w.processed_at at time zone 'Asia/Manila')::date between p_from and p_to;

  return jsonb_build_object(
    'collected', v_collected, 'by_method', v_methods,
    'expenses', v_expenses, 'by_category', v_categories,
    'stock_bought', v_stock, 'materials_used', v_used,
    'referral_payouts', v_referrals,
    'profit', v_collected - v_expenses - v_stock - v_referrals);
end;
$$;
