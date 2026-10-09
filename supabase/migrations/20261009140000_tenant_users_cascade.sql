-- Deleting a login (for example in the Supabase dashboard) now also removes
-- their tenant membership, so no ghost staff rows are left behind.
alter table public.tenant_users
  add constraint tenant_users_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
