-- 1. Items can carry a barcode (the one printed on the box), scanned or typed in.
-- 2. Admins get a phone push when an item drops to its reorder level or runs out.
-- 3. Receiving proof photos must be fresh: uploaded by the same person in the
--    last day, and never used for an earlier delivery.

alter table public.inventory_items add column if not exists barcode text;
create unique index if not exists inventory_items_tenant_barcode_key
  on public.inventory_items (tenant_id, barcode) where barcode is not null;

create or replace function public.notify_low_stock()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_admin uuid;
  v_title text;
  v_body text;
begin
  if NEW.quantity_on_hand <= 0 and OLD.quantity_on_hand > 0 then
    v_title := 'Out of stock';
    v_body := format('%s is out of stock. Restock soon.', NEW.name);
  elsif NEW.reorder_level > 0
    and NEW.quantity_on_hand <= NEW.reorder_level
    and OLD.quantity_on_hand > NEW.reorder_level then
    v_title := 'Low stock';
    v_body := format('%s is down to %s %s (reorder at %s).',
      NEW.name, trim_scale(NEW.quantity_on_hand), NEW.unit, trim_scale(NEW.reorder_level));
  else
    return NEW;
  end if;

  for v_admin in
    select distinct tu.user_id from public.tenant_users tu
    where tu.tenant_id = NEW.tenant_id and tu.role = 'admin' and tu.user_id is not null
  loop
    perform public.team_push(v_admin, v_title, v_body);
  end loop;
  return NEW;
end;
$$;
revoke execute on function public.notify_low_stock() from public, anon, authenticated;

drop trigger if exists inventory_items_low_stock_trg on public.inventory_items;
create trigger inventory_items_low_stock_trg
  after update of quantity_on_hand on public.inventory_items
  for each row
  when (NEW.quantity_on_hand < OLD.quantity_on_hand)
  execute function public.notify_low_stock();

create or replace function public.inventory_movements_check_photos()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  p text;
begin
  if NEW.movement_type <> 'stock_in' then
    return NEW;
  end if;
  foreach p in array array[NEW.receiver_photo_path, NEW.receipt_photo_path, NEW.stock_photo_path] loop
    if p is null
      or split_part(p, '/', 1) <> NEW.tenant_id::text
      or not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'stock-receipts' and o.name = p
          and o.created_at > now() - interval '1 day'
          and (auth.uid() is null or o.owner_id = auth.uid()::text)
      )
    then
      raise exception 'Receiving stock needs fresh photos of the receiver, the receipt and the stock.';
    end if;
    -- Lines saved together (bulk restock) share photos; older deliveries may not.
    if exists (
      select 1 from public.inventory_movements m
      where m.created_at < now()
        and p in (m.receiver_photo_path, m.receipt_photo_path, m.stock_photo_path)
    ) then
      raise exception 'These photos were already used for an earlier delivery. Take new ones.';
    end if;
  end loop;
  return NEW;
end;
$$;
