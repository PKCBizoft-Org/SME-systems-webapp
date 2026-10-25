-- Everything refreshes by itself: the app screens listen for changes on these
-- tables (lib/live.ts in the mobile app). Row-level security still decides
-- which changes each person receives.

do $$
declare t text;
begin
  foreach t in array array[
    'clients', 'outages', 'referrals', 'referral_rewards',
    'repair_job_crew', 'repair_join_requests', 'truck_stock', 'truck_stock_log', 'inventory_items'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
