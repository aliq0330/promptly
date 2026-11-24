-- Yorum düzenleme geçmişi + yorum takibi (20261214120000_comment_history_and_follow.sql; docs/history/452-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/comment-history-follow.sql  ("FAILED=0" beklenir).
-- ow = içerik sahibi; me = yorum yazarı; fo = takipçi; ot = üçüncü kişi. P1 = ow'un herkese açık promptu, P2 = ow'un ÖZEL promptu.
\pset pager off
\set ON_ERROR_STOP off
\set me '''11111111-1111-4111-8111-111111111111'''
\set ow '''22222222-2222-4222-8222-222222222222'''
\set fo '''33333333-3333-4333-8333-333333333333'''
\set ot '''44444444-4444-4444-8444-444444444444'''
\set p1 '''d9000000-0000-4000-8000-000000000001'''
\set p2 '''d9000000-0000-4000-8000-000000000002'''
\set c1 '''d9100000-0000-4000-8000-000000000001'''
\set c2 '''d9100000-0000-4000-8000-000000000002'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:me, 'me@test.dev', '{"username":"ch_me","display_name":"Me"}'),
  (:ow, 'ow@test.dev', '{"username":"ch_ow","display_name":"Ow"}'),
  (:fo, 'fo@test.dev', '{"username":"ch_fo","display_name":"Fo"}'),
  (:ot, 'ot@test.dev', '{"username":"ch_ot","display_name":"Ot"}');

create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', case when uid = '' then 'anon' else 'authenticated' end, false);
  execute case when uid = '' then 'set role anon' else 'set role authenticated' end;
end $$;
-- Tohumlama: rolü ve kimliği sıfırla (hız sınırı/askı tetikleyicileri auth.uid() boşken çalışmaz).
create or replace function public._seed() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claim.role', 'service_role', false);
end $$;
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._seed(), public._try(text) to public;

insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility) values
  (:p1, :ow, 'P1', 'd', 'm', 'text', 'published', 'public'),
  (:p2, :ow, 'P2', 'd', 'm', 'text', 'published', 'private');
insert into public.prompt_comments (id, prompt_id, author_id, body) values (:c1, :p1, :me, 'ilk sürüm');

-- ---------------------------------------------------------------- Düzenleme geçmişi
-- 1. Gövde değişince eski gövde geçmişe yazılır
select public._as_user(:me);
update public.prompt_comments set body = 'ikinci sürüm' where id = :c1;
update public.prompt_comments set body = 'üçüncü sürüm' where id = :c1;
select public._check(1, 'her düzenleme eski gövdeyi geçmişe yazar (en yeni önce)',
  (select count(*) from public.comment_history(:c1)) = 2
  and (select body from public.comment_history(:c1) limit 1) = 'ikinci sürüm', (select string_agg(body, ' / ') from public.comment_history(:c1)));

-- 2. Gövde değişmeyen güncelleme (ek değişimi vb.) sürüm yazmaz
update public.prompt_comments set media_kind = media_kind where id = :c1;
update public.prompt_comments set body = body where id = :c1;
select public._check(2, 'gövde değişmeyen güncelleme geçmişe yazmaz', (select count(*) from public.comment_history(:c1)) = 2);

-- 3. Yorumu okuyabilen herkes (üçüncü kişi, ziyaretçi dahil) geçmişi görür
select public._as_user(:ot);
select public._check(3, 'başkası geçmişi görür', (select count(*) from public.comment_history(:c1)) = 2);
select public._as_user('');
select public._check(4, 'ziyaretçi (anon) geçmişi görür', (select count(*) from public.comment_history(:c1)) = 2);

-- 5. İstemci geçmişe doğrudan yazamaz/silemez
select public._as_user(:me);
select public._try(format('insert into public.comment_versions (comment_id, body, written_at) values (%L, ''sahte'', now())', 'd9100000-0000-4000-8000-000000000001')) as r5a \gset
select public._try(format('delete from public.comment_versions where comment_id = %L', 'd9100000-0000-4000-8000-000000000001')) as r5b \gset
select public._check(5, 'istemci geçmişe yazamaz ve silemez', :'r5a' ilike '%permission denied%' and :'r5b' ilike '%permission denied%'
  and (select count(*) from public.comment_history(:c1)) = 2, :'r5a' || ' / ' || :'r5b');

-- 6. Silme (soft-delete) geçmişe yazılmaz; silinen yorumun geçmişi görünmez
update public.prompt_comments set deleted_at = now(), body = '' where id = :c1;
select public._seed();
select public._check(6, 'soft-delete yeni sürüm yazmaz', (select count(*) from public.comment_versions where comment_id = :c1) = 2);
select public._as_user(:ot);
select public._check(7, 'silinen yorumun geçmişi okunmaz', (select count(*) from public.comment_history(:c1)) = 0);
select public._seed();

-- 8. 30 sürümden fazlası tutulmaz
insert into public.prompt_comments (id, prompt_id, author_id, body) values (:c2, :p1, :me, 'v0');
do $$ begin for i in 1..35 loop update public.prompt_comments set body = 'v' || i where id = 'd9100000-0000-4000-8000-000000000002'; end loop; end $$;
select public._check(8, 'en çok 30 sürüm tutulur, en eskiler düşer', (select count(*) from public.comment_versions where comment_id = :c2) = 30
  and not exists (select 1 from public.comment_versions where comment_id = :c2 and body = 'v0'));

-- ---------------------------------------------------------------- Yorum takibi
-- 9. İçeriği takip et: kendi satırı, yalnız okuyabildiği içerik
select public._as_user(:fo);
select public._try(format('select public.set_comment_subscription(''prompt'', %L, null, true)', 'd9000000-0000-4000-8000-000000000001')) as r9 \gset
select public._check(9, 'okunabilir içerik takip edilir', :'r9' = 'ok' and (select count(*) from public.comment_subscriptions where scope = 'content' and target_id = :p1) = 1, :'r9');

-- 10. Özel (okunamayan) içerik takip edilemez
select public._try(format('select public.set_comment_subscription(''prompt'', %L, null, true)', 'd9000000-0000-4000-8000-000000000002')) as r10 \gset
select public._check(10, 'okunamayan (özel) içerik takip edilemez', :'r10' <> 'ok' and not exists (select 1 from public.comment_subscriptions where target_id = :p2), :'r10');

-- 11. İki kez takip etmek tek satır bırakır; geçersiz tür reddedilir
select public._try(format('select public.set_comment_subscription(''prompt'', %L, null, true)', 'd9000000-0000-4000-8000-000000000001')) as r11a \gset
select public._try(format('select public.set_comment_subscription(''quote'', %L, null, true)', 'd9000000-0000-4000-8000-000000000001')) as r11b \gset
select public._check(11, 'tekrar takip tek satır; geçersiz tür reddedilir',
  (select count(*) from public.comment_subscriptions where scope = 'content' and target_id = :p1) = 1 and :'r11b' ilike '%invalid_target%', :'r11a' || ' / ' || :'r11b');

-- 12. Anon takip edemez
select public._as_user('');
select public._check(12, 'anon takip RPC''sini çağıramaz', not has_function_privilege('anon', 'public.set_comment_subscription(text, uuid, uuid, boolean)', 'execute'));

-- 13. Yeni yorum içeriğin takipçisine BİR bildirim yazar (yazan hariç)
select public._as_user(:ot);
insert into public.prompt_comments (id, prompt_id, author_id, body) values ('d9100000-0000-4000-8000-000000000003', :p1, :ot, 'takipçi görsün');
select public._seed();
select public._check(13, 'takipçiye "comment" bildirimi yazılır, yazan almaz',
  (select count(*) from public.notifications where recipient_id = :fo and type = 'comment' and dedupe_key like 'csub:%') = 1
  and not exists (select 1 from public.notifications where recipient_id = :ot and dedupe_key like 'csub:%'));

-- 14. Okunmamış dönemde ikinci yorum ikinci bildirim yazmaz
insert into public.prompt_comments (id, prompt_id, author_id, body) values ('d9100000-0000-4000-8000-000000000004', :p1, :ot, 'ikinci yorum');
select public._check(14, 'okunmamış dönemde tek bildirim', (select count(*) from public.notifications where recipient_id = :fo and dedupe_key like 'csub:%') = 1);

-- 15. Okunduktan sonra yeni yorum yeni bildirim üretir
update public.notifications set is_read = true where recipient_id = :fo and dedupe_key like 'csub:%';
insert into public.prompt_comments (id, prompt_id, author_id, body) values ('d9100000-0000-4000-8000-000000000005', :p1, :ot, 'üçüncü yorum');
select public._check(15, 'okunduktan sonra yeni bildirim', (select count(*) from public.notifications where recipient_id = :fo and dedupe_key like 'csub:%') = 2);

-- 16. İçerik sahibi aboneliğe rağmen çifte bildirim almaz (kendi "yorum yaptı" bildirimi zaten var)
select public._as_user(:ow);
select public._try(format('select public.set_comment_subscription(''prompt'', %L, null, true)', 'd9000000-0000-4000-8000-000000000001')) as r16 \gset
select public._seed();
insert into public.prompt_comments (id, prompt_id, author_id, body) values ('d9100000-0000-4000-8000-000000000006', :p1, :ot, 'sahip için');
select public._check(16, 'içerik sahibine takip bildirimi yazılmaz', not exists (select 1 from public.notifications where recipient_id = :ow and dedupe_key like 'csub:%'));

-- 17. Takibi bırakınca bildirim durur
select public._as_user(:fo);
select public._try(format('select public.set_comment_subscription(''prompt'', %L, null, false)', 'd9000000-0000-4000-8000-000000000001')) as r17 \gset
select public._seed();
update public.notifications set is_read = true where recipient_id = :fo and dedupe_key like 'csub:%';
insert into public.prompt_comments (id, prompt_id, author_id, body) values ('d9100000-0000-4000-8000-000000000007', :p1, :ot, 'artık duymasın');
select public._check(17, 'takip bırakılınca yeni bildirim yazılmaz', :'r17' = 'ok'
  and (select count(*) from public.notifications where recipient_id = :fo and dedupe_key like 'csub:%') = 2);

-- 18. Otomatik abonelik: yorum yazan ve yanıt alan o başlığa abone olur (thread, auto)
insert into public.prompt_comments (id, prompt_id, author_id, body, parent_id) values ('d9100000-0000-4000-8000-000000000008', :p1, :fo, 'yanıt', 'd9100000-0000-4000-8000-000000000001');
select public._check(18, 'yorum yazan ve yanıt alan başlığa otomatik abone olur',
  exists (select 1 from public.comment_subscriptions where user_id = :fo and scope = 'thread' and auto)
  and exists (select 1 from public.comment_subscriptions where user_id = :me and scope = 'thread' and auto and comment_id = :c1));

-- 19. Engellenen yazarın yorumu için bildirim yazılmaz
insert into public.blocks (blocker_id, blocked_id) values (:fo, :ot);
select public._as_user(:fo);
select public._try(format('select public.set_comment_subscription(''prompt'', %L, null, true)', 'd9000000-0000-4000-8000-000000000001')) as r19 \gset
select public._seed();
update public.notifications set is_read = true where recipient_id = :fo;
insert into public.prompt_comments (id, prompt_id, author_id, body) values ('d9100000-0000-4000-8000-000000000009', :p1, :ot, 'engelli yazar');
select public._check(19, 'engelli yazarın yorumu için bildirim yazılmaz', not exists (select 1 from public.notifications where recipient_id = :fo and dedupe_key like 'csub:%' and created_at > now() - interval '1 minute' and message like '%engelli%'));

-- 20. Abonelikler yalnız sahibine görünür; liste RPC'si başlık getirir
select public._as_user(:ot);
select public._check(20, 'başkasının abonelikleri görünmez', (select count(*) from public.comment_subscriptions where user_id = :fo) = 0);
select public._as_user(:fo);
select public._check(21, 'my_comment_subscriptions kendi satırlarını başlıkla verir', (select count(*) from public.my_comment_subscriptions() where title = 'P1') >= 1);

-- 22. 200 sınırı (elle ekleme)
select public._seed();
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility)
  select ('d9a00000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, :ow, 'X' || g, 'd', 'm', 'text', 'published', 'public' from generate_series(1, 210) g;
select public._as_user(:ot);
do $$
declare i int; r text;
begin
  for i in 1..205 loop
    r := public._try(format('select public.set_comment_subscription(''prompt'', %L, null, true)', ('d9a00000-0000-4000-8000-' || lpad(i::text, 12, '0'))));
  end loop;
end $$;
select public._check(22, 'kullanıcı başına en çok 200 abonelik', (select count(*) from public.comment_subscriptions where user_id = :ot) = 200);

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
