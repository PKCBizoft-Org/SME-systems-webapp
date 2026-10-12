-- Reminders Accounting sent should also appear in the customer's in-app inbox,
-- not only as a phone push. They are read from the audit log (customer_reminder).
create or replace function public.my_reminders()
returns table (id bigint, message text, sent_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.id,
         case when a.new_value = 'Overdue reminder (bulk)'
              then 'Your bill is overdue. Please pay in Plan & Bills, or ignore this if you already paid.'
              else a.new_value end,
         a.changed_at
  from public.audit_log a
  where a.field_name = 'customer_reminder'
    and a.client_id = (select c.id from public.clients c where c.user_id = auth.uid() limit 1)
  order by a.changed_at desc
  limit 10;
$$;

revoke execute on function public.my_reminders() from public, anon;
grant execute on function public.my_reminders() to authenticated;
