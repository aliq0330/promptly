-- Konu sayfaları (docs/history/211-*): feed_page etiket/araç süzgeci + 11/10 argümanlı biçimlerin aynı kalması, feed_count,
-- tool_follows RLS + sınır, for_you_page araç sinyali.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/topic-pages.sql  ("FAILED=0" beklenir).
-- alice = izleyen; bobby, carol = yazarlar.
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol')) as u(id, name);

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

insert into public.tags (slug, label) values ('karakter', 'Karakter'), ('kedi', 'Kedi');
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, category, subcategory, tools, status, visibility, created_at) values
  ('f0000000-0000-4000-8000-000000000001', :bobby, 'MJ v7 karakter', 'd', 'm', 'image', 'human_character', 'character_design', '{midjourney:v7}', 'published', 'public', now() - interval '1 hour'),
  ('f0000000-0000-4000-8000-000000000002', :carol, 'MJ düz', 'd', 'm', 'image', 'photography', null, '{midjourney}', 'published', 'public', now() - interval '2 hours'),
  ('f0000000-0000-4000-8000-000000000003', :carol, 'Flux karakter', 'd', 'm', 'image', 'human_character', null, '{flux}', 'published', 'public', now() - interval '3 hours'),
  ('f0000000-0000-4000-8000-000000000004', :bobby, 'Gizli MJ', 'd', 'm', 'image', 'human_character', null, '{midjourney}', 'published', 'private', now() - interval '4 hours'),
  ('f0000000-0000-4000-8000-000000000005', :bobby, 'Taslak MJ', 'd', 'm', 'image', 'human_character', null, '{midjourney}', 'draft', 'public', now() - interval '5 hours'),
  ('f0000000-0000-4000-8000-000000000006', :carol, 'midjourneyx benzeri ad', 'd', 'm', 'image', null, null, '{midjourneyx}', 'published', 'public', now() - interval '6 hours');
insert into public.prompt_tags (prompt_id, tag_slug) values
  ('f0000000-0000-4000-8000-000000000001', 'karakter'),
  ('f0000000-0000-4000-8000-000000000003', 'karakter'),
  ('f0000000-0000-4000-8000-000000000004', 'karakter'),
  ('f0000000-0000-4000-8000-000000000002', 'kedi');
insert into public.workflows (id, creator_id, title, status, visibility, tools, created_at) values
  ('f1000000-0000-4000-8000-000000000001', :bobby, 'MJ workflow', 'published', 'public', '{midjourney}', now() - interval '30 minutes');
insert into public.workflow_tags (workflow_id, tag_slug) values ('f1000000-0000-4000-8000-000000000001', 'karakter');

-- 13 argümanlı çağrı yardımcısı: kimlik listesi (sıralı).
create or replace function public._feed(p_tag text, p_tool text, p_category text default null, p_subcategory text default null)
returns text language sql as $$
  select coalesce(string_agg(title, ',' order by created_at desc), '')
  from (
    select f.created_at, coalesce(p.title, w.title) as title
    from public.feed_page('all', 'newest', null, null, p_category, p_subcategory, 50, null, null, null, false, p_tag, p_tool) f
    left join public.prompts p on p.id = f.id
    left join public.workflows w on w.id = f.id
  ) s
$$;
grant execute on function public._feed(text, text, text, text) to public;

set role anon;
select public._as_user('');
select public._check(1, 'etiket süzgeci: yalnız o etiketli herkese açık içerik (prompt + workflow), gizli/taslak yok',
  public._feed('karakter', null) = 'MJ workflow,MJ v7 karakter,Flux karakter', public._feed('karakter', null));
select public._check(2, 'araç süzgeci: "midjourney" ve "midjourney:v7" eşleşir, benzer adlı başka araç eşleşmez',
  public._feed(null, 'midjourney') = 'MJ workflow,MJ v7 karakter,MJ düz', public._feed(null, 'midjourney'));
select public._check(3, 'araç + kategori + alt kategori birlikte',
  public._feed(null, 'midjourney', 'human_character', 'character_design') = 'MJ v7 karakter', public._feed(null, 'midjourney', 'human_character', 'character_design'));
select public._check(4, '11 argümanlı biçim aynı kalır (süzgeçsiz tüm herkese açık içerik)',
  (select count(*) from public.feed_page('all', 'newest', null, null, null, null, 50, null, null, null, false)) = 5);
select public._check(5, '10 argümanlı biçim de çalışır',
  (select count(*) from public.feed_page('all', 'newest', null, null, null, null, 50, null, null, null)) = 5);
select public._check(6, 'feed_count: etiket / araç / kategori sayıları feed_page ile aynı',
  public.feed_count(null, null, null, 'karakter', null) = 3
  and public.feed_count(null, null, null, null, 'midjourney') = 3
  and public.feed_count('image', 'human_character', null, null, null) = 2);
select public._check(7, 'misafir araç takip edemez',
  public._try($q$insert into public.tool_follows (user_id, tool_id) values ('11111111-1111-4111-8111-111111111111', 'midjourney')$q$) <> 'ok');

reset role;
set role authenticated;
select public._as_user(:alice);
select public._check(8, 'kullanıcı kendi adına araç takip eder',
  public._try($q$insert into public.tool_follows (user_id, tool_id) values ('11111111-1111-4111-8111-111111111111', 'midjourney')$q$) = 'ok');
select public._check(9, 'başkası adına takip ekleyemez',
  public._try($q$insert into public.tool_follows (user_id, tool_id) values ('22222222-2222-4222-8222-222222222222', 'flux')$q$) <> 'ok');
select public._check(10, 'geçersiz araç kimliği reddedilir',
  public._try($q$insert into public.tool_follows (user_id, tool_id) values ('11111111-1111-4111-8111-111111111111', 'Mid Journey!')$q$) <> 'ok');
select public._check(11, 'Sana özel: takip edilen araçla yapılan içeriğin nedeni "tool"',
  (select reason_kind || ':' || coalesce(reason_ref, '') from public.for_you_page(now(), null, null, null, null, 50, null, null, null)
    where id = 'f0000000-0000-4000-8000-000000000002') = 'tool:midjourney');
select public._check(12, 'Sana özel: takip edilen araç olmayan içerik "tool" nedeni almaz',
  (select reason_kind from public.for_you_page(now(), null, null, null, null, 50, null, null, null)
    where id = 'f0000000-0000-4000-8000-000000000003') <> 'tool');

reset role;
set role authenticated;
select public._as_user(:bobby);
select public._check(13, 'başkasının takiplerini okuyamaz',
  (select count(*) from public.tool_follows) = 0);
reset role;

-- Sınır: 100 takipten sonra hata.
insert into public.tool_follows (user_id, tool_id) select :carol, 't' || g from generate_series(1, 100) g;
select public._check(14, '101. araç takibi reddedilir',
  public._try($q$insert into public.tool_follows (user_id, tool_id) values ('33333333-3333-4333-8333-333333333333', 'fazla')$q$) ilike '%tool_follow_limit%');

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
