-- Push alerts for the mobile app while it is closed.
--   * push_tokens: one row per phone, registered by the app (register_push_token)
--   * push_config: private shared secret between the database and the
--     send-push edge function
--   * trigger: when Accounting verifies or rejects a payment, ask send-push to
--     notify the customer

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
-- no policies: only the service role and the functions below touch it

create table if not exists public.push_config (
  id boolean primary key default true check (id),
  secret text not null default encode(gen_random_bytes(24), 'hex')
);
alter table public.push_config enable row level security;
insert into public.push_config (id) values (true) on conflict do nothing;

create or replace function public.register_push_token(p_token text, p_platform text default 'android')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if coalesce(btrim(p_token), '') = '' then
    return;
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), coalesce(p_platform, 'android'), now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;
revoke execute on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

create or replace function public.notify_payment_result()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid;
  v_old text := lower(coalesce(OLD.status, ''));
  v_new text := lower(coalesce(NEW.status, ''));
  v_title text;
  v_body text;
  v_secret text;
begin
  if v_old = v_new then
    return NEW;
  end if;

  if v_new ~ '(verif|approv)' then
    v_title := 'Payment verified';
    v_body := 'Accounting verified your payment. Thank you!';
  elsif v_new ~ '(reject|declin)' then
    v_title := 'Payment was not accepted';
    v_body := 'Accounting could not verify your payment. Open the app to see why and submit it again.';
  else
    return NEW;
  end if;

  select coalesce(NEW.user_id, c.user_id) into v_user
  from (select 1) x left join public.clients c on c.id = NEW.client_id;
  if v_user is null then
    return NEW;
  end if;

  select secret into v_secret from public.push_config limit 1;

  perform net.http_post(
    url := 'https://ylqmsghxihtzbaqgkyxi.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('user_id', v_user, 'title', v_title, 'body', v_body)
  );
  return NEW;
exception when others then
  -- A failed alert must never block Accounting from approving a payment.
  return NEW;
end;
$$;

drop trigger if exists payment_submission_push_trigger on public.payment_submissions;
create trigger payment_submission_push_trigger
  after update of status on public.payment_submissions
  for each row execute function public.notify_payment_result();
