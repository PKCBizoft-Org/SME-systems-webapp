-- Referrers see every step: signed up, applied (awaiting Accounting),
-- approved (waiting for installation), installed (reward earned).
create or replace function public.my_referred_customers()
returns table(client_id uuid, display_name text, stage text, joined_at timestamptz, reward_amount numeric)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    c.id,
    public.short_person_name(c.customer_name),
    case
      when exists (select 1 from public.referrals r where r.referred_client_id = c.id) then 'Installed'
      when lower(coalesce(c.installation_status, '')) in ('installed', 'completed', 'done') then 'Installed'
      when lower(coalesce(c.installation_status, '')) = 'for installation' then 'Approved, waiting for installation'
      when exists (select 1 from public.payment_submissions s where s.client_id = c.id and s.status = 'Pending')
        or exists (select 1 from public.service_requests sr where sr.client_id = c.id and sr.status = 'Payment Pending')
        then 'Applied, awaiting approval'
      else 'Signed up, no plan yet'
    end,
    (select u.created_at from auth.users u where u.id = c.user_id),
    (select max(r.bonus_amount) from public.referrals r where r.referred_client_id = c.id)
  from public.clients c
  where c.referred_by_client_id = (select id from public.clients where user_id = auth.uid() limit 1)
  order by 4 desc nulls last;
$$;
