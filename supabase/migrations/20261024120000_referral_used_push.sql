-- Tell the referrer the moment someone links to their referral code
-- (at signup or later from the Referrals screen).
create or replace function public.notify_referral_used()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_referrer uuid;
begin
  if NEW.referred_by_client_id is null
     or (TG_OP = 'UPDATE' and OLD.referred_by_client_id is not distinct from NEW.referred_by_client_id) then
    return NEW;
  end if;

  select user_id into v_referrer from public.clients where id = NEW.referred_by_client_id;
  if v_referrer is null then
    return NEW;
  end if;

  perform public.team_push(
    v_referrer,
    'New referral!',
    coalesce(public.short_person_name(NEW.customer_name), 'Someone') || ' used your referral code. Your reward is unlocked once they subscribe and are installed.'
  );
  return NEW;
exception when others then
  return NEW;
end;
$$;

drop trigger if exists clients_referral_used_push on public.clients;
create trigger clients_referral_used_push
after insert or update of referred_by_client_id on public.clients
for each row execute function public.notify_referral_used();
