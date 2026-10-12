-- Signatures are stored as repair_photos rows, but the check only allowed
-- before/after, so no signature could ever be saved.
alter table public.repair_photos drop constraint if exists repair_photos_photo_type_check;
alter table public.repair_photos
  add constraint repair_photos_photo_type_check check (photo_type = any (array['before'::text, 'after'::text, 'signature'::text]));
