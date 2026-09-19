-- Promptly — Bölüm 20: Supabase Storage.
--
-- Three public buckets, one per place the app today embeds an image as a
-- base64 data URL in localStorage (a stand-in that only works because
-- nothing is shared across users/devices yet — see CLAUDE.md's Bölüm
-- 12/17 status notes on resizeImageToDataUrl/resizeImageToDataUrlFit):
--   - avatars              — profile pictures (/profile/edit)
--   - prompt-media         — prompt images (image-type prompts only)
--   - request-references   — optional reference image on a prompt request
--
-- All three are PUBLIC read buckets (this is a public discovery platform —
-- CLAUDE.md §1 — anonymous visitors already read prompts/profiles freely
-- under Bölüm 19's RLS policies; the images inside them are no more
-- sensitive than the rows that reference them). Writes are restricted by
-- path: every object's key must start with the uploader's own
-- auth.uid(), enforced via storage.foldername(name) — the standard
-- Supabase pattern for per-user object ownership, since storage.objects'
-- own RLS can't cheaply join back to public.prompts/profiles.
--
-- Path convention (for Bölüm 21's frontend implementation):
--   avatars/{user_id}/avatar.<ext>              (one file, overwritten on re-upload)
--   prompt-media/{user_id}/{prompt_id}-{n}.<ext>
--   request-references/{user_id}/{request_id}.<ext>
--
-- Nothing in the frontend uploads to these buckets yet — that's Bölüm
-- 21's job, same staging as Bölüm 18 (schema) → Bölüm 19 (RLS) → Bölüm 21
-- (frontend wiring) before it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('prompt-media', 'prompt-media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('request-references', 'request-references', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- === avatars ===============================================================

create policy "Avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can replace their own avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- === prompt-media ===========================================================

create policy "Prompt media images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'prompt-media');

create policy "Users can upload prompt media under their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'prompt-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own prompt media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'prompt-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- === request-references =====================================================

create policy "Request reference images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'request-references');

create policy "Users can upload request references under their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'request-references'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own request reference"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'request-references' and (storage.foldername(name))[1] = auth.uid()::text);
