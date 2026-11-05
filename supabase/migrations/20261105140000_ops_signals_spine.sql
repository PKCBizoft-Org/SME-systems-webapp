-- The "signals spine": one table every fraud/ops detector writes to, so flags can
-- be reviewed in one place and summarised in the daily digest. Today's detectors are
-- the three payment-proof signals; future ones (cash reconciliation, record tamper,
-- churn, ...) add rows with a new `kind` and reuse everything below.

create table if not exists public.ops_signals (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  kind        text not null,                 -- e.g. duplicate_reference, duplicate_image, amount_mismatch
  severity    text not null default 'warn',  -- info | warn | alert
  entity_type text not null,                 -- e.g. payment_submission
  entity_id   uuid not null,
  summary     text not null,
  details     jsonb not null default '{}'::jsonb,
  status      text not null default 'open',  -- open | resolved | dismissed
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  resolved_at timestamptz,
  unique (tenant_id, kind, entity_type, entity_id)
);

create index if not exists ops_signals_open_idx on public.ops_signals (tenant_id, status, created_at desc);

-- Staff may read their tenant's signals (for a future review inbox and transparency);
-- all writes are server-only (service_role bypasses RLS; no write policy is granted).
alter table public.ops_signals enable row level security;
drop policy if exists ops_signals_staff_read on public.ops_signals;
create policy ops_signals_staff_read on public.ops_signals
  for select to authenticated
  using (public.is_payment_staff(tenant_id));

-- Recompute the payment-proof signals for all pending submissions (idempotent via the
-- unique key), re-open ones that recur, and resolve any whose submission is no longer
-- pending. Returns a small summary for the morning digest.
create or replace function public.refresh_payment_signals()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare result jsonb;
begin
  -- Duplicate GCash reference number (another submission, not the same split receipt).
  insert into public.ops_signals (tenant_id, kind, severity, entity_type, entity_id, summary, details)
  select s.tenant_id, 'duplicate_reference',
         case when bool_or(o.status ~* 'verif|paid|approv') then 'alert' else 'warn' end,
         'payment_submission', s.id,
         'Reference "' || s.reference_number || '" was also used on ' || count(*) || ' other submission(s).',
         jsonb_build_object('reference', s.reference_number,
                            'twin_ids', jsonb_agg(o.id),
                            'twin_verified', bool_or(o.status ~* 'verif|paid|approv'))
  from public.payment_submissions s
  join public.payment_submissions o
    on o.id <> s.id
   and o.reference_number is not null and trim(o.reference_number) <> ''
   and lower(trim(o.reference_number)) = lower(trim(s.reference_number))
   and (s.group_id is null or o.group_id is distinct from s.group_id)
  where s.status ~* 'pending' and s.reference_number is not null and trim(s.reference_number) <> ''
  group by s.tenant_id, s.id, s.reference_number
  on conflict (tenant_id, kind, entity_type, entity_id) do update
    set summary = excluded.summary, details = excluded.details, severity = excluded.severity,
        status = 'open', resolved_at = null, updated_at = now();

  -- Duplicate exact receipt image (same proof_hash).
  insert into public.ops_signals (tenant_id, kind, severity, entity_type, entity_id, summary, details)
  select s.tenant_id, 'duplicate_image',
         case when bool_or(o.status ~* 'verif|paid|approv') then 'alert' else 'warn' end,
         'payment_submission', s.id,
         'The same receipt image was sent on ' || count(*) || ' other submission(s).',
         jsonb_build_object('proof_hash', s.proof_hash,
                            'twin_ids', jsonb_agg(o.id),
                            'twin_verified', bool_or(o.status ~* 'verif|paid|approv'))
  from public.payment_submissions s
  join public.payment_submissions o
    on o.id <> s.id
   and o.proof_hash is not null
   and o.proof_hash = s.proof_hash
   and (s.group_id is null or o.group_id is distinct from s.group_id)
  where s.status ~* 'pending' and s.proof_hash is not null
  group by s.tenant_id, s.id, s.proof_hash
  on conflict (tenant_id, kind, entity_type, entity_id) do update
    set summary = excluded.summary, details = excluded.details, severity = excluded.severity,
        status = 'open', resolved_at = null, updated_at = now();

  -- Claimed amount does not match what is due on the bill.
  insert into public.ops_signals (tenant_id, kind, severity, entity_type, entity_id, summary, details)
  select s.tenant_id, 'amount_mismatch', 'warn', 'payment_submission', s.id,
         'Claims ' || s.amount_claimed || ' but ' || bb.balance || ' is due ('
           || case when s.amount_claimed < bb.balance then 'short' else 'over' end || ').',
         jsonb_build_object('claimed', s.amount_claimed, 'expected', bb.balance,
                            'diff', s.amount_claimed - bb.balance)
  from public.payment_submissions s
  join public.billing_balances bb on bb.id = s.billing_id
  where s.status ~* 'pending' and s.amount_claimed is not null and bb.balance is not null
    and abs(s.amount_claimed - bb.balance) >= 1
  on conflict (tenant_id, kind, entity_type, entity_id) do update
    set summary = excluded.summary, details = excluded.details, updated_at = now(),
        status = 'open', resolved_at = null;

  -- Resolve payment signals whose submission is no longer pending (handled / rejected).
  update public.ops_signals sig
     set status = 'resolved', resolved_at = now(), updated_at = now()
   where sig.status = 'open' and sig.entity_type = 'payment_submission'
     and sig.kind in ('duplicate_reference', 'duplicate_image', 'amount_mismatch')
     and not exists (
       select 1 from public.payment_submissions s
       where s.id = sig.entity_id and s.status ~* 'pending'
     );

  select jsonb_build_object(
    'open', count(*),
    'duplicate_reference', count(*) filter (where kind = 'duplicate_reference'),
    'duplicate_image', count(*) filter (where kind = 'duplicate_image'),
    'amount_mismatch', count(*) filter (where kind = 'amount_mismatch'),
    'alert', count(*) filter (where severity = 'alert')
  ) into result
  from public.ops_signals
  where status = 'open' and entity_type = 'payment_submission';

  return coalesce(result, '{"open":0}'::jsonb);
end;
$fn$;

revoke execute on function public.refresh_payment_signals() from public, anon, authenticated;
grant execute on function public.refresh_payment_signals() to service_role;
