-- Security fix for "one receipt for all bills" (20261025090000).
--
-- Customers may insert plan-payment rows into payment_submissions directly
-- (payment_submissions_customer_insert), so they could have set group_id
-- themselves and slipped past the one-reference-per-receipt rule. Now:
--   * group_id can only be set by submit_bills_payment(), which turns on the
--     transaction-local setting pkc.payment_group; anything else is refused,
--     and every part of a group must belong to the same customer and tenant.
--   * verify / reject / cancel only act on parts of the same customer, and a
--     part's bill must belong to that customer (defence in depth).
-- The function bodies are patched in place; each patch must apply exactly.

create or replace function public.guard_payment_group()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if NEW.group_id is not distinct from (case when TG_OP = 'UPDATE' then OLD.group_id end) then
    return NEW;
  end if;

  if NEW.group_id is not null then
    if coalesce(current_setting('pkc.payment_group', true), '') <> 'on' then
      raise exception 'Payments can only be grouped by the app''s "pay all bills" step.';
    end if;
    if exists (
      select 1 from public.payment_submissions o
      where o.group_id = NEW.group_id and o.id <> NEW.id
        and (o.client_id is distinct from NEW.client_id or o.tenant_id is distinct from NEW.tenant_id)
    ) then
      raise exception 'Every part of a receipt must belong to the same customer.';
    end if;
  elsif TG_OP = 'UPDATE' then
    raise exception 'A payment cannot be taken out of its receipt.';
  end if;

  return NEW;
end;
$fn$;

-- BEFORE triggers run in name order: this name sorts after
-- payment_submission_tenant_trigger, which fills in tenant_id first.
drop trigger if exists payment_submission_zz_group_guard on public.payment_submissions;
create trigger payment_submission_zz_group_guard
  before insert or update of group_id on public.payment_submissions
  for each row execute function public.guard_payment_group();

do $patch$
declare
  d text;
  n text;
begin
  -- submit_bills_payment: allow grouping for its own inserts only.
  d := pg_get_functiondef('public.submit_bills_payment(uuid,numeric,text,text,text,text,date,text)'::regprocedure);
  n := replace(d,
    '  v_count := jsonb_array_length(v_parts);',
    E'  v_count := jsonb_array_length(v_parts);\n  -- Lets the group guard trigger accept group_id, for this transaction only.\n  perform set_config(''pkc.payment_group'', ''on'', true);');
  if n = d then raise exception 'patch failed: submit_bills_payment'; end if;
  execute n;

  -- verify: same customer only, and the bill must be that customer's.
  d := pg_get_functiondef('public.verify_payment_submission_as(uuid,uuid)'::regprocedure);
  n := replace(d,
    '(id = sub.id or (sub.group_id is not null and group_id = sub.group_id))',
    '(id = sub.id or (sub.group_id is not null and group_id = sub.group_id and client_id = sub.client_id and tenant_id = sub.tenant_id))');
  n := replace(n,
    'select * into bill from public.billing where id = part.billing_id for update;',
    'select * into bill from public.billing where id = part.billing_id and client_id = part.client_id for update;');
  if n = d or position('client_id = part.client_id' in n) = 0 then raise exception 'patch failed: verify'; end if;
  execute n;

  -- reject: same customer only (two queries).
  d := pg_get_functiondef('public.reject_payment_submission_as(uuid,uuid,text,text)'::regprocedure);
  n := replace(d,
    '(s.id = sub.id or (sub.group_id is not null and s.group_id = sub.group_id))',
    '(s.id = sub.id or (sub.group_id is not null and s.group_id = sub.group_id and s.client_id = sub.client_id and s.tenant_id = sub.tenant_id))');
  n := replace(n,
    '(id = sub.id or (sub.group_id is not null and group_id = sub.group_id))',
    '(id = sub.id or (sub.group_id is not null and group_id = sub.group_id and client_id = sub.client_id and tenant_id = sub.tenant_id))');
  if n = d or position('s.client_id = sub.client_id' in n) = 0 or position('and client_id = sub.client_id' in n) = 0 then
    raise exception 'patch failed: reject';
  end if;
  execute n;

  -- cancel: same customer only.
  d := pg_get_functiondef('public.cancel_bill_payment(uuid)'::regprocedure);
  n := replace(d,
    '(id = v_sub.id or (v_sub.group_id is not null and group_id = v_sub.group_id))',
    '(id = v_sub.id or (v_sub.group_id is not null and group_id = v_sub.group_id and client_id = v_sub.client_id and tenant_id = v_sub.tenant_id))');
  if n = d then raise exception 'patch failed: cancel'; end if;
  execute n;
end
$patch$;
