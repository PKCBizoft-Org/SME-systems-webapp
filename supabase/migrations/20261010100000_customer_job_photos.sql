-- Customers can see the before/after photos a technician took on their own jobs.
-- Files live at jobs/<client id>/<job id>/<file> in the private client-media bucket.
create policy client_media_customer_job_photos on storage.objects
  for select to authenticated
  using (
    bucket_id = 'client-media'
    and (storage.foldername(name))[1] = 'jobs'
    and exists (
      select 1 from public.clients c
      where c.id::text = (storage.foldername(name))[2]
        and c.user_id = (select auth.uid())
    )
  );
