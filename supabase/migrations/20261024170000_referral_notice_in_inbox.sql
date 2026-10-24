-- Keep the "someone used your referral code" notice so it shows in the
-- referrer's in-app Notifications, not only as a push.
create or replace function public.notify_referral_used()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_referrer public.clients%rowtype;
  v_body text;
begin
  if NEW.referred_by_client_id is null
     or (TG_OP = 'UPDATE' and OLD.referred_by_client_id is not distinct from NEW.referred_by_client_id) then
    return NEW;
  end if;

  select * into v_referrer from public.clients where id = NEW.referred_by_client_id;
  if not found then
    return NEW;
  end if;

  v_body := coalesce(public.short_person_name(NEW.customer_name), 'Someone')
            || ' used your referral code. Your reward is unlocked once they subscribe and are installed.';

  insert into public.audit_log (tenant_id, client_id, changed_by_email, field_name, old_value, new_value)
  values (v_referrer.tenant_id, v_referrer.id, 'system (referrals)', 'referral_used', '', v_body);

  if v_referrer.user_id is not null then
    perform public.team_push(v_referrer.user_id, 'New referral!', v_body);
  end if;
  return NEW;
exception when others then
  return NEW;
end;
$$;

create or replace function public.my_referral_notices()
returns table(id bigint, message text, sent_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.id, a.new_value, a.changed_at
  from public.audit_log a
  where a.field_name = 'referral_used'
    and a.client_id = (select c.id from public.clients c where c.user_id = auth.uid() limit 1)
  order by a.changed_at desc
  limit 20;
$$;

revoke all on function public.my_referral_notices() from public, anon;
grant execute on function public.my_referral_notices() to authenticated;
