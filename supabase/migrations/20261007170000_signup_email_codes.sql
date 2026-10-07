-- Customer sign-up verification codes, generated and emailed by our own server.
-- The account is created unconfirmed (no Supabase link email); entering the
-- right code confirms it. Server-only: RLS on, no policies.
create table if not exists public.signup_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.signup_codes enable row level security;
notify pgrst, 'reload schema';
