-- Fix: my_referred_customers() only treated 'completed' as installed.
-- The installation flow stores 'Installed', so installed friends still
-- showed as "Registered / Waiting" on the referrer's Referrals screen.
--
-- Also removes the p_user_id parameter (any caller could list another
-- user's referred friends) and blocks anonymous access.

drop function if exists public.my_referred_customers(text);
drop function if exists public.my_referred_customers();

create function public.my_referred_customers()
returns table (
  client_id text,
  display_name text,
  stage text,
  joined_at timestamptz,
  reward_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  select id into v_client_id
  from public.clients
  where user_id = auth.uid()
  limit 1;

  return query
  select
    c_ref.id::text,
    c_ref.customer_name,
    case
      when lower(c_ref.installation_status) in ('installed', 'completed')
        then 'Installed'
      else 'Registered'
    end,
    null::timestamptz,
    250.00::numeric
  from public.clients c_ref
  where c_ref.referred_by_client_id = v_client_id;
end;
$$;

revoke execute on function public.my_referred_customers() from public, anon;
grant execute on function public.my_referred_customers() to authenticated;