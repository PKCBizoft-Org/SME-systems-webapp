-- Email codes are generated and checked by our own server (sent through SMTP),
-- so Supabase's built-in mailer is not needed.
create table if not exists public.staff_email_codes (
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('login','users')),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, purpose)
);
alter table public.staff_email_codes enable row level security;

create table if not exists public.staff_email_verified (
  session_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('login','users')),
  verified_at timestamptz not null default now(),
  primary key (session_id, purpose)
);
alter table public.staff_email_verified enable row level security;

notify pgrst, 'reload schema';
