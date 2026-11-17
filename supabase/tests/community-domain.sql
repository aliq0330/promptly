-- Topluluk Alan + Amaç (docs/history/426-*): chat_groups.domain, create/update_community, alan süzgeci, community_domains, ilgi puanı.
-- Çalıştırma: supabase/tests/run-local.sh supabase/tests/community-domain.sql  ("FAILED=0" beklenir).
-- alice = sahip, erin = dışarıdan izleyen (ilgi alanı photography), dave = üye olmayan ikinci kişi.
\pset pager off
\set ON_ERROR_STOP off
\set alice '''11111111-1111-4111-8111-111111111111'''
\set dave  '''44444444-4444-4444-8444-444444444444'''
\set erin  '''55555555-5555-4555-8555-555555555555'''
insert into auth.users (id, email, raw_user_meta_data)
select u.id::uuid, u.name || '@test.dev', jsonb_build_object('username', u.name, 'display_name', initcap(u.name))
from (values (:alice,'alice'),(:dave,'dave'),(:erin,'erin')) as u(id, name);
create table public._results (n int, name text, ok boolean, detail text);
grant all on public._results to public;
create or replace function public._check(n int, name text, ok boolean, detail text default '') returns void language sql as
  $$ insert into public._results values (n, name, coalesce(ok,false), detail) $$;
create or replace function public._as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
end $$;
create or replace function public._try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlerrm; end $$;
create table public._ctx (k text primary key, v text);
grant all on public._ctx to public;

update public.profiles set interests = array['Fotoğrafçılık'] where id = :erin; -- eski Türkçe değer de alana çözülür

set role authenticated;
select public._as_user(:alice);
-- Alanlı topluluk, alansız eski çağrı (11 konumsal argüman), geçersiz alan
insert into public._ctx select 'a', (public.create_community('Lens Kulübü', 'd', 'public', null, 50, '{}', 'showcase', 'members', 'members', null, false, 'photography')->>'group_id');
insert into public._ctx select 'b', (public.create_community('Eski Çağrı', 'd', 'public', null, 50, '{}', 'general', 'members', 'members', null, false)->>'group_id');
insert into public._ctx select 'c', (public.create_community('Kodcular', 'd', 'restricted', null, 50, '{}', 'learning', 'members', 'members', null, false, 'software')->>'group_id');
select public._check(1, 'oluşturma: alan ve amaç kaydedilir', (select domain = 'photography' and category = 'showcase' from public.chat_groups where id = (select v::uuid from public._ctx where k = 'a')));
select public._check(2, 'oluşturma: eski 11 argümanlı çağrı çalışır, alan boş', (select domain is null from public.chat_groups where id = (select v::uuid from public._ctx where k = 'b')));
select public._check(3, 'oluşturma: geçersiz alan reddedilir', public._try($q$select public.create_community('X', null, 'public', null, 50, '{}', 'general', 'members', 'members', null, false, 'nope')$q$) like '%invalid_domain%');
select public._check(4, 'oluşturma: denetim kaydı alanı taşır', exists (select 1 from public.chat_group_audit where group_id = (select v::uuid from public._ctx where k = 'a') and action = 'community_created' and details->>'domain' = 'photography'));

-- update_community: alan yaması
select public._try(format($q$select public.update_community(%L, '{"domain":"design"}')$q$, (select v from public._ctx where k = 'b'))) as r1 \gset
select domain as d1 from public.chat_groups where id = (select v::uuid from public._ctx where k = 'b') \gset
select public._try(format($q$select public.update_community(%L, '{"domain":null}')$q$, (select v from public._ctx where k = 'b'))) as r2 \gset
select domain is null as d2 from public.chat_groups where id = (select v::uuid from public._ctx where k = 'b') \gset
select public._check(5, 'ayar: sahip alanı değiştirir, boşaltır; geçersiz alan reddedilir',
  :'r1' = 'ok' and :'d1' = 'design' and :'r2' = 'ok' and :'d2'::boolean
  and public._try(format($q$select public.update_community(%L, '{"domain":"nope"}')$q$, (select v from public._ctx where k = 'b'))) like '%invalid_domain%'
  and public._try(format($q$select public.update_community(%L, '{"domain":5}')$q$, (select v from public._ctx where k = 'b'))) like '%invalid_domain%');
select public._as_user(:dave);
select public._try(format($q$select public.update_community(%L, '{"domain":"art"}')$q$, (select v from public._ctx where k = 'a'))) as r6 \gset
reset role;
select public._check(6, 'ayar: üye olmayan alanı değiştiremez', :'r6' like '%forbidden%' or :'r6' like '%group_not_found%', :'r6');
select public._check(6, 'ayar: reddedilen yama alanı değiştirmedi', (select domain from public.chat_groups where id = (select v::uuid from public._ctx where k = 'a')) = 'photography');
set role authenticated;

-- Süzgeç: p_category amaç YA DA alan kimliğidir
select public._as_user(:erin);
select public._check(7, 'süzgeç: alan kimliği browse/discover/search içinde çalışır; başka alan eler; amaç süzgeci eskisi gibi',
  (select array_agg(name order by name) from public.browse_communities(null, 'photography', 'popular', 20, 0)) = array['Lens Kulübü']
  and (select array_agg(name order by name) from public.discover_communities(null, 'popular', 'photography', 20, 0)) = array['Lens Kulübü']
  and (select array_agg(name order by name) from public.search_communities('Lens', 'photography', 20, 0)) = array['Lens Kulübü']
  and (select count(*) from public.browse_communities(null, 'software', 'popular', 20, 0)) = 1 -- kapalı (restricted) Kodcular
  and (select array_agg(name order by name) from public.browse_communities(null, 'showcase', 'popular', 20, 0)) = array['Lens Kulübü']);

-- community_domains: kartı görülebilen topluluğun alanı; görülemeyen / olmayan için satır yok
select public._check(8, 'community_domains: görülebilen topluluklar alanıyla döner, alansız ve olmayan dönmez',
  (select count(*) from public.community_domains(array[(select v::uuid from public._ctx where k = 'a'), (select v::uuid from public._ctx where k = 'c'), (select v::uuid from public._ctx where k = 'b'), gen_random_uuid()])) = 2
  and (select domain from public.community_domains(array[(select v::uuid from public._ctx where k = 'a')])) = 'photography');
reset role;
set role anon;
select public._check(9, 'community_domains: ziyaretçi herkese açık topluluğun alanını okur, kapalı olanınkini okumaz',
  (select domain from public.community_domains(array[(select v::uuid from public._ctx where k = 'a')])) = 'photography'
  and (select count(*) from public.community_domains(array[(select v::uuid from public._ctx where k = 'c')])) = 1); -- restricted: kart herkese okunur
reset role;

-- İlgi puanı: topluluğun alanı ilgi alanlarındaysa neden = interest
set role authenticated;
select public._as_user(:erin);
select public._check(10, 'öneri: ilgi alanı (photography) topluluğun alanıyla eşleşir → neden interest ve ilk sırada',
  (select reason from public.recommend_communities(10) where name = 'Lens Kulübü') = 'interest'
  );
reset role;

-- Geri doldurma ifadesi (migration'daki UPDATE ile aynı)
insert into public.conversations (id, kind, last_message_at) values ('c0000000-0000-4000-8000-0000000000a1', 'group', now());
insert into public.chat_groups (id, name, visibility, category) values ('c0000000-0000-4000-8000-0000000000a1', 'Eski Ses', 'public', 'audio');
update public.chat_groups
   set domain = case category
     when 'image' then 'art' when 'text' then 'writing' when 'audio' then 'music-audio' when 'video' then 'video'
     when 'workflow' then 'productivity' when 'learning' then 'education' else null end
 where domain is null and category in ('image', 'text', 'audio', 'video', 'workflow', 'learning');
select public._check(11, 'geri doldurma: eski ortam kategorisi tahmini alana çevrilir, kategori değişmez', (select domain = 'music-audio' and category = 'audio' from public.chat_groups where id = 'c0000000-0000-4000-8000-0000000000a1'));
insert into public.domains (id, label_tr, label_en) values ('tmpdom', 'Geçici', 'Temp');
update public.chat_groups set domain = 'tmpdom' where id = 'c0000000-0000-4000-8000-0000000000a1';
delete from public.domains where id = 'tmpdom';
select public._check(12, 'alan silinirse topluluğun alanı boşalır (on delete set null), topluluk silinmez', (select domain is null from public.chat_groups where id = 'c0000000-0000-4000-8000-0000000000a1'));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from public._results order by n, name;
select 'FAILED=' || count(*) filter (where not ok) from public._results;
