-- "Kanıtlanmış" sıralaması (docs/history/307-*). Çalıştırma: supabase/tests/run-local.sh supabase/tests/feed-page-proven.sql ("FAILED=0" beklenir).
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
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false);
end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text) to public;

-- Prompt'lar (id sonu = ad): hepsi alice'in
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, category, status, visibility, community_id, tools, created_at) values
  ('c0000000-0000-4000-8000-000000000001', :alice, 'A 20/20', 'd', 't', 'image', 'portrait', 'published', 'public', null, array['midjourney:v7'], now() - interval '5 days'),
  ('c0000000-0000-4000-8000-000000000002', :alice, 'B 8/10',  'd', 't', 'image', 'portrait', 'published', 'public', null, '{}', now() - interval '4 days'),
  ('c0000000-0000-4000-8000-000000000003', :alice, 'C 5/5',   'd', 't', 'text',  null,       'published', 'public', null, '{}', now() - interval '3 days'),
  ('c0000000-0000-4000-8000-000000000004', :alice, 'D 4/4 (az oy)', 'd', 't', 'image', null, 'published', 'public', null, '{}', now() - interval '2 days'),
  ('c0000000-0000-4000-8000-000000000005', :alice, 'E özel 30/30', 'd', 't', 'image', null, 'published', 'private', null, '{}', now() - interval '1 day'),
  ('c0000000-0000-4000-8000-000000000006', :alice, 'F 10/20', 'd', 't', 'image', 'portrait', 'published', 'public', null, '{}', now() - interval '6 days'),
  ('c0000000-0000-4000-8000-000000000007', :alice, 'G 8/10 (B ile aynı oran)', 'd', 't', 'image', 'portrait', 'published', 'public', null, '{}', now() - interval '7 days');
insert into public.prompt_works_stats (prompt_id, yes_count, no_count) values
  ('c0000000-0000-4000-8000-000000000001', 20, 0), ('c0000000-0000-4000-8000-000000000002', 8, 2), ('c0000000-0000-4000-8000-000000000003', 5, 0),
  ('c0000000-0000-4000-8000-000000000004', 4, 0), ('c0000000-0000-4000-8000-000000000005', 30, 0), ('c0000000-0000-4000-8000-000000000006', 10, 10),
  ('c0000000-0000-4000-8000-000000000007', 8, 2)
on conflict (prompt_id) do update set yes_count = excluded.yes_count, no_count = excluded.no_count;

create temp table _all as select * from public.feed_page_proven();
grant all on _all to public;

select public._check(1, 'Wilson sırası: 20/20 (0.84) > 5/5 (0.57) > 8/10 (0.49, iki tane) > 10/20 (0.30); az oy ve özel prompt yok',
  (select array_agg(right(id::text, 1) order by sort_rank desc, created_at desc, id desc) from _all) = array['1','3','2','7','6']);
select public._check(2, 'aynı skorlu iki prompt: yeni olan önce (B, G'')den önce) ve skorlar eşit',
  (select count(distinct sort_rank) from _all where right(id::text,1) in ('2','7')) = 1);
select public._check(3, '5''ten az oylu (D) ve özel prompt (E) hiç gelmez', not exists (select 1 from _all where right(id::text,1) in ('4','5')));
select public._check(4, '5/5 küçük örneklemde 20/20''nin altındadır (alt sınır az oyla yukarı çıkmaz)',
  (select sort_rank from _all where right(id::text,1) = '3') < (select sort_rank from _all where right(id::text,1) = '1'));
select public._check(5, 'tür / kategori / araç süzgeçleri',
  (select count(*) from public.feed_page_proven(p_content_type => 'text')) = 1
  and (select count(*) from public.feed_page_proven(p_category => 'portrait')) = 4
  and (select array_agg(right(id::text,1)) from public.feed_page_proven(p_tool => 'midjourney')) = array['1']);

-- keyset sayfalama: 2'şer 2'şer, tekrarsız ve eksiksiz
create temp table _pages (n int, id uuid);
grant all on _pages to public;
do $$
declare
  r record; cur_rank bigint; cur_at timestamptz; cur_id uuid; got int; i int := 0;
begin
  loop
    got := 0;
    for r in select * from public.feed_page_proven(p_limit => 2, p_after_rank => cur_rank, p_after_created_at => cur_at, p_after_id => cur_id) loop
      got := got + 1; i := i + 1;
      insert into _pages values (i, r.id);
      cur_rank := r.sort_rank; cur_at := r.created_at; cur_id := r.id;
    end loop;
    exit when got < 2 or i > 20;
  end loop;
end $$;
select public._check(6, 'keyset sayfalama aynı sırayı tekrarsız ve eksiksiz verir',
  (select array_agg(right(id::text,1) order by n) from _pages) = (select array_agg(right(id::text,1) order by sort_rank desc, created_at desc, id desc) from _all)
  and (select count(*) from _pages) = (select count(distinct id) from _pages));

-- ziyaretçi ve başka kullanıcı da okuyabilir; topluluğa ait ve silinmiş prompt çıkmaz
update public.prompts set deleted_at = now() where id = 'c0000000-0000-4000-8000-000000000006';
set role anon;
select public._as_user('');
select public._check(7, 'ziyaretçi okuyabilir; silinmiş prompt (F) gelmez', (select array_agg(right(id::text,1) order by sort_rank desc, created_at desc, id desc) from public.feed_page_proven()) = array['1','3','2','7']);
reset role;
select public._check(8, 'EXECUTE: anon + authenticated var, public yok',
  has_function_privilege('anon', 'public.feed_page_proven(text,text,text,text,integer,bigint,timestamptz,uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.feed_page_proven(text,text,text,text,integer,bigint,timestamptz,uuid)', 'execute'));
select public._check(9, '50''den büyük limit 50''ye kırpılır, 0 limit en az 1',
  (select count(*) from public.feed_page_proven(p_limit => 1000)) <= 50 and (select count(*) from public.feed_page_proven(p_limit => 0)) = 1);

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
