-- Private media buckets: a post's files are readable only while the post is.
--
-- Problem: `prompt-media`, `request-references` and `result-media` were PUBLIC
-- buckets. A public bucket serves every object at /object/public/<bucket>/<path>
-- to anyone who knows the URL, no matter what the row that references the file
-- says — so a prompt/request set to `private` (or still a draft) kept
-- world-readable images, posters, videos and audio.
--
-- Fix (non-destructive: no table/bucket/object/policy is dropped, no object is
-- moved or rewritten, the URLs stored in the rows stay as they are):
--   1) The three buckets become PRIVATE. The old /object/public/… URLs stop
--      working for everyone; the app resolves a short-lived signed URL
--      (`createSignedUrl(s)`) for every file it shows.
--   2) Their SELECT policies — which used to be `bucket_id = …` — now follow the
--      rows that reference the file. A file is readable when
--        - it sits in the caller's own `{auth.uid()}/…` folder (the author keeps
--          seeing their private/draft files), OR
--        - some row that points at it is itself readable BY THE CALLER. The
--          sub-selects run with the caller's RLS, so they inherit exactly the
--          visibility rules of prompts / prompt_requests (published + public,
--          or own) — flip a post to private and the file stops being readable
--          at once, flip it back and it is readable again; there is no copy of
--          the file to keep in sync.
--      Referencing rows (not file names) are used on purpose: "Kopyasını
--      Oluştur" and a video/audio prompt's poster re-point a row at a file that
--      lives in another row's folder, and that must keep working.
--   3) Moderators (the admin console's file list) keep read access.
--
-- Known limit: a signed URL is a bearer token. One already handed out stays
-- valid until it expires (the app asks for 10 minutes), even if the post turns
-- private in between. That window is the price of signed URLs.
--
-- Avatars stay public on purpose. Message photos were already private.
--
-- No function is created, so there is no `search_path`/EXECUTE surface; the
-- moderator policy only calls the existing `is_moderator()` (granted to
-- `authenticated`). Policies are changed with ALTER POLICY (no DROP).
--
-- Apply AFTER the matching frontend is deployed: the old frontend renders the
-- stored public URLs directly and would show broken images once this runs.

-- 1) Buckets -> private ------------------------------------------------------
update storage.buckets
   set public = false
 where id in ('prompt-media', 'request-references', 'result-media')
   and public is distinct from false;

-- 2) Indexes so "which row references this object" is an index lookup ---------
-- The policies below compare the object path with the path part of the stored
-- URL; these expression indexes use the very same expression.
create index if not exists prompt_media_prompt_media_path_idx
  on public.prompt_media ((substring(url from '/storage/v1/object/public/prompt-media/([^?#]+)')));
create index if not exists prompt_media_result_media_path_idx
  on public.prompt_media ((substring(url from '/storage/v1/object/public/result-media/([^?#]+)')));
create index if not exists prompt_request_media_path_idx
  on public.prompt_request_media ((substring(url from '/storage/v1/object/public/request-references/([^?#]+)')));
create index if not exists prompt_requests_reference_path_idx
  on public.prompt_requests ((substring(reference_image_url from '/storage/v1/object/public/request-references/([^?#]+)')));
create index if not exists prompt_results_media_path_idx
  on public.prompt_results ((substring(media_url from '/storage/v1/object/public/result-media/([^?#]+)')));
create index if not exists prompt_results_thumbnail_path_idx
  on public.prompt_results ((substring(thumbnail_url from '/storage/v1/object/public/result-media/([^?#]+)')));

-- 3) SELECT policies follow the referencing rows -----------------------------
alter policy "Prompt media images are publicly readable" on storage.objects
  rename to "Prompt media is readable while its prompt is";
alter policy "Prompt media is readable while its prompt is" on storage.objects
  using (
    bucket_id = 'prompt-media'
    and (
      (storage.foldername(objects.name))[1] = auth.uid()::text
      or exists (
        select 1 from public.prompt_media m
        where substring(m.url from '/storage/v1/object/public/prompt-media/([^?#]+)') = objects.name
      )
    )
  );

alter policy "Request reference images are publicly readable" on storage.objects
  rename to "Request references are readable while their request is";
alter policy "Request references are readable while their request is" on storage.objects
  using (
    bucket_id = 'request-references'
    and (
      (storage.foldername(objects.name))[1] = auth.uid()::text
      or exists (
        select 1 from public.prompt_request_media m
        where substring(m.url from '/storage/v1/object/public/request-references/([^?#]+)') = objects.name
      )
      or exists (
        select 1 from public.prompt_requests r
        where substring(r.reference_image_url from '/storage/v1/object/public/request-references/([^?#]+)') = objects.name
      )
    )
  );

alter policy "Result media is publicly readable" on storage.objects
  rename to "Result media is readable while its prompt is";
alter policy "Result media is readable while its prompt is" on storage.objects
  using (
    bucket_id = 'result-media'
    and (
      (storage.foldername(objects.name))[1] = auth.uid()::text
      or exists (
        select 1 from public.prompt_results r
        where substring(r.media_url from '/storage/v1/object/public/result-media/([^?#]+)') = objects.name
           or substring(r.thumbnail_url from '/storage/v1/object/public/result-media/([^?#]+)') = objects.name
      )
      or exists (
        select 1 from public.prompt_media m
        where substring(m.url from '/storage/v1/object/public/result-media/([^?#]+)') = objects.name
      )
    )
  );

-- 4) Moderators can still open any file from the admin console ----------------
-- Separate `authenticated`-only policy: the three policies above are evaluated
-- for `anon` too, and `anon` has no EXECUTE on `is_moderator()`.
create policy "Moderators can read post media"
  on storage.objects for select
  to authenticated
  using (
    bucket_id in ('prompt-media', 'request-references', 'result-media')
    and public.is_moderator()
  );
