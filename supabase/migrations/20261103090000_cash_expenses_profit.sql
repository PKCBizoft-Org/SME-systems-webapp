-- 2026-11-03: money going out, cash on hand, profit, truck usage, materials rule.
--  * expenses: what the business spends (fuel, salaries, rent ...), paid from Cash / GCash / Bank.
--  * cash_movements: cash deposited to the bank, withdrawn, or a count correction.
--  * cash_on_hand(): cash received (Cash payments) - cash spent - deposits (+ withdrawals, +/- corrections).
--  * inventory_movements.unit_cost: cost of the item at the time, so stock bought keeps its price.
--  * profit_summary(): collections - expenses - stock bought for a date range.
--  * job_materials_report(): now also lists materials used straight from a technician's truck.
--  * A technician can't close a customer job until the materials taken for it are declared
--    (same rule backbone jobs already had).
--  * Drops client_addresses, client_contacts, client_profiles (empty, nothing uses them).

-- ---------------------------------------------------------------- expenses
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  expense_date date not null default public.today_ph(),
  category text not null check (category in (
    'Fuel', 'Salaries', 'Rent', 'Electricity & water', 'Upstream internet',
    'Tools & equipment', 'Vehicle', 'Office', 'Other')),
  description text not null check (length(btrim(description)) between 1 and 300),
  amount numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  paid_from text not null check (paid_from in ('Cash', 'GCash', 'Bank')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text
);
create index if not exists expenses_tenant_date_idx on public.expenses (tenant_id, expense_date desc);

alter table public.expenses enable row level security;
revoke all on public.expenses from anon, authenticated;
grant select on public.expenses to authenticated;
drop policy if exists "payment staff read expenses" on public.expenses;
create policy "payment staff read expenses" on public.expenses
  for select to authenticated
  using (exists (
    select 1 from public.tenant_users tu
    where tu.user_id = (select auth.uid()) and tu.tenant_id = expenses.tenant_id
      and tu.role in ('admin', 'accounting')));

create or replace function public.add_expense(
  p_tenant uuid, p_date date, p_category text, p_description text, p_amount numeric, p_paid_from text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.actor_is_payment_staff(auth.uid(), p_tenant) then
    raise exception 'Only accounting or admin staff can record expenses.';
  end if;
  if p_date is null or p_date > public.today_ph() then raise exception 'The date can''t be in the future.'; end if;
  if p_date < public.today_ph() - 366 then raise exception 'The date is more than a year ago.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount above 0.'; end if;
  if round(p_amount, 2) <> p_amount then raise exception 'Use at most 2 decimal places.'; end if;
  insert into public.expenses (tenant_id, expense_date, category, description, amount, paid_from, created_by)
  values (p_tenant, p_date, p_category, btrim(coalesce(p_description, '')), p_amount, p_paid_from, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.void_expense(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare e public.expenses%rowtype;
begin
  select * into e from public.expenses where id = p_id for update;
  if not found or not public.actor_is_payment_staff(auth.uid(), e.tenant_id) then
    raise exception 'Expense not found.';
  end if;
  if e.voided_at is not null then raise exception 'This expense was already removed.'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Say why it is being removed.'; end if;
  update public.expenses set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason) where id = p_id;
end;
$$;

-- ---------------------------------------------------------------- cash movements
create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('deposit', 'withdrawal', 'correction')),
  -- Effect on cash in hand: deposit < 0, withdrawal > 0, correction either way.
  change numeric(12,2) not null check (change <> 0),
  moved_on date not null default public.today_ph(),
  note text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cash_movements_tenant_date_idx on public.cash_movements (tenant_id, moved_on desc);

alter table public.cash_movements enable row level security;
revoke all on public.cash_movements from anon, authenticated;
grant select on public.cash_movements to authenticated;
drop policy if exists "payment staff read cash movements" on public.cash_movements;
create policy "payment staff read cash movements" on public.cash_movements
  for select to authenticated
  using (exists (
    select 1 from public.tenant_users tu
    where tu.user_id = (select auth.uid()) and tu.tenant_id = cash_movements.tenant_id
      and tu.role in ('admin', 'accounting')));

create or replace function public.record_cash_movement(
  p_tenant uuid, p_kind text, p_amount numeric, p_date date, p_note text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_change numeric;
begin
  if not public.actor_is_payment_staff(auth.uid(), p_tenant) then
    raise exception 'Only accounting or admin staff can record cash.';
  end if;
  if p_amount is null or p_amount = 0 then raise exception 'Enter an amount.'; end if;
  if round(p_amount, 2) <> p_amount then raise exception 'Use at most 2 decimal places.'; end if;
  if p_date is null or p_date > public.today_ph() then raise exception 'The date can''t be in the future.'; end if;
  v_change := case p_kind
    when 'deposit' then -abs(p_amount)
    when 'withdrawal' then abs(p_amount)
    when 'correction' then p_amount
  end;
  if v_change is null then raise exception 'Unknown cash entry type.'; end if;
  if p_kind = 'correction' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Say why the cash count is being corrected.';
  end if;
  insert into public.cash_movements (tenant_id, kind, change, moved_on, note, created_by)
  values (p_tenant, p_kind, v_change, p_date, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Cash the business should be holding now, plus the latest entries behind it.
create or replace function public.cash_on_hand(p_tenant uuid, p_limit int default 60)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_in numeric; v_spent numeric; v_moves numeric; v_entries jsonb;
begin
  if not public.actor_is_payment_staff(auth.uid(), p_tenant) then
    raise exception 'Only accounting or admin staff can see this.';
  end if;
  select coalesce(sum(amount_paid), 0) into v_in from public.payments
   where tenant_id = p_tenant and payment_method = 'Cash';
  select coalesce(sum(amount), 0) into v_spent from public.expenses
   where tenant_id = p_tenant and paid_from = 'Cash' and voided_at is null;
  select coalesce(sum(change), 0) into v_moves from public.cash_movements where tenant_id = p_tenant;

  select coalesce(jsonb_agg(e order by e->>'on' desc, e->>'at' desc), '[]'::jsonb) into v_entries
  from (
    select x as e from (
      select jsonb_build_object('type', 'payment', 'on', p.payment_date, 'at', p.payment_date,
               'change', p.amount_paid,
               'text', coalesce(c.customer_name, 'Customer') || coalesce(' · ' || p.receipt_number, '')) x
      from public.payments p left join public.clients c on c.id = p.client_id
      where p.tenant_id = p_tenant and p.payment_method = 'Cash'
      union all
      select jsonb_build_object('type', 'expense', 'on', ex.expense_date, 'at', ex.created_at,
               'change', -ex.amount, 'text', ex.category || ' · ' || ex.description)
      from public.expenses ex
      where ex.tenant_id = p_tenant and ex.paid_from = 'Cash' and ex.voided_at is null
      union all
      select jsonb_build_object('type', m.kind, 'on', m.moved_on, 'at', m.created_at,
               'change', m.change, 'text', coalesce(m.note, initcap(m.kind)))
      from public.cash_movements m where m.tenant_id = p_tenant
    ) all_rows
    order by (x->>'on') desc, (x->>'at') desc
    limit greatest(1, least(coalesce(p_limit, 60), 500))
  ) latest;

  return jsonb_build_object(
    'cash_in', v_in, 'cash_spent', v_spent, 'movements', v_moves,
    'balance', v_in - v_spent + v_moves, 'entries', v_entries);
end;
$$;

-- ---------------------------------------------------------------- stock cost at the time
alter table public.inventory_movements add column if not exists unit_cost numeric(12,2);

create or replace function public.inventory_movements_stamp_cost()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.unit_cost is null then
    select i.unit_cost into NEW.unit_cost from public.inventory_items i where i.id = NEW.item_id;
  end if;
  return NEW;
end;
$$;
drop trigger if exists inventory_movements_stamp_cost_trg on public.inventory_movements;
create trigger inventory_movements_stamp_cost_trg
  before insert on public.inventory_movements
  for each row execute function public.inventory_movements_stamp_cost();

-- Old rows keep unit_cost null (movements are immutable, and old stock_in rows without
-- photos can't pass the photo check again); reports fall back to the item's current cost.

-- ---------------------------------------------------------------- profit
create or replace function public.profit_summary(p_tenant uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_collected numeric; v_methods jsonb; v_expenses numeric; v_categories jsonb;
  v_stock numeric; v_used numeric;
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

  return jsonb_build_object(
    'collected', v_collected, 'by_method', v_methods,
    'expenses', v_expenses, 'by_category', v_categories,
    'stock_bought', v_stock, 'materials_used', v_used,
    'profit', v_collected - v_expenses - v_stock);
end;
$$;

-- ---------------------------------------------------------------- job materials report + truck usage
create or replace function public.job_materials_report(p_days integer default 60)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tenants uuid[];
  v_out jsonb;
  v_truck jsonb;
  v_since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 366)));
begin
  select array_agg(tu.tenant_id) into v_tenants from public.tenant_users tu
  where tu.user_id = auth.uid() and lower(tu.role) in ('admin', 'inventory');
  if v_tenants is null then
    raise exception 'Only admin and inventory staff can see this.';
  end if;

  with moves as (
    select m.repair_id, m.backbone_job_id, m.item_id, m.tenant_id,
           coalesce(sum(-m.quantity_change) filter (where m.movement_type = 'installation_use'), 0) as out_qty,
           coalesce(sum(m.quantity_change) filter (where m.movement_type = 'return'), 0) as ret_qty,
           min(m.created_at) as first_at,
           (array_agg(m.created_by order by m.created_at) filter (where m.movement_type = 'installation_use'))[1] as taken_by
    from public.inventory_movements m
    where m.tenant_id = any (v_tenants)
      and (m.repair_id is not null or m.backbone_job_id is not null)
      and m.created_at > v_since
    group by m.repair_id, m.backbone_job_id, m.item_id, m.tenant_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', case when x.repair_id is not null then 'client' else 'backbone' end,
           'job_id', coalesce(x.repair_id, x.backbone_job_id),
           'job', coalesce(c.customer_name, b.title, 'Job'),
           'job_type', coalesce(r.job_type, b.job_type),
           'job_status', coalesce(r.status, b.status),
           'technician', coalesce(nullif(public.team_person_name(x.taken_by), ''), 'Technician'),
           'item', i.name, 'unit', i.unit, 'unit_cost', coalesce(i.unit_cost, 0),
           'out', x.out_qty, 'used', jm.qty_used, 'returned', x.ret_qty,
           'return_done', jm.return_done_at is not null, 'return_note', jm.return_note,
           'diff', case when jm.return_done_at is not null then x.ret_qty - (x.out_qty - jm.qty_used) end,
           'at', x.first_at
         )), '[]'::jsonb) into v_out
  from moves x
  join public.inventory_items i on i.id = x.item_id
  left join public.repair_records r on r.id = x.repair_id
  left join public.clients c on c.id = r.client_id
  left join public.backbone_jobs b on b.id = x.backbone_job_id
  left join public.job_materials jm on jm.item_id = x.item_id
    and ((x.repair_id is not null and jm.repair_id = x.repair_id) or (x.backbone_job_id is not null and jm.backbone_job_id = x.backbone_job_id))
  where x.out_qty > 0;

  -- Used straight from a truck: nothing to return, so it is settled the moment it is used.
  with uses as (
    select coalesce(l.repair_id::text, 'truck:' || l.client_id::text || ':' || l.user_id::text
                    || ':' || ((l.created_at at time zone 'Asia/Manila')::date)::text) as job_key,
           l.repair_id, l.client_id, l.user_id, l.item_id,
           sum(-l.change) as qty, min(l.created_at) as first_at
    from public.truck_stock_log l
    where l.tenant_id = any (v_tenants) and l.kind = 'use' and l.created_at > v_since
    group by 1, 2, 3, 4, 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', 'truck',
           'job_id', u.job_key,
           'job', coalesce(c.customer_name, 'Customer'),
           'job_type', coalesce(r.job_type, 'repair'),
           'job_status', r.status,
           'technician', coalesce(nullif(public.team_person_name(u.user_id), ''), 'Technician'),
           'item', i.name, 'unit', i.unit, 'unit_cost', coalesce(i.unit_cost, 0),
           'out', u.qty, 'used', u.qty, 'returned', 0,
           'return_done', true, 'return_note', null, 'diff', 0,
           'at', u.first_at
         )), '[]'::jsonb) into v_truck
  from uses u
  join public.inventory_items i on i.id = u.item_id
  left join public.repair_records r on r.id = u.repair_id
  left join public.clients c on c.id = u.client_id
  where u.qty > 0;

  select coalesce(jsonb_agg(e order by (e->>'at') desc, e->>'item'), '[]'::jsonb) into v_out
  from jsonb_array_elements(v_out || v_truck) e;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------- materials rule for customer jobs
create or replace function public.require_materials_before_done()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_done constant text := '(complete|resolved|done|fixed)';
begin
  -- Same scope as the arrival rule: the assigned technician closing their own job.
  if lower(coalesce(NEW.status, '')) ~ v_done
     and lower(coalesce(OLD.status, '')) !~ v_done
     and NEW.technician_user_id is not null
     and NEW.technician_user_id = auth.uid()
     and exists (
       select 1
       from (
         select m.item_id, sum(-m.quantity_change) filter (where m.movement_type = 'installation_use') as out_qty
         from public.inventory_movements m
         where m.repair_id = NEW.id
         group by m.item_id
       ) x
       left join public.job_materials jm on jm.repair_id = NEW.id and jm.item_id = x.item_id
       where coalesce(x.out_qty, 0) > 0 and jm.qty_used is null and jm.return_done_at is null
     ) then
    raise exception 'Declare the materials you used first.';
  end if;
  return NEW;
end;
$$;
drop trigger if exists require_materials_before_done_before on public.repair_records;
create trigger require_materials_before_done_before
  before update of status on public.repair_records
  for each row execute function public.require_materials_before_done();

-- ---------------------------------------------------------------- locks
revoke all on function public.add_expense(uuid, date, text, text, numeric, text) from public, anon;
revoke all on function public.void_expense(uuid, text) from public, anon;
revoke all on function public.record_cash_movement(uuid, text, numeric, date, text) from public, anon;
revoke all on function public.cash_on_hand(uuid, int) from public, anon;
revoke all on function public.profit_summary(uuid, date, date) from public, anon;
revoke all on function public.inventory_movements_stamp_cost() from public, anon, authenticated;
revoke all on function public.require_materials_before_done() from public, anon, authenticated;
grant execute on function public.add_expense(uuid, date, text, text, numeric, text) to authenticated;
grant execute on function public.void_expense(uuid, text) to authenticated;
grant execute on function public.record_cash_movement(uuid, text, numeric, date, text) to authenticated;
grant execute on function public.cash_on_hand(uuid, int) to authenticated;
grant execute on function public.profit_summary(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------- unused tables
drop table if exists public.client_addresses;
drop table if exists public.client_contacts;
drop table if exists public.client_profiles;
