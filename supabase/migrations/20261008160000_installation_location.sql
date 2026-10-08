-- Where a plan application should be installed when it differs from the
-- customer's account address (chosen in the mobile app's Apply for Plan popup).
alter table public.service_requests
  add column if not exists installation_location_type text
    check (installation_location_type in ('current', 'other')),
  add column if not exists installation_area text,
  add column if not exists installation_region_code text,
  add column if not exists installation_province_code text,
  add column if not exists installation_city_code text,
  add column if not exists installation_barangay_code text,
  add column if not exists installation_purok text;
