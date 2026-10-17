-- 1. Live updates. The app's notification inbox and the web's Accounting badges listen for
--    changes on these tables, but only repair_records was in the realtime publication, so they
--    only caught up on their next check. Row-level security still decides who receives what.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['billing', 'payments', 'payment_submissions', 'service_requests', 'referral_withdrawals', 'ratings']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

-- 2. A push to every phone when a new app version is published. The app only checked GitHub
--    when it was opened, so nobody heard about an update until then. Every 10 minutes the
--    database reads where GitHub's "latest release" page points (the release is only created
--    once the APK is attached) and announces a version once.
create table if not exists public.app_release_check (
  id integer primary key default 1 check (id = 1),
  request_id bigint,
  announced_version text,
  checked_at timestamptz
);
alter table public.app_release_check enable row level security;
revoke all on public.app_release_check from anon, authenticated;

-- 0.7.5 was released before this check existed; the next version is the first announced.
insert into public.app_release_check (id, announced_version) values (1, '0.7.5') on conflict (id) do nothing;

create or replace function public.check_app_release()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  st public.app_release_check%rowtype;
  v_status integer;
  v_location text;
  v_version text;
  v_notified integer := 0;
  u uuid;
begin
  select * into st from public.app_release_check where id = 1 for update;

  -- The answer to the previous run's request (pg_net requests finish in the background).
  if st.request_id is not null then
    select r.status_code, r.headers->>'location' into v_status, v_location
    from net._http_response r where r.id = st.request_id;

    if v_status = 200 then
      v_version := substring(v_location from '/releases/tag/v?([0-9]+\.[0-9]+\.[0-9]+)');
      if v_version is not null
         and string_to_array(v_version, '.')::int[] > string_to_array(coalesce(st.announced_version, '0.0.0'), '.')::int[] then
        for u in select distinct t.user_id from public.push_tokens t where t.user_id is not null loop
          perform public.team_push(u, 'Update available', format('PKC BIZOFT %s is ready. Open the app to install it.', v_version));
          v_notified := v_notified + 1;
        end loop;
        update public.app_release_check set announced_version = v_version where id = 1;
      end if;
    end if;
  end if;

  update public.app_release_check
  set request_id = net.http_get(
        url := 'https://github.com/pkcbizoft26gh/pkc-bizoft-mobile/releases/latest',
        headers := '{"User-Agent": "pkc-bizoft-release-check"}'::jsonb
      ),
      checked_at = now()
  where id = 1;

  return jsonb_build_object('latest', v_version, 'notified', v_notified);
end;
$fn$;
revoke execute on function public.check_app_release() from public, anon, authenticated;

select cron.unschedule('pkc-app-release-check') where exists (select 1 from cron.job where jobname = 'pkc-app-release-check');
select cron.schedule('pkc-app-release-check', '*/10 * * * *', 'select public.check_app_release()');
