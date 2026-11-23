-- Takip Ettiklerin etkinlik akışı (docs/history/451-*). Çalıştırma: supabase/tests/run-local.sh supabase/tests/following-activity.sql ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set deniz '''11111111-1111-4111-8111-111111111111'''
\set selin '''22222222-2222-4222-8222-222222222222'''
\set ali   '''33333333-3333-4333-8333-333333333333'''
\set lina  '''44444444-4444-4444-8444-444444444444'''
\set kaan  '''55555555-5555-4555-8555-555555555555'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:deniz,'deniz'),(:selin,'selin'),(:ali,'ali'),(:lina,'lina'),(:kaan,'kaan')) as u(id, name);

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

-- deniz: selin, ali ve kaan'ı takip ediyor; lina'yı takip etmiyor ama #minyatur etiketini takip ediyor.
insert into public.follows (follower_id, following_id) values (:deniz, :selin), (:deniz, :ali), (:deniz, :kaan);
insert into public.tags (slug, label) values ('minyatur', 'minyatür') on conflict do nothing;
insert into public.tag_follows (user_id, tag_slug) values (:deniz, 'minyatur');

-- selin: 1 saat içinde 4 prompt (toplanır); ali: 1 prompt; lina: etiketli 1 prompt; kaan: 1 prompt (sonra sessize alınacak).
insert into public.prompts (id, author_id, title, description, prompt_text, content_type, status, visibility, created_at) values
  ('a0000000-0000-4000-8000-000000000001', :selin, 'S1', 'd', 't', 'image', 'published', 'public', now() - interval '40 minutes'),
  ('a0000000-0000-4000-8000-000000000002', :selin, 'S2', 'd', 't', 'image', 'published', 'public', now() - interval '50 minutes'),
  ('a0000000-0000-4000-8000-000000000003', :selin, 'S3', 'd', 't', 'image', 'published', 'public', now() - interval '60 minutes'),
  ('a0000000-0000-4000-8000-000000000004', :selin, 'S4', 'd', 't', 'image', 'published', 'public', now() - interval '70 minutes'),
  ('a0000000-0000-4000-8000-000000000005', :ali,   'A1', 'd', 't', 'image', 'published', 'public', now() - interval '10 minutes'),
  ('a0000000-0000-4000-8000-000000000006', :lina,  'L1', 'd', 't', 'image', 'published', 'public', now() - interval '20 minutes'),
  ('a0000000-0000-4000-8000-000000000007', :kaan,  'K1', 'd', 't', 'image', 'published', 'public', now() - interval '30 minutes'),
  ('a0000000-0000-4000-8000-000000000008', :ali,   'A özel', 'd', 't', 'image', 'published', 'private', now() - interval '5 minutes'),
  ('a0000000-0000-4000-8000-000000000009', :selin, 'S eski', 'd', 'eski metin', 'text', 'published', 'public', now() - interval '20 days');
insert into public.prompt_tags (prompt_id, tag_slug) values ('a0000000-0000-4000-8000-000000000006', 'minyatur');

-- selin'in eski promptu için yeni sürüm (2 saat önce) — 24 saat içinde iki sürüm varsa yalnız sonuncusu.
insert into public.prompt_versions (prompt_id, version_number, title, description, prompt_text, source, created_by, created_at) values
  ('a0000000-0000-4000-8000-000000000009', 2, 'S eski', 'd', 'yeni metin', 'owner_edit', :selin, now() - interval '3 hours'),
  ('a0000000-0000-4000-8000-000000000009', 3, 'S eski', 'd', 'daha yeni metin', 'owner_edit', :selin, now() - interval '2 hours')
on conflict (prompt_id, version_number) do update set created_at = excluded.created_at, prompt_text = excluded.prompt_text;

-- deniz'in üyesi olduğu Space'te ali 3 görsel ekledi (aynı saat içinde iki kayıt → tek satır).
insert into public.spaces (id, owner_id, title, visibility) values ('b0000000-0000-4000-8000-000000000001', :ali, 'AI Photography', 'public');
insert into public.space_members (space_id, user_id, role) values ('b0000000-0000-4000-8000-000000000001', :deniz, 'editor') on conflict do nothing;
insert into public.space_activity (space_id, actor_id, action, count, created_at) values
  ('b0000000-0000-4000-8000-000000000001', :ali, 'image_added', 2, date_trunc('hour', now() - interval '5 hours') + interval '10 minutes'),
  ('b0000000-0000-4000-8000-000000000001', :ali, 'image_added', 1, date_trunc('hour', now() - interval '5 hours') + interval '20 minutes');

set role authenticated;
select public._as_user(:deniz);

create temp table _p1 as select * from public.following_activity_page(20);
grant all on _p1 to public;

select public._check(1, 'selin''in 1 saatteki 4 promptu tek "group" satırı',
  (select count(*) from _p1 where event_kind = 'group' and actor_id = :selin) = 1
  and (select cardinality(member_ids) from _p1 where event_kind = 'group' and actor_id = :selin) = 4
  and not exists (select 1 from _p1 where event_kind = 'post' and item_id::text like 'a0000000-0000-4000-8000-00000000000_' and actor_id = :selin
                    and item_id <> 'a0000000-0000-4000-8000-000000000009'));
select public._check(2, 'ali''nin herkese açık promptu var, özel promptu yok',
  exists (select 1 from _p1 where event_kind = 'post' and item_id = 'a0000000-0000-4000-8000-000000000005')
  and not exists (select 1 from _p1 where item_id = 'a0000000-0000-4000-8000-000000000008'));
select public._check(3, 'takip edilmeyen lina''nın etiketli promptu "tag" kaynağıyla ve eşleşen etiketle gelir',
  exists (select 1 from _p1 where item_id = 'a0000000-0000-4000-8000-000000000006' and source = 'tag'
            and detail -> 'tags' ? 'minyatur'));
select public._check(4, 'yeni sürüm: 24 saatte yalnız son sürüm (3)',
  (select count(*) from _p1 where event_kind = 'version') = 1
  and (select (detail ->> 'version')::int from _p1 where event_kind = 'version') = 3);
select public._check(5, 'Space etkinliği: aynı saat tek satır, toplam 3 görsel',
  (select count(*) from _p1 where event_kind = 'space_activity') = 1
  and (select (detail ->> 'count')::int from _p1 where event_kind = 'space_activity') = 3
  and (select detail ->> 'title' from _p1 where event_kind = 'space_activity') = 'AI Photography');
select public._check(6, 'sıra zamana göre (yeniden eskiye)',
  (select bool_and(ok) from (select occurred_at >= lead(occurred_at) over (order by occurred_at desc, event_key desc) is not false as ok from _p1) x));

-- Sayfalama: 2'şer, tekrarsız
create temp table _keys (k text);
grant all on _keys to public;
do $$
declare r record; at timestamptz; k text; got int; i int := 0;
begin
  loop
    got := 0;
    for r in select * from public.following_activity_page(2, at, k) loop
      insert into _keys values (r.event_key); at := r.occurred_at; k := r.event_key; got := got + 1;
    end loop;
    i := i + 1;
    exit when got < 2 or i > 20;
  end loop;
end $$;
select public._check(7, 'sayfalama tekrarsız ve tek sayfadakiyle aynı küme',
  (select count(*) from _keys) = (select count(distinct k) from _keys)
  and (select count(*) from _keys) = (select count(*) from _p1));

-- Ayarlar: toplamayı kapat → selin'in promptları tek tek; etiketleri kapat → lina yok.
select public.follow_feed_settings_set(p_group_posts => false, p_include_tags => false);
select public._check(8, 'toplama kapalıyken 4 ayrı satır, etiket kapalıyken lina yok',
  (select count(*) from public.following_activity_page(20) where actor_id = :selin and event_kind = 'post') = 5
  and not exists (select 1 from public.following_activity_page(20) where item_id = 'a0000000-0000-4000-8000-000000000006'));
select public.follow_feed_settings_set(p_group_posts => true, p_include_tags => true);

-- Kişi modu: kaan sessiz → hiç gelmez; takip etmediği kişiye mod verilemez.
select public.set_follow_feed_mode(:kaan, 'muted');
select public._check(9, 'sessize alınan kaan akışta yok',
  not exists (select 1 from public.following_activity_page(20) where actor_id = :kaan));
select public._check(10, 'takip edilmeyen kişiye mod verilemez',
  public._try(format('select public.set_follow_feed_mode(%L, ''muted'')', :lina)) ilike '%not_following%');
-- Öne çıkanlar: ali'nin 0 beğenili promptu düşer.
select public.set_follow_feed_mode(:ali, 'highlights');
select public._check(11, 'yalnız öne çıkanlar modunda sıradan paylaşım gelmez',
  not exists (select 1 from public.following_activity_page(20) where event_kind = 'post' and actor_id = :ali));
select public.set_follow_feed_mode(:ali, null);

-- Kaynak süzgeçleri
select public._check(12, 'Spaces süzgeci yalnız Space etkinliği döner',
  (select bool_and(event_kind = 'space_activity') from public.following_activity_page(20, null, null, 'spaces'))
  and exists (select 1 from public.following_activity_page(20, null, null, 'spaces')));
select public._check(13, 'Etiketler süzgeci yalnız etiket kaynaklı paylaşımlar',
  (select bool_and(source = 'tag') from public.following_activity_page(20, null, null, 'tags')));
-- İçerik türü (Ana Sayfa'nın ortak süzgeci): "metin" → görsel paylaşımlar ve Space etkinliği yok; metin promptunun kendisi ve sürümü kalır.
select public._check(21, 'içerik türü süzgeci: yalnız metin promptu (paylaşım + sürüm), görsel paylaşım ve Space etkinliği yok',
  (select bool_and(event_kind in ('post', 'version') and item_id = 'a0000000-0000-4000-8000-000000000009')
     from public.following_activity_page(20, null, null, 'all', null, null, null, null, 'text'))
  and exists (select 1 from public.following_activity_page(20, null, null, 'all', null, null, null, null, 'text'))
  and exists (select 1 from public.following_activity_page(20, null, null, 'all', null, null, null, null, 'image') where event_kind in ('post', 'group'))
  and not exists (select 1 from public.following_activity_page(20, null, null, 'all', null, null, null, null, 'image') where event_kind = 'space_activity'));

-- Ziyaret: ilk çağrı null döner, ikincisi ilkinin zamanını.
select public._check(14, 'ilk ziyaret önceki zaman olarak null döner', public.follow_feed_visit() is null);
select public._check(15, 'ikinci ziyaret bir önceki zamanı döner; peek yazmaz',
  public.follow_feed_visit(true) is not null);

-- Özet
select public._check(16, 'özet: sessiz kaan sayılmaz; selin en çok paylaşan; takip sayıları',
  (select (public.following_activity_summary(now() - interval '2 days') ->> 'posts')::int) = 5
  and (public.following_activity_summary(now() - interval '2 days') -> 'actors' -> 0 ->> 'id') = :selin
  and (public.following_activity_summary() ->> 'following')::int = 3
  and (public.following_activity_summary() ->> 'tags_followed')::int = 1);

-- Yönetim listesi: son paylaşana göre, modu taşır
select public._check(17, 'kişi listesi: üç kişi, kaan sessiz',
  (select count(*) from public.following_people_overview()) = 3
  and (select mode from public.following_people_overview() where id = :kaan) = 'muted');

-- Takibi bırakınca mod satırı gider
reset role;
delete from public.follows where follower_id = :deniz and following_id = :kaan;
select public._check(18, 'takip bırakılınca mod silinir',
  not exists (select 1 from public.follow_feed_modes where user_id = :deniz and target_id = :kaan));

-- Misafir çalıştıramaz
set role anon;
select public._as_user('');
select public._check(19, 'misafir akışı çağıramaz',
  public._try('select * from public.following_activity_page(5)') ilike '%permission denied%');
reset role;

-- Başkasının tercih/mod satırı okunmaz
set role authenticated;
select public._as_user(:selin);
select public._check(20, 'başkasının mod satırı görünmez',
  not exists (select 1 from public.follow_feed_modes where user_id = :deniz));
reset role;

select 'FAILED=' || count(*) filter (where not ok) from public._results;
select n, name, detail from public._results where not ok order by n;
