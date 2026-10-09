-- 1. A readable registered address ("Prk 6-A Burgos, Canocotan, City of Tagum,
--    Davao del Norte") that technicians can search on Google Maps.
create or replace function public.client_full_address(p_client uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.clients%rowtype;
  up public.user_profiles%rowtype;
  v_allowed boolean;
begin
  select * into c from public.clients where id = p_client;
  if c.id is null then
    return null;
  end if;

  -- The customer themselves, or staff of the same tenant.
  v_allowed := c.user_id = auth.uid()
    or exists (
      select 1 from public.tenant_users tu
      where tu.user_id = auth.uid() and tu.tenant_id = c.tenant_id
    );
  if not v_allowed then
    return null;
  end if;

  select * into up from public.user_profiles where user_id = c.user_id;

  return nullif(concat_ws(', ',
    nullif(btrim(coalesce(up.purok, c.area, '')), ''),
    (select btrim(name) from public.ph_locations where code = up.barangay_code),
    (select btrim(name) from public.ph_locations where code = up.city_municipality_code),
    (select btrim(name) from public.ph_locations where code = up.province_code)
  ), '');
end;
$$;
revoke execute on function public.client_full_address(uuid) from public, anon;
grant execute on function public.client_full_address(uuid) to authenticated;

-- 2. A customer corrects their own pin. It moves their saved pin and any open
--    job (installation or repair), so the technician is sent to the new spot.
create or replace function public.set_my_location_pin(p_lat double precision, p_lon double precision)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_client uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if p_lat is null or p_lon is null or p_lat not between 4 and 22 or p_lon not between 116 and 128 then
    raise exception 'That location is not in the Philippines.';
  end if;

  select id into v_client from public.clients where user_id = auth.uid() limit 1;
  if v_client is null then
    raise exception 'Your customer account could not be found.';
  end if;

  update public.clients set latitude = p_lat, longitude = p_lon where id = v_client;

  update public.repair_records
  set latitude = p_lat, longitude = p_lon
  where client_id = v_client
    and lower(coalesce(status, '')) !~ '(complete|resolved|done|fixed|closed|cancel)';
end;
$$;
revoke execute on function public.set_my_location_pin(double precision, double precision) from public, anon;
grant execute on function public.set_my_location_pin(double precision, double precision) to authenticated;
