-- Fraud guard: store a SHA-256 fingerprint of each payment receipt image, so a
-- re-submitted screenshot (the same file sent again) can be flagged at verification.
-- Purely additive: a new nullable column plus a partial index. No existing flow changes.

alter table public.payment_submissions
  add column if not exists proof_hash text;

comment on column public.payment_submissions.proof_hash is
  'SHA-256 hex of the receipt image bytes; filled lazily by the proof-hash route for duplicate detection.';

create index if not exists payment_submissions_proof_hash_idx
  on public.payment_submissions (tenant_id, proof_hash)
  where proof_hash is not null;
