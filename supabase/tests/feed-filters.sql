-- Ana Sayfa / Keşfet süzgeçleri (docs/history/221-*): feed_page çok değerli süzgeçler (p_authors / p_tags / p_tools), 'recommended' sırası,
-- 13/11/10 argümanlı eski imzaların aynı kalması, görünürlüğün korunması, keyset sayfalama, discover_tool_counts.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/feed-filters.sql  ("FAILED=0" beklenir).
-- alice = izleyen (bobby'yi takip eder); bobby, carol = yazarlar.
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
grant execute on function public._check(int, text, boolean, text), public._as_user(text) to public;

insert into public.tags (slug, label) values ('karakter', 'Karakter'), ('kedi', 'Kedi'), ('manzara', 'Manzara') on conflict (slug) do nothing;
-- P1 bobby MJ v7 karakter+kedi | P2 carol MJ karakter | P3 carol Flux karakter+kedi | P4 bobby gizli | P5 bobby taslak | P6 carol midjourneyx | P7 bobby Flux manzara
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, category, tools, status, visibility, created_at, like_count, save_count, comment_count, copy_count) values
  ('f0000000-0000-4000-8000-000000000001', :bobby, 'P1', 'd', 'm', 'image', 'photography', '{midjourney:v7}', 'published', 'public', now() - interval '1 hour', 5, 0, 0, 0),
  ('f0000000-0000-4000-8000-000000000002', :carol, 'P2', 'd', 'm', 'image', 'photography', '{midjourney}', 'published', 'public', now() - interval '2 hours', 1, 10, 0, 0),
  ('f0000000-0000-4000-8000-000000000003', :carol, 'P3', 'd', 'm', 'image', 'photography', '{flux}', 'published', 'public', now() - interval '3 hours', 2, 0, 0, 0),
  ('f0000000-0000-4000-8000-000000000004', :bobby, 'P4 gizli', 'd', 'm', 'image', 'photography', '{midjourney}', 'published', 'private', now() - interval '4 hours', 0, 0, 0, 0),
  ('f0000000-0000-4000-8000-000000000005', :bobby, 'P5 taslak', 'd', 'm', 'image', 'photography', '{midjourney}', 'draft', 'public', now() - interval '5 hours', 0, 0, 0, 0),
  ('f0000000-0000-4000-8000-000000000006', :carol, 'P6', 'd', 'm', 'image', 'photography', '{midjourneyx}', 'published', 'public', now() - interval '6 hours', 0, 0, 0, 0),
  ('f0000000-0000-4000-8000-000000000007', :bobby, 'P7', 'd', 'm', 'image', 'photography', '{flux}', 'published', 'public', now() - interval '7 hours', 0, 0, 0, 7);
insert into public.prompt_tags (prompt_id, tag_slug) values
  ('f0000000-0000-4000-8000-000000000001', 'karakter'), ('f0000000-0000-4000-8000-000000000001', 'kedi'),
  ('f0000000-0000-4000-8000-000000000002', 'karakter'),
  ('f0000000-0000-4000-8000-000000000003', 'karakter'), ('f0000000-0000-4000-8000-000000000003', 'kedi'),
  ('f0000000-0000-4000-8000-000000000004', 'karakter'),
  ('f0000000-0000-4000-8000-000000000007', 'manzara');
-- W1 bobby MJ karakter | W2 carol (araçsız, etiketsiz)
insert into public.workflows (id, creator_id, title, status, visibility, tools, created_at, like_count, save_count, comment_count) values
  ('f1000000-0000-4000-8000-000000000001', :bobby, 'W1', 'published', 'public', '{midjourney}', now() - interval '30 minutes', 0, 0, 0),
  ('f1000000-0000-4000-8000-000000000002', :carol, 'W2', 'published', 'public', '{}', now() - interval '45 minutes', 0, 0, 0);
insert into public.workflow_tags (workflow_id, tag_slug) values ('f1000000-0000-4000-8000-000000000001', 'karakter');
-- İstek R1 carol, Hazır ayar S1 bobby
insert into public.prompt_requests (id, author_id, title, description, content_type, visibility, is_draft, created_at, like_count, comment_count, response_count) values
  ('f2000000-0000-4000-8000-000000000001', :carol, 'R1', 'd', 'image', 'public', false, now() - interval '20 minutes', 0, 0, 0);
insert into public.presets (id, creator_id, title, content_type, status, visibility, tools, created_at, like_count, save_count, comment_count) values
  ('f3000000-0000-4000-8000-000000000001', :bobby, 'S1', 'image', 'published', 'public', '{flux}', now() - interval '10 minutes', 0, 0, 0);
-- Space (akışta paylaşılmış) bobby, alıntı carol → P1
insert into public.spaces (id, owner_id, title, visibility, shared_at, like_count, comment_count) values
  ('f4000000-0000-4000-8000-000000000001', :bobby, 'Space1', 'public', now() - interval '15 minutes', 0, 0);
insert into public.content_quotes (id, author_id, content_type, prompt_id, like_count, comment_count) values
  ('f5000000-0000-4000-8000-000000000001', :carol, 'prompt', 'f0000000-0000-4000-8000-000000000001', 0, 0);
insert into public.follows (follower_id, following_id) values (:alice, :bobby);

-- 16 argümanlı çağrı yardımcısı: başlık listesi (sıralı).
create or replace function public._f(p_scope text, p_order text, p_kinds text[], p_authors uuid[], p_tags text[], p_tools text[],
                                     p_tag text default null, p_tool text default null, p_limit int default 50)
returns text language sql as $$
  select coalesce(string_agg(coalesce(p.title, w.title, r.title, s.title, sp.title, 'quote:' || q.id::text), ',' order by f.sort_rank desc, f.created_at desc, f.id desc), '')
  from public.feed_page(p_scope, p_order, p_kinds, null, null, null, p_limit, null, null, null, false, p_tag, p_tool, p_authors, p_tags, p_tools) f
  left join public.prompts p on f.kind = 'prompt' and p.id = f.id
  left join public.workflows w on f.kind = 'workflow' and w.id = f.id
  left join public.prompt_requests r on f.kind = 'request' and r.id = f.id
  left join public.presets s on f.kind = 'preset' and s.id = f.id
  left join public.spaces sp on f.kind = 'space' and sp.id = f.id
  left join public.content_quotes q on f.kind = 'quote' and q.id = f.id
$$;
grant execute on function public._f(text, text, text[], uuid[], text[], text[], text, text, int) to public;
create or replace function public._ids(variadic names text[]) returns uuid[] language sql as $$
  select array_agg(id) from public.profiles where username = any (names)
$$;
grant execute on function public._ids(text[]) to public;

-- Keyset sayfalama: süzgeç + sıra altında sayfa sayfa gezince hiçbir satır atlanmaz ya da tekrarlanmaz.
create or replace function public._walk(p_scope text, p_order text, p_authors uuid[], p_tags text[], p_tools text[]) returns text language plpgsql as $$
declare cur record; acc text := ''; n int := 0; page_rows int; last_rank bigint := null; last_at timestamptz := null; last_id uuid := null;
begin
  loop
    select count(*) into page_rows from public.feed_page(p_scope, p_order, array['prompt'], null, null, null, 1, last_rank, last_at, last_id, false, null, null, p_authors, p_tags, p_tools);
    exit when page_rows = 0 or n > 20;
    select f.sort_rank, f.created_at, f.id, p.title into cur
      from public.feed_page(p_scope, p_order, array['prompt'], null, null, null, 1, last_rank, last_at, last_id, false, null, null, p_authors, p_tags, p_tools) f
      join public.prompts p on p.id = f.id;
    acc := acc || (case when acc = '' then '' else ',' end) || cur.title;
    last_rank := cur.sort_rank; last_at := cur.created_at; last_id := cur.id; n := n + 1;
  end loop;
  return acc;
end $$;
grant execute on function public._walk(text, text, uuid[], text[], text[]) to public;
set role anon;
select public._as_user('');
select public._check(1, 'süzgeçsiz: yalnız herkese açık + yayında içerik (gizli/taslak yok), eski imza ile aynı sayı',
  (select count(*) from public.feed_page('all', 'newest', null, null, null, null, 50, null, null, null, false, null, null, null, null, null))
   = (select count(*) from public.feed_page('all', 'newest', null, null, null, null, 50, null, null, null, false, null, null))
  and public._f('all', 'newest', array['prompt'], null, null, null) not like '%P4%' and public._f('all', 'newest', array['prompt'], null, null, null) not like '%P5%',
  public._f('all', 'newest', array['prompt'], null, null, null));
select public._check(2, 'boş dizi = süzgeç yok',
  public._f('all', 'newest', array['prompt'], '{}', '{}', '{}') = public._f('all', 'newest', array['prompt'], null, null, null));
select public._check(3, 'kişi süzgeci: yalnız seçilen yazarın içeriği (herkese açık/yayında), gizli/taslak yine yok',
  public._f('all', 'newest', array['prompt'], public._ids('bobby'), null, null) = 'P1,P7',
  public._f('all', 'newest', array['prompt'], public._ids('bobby'), null, null));
select public._check(4, 'çoklu kişi: VEYA (iki yazarın içeriği)',
  public._f('all', 'newest', array['prompt'], public._ids('bobby', 'carol'), null, null) = 'P1,P2,P3,P6,P7',
  public._f('all', 'newest', array['prompt'], public._ids('bobby', 'carol'), null, null));
select public._check(5, 'tek etiket süzgeci',
  public._f('all', 'newest', array['prompt'], null, array['karakter'], null) = 'P1,P2,P3',
  public._f('all', 'newest', array['prompt'], null, array['karakter'], null));
select public._check(6, 'çoklu etiket: HEPSİ gönderide olmalı (VE)',
  public._f('all', 'newest', array['prompt'], null, array['karakter', 'kedi'], null) = 'P1,P3',
  public._f('all', 'newest', array['prompt'], null, array['karakter', 'kedi'], null));
select public._check(7, 'araç süzgeci: "midjourney" ve "midjourney:v7" eşleşir, "midjourneyx" eşleşmez',
  public._f('all', 'newest', array['prompt'], null, null, array['midjourney']) = 'P1,P2',
  public._f('all', 'newest', array['prompt'], null, null, array['midjourney']));
select public._check(8, 'çoklu araç: VEYA',
  public._f('all', 'newest', array['prompt'], null, null, array['midjourney', 'flux']) = 'P1,P2,P3,P7',
  public._f('all', 'newest', array['prompt'], null, null, array['midjourney', 'flux']));
select public._check(9, 'farklı süzgeçler VE ile birleşir (kişi + etiket + araç)',
  public._f('all', 'newest', array['prompt'], public._ids('carol'), array['karakter'], array['midjourney']) = 'P2'
  and public._f('all', 'newest', array['prompt'], public._ids('bobby'), array['karakter'], array['flux']) = '',
  public._f('all', 'newest', array['prompt'], public._ids('carol'), array['karakter'], array['midjourney']));
select public._check(10, 'süzgeçler dört içerik türünde de çalışır (workflow/hazır ayar/istek)',
  public._f('all', 'newest', array['workflow'], public._ids('bobby'), array['karakter'], array['midjourney']) = 'W1'
  and public._f('all', 'newest', array['preset'], public._ids('bobby'), null, array['flux']) = 'S1'
  and public._f('all', 'newest', array['request'], public._ids('carol'), null, null) = 'R1'
  and public._f('all', 'newest', array['request'], public._ids('bobby'), null, null) = '',
  public._f('all', 'newest', array['workflow'], public._ids('bobby'), array['karakter'], array['midjourney']));
select public._check(11, 'kişi süzgeci Space ve alıntıyı sahibine göre süzer; etiket/araç süzgeci ikisini de eler',
  public._f('all', 'newest', array['space'], public._ids('bobby'), null, null) = 'Space1'
  and public._f('all', 'newest', array['space'], public._ids('carol'), null, null) = ''
  and public._f('all', 'newest', array['quote'], public._ids('carol'), null, null) like 'quote:%'
  and public._f('all', 'newest', array['quote'], public._ids('bobby'), null, null) = ''
  and public._f('all', 'newest', array['space'], null, array['karakter'], null) = ''
  and public._f('all', 'newest', array['quote'], null, null, array['midjourney']) = '',
  public._f('all', 'newest', array['space'], public._ids('bobby'), null, null));
select public._check(12, 'eski tek etiket/araç parametreleri (konu sayfası) aynı çalışır',
  public._f('all', 'newest', array['prompt'], null, null, null, 'karakter', null) = 'P1,P2,P3'
  and public._f('all', 'newest', array['prompt'], null, null, null, null, 'midjourney') = 'P1,P2'
  and public._f('all', 'newest', array['prompt'], null, array['kedi'], null, 'karakter', null) = 'P1,P3',
  public._f('all', 'newest', array['prompt'], null, null, null, 'karakter', null));

-- Sıralama: recommended = beğeni×3 + kaydetme×2 + yorum×2 + kopyalama×2.
-- P1: 15, P2: 3+20 = 23, P3: 6, P7: 14 → P2, P1, P7, P3, sonra puanı 0 olanlar en yeni sırasıyla (P6).
select public._check(13, 'recommended sırası: etkileşim puanı (beğeni×3 + kaydetme×2 + yorum×2 + kopyalama×2), eşitlikte en yeni',
  public._f('all', 'recommended', array['prompt'], null, null, null) = 'P2,P1,P7,P3,P6',
  public._f('all', 'recommended', array['prompt'], null, null, null));
select public._check(14, 'popular = yalnız beğeni, used = yalnız kopyalama (prompt), bilinmeyen sıra = en yeni',
  public._f('all', 'popular', array['prompt'], null, null, null) = 'P1,P3,P2,P6,P7'
  and public._f('all', 'used', array['prompt'], null, null, null) = 'P7,P1,P2,P3,P6'
  and public._f('all', 'bilinmeyen', array['prompt'], null, null, null) = public._f('all', 'newest', array['prompt'], null, null, null),
  public._f('all', 'popular', array['prompt'], null, null, null) || ' | ' || public._f('all', 'used', array['prompt'], null, null, null));
select public._check(15, 'recommended + süzgeç birlikte',
  public._f('all', 'recommended', array['prompt'], null, array['karakter'], null) = 'P2,P1,P3',
  public._f('all', 'recommended', array['prompt'], null, array['karakter'], null));

select public._check(16, 'keyset: recommended + süzgeç, sayfa boyutu 1 → tek geçişte aynı sıra',
  public._walk('all', 'recommended', null, array['karakter'], null) = 'P2,P1,P3'
  and public._walk('all', 'newest', public._ids('bobby', 'carol'), null, array['midjourney', 'flux']) = 'P1,P2,P3,P7',
  public._walk('all', 'recommended', null, array['karakter'], null) || ' | ' || public._walk('all', 'newest', public._ids('bobby', 'carol'), null, array['midjourney', 'flux']));

select public._check(17, 'discover_tool_counts: araç başına herkese açık gönderi (modeller tek sayılır, gizli/taslak yok), misafir de okur',
  (select string_agg(tool_id || '=' || post_count, ',' order by post_count desc, tool_id) from public.discover_tool_counts()) = 'flux=3,midjourney=3,midjourneyx=1',
  (select string_agg(tool_id || '=' || post_count, ',' order by post_count desc, tool_id) from public.discover_tool_counts()));

reset role;
set role authenticated;
select public._as_user(:alice);
select public._check(18, 'takip kapsamı + süzgeçler: yalnız takip edilenlerin gönderisi, sonra süzgeç VE ile daralır',
  public._f('following', 'newest', array['prompt'], null, null, null) = 'P1,P7'
  and public._f('following', 'newest', array['prompt'], null, array['kedi'], null) = 'P1'
  and public._f('following', 'newest', array['prompt'], public._ids('carol'), null, null) = '',
  public._f('following', 'newest', array['prompt'], null, null, null));
select public._check(19, 'takip kapsamı kronolojik: en yeni önce (tüm türler)',
  public._f('following', 'newest', null, null, null, null) = 'S1,Space1,W1,P1,P7',
  public._f('following', 'newest', null, null, null, null));
reset role;

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
