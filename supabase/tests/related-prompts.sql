-- "Benzer promptlar" (related_prompts; docs/history/274-*): DNA + etiket + kategori tek puanda; biçim bölümleri ve yaygın sözcükler DNA eşleşmesi değil.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/related-prompts.sql  ("FAILED=0" beklenir).
-- alice = kaynak prompt'un yazarı; bobby = diğer yazar.
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby')) as u(id, name);

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
grant execute on function public._check(int, text, boolean, text) to public;

insert into public.tags (slug, label) values ('neon', 'Neon'), ('sehir', 'Şehir') on conflict do nothing;

-- s1 = kaynak (art / sub_x, etiket neon + sehir; DNA: konu "neon city", ışık "neon light", biçim "json output", konu ayrıca yaygın sözcük "ortak").
-- c1 = aynı kategori + iki ortak etiket · c2 = farklı kategori, yalnız BİÇİM bölümünde ortak · c3 = farklı kategori, ışıkta "neon" ortak
-- c4 = farklı kategori, yalnız yaygın "ortak" sözcüğü ortak · c5 = yalnız aynı kategori · c6 = aynı yazar, hiçbir şey ortak değil
-- c7 = gizli · c8 = taslak (ikisi de ortak etiketli).
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, category, subcategory, status, visibility, like_count) values
  ('d0000000-0000-4000-8000-000000000001', :alice, 'Kaynak', 'd', 'm', 'image', 'art', 'sub_x', 'published', 'public', 0),
  ('d0000000-0000-4000-8000-0000000000c1', :bobby, 'C1 aynı kategori + iki etiket', 'd', 'm', 'image', 'art', 'sub_x', 'published', 'public', 0),
  ('d0000000-0000-4000-8000-0000000000c2', :bobby, 'C2 yalnız biçim ortak', 'd', 'm', 'image', 'photo', null, 'published', 'public', 0),
  ('d0000000-0000-4000-8000-0000000000c3', :bobby, 'C3 ışık ortak', 'd', 'm', 'image', 'photo', null, 'published', 'public', 0),
  ('d0000000-0000-4000-8000-0000000000c4', :bobby, 'C4 yaygın sözcük', 'd', 'm', 'image', 'photo', null, 'published', 'public', 0),
  ('d0000000-0000-4000-8000-0000000000c5', :bobby, 'C5 yalnız kategori', 'd', 'm', 'image', 'art', 'sub_y', 'published', 'public', 0),
  ('d0000000-0000-4000-8000-0000000000c6', :alice, 'C6 aynı yazar', 'd', 'm', 'text', 'writing', null, 'published', 'public', 0),
  ('d0000000-0000-4000-8000-0000000000c7', :bobby, 'C7 gizli', 'd', 'm', 'image', 'art', 'sub_x', 'published', 'private', 0),
  ('d0000000-0000-4000-8000-0000000000c8', :bobby, 'C8 taslak', 'd', 'm', 'image', 'art', 'sub_x', 'draft', 'public', 0);
-- 80 dolgu prompt: hepsinde "ortak" sözcüğü → %5'i aşar (yaygın).
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, category, status, visibility)
select ('d1000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, :bobby, 'Dolgu ' || g, 'd', 'm', 'text', 'filler', 'published', 'public'
from generate_series(1, 80) g;
insert into public.prompt_dna_sections (prompt_id, type, content)
select ('d1000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'task', 'ortak gorev ' || g from generate_series(1, 80) g;

insert into public.prompt_tags (prompt_id, tag_slug) values
  ('d0000000-0000-4000-8000-000000000001', 'neon'), ('d0000000-0000-4000-8000-000000000001', 'sehir'),
  ('d0000000-0000-4000-8000-0000000000c1', 'neon'), ('d0000000-0000-4000-8000-0000000000c1', 'sehir'),
  ('d0000000-0000-4000-8000-0000000000c7', 'neon'), ('d0000000-0000-4000-8000-0000000000c8', 'neon');
insert into public.prompt_dna_sections (prompt_id, type, content) values
  ('d0000000-0000-4000-8000-000000000001', 'subject', 'neon city, ortak sokak'),
  ('d0000000-0000-4000-8000-000000000001', 'lighting', 'neon light'),
  ('d0000000-0000-4000-8000-000000000001', 'format', 'json output'),
  ('d0000000-0000-4000-8000-0000000000c2', 'format', 'json output'),
  ('d0000000-0000-4000-8000-0000000000c3', 'lighting', 'neon glow'),
  ('d0000000-0000-4000-8000-0000000000c4', 'subject', 'ortak bahce');

select public._check(1, 'imza değişmedi: id, dna_hits, tag_hits',
  pg_get_function_result('public.related_prompts(uuid,integer)'::regprocedure) = 'TABLE(id uuid, dna_hits integer, tag_hits integer)');

create temp table r as
  select row_number() over () as k, * from public.related_prompts('d0000000-0000-4000-8000-000000000001', 12);

select public._check(2, 'kaynak kendisi listede yok', not exists (select 1 from r where id = 'd0000000-0000-4000-8000-000000000001'));
select public._check(3, 'iki ortak etiket + aynı alt kategori + kategori en üstte',
  (select id from r where k = 1) = 'd0000000-0000-4000-8000-0000000000c1' and (select tag_hits from r where k = 1) = 2);
select public._check(4, 'yalnız biçim bölümünde ortak olan aday OLMAZ',
  not exists (select 1 from r where id = 'd0000000-0000-4000-8000-0000000000c2'));
select public._check(5, 'yalnız yaygın sözcük ("ortak") ortak olan aday OLMAZ',
  not exists (select 1 from r where id = 'd0000000-0000-4000-8000-0000000000c4'));
select public._check(6, 'tanımlayıcı bölümde (ışık: neon) ortak olan aday olur, dna_hits = 1',
  (select dna_hits from r where id = 'd0000000-0000-4000-8000-0000000000c3') = 1);
select public._check(7, 'yalnız aynı kategori (3 puan) ışık eşleşmesinden (2 puan) önce gelir',
  (select k from r where id = 'd0000000-0000-4000-8000-0000000000c5') < (select k from r where id = 'd0000000-0000-4000-8000-0000000000c3'));
select public._check(8, 'yalnız "aynı yazar" benzerlik sayılmaz',
  not exists (select 1 from r where id = 'd0000000-0000-4000-8000-0000000000c6'));
select public._check(9, 'gizli ve taslak prompt dönmez',
  not exists (select 1 from r where id in ('d0000000-0000-4000-8000-0000000000c7', 'd0000000-0000-4000-8000-0000000000c8')));
select public._check(10, 'tam sıra: c1, c5, c3',
  (select string_agg(right(id::text, 2), ',' order by k) from r) = 'c1,c5,c3');
select public._check(11, 'p_limit en az 1 döndürür',
  (select count(*) from public.related_prompts('d0000000-0000-4000-8000-000000000001', 0)) = 1);
select public._check(12, 'p_limit 12 ile sınırlı',
  (select count(*) from public.related_prompts('d0000000-0000-4000-8000-000000000001', 100)) <= 12);
select public._check(13, 'anon çalıştırabilir, public rolü yetkisi kapalı',
  has_function_privilege('anon', 'public.related_prompts(uuid,integer)', 'execute')
  and has_function_privilege('authenticated', 'public.related_prompts(uuid,integer)', 'execute'));
select public._check(14, 'olmayan kaynak için boş döner',
  (select count(*) from public.related_prompts('d0000000-0000-4000-8000-00000000ffff', 4)) = 0);

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
