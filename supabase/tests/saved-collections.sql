-- Kaydet / koleksiyon üyeliği: DB tarafı davranış ve RLS testi (docs/history/168-*, 336-*).
--
-- Model (336): her kullanıcının tek bir SİSTEM koleksiyonu vardır ("Kaydedilenlerin tümü", collections.is_default).
-- Kaydetmek = sistem koleksiyonuna satır; koleksiyona eklemek = koleksiyona satır (+ kayıtlı değilse sisteme otomatik);
-- koleksiyondan çıkarmak yalnız o koleksiyonu etkiler; `unsave_content` her yerden çıkarır.
--
-- Nasıl çalıştırılır: repodaki TÜM migration'lar Supabase stub'larıyla (auth şeması,
-- roller, storage, supabase_realtime — bkz. docs/history/158-*) temiz bir yerel
-- PostgreSQL'e oynatıldıktan sonra, süper kullanıcıyla:  psql -d <db> -f saved-collections.sql
-- Sonda her kontrol PASS/FAIL yazar; "FAILED=0" beklenir. Fixture'lar kalıcıdır —
-- ikinci çalıştırma için veritabanını yeniden kurun.
\set ON_ERROR_STOP off
\pset pager off
-- ---------- fixtures (as superuser) ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@test.dev', '{"username":"alice","display_name":"Alice"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@test.dev',   '{"username":"bobby","display_name":"Bob"}');
insert into public.prompts (id, author_id, title, description, prompt_text, content_type) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'P', 'd', 'text', 'text'),
  ('aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'P2', 'd', 'text', 'text');
insert into public.workflows (id, creator_id, title, status) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'W', 'published');
insert into public.collections (id, owner_id, name, visibility) values
  ('c0000001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Yazılım', 'private'),
  ('c0000002-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Tasarım', 'public'),
  ('c0000003-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'Bob public', 'public');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;

create table pg_temp.results (n int, name text, ok boolean, detail text);
grant all on pg_temp.results to public;
create or replace function pg_temp.check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into pg_temp.results values (n, name, coalesce(ok,false), detail) $$;

-- Alice'in sistem koleksiyonu ("Kaydedilenlerin tümü") kimliği
create or replace function pg_temp.sys(uid text) returns uuid language sql as
  $$ select id from public.collections where owner_id = uid::uuid and is_default $$;
-- Alice'in P içeriğini hangi koleksiyonlar tutuyor (ad olarak, sıralı)
create or replace function pg_temp.holders(prompt uuid) returns text[] language sql as
  $$ select coalesce(array_agg(c.name order by c.name), '{}') from public.collection_items ci join public.collections c on c.id = ci.collection_id
      where c.owner_id = '11111111-1111-4111-8111-111111111111' and ci.prompt_id = prompt $$;

-- 0. kayıtta her kullanıcıya tam bir sistem koleksiyonu, özel
select pg_temp.check(0, 'each user has exactly one system collection (private)',
  (select count(*) from public.collections where is_default and visibility = 'private' and name = 'Kaydedilenler'
     and owner_id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222')) = 2);

set role authenticated;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');

-- 1. kaydet (yalnız sistem koleksiyonuna) -> hiçbir koleksiyonda değil, ama kayıtlı
insert into public.collection_items (collection_id, prompt_id) values (pg_temp.sys('11111111-1111-4111-8111-111111111111'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.check(1, 'save puts the work in "Kaydedilenlerin tümü" only', pg_temp.holders('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = array['Kaydedilenler']);
reset role;
select pg_temp.check(1, 'save_count = 1 after save', (select save_count from public.prompts where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1);
set role authenticated; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');

-- 2. sonra iki koleksiyona ekle -> kayıt + 2 koleksiyon, save_count hâlâ 1
insert into public.collection_items (collection_id, prompt_id) values
  ('c0000001-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('c0000002-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.check(2, 'saved work can sit in several collections at once',
  pg_temp.holders('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = array['Kaydedilenler','Tasarım','Yazılım']);
reset role;
select pg_temp.check(2, 'save_count stays 1 (one per owner, not per collection)', (select save_count from public.prompts where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1);
set role authenticated; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');

-- 3. kayıtlı olmayan içeriği doğrudan koleksiyona ekle -> sisteme otomatik girer, save_count tam +1
insert into public.collection_items (collection_id, prompt_id) values ('c0000001-0000-4000-8000-000000000001', 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.check(3, 'adding an unsaved work to a collection saves it too', pg_temp.holders('aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = array['Kaydedilenler','Yazılım']);
reset role;
select pg_temp.check(3, 'save_count = 1 for the auto-saved work (counted once)', (select save_count from public.prompts where id='aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1);
select pg_temp.check(3, 'collection item_count: Yazılım has 2, system has 2',
  (select item_count from public.collections where id='c0000001-0000-4000-8000-000000000001') = 2
  and (select item_count from public.collections where owner_id='11111111-1111-4111-8111-111111111111' and is_default) = 2);
set role authenticated; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');

-- 4. tekrar ekleme: 23505 (istemci başarı sayar), fazladan satır yok
do $$ begin
  begin
    insert into public.collection_items (collection_id, prompt_id) values ('c0000002-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    perform pg_temp.check(4, 'duplicate add raises 23505', false, 'no error');
  exception when unique_violation then
    perform pg_temp.check(4, 'duplicate add raises 23505 (client treats as success)', true);
  end;
end $$;
select pg_temp.check(4, 'still exactly 3 rows for the work after duplicate add', cardinality(pg_temp.holders('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) = 3);

-- 5. yalnız Yazılım'dan çıkar -> Tasarım + kayıt kalır
delete from public.collection_items where collection_id='c0000001-0000-4000-8000-000000000001' and prompt_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.check(5, 'leaving Yazılım keeps Tasarım and the saved state', pg_temp.holders('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = array['Kaydedilenler','Tasarım']);
reset role;
select pg_temp.check(5, 'save_count stays 1', (select save_count from public.prompts where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1);
set role authenticated; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');

-- 6. tekrarlanan çıkarma zararsız
delete from public.collection_items where collection_id='c0000001-0000-4000-8000-000000000001' and prompt_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.check(6, 'removing an already-removed membership changes nothing', cardinality(pg_temp.holders('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) = 2);

-- 7. son koleksiyondan da çıkar -> hâlâ KAYITLI (kaydetmek ve koleksiyon ayrı)
delete from public.collection_items where collection_id='c0000002-0000-4000-8000-000000000002' and prompt_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.check(7, 'leaving every collection does NOT unsave', pg_temp.holders('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = array['Kaydedilenler']);
reset role;
select pg_temp.check(7, 'save_count still 1', (select save_count from public.prompts where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1);
set role authenticated; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');

-- 8. koleksiyonu sil -> içerik kayıtlı kalır, save_count düşmez
delete from public.collections where id='c0000001-0000-4000-8000-000000000001';
select pg_temp.check(8, 'deleting a collection keeps its works saved', pg_temp.holders('aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = array['Kaydedilenler']);
reset role;
select pg_temp.check(8, 'save_count unchanged by collection delete', (select save_count from public.prompts where id='aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1);
set role authenticated; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');

-- 9. Kaydedilenlerden kaldır: her koleksiyondan tek seferde; sayaç düşer
insert into public.collection_items (collection_id, prompt_id) values ('c0000002-0000-4000-8000-000000000002', 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.check(9, 'precondition: saved + in Tasarım', pg_temp.holders('aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = array['Kaydedilenler','Tasarım']);
select public.unsave_content('prompt', 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.check(9, 'unsave_content removes it from every collection incl. the system one', cardinality(pg_temp.holders('aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) = 0);
reset role;
select pg_temp.check(9, 'save_count back to 0 (single decrement)', (select save_count from public.prompts where id='aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 0);
select pg_temp.check(9, 'unsave leaves the other saved work alone', (select save_count from public.prompts where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1);
set role authenticated; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
do $$ begin
  begin perform public.unsave_content('request', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); perform pg_temp.check(9, 'unsave_content rejects an unsupported type', false);
  exception when others then perform pg_temp.check(9, 'unsave_content rejects an unsupported type', sqlerrm = 'unsave_invalid_type', sqlerrm);
  end;
end $$;

-- 10. sistem koleksiyonu değiştirilemez / silinemez
do $$ begin
  begin update public.collections set name = 'X' where owner_id = auth.uid() and is_default; perform pg_temp.check(10, 'system collection cannot be renamed', false);
  exception when others then perform pg_temp.check(10, 'system collection cannot be renamed', true, sqlerrm); end;
  begin update public.collections set visibility = 'public' where owner_id = auth.uid() and is_default; perform pg_temp.check(10, 'system collection cannot be made public', false);
  exception when others then perform pg_temp.check(10, 'system collection cannot be made public', true, sqlerrm); end;
  begin update public.collections set is_default = false where owner_id = auth.uid() and is_default; perform pg_temp.check(10, 'system flag cannot be flipped by a client', false);
  exception when others then perform pg_temp.check(10, 'system flag cannot be flipped by a client', true, sqlerrm); end;
  begin delete from public.collections where owner_id = auth.uid() and is_default; perform pg_temp.check(10, 'system collection cannot be deleted', false);
  exception when others then perform pg_temp.check(10, 'system collection cannot be deleted', true, sqlerrm); end;
end $$;

-- 11. aynı kurallar workflow için
insert into public.collection_items (collection_id, workflow_id) values ('c0000002-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select pg_temp.check(11, 'workflow added to a collection is saved too',
  (select count(*) from public.collection_items ci join public.collections c on c.id=ci.collection_id where c.owner_id=auth.uid() and ci.workflow_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 2);
delete from public.collection_items where collection_id='c0000002-0000-4000-8000-000000000002' and workflow_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select pg_temp.check(11, 'workflow: leaving the collection keeps it saved',
  (select count(*) from public.collection_items ci join public.collections c on c.id=ci.collection_id where c.owner_id=auth.uid() and ci.workflow_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and c.is_default) = 1);
select public.unsave_content('workflow', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select pg_temp.check(11, 'workflow: unsave removes it',
  not exists(select 1 from public.collection_items ci join public.collections c on c.id=ci.collection_id where c.owner_id=auth.uid() and ci.workflow_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
reset role;

-- 12. Bob, Alice'in üyeliklerine dokunamaz; Alice'in sistem koleksiyonuna da satır sızdırmaz
set role authenticated; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
do $$ begin
  begin
    insert into public.collection_items (collection_id, prompt_id) values ('c0000002-0000-4000-8000-000000000002', 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    perform pg_temp.check(12, 'bob cannot INSERT into alice''s collection', false, 'insert succeeded');
  exception when insufficient_privilege then
    perform pg_temp.check(12, 'bob cannot INSERT into alice''s collection', true);
  end;
end $$;
-- ON CONFLICT DO NOTHING ile RLS atlatılıp Alice'in sistem koleksiyonuna satır eklenemez
insert into public.collection_items (collection_id, prompt_id) values ('c0000002-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') on conflict do nothing;
reset role;
select pg_temp.check(12, 'a rejected insert does not plant a row in alice''s system collection',
  not exists(select 1 from public.collection_items ci where ci.collection_id = pg_temp.sys('11111111-1111-4111-8111-111111111111') and ci.prompt_id = 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
set role authenticated; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select public.unsave_content('prompt', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
reset role;
select pg_temp.check(12, 'bob''s unsave_content never touches alice''s saves', (select save_count from public.prompts where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 1);
-- Alice'in sistem koleksiyonu (özel) Bob'a görünmez
set role authenticated; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check(12, 'bob cannot see alice''s system collection items',
  (select count(*) from public.collection_items where collection_id = pg_temp.sys('11111111-1111-4111-8111-111111111111')) = 0);
reset role;

-- 13. içeriğin kendisi silinirken (CASCADE) hem sistem hem koleksiyon satırları sorunsuz gider
set role authenticated; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into public.collection_items (collection_id, prompt_id) values ('c0000002-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
reset role;
do $$ begin
  begin
    delete from public.prompts where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    perform pg_temp.check(13, 'deleting a saved prompt cascades through system + collection rows', true);
  exception when others then
    perform pg_temp.check(13, 'deleting a saved prompt cascades through system + collection rows', false, sqlerrm);
  end;
end $$;
select pg_temp.check(13, 'no orphan membership rows remain', not exists(select 1 from public.collection_items where prompt_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from pg_temp.results;
