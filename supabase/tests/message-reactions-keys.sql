-- Mesaj tepkileri = gönderi tepkileri (docs/history/330-*): eski emojiler anahtara çevrilir, karşılıksızlar silinir, CHECK yalnız
-- altı anahtarı kabul eder; RLS (yalnız üye, yalnız kendi adına) değişmedi.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/message-reactions-keys.sql  ("FAILED=0" beklenir).
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set bobby '''22222222-2222-4222-8222-222222222222'''
\set carol '''33333333-3333-4333-8333-333333333333'''

insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:bobby,'bobby'),(:carol,'carol')) as u(id, name);

create table public._results (n int, name text, ok boolean, detail text);
create table public._ctx (k text primary key, v text);
grant all on public._results, public._ctx to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
create or replace function public._g(key text) returns uuid language sql stable as $$ select v::uuid from public._ctx where k = key $$;
grant execute on function public._check(int, text, boolean, text), public._as_user(text), public._try(text), public._g(text) to public;

-- ---------- fixture: alice↔bobby birebir sohbet, mesaj başına bir kişinin tepkisi ----------
set role authenticated;
select public._as_user(:alice);
create temp table _dm as select public.start_direct_conversation(:bobby) as id;
grant all on _dm to public;
select public._as_user(:bobby);
update public.conversation_members set status = 'accepted' where user_id = :bobby;
reset role;
insert into public._ctx select 'dm', id::text from _dm;
-- 14 mesaj: her biri eski bir emojiyle tepki alır (bobby'den), m1 ayrıca alice'ten.
insert into public.messages (id, conversation_id, sender_id, body, created_at)
select ('00000000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid, public._g('dm'), :alice, 'mesaj ' || i, now() - make_interval(mins => 60 - i)
from generate_series(1, 14) as i;

-- Eski veriyi taklit et: kısıtı geçici kaldırıp migration öncesi serbest emojileri yaz, sonra migration'ı yeniden oynat.
alter table public.message_reactions drop constraint message_reactions_emoji_check;
insert into public.message_reactions (message_id, conversation_id, user_id, emoji)
select ('00000000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid, public._g('dm'), :bobby, e
from (values (1, '❤️'), (2, '❤'), (3, '😂'), (4, '😮'), (5, '🔥'), (6, '👏'), (7, '👍'), (8, '🤔'), (9, '😍'),
             (10, '😢'), (11, '😡'), (12, '😴'), (13, 'love'), (14, '💯')) as v(i, e);
insert into public.message_reactions (message_id, conversation_id, user_id, emoji)
values ('00000000-0000-4000-8000-000000000101', public._g('dm'), :alice, '😡');

\ir ../migrations/20261104120000_message_reactions_post_reactions.sql

create or replace function public._r(i int, uid uuid) returns text language sql stable as $$
  select coalesce((select emoji from public.message_reactions
                   where message_id = ('00000000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid and user_id = uid), '<yok>') $$;

-- 1. Dönüşüm
select public._check(1, '❤️ (VS16 ile) ve ❤ → love', public._r(1, :bobby) = 'love' and public._r(2, :bobby) = 'love', public._r(1, :bobby) || ',' || public._r(2, :bobby));
select public._check(2, '😂→haha, 😮→wow, 🔥→fire, 👏→clap',
  public._r(3, :bobby) || public._r(4, :bobby) || public._r(5, :bobby) || public._r(6, :bobby) = 'hahawowfireclap');
select public._check(3, 'yakın karşılıklar: 👍→clap, 🤔→idea, 😍→love, 💯→fire',
  public._r(7, :bobby) || public._r(8, :bobby) || public._r(9, :bobby) || public._r(14, :bobby) = 'clapidealovefire');
select public._check(4, 'zaten anahtar olan dokunulmaz', public._r(13, :bobby) = 'love');
select public._check(5, 'karşılıksız 😢 😡 😴 silinir', public._r(10, :bobby) || public._r(11, :bobby) || public._r(12, :bobby) = '<yok><yok><yok>');
select public._check(6, 'aynı mesajda başkasının karşılıksız tepkisi silinir, diğerininki kalır',
  public._r(1, :alice) = '<yok>' and public._r(1, :bobby) = 'love');
select public._check(7, 'kalan her satır altı anahtardan biri',
  not exists (select 1 from public.message_reactions where emoji not in ('love','fire','wow','clap','haha','idea')));

-- 2. Yazma (gerçek istemci yolu: authenticated + RLS)
set role authenticated;
select public._as_user(:alice);
select public._check(8, 'üye anahtarla tepki verir',
  public._try(format($$insert into public.message_reactions (message_id, conversation_id, user_id, emoji) values ('00000000-0000-4000-8000-000000000110', %L, %L, 'fire')$$, public._g('dm'), :alice)) = 'ok');
select public._check(9, 'tepkiyi değiştirme (upsert) anahtarla çalışır',
  public._try(format($$insert into public.message_reactions (message_id, conversation_id, user_id, emoji) values ('00000000-0000-4000-8000-000000000110', %L, %L, 'idea') on conflict (message_id, user_id) do update set emoji = excluded.emoji$$, public._g('dm'), :alice)) = 'ok');
select public._check(15, 'değişen tepki yerinde (tek satır, yeni anahtar)', public._r(10, :alice) = 'idea', public._r(10, :alice));
select public._check(10, 'eski emoji (yenilenmemiş sekme) reddedilir',
  public._try(format($$insert into public.message_reactions (message_id, conversation_id, user_id, emoji) values ('00000000-0000-4000-8000-000000000111', %L, %L, '👍')$$, public._g('dm'), :alice)) like '%message_reactions_emoji_check%');
select public._check(11, 'güncellemede de eski emoji reddedilir',
  public._try(format($$update public.message_reactions set emoji = '😂' where user_id = %L$$, :alice)) like '%message_reactions_emoji_check%');
select public._check(12, 'bilinmeyen anahtar reddedilir',
  public._try(format($$insert into public.message_reactions (message_id, conversation_id, user_id, emoji) values ('00000000-0000-4000-8000-000000000112', %L, %L, 'heart')$$, public._g('dm'), :alice)) like '%message_reactions_emoji_check%');
select public._as_user(:carol);
select public._check(13, 'üye olmayan geçerli anahtarla da yazamaz (RLS aynen)',
  public._try(format($$insert into public.message_reactions (message_id, conversation_id, user_id, emoji) values ('00000000-0000-4000-8000-000000000112', %L, %L, 'love')$$, public._g('dm'), :carol)) <> 'ok');
select public._check(14, 'üye olmayan tepkileri okuyamaz', (select count(*) from public.message_reactions) = 0);
reset role;

select 'FAILED=' || count(*) filter (where not ok) || ' / ' || count(*) from public._results;
select n, name, detail from public._results where not ok order by n;
