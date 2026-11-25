-- Space'in sosyal katmanı KALDIRILDI (docs/history/459-*): Space artık ekip dosyası gibi ÖZEL bir çalışma tuvalidir — yorum, 1–5 puan,
-- etkinlik sekmesi, alıntı/akış, herkese açık/bağlantılı görünürlük, paylaşım bağlantıları, Keşfet/profil listesi ve "Sabitle" yok.
--
-- Bu migration "genişlet" adımıdır + yıkıcı veri temizliğidir:
--  1. silinecek sosyal veri ÖNCE istemciye kapalı `space_social_archive` tablosuna JSON olarak arşivlenir;
--  2. Space yorumu/puanı/beğenisi/alıntısı/topluluk duyurusu ve bunların bildirimleri silinir, sayaçlar sıfırlanır;
--  3. tüm Space'ler `private` olur (CHECK + zorlayıcı tetikleyici); okuma YALNIZ üyeliktir (`can_read_space`);
--  4. yeni Space yorumu/puanı/alıntısı/duyurusu veritabanında REDDEDİLİR (eski istemci de yazamaz);
--  5. yalnız Space'e ait ölü RPC'ler (bağlantı, vitrin listesi, paylaşım, sabitleme) düşer.
-- Ortak tablolardaki (`prompt_comments.space_id`, `content_quotes.space_id`, `spaces.rating_*`…) ölü sütunlar BİLEREK durur: onlara
-- onlarca canlı fonksiyon adıyla bakıyor (feed_page, bildirim tetikleyicileri…); ayrı bir contract'ta düşürülür (CLAUDE.md "Ölü sütunlar").
-- ci:allow-destructive

-- 1. Arşiv (istemciye KAPALI: RLS açık, politika yok, yetki yok) -------------------------------------------------------------------
create table if not exists public.space_social_archive (
  id bigint generated always as identity primary key,
  source text not null,
  row_data jsonb not null,
  archived_at timestamptz not null default now()
);
alter table public.space_social_archive enable row level security;
revoke all on public.space_social_archive from public, anon, authenticated;

insert into public.space_social_archive (source, row_data)
select 'prompt_comments', to_jsonb(c) from public.prompt_comments c where c.space_id is not null
union all
select 'content_quotes', to_jsonb(q) from public.content_quotes q where q.space_id is not null
union all
select 'prompt_likes', to_jsonb(l) from public.prompt_likes l where l.space_id is not null
union all
select 'community_posts', to_jsonb(p) from public.community_posts p where p.space_id is not null
union all
select 'spaces_visibility', jsonb_build_object('space_id', s.id, 'visibility', s.visibility, 'shared_at', s.shared_at, 'rating_avg', s.rating_avg, 'rating_count', s.rating_count)
  from public.spaces s where s.visibility <> 'private' or s.rating_count > 0 or s.shared_at is not null
union all
select 'space_share_links', to_jsonb(l) from public.space_share_links l;

-- 2. Sosyal veriyi sil ------------------------------------------------------------------------------------------------------------
-- Bildirimler (yorum/beğeni/alıntı → Space adresi) önce: kaynakları gidiyor.
delete from public.notifications
 where type in ('comment', 'like', 'quote', 'reaction') and target_href ~ '^/spaces/local';

-- Yorumlar: "yanıtlı yorumu yumuşak sil" tetikleyicisi satırı gerçekten silmez — veri temizliği için kullanıcı tetikleyicileri kapatılır
-- (sayaçlar zaten aşağıda sıfırlanıyor; Space yorumunun başka tablodaki sayacı yok).
alter table public.prompt_comments disable trigger user;
delete from public.prompt_comments where space_id is not null;
alter table public.prompt_comments enable trigger user;

delete from public.content_quotes where space_id is not null;
delete from public.prompt_likes where space_id is not null;
delete from public.community_posts where space_id is not null;

-- Sayaçları ve eski paylaşım işaretlerini sıfırla (korumalı sütunlar: kullanıcı tetikleyicileri bu işlem için kapalı).
alter table public.spaces disable trigger user;
update public.spaces
   set rating_avg = 0, rating_count = 0, comment_count = 0, quote_count = 0, like_count = 0, shared_at = null,
       visibility = 'private'
 where visibility <> 'private' or rating_count > 0 or comment_count > 0 or quote_count > 0 or like_count > 0 or shared_at is not null;
alter table public.spaces enable trigger user;

delete from public.space_link_grants;
delete from public.space_share_links;

-- 3. Görünürlük = hep özel; okuma = yalnız üyelik ----------------------------------------------------------------------------------
alter table public.spaces drop constraint if exists spaces_visibility_check;
alter table public.spaces add constraint spaces_visibility_check check (visibility = 'private');

-- Eski istemci "herkese açık" yazsa bile hata vermeden özel kalır (yazma yolu RPC'ler; kimse yanlışlıkla açamaz).
create or replace function public.spaces_force_private()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.visibility := 'private';
  return new;
end;
$$;
drop trigger if exists spaces_force_private on public.spaces;
create trigger spaces_force_private before insert or update of visibility on public.spaces
  for each row execute function public.spaces_force_private();

create or replace function public.can_read_space(p_space uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.spaces s
     where s.id = p_space
       and exists (select 1 from public.space_members m where m.space_id = s.id and m.user_id = auth.uid())
       and not public._space_member_expired(s.id, auth.uid())
  );
$$;

-- 4. Yeni sosyal yazımlar reddedilir ------------------------------------------------------------------------------------------------
create or replace function public.enforce_space_engagement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Space'in yorumu, puanı ve beğenisi yok (docs/history/459-*). Eski istemcilerin yazması da burada durur.
  if nullif(to_jsonb(new) ->> 'space_id', '') is not null then
    raise exception 'space_engagement_closed';
  end if;
  return new;
end;
$$;

create or replace function public.content_quotes_no_space()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.space_id is not null then
    raise exception 'space_engagement_closed';
  end if;
  return new;
end;
$$;
drop trigger if exists content_quotes_no_space on public.content_quotes;
create trigger content_quotes_no_space before insert or update on public.content_quotes
  for each row execute function public.content_quotes_no_space();

create or replace function public.community_posts_no_space()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.space_id is not null then
    raise exception 'space_engagement_closed';
  end if;
  return new;
end;
$$;
drop trigger if exists community_posts_no_space on public.community_posts;
create trigger community_posts_no_space before insert or update on public.community_posts
  for each row execute function public.community_posts_no_space();

-- Tetikleyici fonksiyonlarından EXECUTE kapalı (CLAUDE.md §6 güvenlik kuralı 6).
revoke execute on function public.spaces_force_private() from public, anon, authenticated;
revoke execute on function public.content_quotes_no_space() from public, anon, authenticated;
revoke execute on function public.community_posts_no_space() from public, anon, authenticated;

-- 5. Yalnız Space'e ait ölü RPC'ler -------------------------------------------------------------------------------------------------
drop function if exists public.create_space_link(uuid);
drop function if exists public.open_space_link(text);
drop function if exists public.revoke_space_link(uuid);
drop function if exists public.space_link_status(uuid);
drop function if exists public.list_public_spaces(uuid, uuid, integer, integer);
drop function if exists public.list_public_spaces_for_skill(uuid, integer, integer);
drop function if exists public.set_space_shared(uuid, boolean);
drop function if exists public.set_space_favorite(uuid, boolean);
