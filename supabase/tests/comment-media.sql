-- Yorumda fotoğraf · GIF · içerik eki (20261102100000_comment_media_attachments.sql; docs/history/308-*): DB testi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/comment-media.sql  ("FAILED=0" beklenir).
-- me = yorum yazarı; ow = içerik sahibi. P1 yayında+herkese açık, P2 özel, P3 taslak, P4 topluluğa özgü. S1 herkese açık Space, S2 özel Space.
\pset pager off
\set ON_ERROR_STOP off
\set me '''11111111-1111-4111-8111-111111111111'''
\set ow '''22222222-2222-4222-8222-222222222222'''
\set p1 '''d7000000-0000-4000-8000-000000000001'''
\set p2 '''d7000000-0000-4000-8000-000000000002'''
\set p3 '''d7000000-0000-4000-8000-000000000003'''
\set p4 '''d7000000-0000-4000-8000-000000000004'''
\set s1 '''d7100000-0000-4000-8000-000000000001'''
\set s2 '''d7100000-0000-4000-8000-000000000002'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:me, 'me@test.dev', '{"username":"cm_me","display_name":"Me"}'),
  (:ow, 'ow@test.dev', '{"username":"cm_ow","display_name":"Ow"}');

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

insert into public.conversations (id, kind) values ('e7000000-0000-4000-8000-000000000001', 'group');
insert into public.chat_groups (id, name, created_by) values ('e7000000-0000-4000-8000-000000000001', 'Topluluk', :ow);
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, community_id) values
  (:p1, :ow, 'P1', 'd', 'm', 'text', 'published', 'public', null),
  (:p2, :ow, 'P2 özel', 'd', 'm', 'text', 'published', 'private', null),
  (:p3, :ow, 'P3 taslak', 'd', 'm', 'text', 'draft', 'public', null),
  (:p4, :ow, 'P4 topluluk', 'd', 'm', 'text', 'published', 'private', 'e7000000-0000-4000-8000-000000000001');
insert into public.spaces (id, owner_id, title, visibility) values (:s1, :ow, 'S1', 'public'), (:s2, :ow, 'S2', 'private');

-- Yorumlar yetkili kullanıcıyla yazılır; doğrulama tetikleyicisi RLS'ten bağımsızdır, o yüzden fixture süper kullanıcıyla açılır.
create or replace function public._c(extra text) returns text language plpgsql as $$
begin
  execute format(
    'insert into public.prompt_comments (prompt_id, author_id, body %s) values (%L, %L, %L %s)',
    split_part(extra, '|', 1), 'd7000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'yorum', split_part(extra, '|', 2));
  return 'ok';
exception when others then return sqlerrm; end $$;

-- 1–3. GIF kimliği biçimi
select public._check(1, 'geçerli GIPHY kimliği kabul edilir', public._c(', media_kind, media_ref, media_width, media_height|, ''gif'', ''3o7TKSjRrfIPjeiVyM'', 200, 150') = 'ok');
select public._check(2, 'GIF kimliğinde / . : gibi karakterler reddedilir',
  public._c(', media_kind, media_ref|, ''gif'', ''abc/../evil.gif''') ilike '%prompt_comments_media_check%'
  and public._c(', media_kind, media_ref|, ''gif'', ''https://x.test/a.gif''') ilike '%prompt_comments_media_check%'
  and public._c(', media_kind, media_ref|, ''gif'', ''ab''') ilike '%prompt_comments_media_check%');
select public._check(3, 'bilinmeyen medya türü ve yarım medya reddedilir',
  public._c(', media_kind, media_ref|, ''video'', ''3o7TKSjRrfIPjeiVyM''') ilike '%prompt_comments_media_check%'
  and public._c(', media_kind|, ''gif''') ilike '%prompt_comments_media_check%'
  and public._c(', media_width, media_height|, 100, 100') ilike '%prompt_comments_media_check%'
  and public._c(', media_ref|, ''3o7TKSjRrfIPjeiVyM''') ilike '%prompt_comments_media_check%'
  and public._c(', media_kind, media_ref, media_width|, ''gif'', ''3o7TKSjRrfIPjeiVyM'', 200') ilike '%prompt_comments_media_size%');

-- 4–5. Fotoğraf yolu yalnız yazarın kendi klasörü
select public._check(4, 'kendi klasöründeki fotoğraf yolu kabul edilir',
  public._c(', media_kind, media_ref, media_width, media_height|, ''photo'', ''11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'', 800, 600') = 'ok');
select public._check(5, 'başkasının klasörü / geçersiz uzantı / üst dizin reddedilir',
  public._c(', media_kind, media_ref|, ''photo'', ''22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg''') ilike '%prompt_comments_media_check%'
  and public._c(', media_kind, media_ref|, ''photo'', ''11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.svg''') ilike '%prompt_comments_media_check%'
  and public._c(', media_kind, media_ref|, ''photo'', ''../x.jpg''') ilike '%prompt_comments_media_check%');

-- 6. Boyut sınırı
select public._check(6, 'sıfır/aşırı boyut reddedilir',
  public._c(', media_kind, media_ref, media_width, media_height|, ''gif'', ''3o7TKSjRrfIPjeiVyM'', 0, 150') ilike '%prompt_comments_media_size%'
  and public._c(', media_kind, media_ref, media_width, media_height|, ''gif'', ''3o7TKSjRrfIPjeiVyM'', 200, 99999') ilike '%prompt_comments_media_size%');

-- 7–10. İçerik eki: yalnız yayında + herkese açık + topluluğa özgü olmayan
select public._check(7, 'herkese açık prompt eki kabul edilir', public._c(format(', attach_type, attach_id|, ''prompt'', %L', :p1)) = 'ok');
select public._check(8, 'özel / taslak / topluluğa özgü / olmayan prompt eki reddedilir (attachment_not_public)',
  public._c(format(', attach_type, attach_id|, ''prompt'', %L', :p2)) ilike '%attachment_not_public%'
  and public._c(format(', attach_type, attach_id|, ''prompt'', %L', :p3)) ilike '%attachment_not_public%'
  and public._c(format(', attach_type, attach_id|, ''prompt'', %L', :p4)) ilike '%attachment_not_public%'
  and public._c(', attach_type, attach_id|, ''prompt'', gen_random_uuid()') ilike '%attachment_not_public%');
select public._check(9, 'Space eki: herkese açık kabul, özel reddedilir',
  public._c(format(', attach_type, attach_id|, ''space'', %L', :s1)) = 'ok'
  and public._c(format(', attach_type, attach_id|, ''space'', %L', :s2)) ilike '%attachment_not_public%');
select public._check(10, 'geçersiz ek türü ve yarım ek reddedilir',
  public._c(format(', attach_type, attach_id|, ''comment'', %L', :p1)) ~* '(attachment_not_public|prompt_comments_attach_check)'
  and public._c(', attach_type|, ''prompt''') ~* '(attachment_not_public|prompt_comments_attach_check)'
  and public._c(format(', attach_id|, %L', :p1)) ilike '%prompt_comments_attach_check%');

-- 11–12. Düzenlemede ek/medya değişebilir ve kaldırılabilir; yeni ek aynı kuralla denetlenir; metin düzenlemesi medyaya dokunmaz
-- (NOT: aynı SELECT içindeki alt sorgular fonksiyon çağrısından ÖNCE değerlendirilir; bu yüzden her güncelleme ayrı bir deyimde yapılıp sonucu \gset ile alınır.)
create temp table _k as
  select id from public.prompt_comments where media_kind = 'gif' and media_ref = '3o7TKSjRrfIPjeiVyM' limit 1;
grant all on _k to public;
select public._try('update public.prompt_comments set media_ref = ''AAAAAAAAAA'', edited_at = null where id = (select id from _k)') as r11 \gset
select public._check(11, 'düzenlemede GIF başka GIF ile değişir, edited_at damgalanır',
  :'r11' = 'ok' and (select media_ref = 'AAAAAAAAAA' and edited_at is not null from public.prompt_comments where id = (select id from _k)), :'r11');
select public._try('update public.prompt_comments set body = ''düzenlendi'' where id = (select id from _k)') as r12 \gset
select public._check(12, 'metin düzenlemesi medyaya dokunmadan çalışır',
  :'r12' = 'ok' and (select media_ref from public.prompt_comments where id = (select id from _k)) = 'AAAAAAAAAA', :'r12');
select public._try(format('update public.prompt_comments set attach_type = ''prompt'', attach_id = %L where id = (select id from _k)', :p2)) as r31a \gset
select public._try(format('update public.prompt_comments set attach_type = ''prompt'', attach_id = %L where id = (select id from _k)', :p1)) as r31b \gset
select public._check(31, 'düzenlemede yeni ek herkese açık olmalı (özel reddedilir), açık olan eklenir',
  :'r31a' ilike '%attachment_not_public%' and :'r31b' = 'ok' and (select attach_id = :p1::uuid from public.prompt_comments where id = (select id from _k)), :'r31a' || ' / ' || :'r31b');
select public._try('update public.prompt_comments set media_kind = null, media_ref = null, media_width = null, media_height = null, attach_type = null, attach_id = null where id = (select id from _k)') as r32b \gset
select public._try('update public.prompt_comments set media_kind = ''gif'' where id = (select id from _k)') as r32a \gset
select public._check(32, 'düzenlemede ek ve medya kaldırılabilir (hepsi boşalır); yarım biçim hâlâ reddedilir',
  :'r32a' ilike '%prompt_comments_media_check%' and :'r32b' = 'ok' and (select media_kind is null and attach_type is null from public.prompt_comments where id = (select id from _k)), :'r32a' || ' / ' || :'r32b');
-- Değişmeyen ek, içerik sonradan özel yapılsa da yeniden denetlenmez (yorum düzenlenebilir).
update public.prompt_comments set attach_type = 'prompt', attach_id = :p1 where id = (select id from _k);
update public.prompts set visibility = 'private' where id = :p1;
select public._try('update public.prompt_comments set body = ''hâlâ düzenlenir'' where id = (select id from _k)') as r33 \gset
select public._check(33, 'içerik sonradan özel yapılsa da yorumun metni düzenlenebilir (değişmeyen ek yeniden denetlenmez)', :'r33' = 'ok', :'r33');
update public.prompts set visibility = 'public' where id = :p1;

-- 13. Yanıtlı yorum yumuşak silinince medya + ek temizlenir; yanıtsız yorum gerçekten silinir
insert into public.prompt_comments (id, prompt_id, author_id, body, media_kind, media_ref, attach_type, attach_id)
values ('d7200000-0000-4000-8000-000000000001', :p1, :me, 'üst', 'gif', 'Zq1wX2cV3b', 'prompt', :p1);
insert into public.prompt_comments (id, prompt_id, author_id, body, parent_id)
values ('d7200000-0000-4000-8000-000000000002', :p1, :ow, 'yanıt', 'd7200000-0000-4000-8000-000000000001');
delete from public.prompt_comments where id = 'd7200000-0000-4000-8000-000000000001';
select public._check(13, 'yanıtlı yorum yumuşak silinir: deleted_at dolu, medya ve ek boşalır',
  (select deleted_at is not null and body = '' and media_kind is null and media_ref is null and media_width is null and attach_type is null and attach_id is null
     from public.prompt_comments where id = 'd7200000-0000-4000-8000-000000000001'));
delete from public.prompt_comments where id = 'd7200000-0000-4000-8000-000000000002';
select public._check(14, 'yanıtsız yorum gerçekten silinir', not exists (select 1 from public.prompt_comments where id = 'd7200000-0000-4000-8000-000000000002'));

-- 15–19. Storage: yükleme yalnız kendi klasörüne; okuma = yorumu okuyabilen herkes (ziyaretçi dahil)
grant select, insert, delete on storage.objects to anon, authenticated; -- yerel taklitte tablo yetkisi yok; gerçek Supabase'de var, RLS politikaları sınanıyor
insert into storage.objects (bucket_id, name, owner) values
  ('comment-media', '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg', :me),
  ('comment-media', '11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg', :me);
set role authenticated;
select public._as_user(:ow);
select public._check(15, 'başkasının klasörüne yükleme reddedilir',
  public._try($q$insert into storage.objects (bucket_id, name, owner) values ('comment-media', '11111111-1111-4111-8111-111111111111/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg', '22222222-2222-4222-8222-222222222222')$q$) ilike '%row-level security%');
select public._check(16, 'kendi klasörüne yükleme çalışır; ad biçimi bozuksa reddedilir',
  public._try($q$insert into storage.objects (bucket_id, name, owner) values ('comment-media', '22222222-2222-4222-8222-222222222222/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png', '22222222-2222-4222-8222-222222222222')$q$) = 'ok'
  and public._try($q$insert into storage.objects (bucket_id, name, owner) values ('comment-media', '22222222-2222-4222-8222-222222222222/evil.exe', '22222222-2222-4222-8222-222222222222')$q$) ilike '%row-level security%');
select public._check(17, 'yoruma bağlı fotoğraf başka kullanıcıya görünür; bağlı olmayan görünmez',
  (select count(*) from storage.objects where bucket_id = 'comment-media' and name = '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg') = 1
  and (select count(*) from storage.objects where bucket_id = 'comment-media' and name = '11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg') = 0);
reset role;
set role anon;
select public._as_user('');
select public._check(18, 'ziyaretçi herkese açık içeriğin yorum fotoğrafını görür',
  (select count(*) from storage.objects where bucket_id = 'comment-media' and name = '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg') = 1);
reset role;
set role anon;
select public._as_user('');
select public._check(19, 'ziyaretçi yoruma bağlı olmayan dosyayı göremez', (select count(*) from storage.objects where bucket_id = 'comment-media' and name like '%bbbbbbbb%') = 0);
reset role;

-- 21–22. Yetim taraması: bağlı dosya yetim değil, bağlı olmayan yetim
select public._check(20, 'yoruma bağlı fotoğraf yetim sayılmaz',
  not exists (select 1 from public.orphan_storage_objects('0 seconds') o where o.name like '%aaaaaaaa-aaaa%'));
select public._check(21, 'bağlı olmayan yorum fotoğrafı yetim sayılır',
  exists (select 1 from public.orphan_storage_objects('0 seconds') o where o.bucket_id = 'comment-media' and o.name like '%bbbbbbbb%'));

-- 22. Yalnız GIF'ten oluşan mesajın bildirim önizlemesi
set role authenticated;
select public._as_user(:me);
create temp table _conv as select public.start_direct_conversation(:ow) as id;
grant all on _conv to public;
select public._as_user(:ow);
update public.conversation_members set status = 'accepted' where user_id = :ow;
select public._as_user(:me);
insert into public.messages (conversation_id, sender_id, attachments)
  select id, :me, '[{"path":"giphy:3o7TKSjRrfIPjeiVyM","width":200,"height":150,"mime":"image/gif"}]'::jsonb from _conv;
insert into public.messages (conversation_id, sender_id, attachments)
  select id, :me, '[{"path":"c/u/x.jpg","width":200,"height":150,"mime":"image/jpeg"}]'::jsonb from _conv;
reset role;
select public._check(22, 'GIF mesajı "bir GIF gönderdi", fotoğraf mesajı "bir fotoğraf gönderdi" der',
  exists (select 1 from public.notifications where recipient_id = :ow and message like '%bir GIF gönderdi')
  and exists (select 1 from public.notifications where recipient_id = :ow and message like '%bir fotoğraf gönderdi'));

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
