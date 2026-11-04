-- Kişisel API / MCP ile taslağa görsel ekleme (20261104130000_api_me_media.sql; docs/history/333-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/api-me-media.sql  ("FAILED=0" beklenir).
-- me = anahtar sahibi; ot = başkası. Edge Function'ın yaptığı gibi: rol + JWT iddiaları kurulup RPC çağrılır.
-- p1 benim taslak görsel promptum, p2 benim taslak METİN promptum, p3 benim YAYINDA görsel promptum, p4 başkasının taslağı, p5 topluluğa özgü, p6 silinmiş,
-- p7 benim taslak görsel promptum (sıra/sınır testi için ayrı).
\pset pager off
\set ON_ERROR_STOP off
\set me '''11111111-1111-4111-8111-111111111111'''
\set ot '''22222222-2222-4222-8222-222222222222'''
\set meid '11111111-1111-4111-8111-111111111111'
\set p1 'a7000000-0000-4000-8000-000000000001'
\set p2 'a7000000-0000-4000-8000-000000000002'
\set p3 'a7000000-0000-4000-8000-000000000003'
\set p4 'a7000000-0000-4000-8000-000000000004'
\set p5 'a7000000-0000-4000-8000-000000000005'
\set p6 'a7000000-0000-4000-8000-000000000006'
\set p7 'a7000000-0000-4000-8000-000000000007'

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:me,'me'),(:ot,'ot')) as u(id, name);

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false);
end $$;
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text) to public;

insert into public.conversations (id, kind) values ('e7100000-0000-4000-8000-000000000001', 'group');
insert into public.chat_groups (id, name, created_by) values ('e7100000-0000-4000-8000-000000000001', 'Topluluk', :me);

insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id, deleted_at) values
  (:'p1', :me, 'P1 taslak görsel', 'd', 'metin', 'image', 'draft', 'private', null, null),
  (:'p2', :me, 'P2 taslak metin', 'd', 'metin', 'text', 'draft', 'private', null, null),
  (:'p3', :me, 'P3 yayında görsel', 'd', 'metin', 'image', 'published', 'public', null, null),
  (:'p4', :ot, 'P4 başkası', 'd', 'metin', 'image', 'draft', 'private', null, null),
  (:'p5', :me, 'P5 topluluk', 'd', 'metin', 'image', 'published', 'private', 'e7100000-0000-4000-8000-000000000001', null),
  (:'p6', :me, 'P6 silinmiş', 'd', 'metin', 'image', 'draft', 'private', null, now()),
  (:'p7', :me, 'P7 taslak görsel', 'd', 'metin', 'image', 'draft', 'private', null, null);

-- Yüklenmiş dosyalar (Storage'a Edge Function yazar; burada nesne satırı taklit edilir). Yerel taklitte tablo yetkisi yok, gerçekte var.
grant select, insert, delete on storage.objects to anon, authenticated;
insert into storage.objects (bucket_id, name, owner) values
  ('prompt-media', '11111111-1111-4111-8111-111111111111/b0000000-0000-4000-8000-000000000001.jpg', :me),
  ('prompt-media', '11111111-1111-4111-8111-111111111111/b0000000-0000-4000-8000-000000000002.png', :me),
  ('prompt-media', '11111111-1111-4111-8111-111111111111/b0000000-0000-4000-8000-000000000003.webp', :me),
  ('prompt-media', '11111111-1111-4111-8111-111111111111/b0000000-0000-4000-8000-000000000004.jpg', :me),
  ('prompt-media', '11111111-1111-4111-8111-111111111111/b0000000-0000-4000-8000-000000000005.jpg', :me),
  ('prompt-media', '11111111-1111-4111-8111-111111111111/b0000000-0000-4000-8000-000000000006.jpg', :me),
  ('prompt-media', '22222222-2222-4222-8222-222222222222/b0000000-0000-4000-8000-0000000000aa.jpg', :ot);


set role authenticated;
select public._as_user(:me);

-- --- begin ---------------------------------------------------------------------------------------------------------------------------------------------
select public._check(1, 'begin: my draft image prompt → ok, my id, no images yet',
  (select r->>'ok' = 'true' and r->>'userId' = :'meid' and (r->>'count')::int = 0 from (select public.api_me_media_begin(:'p1') r) s));
select public._check(2, 'begin refusals: others'' draft, community-only, deleted, unknown → not_found',
  (select bool_and(public.api_me_media_begin(id)->>'code' = 'not_found') from unnest(array[:'p4', :'p5', :'p6', 'a7000000-0000-4000-8000-0000000000ff']::uuid[]) id));
select public._check(3, 'begin refusals: published → not_draft; text prompt → not_image_prompt',
  public.api_me_media_begin(:'p3')->>'code' = 'not_draft' and public.api_me_media_begin(:'p2')->>'code' = 'not_image_prompt');

-- Yardımcı: dosya adı (b0000000-…-00000000000N.ext) → yol + kimlik adresi ile commit.
reset role;
create or replace function public._commit(p uuid, file text, w int, h int, alt text default null) returns jsonb language sql as $$
  select public.api_me_media_commit(p, '11111111-1111-4111-8111-111111111111/' || file,
    'https://x.supabase.co/storage/v1/object/public/prompt-media/11111111-1111-4111-8111-111111111111/' || file, w, h, alt) $$;
grant execute on function public._commit(uuid, text, int, int, text) to public;
set role authenticated;
select public._as_user(:me);

-- --- commit --------------------------------------------------------------------------------------------------------------------------------------------
create temp table _r4 as select public._commit(:'p1', 'b0000000-0000-4000-8000-000000000001.jpg', 1600, 900, ' Bir tilki ') as r;
select public._check(4, 'commit: valid → ok, first image at position 0, identity URL, trimmed alt',
  (select r->>'ok' = 'true' and (r->>'position')::int = 0 and (r->>'count')::int = 1 from _r4)
  and exists (select 1 from public.prompt_media m where m.prompt_id = :'p1' and m.position = 0 and m.width = 1600 and m.height = 900
              and m.url = 'https://x.supabase.co/storage/v1/object/public/prompt-media/11111111-1111-4111-8111-111111111111/b0000000-0000-4000-8000-000000000001.jpg' and m.alt = 'Bir tilki'));
select public._check(5, 'commit: the same file cannot be attached twice',
  public._commit(:'p1', 'b0000000-0000-4000-8000-000000000001.jpg', 1600, 900)->>'code' = 'already_attached');
select public._check(6, 'commit: a file that was never uploaded → file_missing (nothing inserted)',
  public._commit(:'p1', 'b0000000-0000-4000-8000-0000000000ee.jpg', 10, 10)->>'code' = 'file_missing'
  and (select count(*) = 1 from public.prompt_media where prompt_id = :'p1'));
select public._check(7, 'commit: path must be MY folder, a uuid name and jpg/png/webp',
  public.api_me_media_commit(:'p1', '22222222-2222-4222-8222-222222222222/b0000000-0000-4000-8000-0000000000aa.jpg', 'https://x.supabase.co/storage/v1/object/public/prompt-media/22222222-2222-4222-8222-222222222222/b0000000-0000-4000-8000-0000000000aa.jpg', 10, 10)->>'code' = 'invalid_path'
  and public.api_me_media_commit(:'p1', '../x.jpg', 'https://x.supabase.co/storage/v1/object/public/prompt-media/../x.jpg', 10, 10)->>'code' = 'invalid_path'
  and public.api_me_media_commit(:'p1', :'meid' || '/b0000000-0000-4000-8000-000000000002.svg', 'https://x.supabase.co/storage/v1/object/public/prompt-media/' || :'meid' || '/b0000000-0000-4000-8000-000000000002.svg', 10, 10)->>'code' = 'invalid_path'
  and public.api_me_media_commit(:'p1', :'meid' || '/not-a-uuid.jpg', 'https://x.supabase.co/storage/v1/object/public/prompt-media/' || :'meid' || '/not-a-uuid.jpg', 10, 10)->>'code' = 'invalid_path'
  and public.api_me_media_commit(:'p1', null, null, 10, 10)->>'code' = 'invalid_path');
select public._check(8, 'commit: the stored URL must be the https identity URL of THAT path',
  public.api_me_media_commit(:'p1', :'meid' || '/b0000000-0000-4000-8000-000000000002.png', 'https://evil.example.com/pic.png', 10, 10)->>'code' = 'invalid_url'
  and public.api_me_media_commit(:'p1', :'meid' || '/b0000000-0000-4000-8000-000000000002.png', 'http://x.supabase.co/storage/v1/object/public/prompt-media/' || :'meid' || '/b0000000-0000-4000-8000-000000000002.png', 10, 10)->>'code' = 'invalid_url'
  and public.api_me_media_commit(:'p1', :'meid' || '/b0000000-0000-4000-8000-000000000002.png', 'https://x.supabase.co/storage/v1/object/public/prompt-media/' || :'meid' || '/b0000000-0000-4000-8000-000000000003.webp', 10, 10)->>'code' = 'invalid_url'
  and public.api_me_media_commit(:'p1', :'meid' || '/b0000000-0000-4000-8000-000000000002.png', 'https://x.supabase.co/storage/v1/object/public/result-media/' || :'meid' || '/b0000000-0000-4000-8000-000000000002.png', 10, 10)->>'code' = 'invalid_url');
select public._check(9, 'commit: dimensions and alt are bounded',
  public._commit(:'p1', 'b0000000-0000-4000-8000-000000000002.png', 0, 10)->>'code' = 'invalid_size'
  and public._commit(:'p1', 'b0000000-0000-4000-8000-000000000002.png', 10, 20001)->>'code' = 'invalid_size'
  and public._commit(:'p1', 'b0000000-0000-4000-8000-000000000002.png', 10, 10, repeat('a', 301))->>'code' = 'invalid_alt');
select public._check(10, 'commit refusals match begin: others'' / community / deleted → not_found; published → not_draft; text → not_image_prompt',
  public._commit(:'p4', 'b0000000-0000-4000-8000-000000000002.png', 10, 10)->>'code' = 'not_found'
  and public._commit(:'p5', 'b0000000-0000-4000-8000-000000000002.png', 10, 10)->>'code' = 'not_found'
  and public._commit(:'p6', 'b0000000-0000-4000-8000-000000000002.png', 10, 10)->>'code' = 'not_found'
  and public._commit(:'p3', 'b0000000-0000-4000-8000-000000000002.png', 10, 10)->>'code' = 'not_draft'
  and public._commit(:'p2', 'b0000000-0000-4000-8000-000000000002.png', 10, 10)->>'code' = 'not_image_prompt'
  and (select count(*) = 0 from public.prompt_media where prompt_id in (:'p2', :'p3', :'p4', :'p5', :'p6')));

-- --- Sıra ve en çok 4 görsel ---------------------------------------------------------------------------------------------------------------------------
create temp table _r11 as select n, public._commit(:'p7', f, 800, 600) as r
  from (values (0, 'b0000000-0000-4000-8000-000000000002.png'), (1, 'b0000000-0000-4000-8000-000000000003.webp'), (2, 'b0000000-0000-4000-8000-000000000004.jpg'), (3, 'b0000000-0000-4000-8000-000000000005.jpg')) v(n, f);
select public._check(11, 'commit: positions run 0,1,2,3 and the 5th image is refused (begin says so too)',
  (select bool_and((r->>'position')::int = n and r->>'ok' = 'true') from _r11)
  and (select (r->>'count')::int = 4 from _r11 where n = 3)
  and (select count(*) = 4 from public.prompt_media where prompt_id = :'p7')
  and public._commit(:'p7', 'b0000000-0000-4000-8000-000000000006.jpg', 800, 600)->>'code' = 'too_many_images'
  and public.api_me_media_begin(:'p7')->>'code' = 'too_many_images');

-- --- Başkası ve anon -----------------------------------------------------------------------------------------------------------------------------------
select public._as_user(:ot);
select public._check(12, 'the other user cannot begin/commit on MY draft (and cannot see my rows)',
  public.api_me_media_begin(:'p1')->>'code' = 'not_found'
  and public.api_me_media_commit(:'p1', :'meid' || '/b0000000-0000-4000-8000-000000000002.png', 'https://x.supabase.co/storage/v1/object/public/prompt-media/' || :'meid' || '/b0000000-0000-4000-8000-000000000002.png', 10, 10)->>'code' in ('invalid_path', 'not_found'));

set role anon;
select public._as_user('');
select public._check(13, 'anon cannot call either function',
  public._try($q$ select public.api_me_media_begin('a7000000-0000-4000-8000-000000000001') $q$) ilike '%permission denied%'
  and public._try($q$ select public.api_me_media_commit('a7000000-0000-4000-8000-000000000001', 'x', 'y', 1, 1) $q$) ilike '%permission denied%');

-- --- Hız sınırı: saatte 20 deneme ----------------------------------------------------------------------------------------------------------------------
reset role;
set role authenticated;
select public._as_user(:me);
select public._check(14, 'begin is rate limited: attempts are counted, the 21st within the hour fails with rate_limit',
  (select count(*) filter (where public._try(format($q$ select public.api_me_media_begin(%L) $q$, :'p1')) = 'ok') >= 1 from generate_series(1, 30))
  and public._try(format($q$ select public.api_me_media_begin(%L) $q$, :'p1')) ilike '%rate_limit%');
reset role;

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
