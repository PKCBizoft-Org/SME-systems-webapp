-- Receiving stock needs proof: a photo of the person receiving, the supplier
-- receipt, and the actual stock that arrived.
-- Files live at <tenant id>/<batch id>/<kind>-<file> in the private
-- stock-receipts bucket. One batch (e.g. a bulk restock) shares one set of photos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stock-receipts', 'stock-receipts', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists stock_receipts_insert on storage.objects;
create policy stock_receipts_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'stock-receipts'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.inventory_has_access(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists stock_receipts_select on storage.objects;
create policy stock_receipts_select on storage.objects for select to authenticated
  using (
    bucket_id = 'stock-receipts'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.inventory_has_access(((storage.foldername(name))[1])::uuid)
  );

-- expected_quantity: what the receipt says, so a short or over delivery is on record.
alter table public.inventory_movements
  add column if not exists receiver_photo_path text,
  add column if not exists receipt_photo_path text,
  add column if not exists stock_photo_path text,
  add column if not exists expected_quantity numeric check (expected_quantity is null or expected_quantity >= 0);

-- Older stock_in rows have no photos, so only new rows are checked.
alter table public.inventory_movements drop constraint if exists inventory_movements_stock_in_photos;
alter table public.inventory_movements add constraint inventory_movements_stock_in_photos
  check (
    movement_type <> 'stock_in'
    or (receiver_photo_path is not null and receipt_photo_path is not null and stock_photo_path is not null)
  ) not valid;

-- The photos must really be uploaded, under this movement's company.
-- Runs after inventory_movements_before_insert_trg (name order), which fills tenant_id.
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
      or not exists (select 1 from storage.objects o where o.bucket_id = 'stock-receipts' and o.name = p)
    then
      raise exception 'Receiving stock needs photos of the receiver, the receipt and the stock.';
    end if;
  end loop;
  return NEW;
end;
$$;
revoke execute on function public.inventory_movements_check_photos() from public, anon, authenticated;

drop trigger if exists inventory_movements_photos_trg on public.inventory_movements;
create trigger inventory_movements_photos_trg
  before insert on public.inventory_movements
  for each row execute function public.inventory_movements_check_photos();
