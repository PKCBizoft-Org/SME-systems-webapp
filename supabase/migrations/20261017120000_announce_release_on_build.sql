-- The update push goes out as soon as the APK build finishes, not on the next 10-minute check.
-- The release workflow's last step calls this with the app's public key. It cannot announce
-- anything GitHub does not already show as the latest release, and each version is announced
-- once, so calling it is harmless; calls closer than 5 seconds apart are ignored.
-- The check reads GitHub in the background, so the workflow calls it a few times, a few seconds
-- apart, until the new version comes back.
create or replace function public.announce_app_release()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if exists (select 1 from public.app_release_check where id = 1 and checked_at > now() - interval '5 seconds') then
    return jsonb_build_object('throttled', true);
  end if;
  return public.check_app_release();
end;
$fn$;
revoke execute on function public.announce_app_release() from public;
grant execute on function public.announce_app_release() to anon, authenticated;

-- The timed check stays only as a safety net, in case the workflow's call fails.
select cron.unschedule('pkc-app-release-check') where exists (select 1 from cron.job where jobname = 'pkc-app-release-check');
select cron.schedule('pkc-app-release-check', '0 * * * *', 'select public.check_app_release()');
