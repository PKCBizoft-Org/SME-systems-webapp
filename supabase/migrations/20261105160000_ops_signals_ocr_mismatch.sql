-- Let refresh_payment_signals count and resolve OCR-mismatch signals too. These rows are
-- written by the client-side OCR check (via /api/accounting/ocr-flag), not recomputed here,
-- but the digest should include them and they should resolve once the submission is handled.
create or replace function public.refresh_payment_signals()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare result jsonb;
begin
  insert into public.ops_signals (tenant_id, kind, severity, entity_type, entity_id, summary, details)
  select s.tenant_id, 'duplicate_reference',
         case when bool_or(o.status ~* 'verif|paid|approv') then 'alert' else 'warn' end,
         'payment_submission', s.id,
         'Reference "' || s.reference_number || '" was also used on ' || count(*) || ' other submission(s).',
         jsonb_build_object('reference', s.reference_number, 'twin_ids', jsonb_agg(o.id),
                            'twin_verified', bool_or(o.status ~* 'verif|paid|approv'))
  from public.payment_submissions s
  join public.payment_submissions o
    on o.id <> s.id and o.tenant_id = s.tenant_id
   and o.reference_number is not null and trim(o.reference_number) <> ''
   and lower(trim(o.reference_number)) = lower(trim(s.reference_number))
   and (s.group_id is null or o.group_id is distinct from s.group_id)
  where s.status ~* 'pending' and s.reference_number is not null and trim(s.reference_number) <> ''
  group by s.tenant_id, s.id, s.reference_number
  on conflict (tenant_id, kind, entity_type, entity_id) do update
    set summary = excluded.summary, details = excluded.details, severity = excluded.severity,
        status = 'open', resolved_at = null, updated_at = now();

  insert into public.ops_signals (tenant_id, kind, severity, entity_type, entity_id, summary, details)
  select s.tenant_id, 'duplicate_image',
         case when bool_or(o.status ~* 'verif|paid|approv') then 'alert' else 'warn' end,
         'payment_submission', s.id,
         'The same receipt image was sent on ' || count(*) || ' other submission(s).',
         jsonb_build_object('proof_hash', s.proof_hash, 'twin_ids', jsonb_agg(o.id),
                            'twin_verified', bool_or(o.status ~* 'verif|paid|approv'))
  from public.payment_submissions s
  join public.payment_submissions o
    on o.id <> s.id and o.tenant_id = s.tenant_id
   and o.proof_hash is not null and o.proof_hash = s.proof_hash
   and (s.group_id is null or o.group_id is distinct from s.group_id)
  where s.status ~* 'pending' and s.proof_hash is not null
  group by s.tenant_id, s.id, s.proof_hash
  on conflict (tenant_id, kind, entity_type, entity_id) do update
    set summary = excluded.summary, details = excluded.details, severity = excluded.severity,
        status = 'open', resolved_at = null, updated_at = now();

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

  update public.ops_signals sig
     set status = 'resolved', resolved_at = now(), updated_at = now()
   where sig.status = 'open' and sig.entity_type = 'payment_submission'
     and sig.kind in ('duplicate_reference', 'duplicate_image', 'amount_mismatch', 'ocr_mismatch')
     and not exists (select 1 from public.payment_submissions s
                     where s.id = sig.entity_id and s.status ~* 'pending');

  select jsonb_build_object(
    'open', count(*),
    'duplicate_reference', count(*) filter (where kind = 'duplicate_reference'),
    'duplicate_image', count(*) filter (where kind = 'duplicate_image'),
    'amount_mismatch', count(*) filter (where kind = 'amount_mismatch'),
    'ocr_mismatch', count(*) filter (where kind = 'ocr_mismatch'),
    'alert', count(*) filter (where severity = 'alert')
  ) into result
  from public.ops_signals
  where status = 'open' and entity_type = 'payment_submission';

  return coalesce(result, '{"open":0}'::jsonb);
end;
$fn$;
