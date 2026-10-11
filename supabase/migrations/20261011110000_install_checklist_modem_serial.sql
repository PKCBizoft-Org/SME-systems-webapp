-- Install checklists and modem serial numbers (technician app).
--   * repair_records.checklist: what the technician ticked when finishing a job
--     ({"items": [...], "done": [...], "at": "..."}); informational, set from the app.
--   * clients.modem_serial (+ who/when): the modem/ONU serial scanned or typed
--     in by a technician. One serial can belong to only one account per tenant.
--   * set_modem_serial(): the only way to save it. Staff of the customer's
--     tenant only; cleans and validates the value, refuses a serial already on
--     another account (without saying whose) and writes an audit_log row.

alter table public.repair_records add column if not exists checklist jsonb;

alter table public.clients add column if not exists modem_serial text;
alter table public.clients add column if not exists modem_serial_at timestamptz;
alter table public.clients add column if not exists modem_serial_by uuid;

create unique index if not exists clients_modem_serial_unique
  on public.clients (tenant_id, modem_serial) where modem_serial is not null;

create or replace function public.set_modem_serial(p_client_id uuid, p_serial text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_client public.clients%rowtype;
  v_serial text := upper(btrim(coalesce(p_serial, '')));
  v_email text;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_client from public.clients where id = p_client_id;
  if not found then
    raise exception 'That customer could not be found.';
  end if;

  if not (
    public.user_is_global_admin()
    or exists (
      select 1 from public.tenant_users tu
      where tu.user_id = v_uid
        and tu.tenant_id = v_client.tenant_id
        and tu.role in ('technician', 'admin', 'accounting')
    )
  ) then
    raise exception 'Only PKC BIZOFT staff can set a modem serial number.';
  end if;

  if char_length(v_serial) < 4 or char_length(v_serial) > 64 then
    raise exception 'A modem serial number has 4 to 64 characters.';
  end if;
  if v_serial !~ '^[A-Z0-9][A-Z0-9._:/-]*$' then
    raise exception 'Use only letters, numbers and . _ : / - in the serial number.';
  end if;

  if exists (
    select 1 from public.clients c
    where c.tenant_id = v_client.tenant_id and c.modem_serial = v_serial and c.id <> v_client.id
  ) then
    raise exception 'That serial number is already registered to another account. Check the label and try again.';
  end if;

  -- The client guard only lets technicians change installation/location fields;
  -- this checked function is the one sanctioned way to save the serial.
  perform set_config('app.bypass_client_guard', 'on', true);
  update public.clients
  set modem_serial = v_serial, modem_serial_at = now(), modem_serial_by = v_uid
  where id = v_client.id;
  perform set_config('app.bypass_client_guard', 'off', true);

  select email into v_email from auth.users where id = v_uid;
  insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values (v_client.tenant_id, v_client.id, coalesce(v_email, 'Unknown'), 'modem_serial',
          coalesce(v_client.modem_serial, ''), v_serial);

  return v_serial;
end;
$fn$;

revoke all on function public.set_modem_serial(uuid, text) from public, anon;
grant execute on function public.set_modem_serial(uuid, text) to authenticated, service_role;
