-- One button for Accounting: remind every customer whose bill is overdue, in the
-- app. Skips customers who have no app account, were already reminded in the
-- last hour, or already sent a payment that covers what they owe.
create or replace function public.remind_overdue_customers()
returns table (sent integer, skipped integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_sent integer := 0;
  v_skipped integer := 0;
  r record;
begin
  if not exists (
    select 1 from public.tenant_users where user_id = auth.uid() and role in ('admin', 'accounting')
  ) then
    raise exception 'Only accounting or admin staff can remind customers.';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  for r in
    select c.id as client_id, c.tenant_id, c.user_id,
           sum(b.balance) as owed,
           sum(b.pending_review) as waiting,
           max(b.days_overdue) as days
    from public.billing_balances b
    join public.clients c on c.id = b.client_id
    where not b.closed
      and b.balance > 0
      and b.days_overdue > 0
      and exists (
        select 1 from public.tenant_users tu
        where tu.user_id = auth.uid() and tu.tenant_id = c.tenant_id and tu.role in ('admin', 'accounting')
      )
    group by c.id, c.tenant_id, c.user_id
    order by max(b.days_overdue) desc
    limit 500
  loop
    if r.user_id is null
       or r.waiting >= r.owed
       or exists (
         select 1 from public.audit_log
         where client_id = r.client_id and field_name = 'customer_reminder'
           and changed_at > now() - interval '1 hour'
       ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    perform public.team_push(
      r.user_id,
      'Reminder from PKC BIZOFT',
      'Your bill is overdue (' || r.owed::text || ' pesos, ' || r.days::text || ' days late). Please pay in the app, or ignore this if you already paid.'
    );
    insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
    values (r.tenant_id, r.client_id, coalesce(v_email, 'Unknown'), 'customer_reminder', '', 'Overdue reminder (bulk)');
    v_sent := v_sent + 1;
  end loop;

  return query select v_sent, v_skipped;
end;
$$;

revoke execute on function public.remind_overdue_customers() from public, anon;
grant execute on function public.remind_overdue_customers() to authenticated;
