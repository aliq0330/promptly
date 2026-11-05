-- "Çalıştı mı?" oyunun yorum/sonuç rozeti (prompt_works_for_users; docs/history/341-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/prompt-works-for-users.sql  ("FAILED=0" beklenir).
-- me = prompt yazarı; u1 = yorum yazan + oy veren; u2 = sonuç paylaşan + oy veren; u3 = oy veren ama yorum/sonuç YOK;
-- u4 = oy veren, yorumu silinmiş; cb = u1'i engelleyen izleyici. P1 yayında, P2 özel, Pd taslak, Pc topluluğa özgü.
\pset pager off
\set ON_ERROR_STOP off
\set me '''11111111-1111-4111-8111-111111111111'''
\set u1 '''22222222-2222-4222-8222-222222222222'''
\set u2 '''33333333-3333-4333-8333-333333333333'''
\set u3 '''44444444-4444-4444-8444-444444444444'''
\set u4 '''55555555-5555-4555-8555-555555555555'''
\set cb '''66666666-6666-4666-8666-666666666666'''
\set p1 '''d4000000-0000-4000-8000-000000000001'''
\set p2 '''d4000000-0000-4000-8000-000000000002'''
\set pd '''d4000000-0000-4000-8000-000000000003'''
\set pc '''d4000000-0000-4000-8000-000000000004'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:me,'me'),(:u1,'u1'),(:u2,'u2'),(:u3,'u3'),(:u4,'u4'),(:cb,'cb')) as u(id, name);

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

insert into public.conversations (id, kind) values ('e5000000-0000-4000-8000-000000000001', 'group');
insert into public.chat_groups (id, name, created_by) values ('e5000000-0000-4000-8000-000000000001', 'Topluluk', :me);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id) values
  (:p1, :me, 'P1', 'd', 'm', 'text', 'published', 'public',  null),
  (:p2, :me, 'P2 özel', 'd', 'm', 'text', 'published', 'private', null),
  (:pd, :me, 'Pd taslak', 'd', 'm', 'text', 'draft', 'public', null),
  (:pc, :me, 'Pc topluluk', 'd', 'm', 'text', 'published', 'private', 'e5000000-0000-4000-8000-000000000001');

-- Oylar (kurulum yetkili rolle): her kişi her promptta bir oy verdi.
insert into public.prompt_works_votes (prompt_id, user_id, works)
select p.id, v.uid, v.w from (values (:p1::uuid), (:p2::uuid), (:pd::uuid), (:pc::uuid)) as p(id)
cross join (values (:u1::uuid, true), (:u2::uuid, false), (:u3::uuid, true), (:u4::uuid, true)) as v(uid, w);
-- Yorum/sonuç: u1 yorumladı, u2 sonuç paylaştı, u3 hiçbir şey bırakmadı, u4'ün yorumu silindi. Aynısı diğer promptlarda da.
insert into public.prompt_comments (prompt_id, author_id, body)
select p.id, :u1, 'yorum' from (values (:p1::uuid), (:p2::uuid), (:pd::uuid), (:pc::uuid)) as p(id);
insert into public.prompt_comments (prompt_id, author_id, body, deleted_at) values (:p1, :u4, 'silinen', now());
insert into public.prompt_results (prompt_id, creator_id, media_type, text_content) values (:p1, :u2, 'text', 'çıktı');

-- Yardımcı: tek çağrıda "kimlik=oy" metni (sıralı).
create or replace function public._votes(p uuid, ids uuid[]) returns text language sql as
  $$ select coalesce(string_agg(left(user_id::text, 2) || '=' || works::text, ',' order by user_id), '') from public.prompt_works_for_users(p, ids) $$;
grant execute on function public._votes(uuid, uuid[]) to public;

-- 1–3. Ziyaretçi de okur; yalnız yorumu/sonucu olan oylar döner (u1 yorum, u2 sonuç); u3 (yorum/sonuç yok) ve u4 (silinmiş yorum) dönmez.
set role anon;
select public._as_user('');
select public._check(1, 'ziyaretçi: yorum yazanın (u1=true) ve sonuç paylaşanın (u2=false) oyu döner',
  public._votes(:p1, array[:u1, :u2, :u3, :u4]::uuid[]) = '22=true,33=false', public._votes(:p1, array[:u1, :u2, :u3, :u4]::uuid[]));
select public._check(2, 'hiç yorum/sonuç bırakmamış birinin oyu (u3) istenince bile dönmez',
  public._votes(:p1, array[:u3]::uuid[]) = '');
select public._check(3, 'yorumu SİLİNMİŞ kişinin oyu (u4) dönmez',
  public._votes(:p1, array[:u4]::uuid[]) = '');
reset role;

-- 4–5. Okunamayan prompt (özel / taslak / topluluk / olmayan) boş döner.
set role authenticated;
select public._as_user(:cb);
select public._check(4, 'özel/taslak/topluluk/olmayan prompt: boş (varlık sızmaz)',
  public._votes(:p2, array[:u1]::uuid[]) = '' and public._votes(:pd, array[:u1]::uuid[]) = '' and public._votes(:pc, array[:u1]::uuid[]) = ''
  and public._votes(gen_random_uuid(), array[:u1]::uuid[]) = '');
select public._check(5, 'boş / null kimlik listesi hata vermez, boş döner',
  public._votes(:p1, array[]::uuid[]) = '' and (select count(*) from public.prompt_works_for_users(:p1, null)) = 0);

-- 6. Sınır: 100'den fazla kimlik too_many_ids.
select public._check(6, '101 kimlik → too_many_ids; 100 kimlik çalışır',
  public._try(format('select * from public.prompt_works_for_users(%L, (select array_agg(gen_random_uuid()) from generate_series(1, 101)))', 'd4000000-0000-4000-8000-000000000001')) ilike '%too_many_ids%'
  and public._try(format('select * from public.prompt_works_for_users(%L, (select array_agg(gen_random_uuid()) from generate_series(1, 100)))', 'd4000000-0000-4000-8000-000000000001')) = 'ok');
reset role;

-- 7. Engel iki yönlü: cb, u1'i engelleyince u1'in oyu cb'ye görünmez; başkasına görünür.
insert into public.blocks (blocker_id, blocked_id) values (:cb, :u1);
set role authenticated;
select public._as_user(:cb);
select public._check(7, 'engellediğim kişinin (u1) oyu bana görünmez, engellemediğim (u2) görünür',
  public._votes(:p1, array[:u1, :u2]::uuid[]) = '33=false', public._votes(:p1, array[:u1, :u2]::uuid[]));
select public._as_user(:u1);
select public._check(8, 'beni engelleyenin oyu görünmez: u1 için cb yok; u1 kendi oyunu görür',
  public._votes(:p1, array[:u1]::uuid[]) = '22=true');
select public._as_user(:u3);
select public._check(9, 'engel ilişkisi olmayan üçüncü kişi u1 ve u2 oyunu görür',
  public._votes(:p1, array[:u1, :u2]::uuid[]) = '22=true,33=false');
reset role;
delete from public.blocks where blocker_id = :cb;

-- 10–12. Yansıma: oy değişince rozet değişir, geri alınınca kaybolur, yorum silinince kaybolur (oy tablosu korunur).
insert into public.prompt_copy_events (prompt_id, user_id) values (:p1, :u1);
set role authenticated;
select public._as_user(:u1);
select * from public.set_prompt_works(:p1, false) \gset s_
select public._as_user(:cb);
select public._check(10, 'u1 oyunu değiştirince (true→false) rozet de değişir',
  public._votes(:p1, array[:u1]::uuid[]) = '22=false', public._votes(:p1, array[:u1]::uuid[]));
select public._as_user(:u1);
select * from public.set_prompt_works(:p1, null) \gset t_
select public._as_user(:cb);
select public._check(11, 'u1 oyunu geri alınca rozet kaybolur (yorumu durur)',
  public._votes(:p1, array[:u1]::uuid[]) = ''
  and (select count(*) from public.prompt_comments where prompt_id = :p1 and author_id = :u1 and deleted_at is null) = 1);
reset role;
-- u1'in yorumunu soft-sil: oy (u2'ninki) etkilenmez; u1 yeniden oy verse bile yorumsuz olduğu için dönmez.
insert into public.prompt_works_votes (prompt_id, user_id, works) values (:p1, :u1, true);
update public.prompt_comments set deleted_at = now() where prompt_id = :p1 and author_id = :u1;
select public._check(12, 'yorumu silinen kişinin oyu (sonucu yok) dönmez; sonuç paylaşan u2 hâlâ döner',
  public._votes(:p1, array[:u1, :u2]::uuid[]) = '33=false');

-- 13. Oy tablosu hâlâ istemciye kapalı (rozet RPC'si bunu gevşetmedi).
set role authenticated;
select public._as_user(:cb);
select public._check(13, 'oy tablosuna doğrudan okuma hâlâ kapalı',
  public._try('select * from public.prompt_works_votes') ilike '%permission denied%');
reset role;

-- 14. Yetki: anon + authenticated çalıştırır.
select public._check(14, 'yetkiler: anon ve authenticated çalıştırabilir, public rolü değil',
  has_function_privilege('anon', 'public.prompt_works_for_users(uuid, uuid[])', 'execute')
  and has_function_privilege('authenticated', 'public.prompt_works_for_users(uuid, uuid[])', 'execute'));

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
