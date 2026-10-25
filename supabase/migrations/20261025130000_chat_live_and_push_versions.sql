-- Chat alerts without trade-offs.
--   * ticket_messages goes on the realtime feed, so an open app shows a new
--     message at once (row-level security still decides who receives what).
--   * push_tokens remembers the app version of each phone. send-push only
--     sends the Reply-button style chat notification to phones whose app
--     understands it; older apps keep getting plain notifications.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ticket_messages'
  ) then
    alter publication supabase_realtime add table public.ticket_messages;
  end if;
end $$;

alter table public.push_tokens add column if not exists app_version text;

-- Older apps call this with (p_token, p_platform); the new parameter is optional.
drop function if exists public.register_push_token(text, text);

create or replace function public.register_push_token(
  p_token text,
  p_platform text default 'android',
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if coalesce(btrim(p_token), '') = '' then
    return;
  end if;
  insert into public.push_tokens (token, user_id, platform, app_version, updated_at)
  values (p_token, auth.uid(), coalesce(p_platform, 'android'), nullif(btrim(coalesce(p_app_version, '')), ''), now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        -- An older app re-registering the same phone clears the version again.
        app_version = excluded.app_version,
        updated_at = now();
end;
$fn$;

revoke all on function public.register_push_token(text, text, text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;
