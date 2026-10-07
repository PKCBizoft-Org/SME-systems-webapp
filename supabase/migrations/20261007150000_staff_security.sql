-- Two-factor gate for staff sign-in: email code + secondary password.
-- Only the server (service role) touches these tables; RLS is on with no policies.

create table if not exists public.staff_security (
  user_id uuid primary key references auth.users(id) on delete cascade,
  secondary_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.staff_security enable row level security;

create table if not exists public.staff_verified_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  verified_at timestamptz not null default now()
);
create index if not exists staff_verified_sessions_user_idx on public.staff_verified_sessions (user_id);
alter table public.staff_verified_sessions enable row level security;

notify pgrst, 'reload schema';
