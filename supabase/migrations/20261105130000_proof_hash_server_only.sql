-- Harden the fraud fingerprint (20261105120000): proof_hash must be written
-- only by the server (service_role). A customer may insert their own payment
-- submission (payment_submissions_customer_insert), so without this they could
-- set proof_hash themselves to a bogus value and slip past the duplicate check.
--
-- SECURITY INVOKER (the default) so current_user reflects the real writer:
-- 'authenticated'/'anon' for the client, 'service_role' for our hashing route,
-- and the table owner for migrations/backfills.

create or replace function public.guard_proof_hash()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
begin
  -- Unchanged value is always allowed.
  if NEW.proof_hash is not distinct from (case when TG_OP = 'UPDATE' then OLD.proof_hash end) then
    return NEW;
  end if;
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'proof_hash is set by the server only.';
  end if;
  return NEW;
end;
$fn$;

-- Sorts after payment_submission_tenant_trigger (fills tenant_id first).
drop trigger if exists payment_submission_zz_proof_hash_guard on public.payment_submissions;
create trigger payment_submission_zz_proof_hash_guard
  before insert or update of proof_hash on public.payment_submissions
  for each row execute function public.guard_proof_hash();
