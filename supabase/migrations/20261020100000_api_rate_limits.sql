-- Rate limits for the website's API routes (proxy.ts). One counter per bucket (route group + IP) per
-- fixed time window. Unlogged: counters are throwaway, so skipping the write-ahead log keeps each hit cheap.

create unlogged table if not exists public.rate_limit_hits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);
alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;

-- Counts one request and says whether it is allowed. retry_after = seconds until the window resets.
create or replace function public.rate_limit_hit(p_bucket text, p_max integer, p_window_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limit_hits as h (bucket, window_start, hits)
  values (left(p_bucket, 200), v_window, 1)
  on conflict (bucket, window_start) do update set hits = h.hits + 1
  returning h.hits into v_hits;

  -- Now and then, drop windows that are long over.
  if random() < 0.01 then
    delete from public.rate_limit_hits where window_start < now() - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed', v_hits <= p_max,
    'retry_after', greatest(1, ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now()))))::int
  );
end;
$$;
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
