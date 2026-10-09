-- Every customer gets an account ID (PKC-00001, ...) as soon as the record is
-- created, not only after installation. Existing IDs are never changed.
create or replace function public.assign_client_account_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.account_id is null or btrim(NEW.account_id) = '' then
    NEW.account_id := 'PKC-' || lpad(nextval('public.client_account_seq')::text, 5, '0');
  end if;
  return NEW;
end;
$$;

drop trigger if exists clients_account_id_trigger on public.clients;
create trigger clients_account_id_trigger
  before insert on public.clients
  for each row execute function public.assign_client_account_id();

revoke execute on function public.assign_client_account_id() from public, anon, authenticated;

-- Customers that already exist without one.
update public.clients
set account_id = 'PKC-' || lpad(nextval('public.client_account_seq')::text, 5, '0')
where account_id is null or btrim(account_id) = '';

create unique index if not exists clients_account_id_uniq
  on public.clients (account_id)
  where account_id is not null;
