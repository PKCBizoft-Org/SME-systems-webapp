-- Who added, re-issued, deactivated or changed the role of each staff user.
-- Rows are written only by the server (service role); tenant admins can read them.
create table if not exists public.user_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  actor_id uuid,
  actor_email text,
  target_user_id uuid,
  target_email text,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists user_audit_tenant_created_idx
  on public.user_audit (tenant_id, created_at desc);

alter table public.user_audit enable row level security;

drop policy if exists "tenant admins read user audit" on public.user_audit;
create policy "tenant admins read user audit" on public.user_audit
  for select to authenticated
  using (exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and tu.tenant_id = user_audit.tenant_id
      and tu.role = 'admin'
  ));

revoke insert, update, delete, truncate on public.user_audit from anon, authenticated;
