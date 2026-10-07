-- Lets a signed-in customer change their own mobile (GCash) number.
create or replace function public.update_my_mobile(p_mobile text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_clean text;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  v_clean := regexp_replace(coalesce(p_mobile, ''), '[\s-]', '', 'g');
  if v_clean ~ '^\+63' then
    v_clean := '0' || substr(v_clean, 4);
  end if;
  if v_clean !~ '^09[0-9]{9}$' then
    raise exception 'Enter a valid mobile number, like 09123456789.';
  end if;

  update public.user_profiles set mobile_number = v_clean, updated_at = now() where user_id = v_uid;
  update public.clients set mobile_number = v_clean where user_id = v_uid;

  return v_clean;
end;
$$;
revoke execute on function public.update_my_mobile(text) from public, anon;
grant execute on function public.update_my_mobile(text) to authenticated;
notify pgrst, 'reload schema';
