-- docs/history/287-*: "contract" temizliği — kullanılmayan `remove_*_from_saved_everywhere` RPC'leri silinir, sahibin kendi içeriğini beğendiği eski
-- satırlar silinir ve sayaçlar/tepki sayıları doğru düşer; diğer beğeniler dokunulmaz; migration yeniden çalıştırılabilir (idempotent).
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/contract-cleanup.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby')) as u(id, name);

create table public._results (n int, name text, ok boolean, detail text);
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;

insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  ('a0000000-0000-4000-8000-0000000000a1', :alice, 'P1', 'd', 'metin', 'text', 'published', 'public');

-- Eski durum: kural gelmeden yazılmış kendi-beğeni (tetikleyiciler kapalı seed) + başkasının normal beğenisi; sayaç ikisini de içerir.
set session_replication_role = replica;
insert into public.prompt_likes (user_id, prompt_id, reaction) values (:alice, 'a0000000-0000-4000-8000-0000000000a1', 'love');
insert into public.prompt_likes (user_id, prompt_id, reaction) values (:bobby, 'a0000000-0000-4000-8000-0000000000a1', 'fire');
update public.prompts set like_count = 2 where id = 'a0000000-0000-4000-8000-0000000000a1';
insert into public.reaction_stats (target_id, reaction, n) values ('a0000000-0000-4000-8000-0000000000a1', 'love', 1), ('a0000000-0000-4000-8000-0000000000a1', 'fire', 1)
  on conflict (target_id, reaction) do update set n = excluded.n;
set session_replication_role = origin;

select count(*) filter (where p.proname like 'remove\_%\_from\_saved\_everywhere') as n
from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in
  ('remove_prompt_from_saved_everywhere', 'remove_workflow_from_saved_everywhere', 'remove_preset_from_saved_everywhere') \gset fn_

-- Temizlik migration'ı (zaten bir kez oynadı; yeniden oynatmak idempotent olmalı ve seed'lenen eski satırı silmeli).
\i migrations/20261031100200_drop_saved_everywhere_and_self_likes.sql

select (select count(*) from public.prompt_likes where prompt_id = 'a0000000-0000-4000-8000-0000000000a1' and user_id = :alice) as self_n,
       (select count(*) from public.prompt_likes where prompt_id = 'a0000000-0000-4000-8000-0000000000a1' and user_id = :bobby) as other_n,
       (select like_count from public.prompts where id = 'a0000000-0000-4000-8000-0000000000a1') as lc,
       (select coalesce(sum(n), 0) from public.reaction_stats where target_id = 'a0000000-0000-4000-8000-0000000000a1' and reaction = 'love') as love_n,
       (select coalesce(sum(n), 0) from public.reaction_stats where target_id = 'a0000000-0000-4000-8000-0000000000a1' and reaction = 'fire') as fire_n \gset c_

select public._check(1, 'üç "her yerden kaldır" RPC canlı şemada yok (migration sonrası 0 kaldı)', :fn_n = 0, :fn_n::text);
select public._check(2, 'kendi-beğeni silindi, başkasının beğenisi yerinde', :c_self_n = 0 and :c_other_n = 1, :c_self_n || '/' || :c_other_n);
select public._check(3, 'beğeni sayacı 2 -> 1 ve tepki sayıları (love 0, fire 1) tutarlı', :c_lc = 1 and :c_love_n = 0 and :c_fire_n = 1, :c_lc || '/' || :c_love_n || '/' || :c_fire_n);

-- Yeniden oynatma: hiçbir şey eşleşmez, hata yok, sayaç oynamaz.
\i migrations/20261031100200_drop_saved_everywhere_and_self_likes.sql
select like_count as lc2 from public.prompts where id = 'a0000000-0000-4000-8000-0000000000a1' \gset d_
select public._check(4, 'migration yeniden oynatılabilir (idempotent), sayaç değişmez', :d_lc2 = 1, :d_lc2::text);

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
