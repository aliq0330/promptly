-- Beğeni / yorum beğenisi / istek etiketi OKUMASI, hedefin okunabilirliğini izler (docs/history/195-*).
--
-- SORUN: üç tablonun SELECT politikası `using (true)` idi — "kim neyi beğendi" ve "hangi isteğe hangi etiket" satırlarını herkese açardı.
-- İçeriğin KENDİSİ (prompts/workflows/presets/prompt_requests/community_posts ve çocuk tabloları) zaten korunuyordu; ama topluluğa özgü
-- (kapalı / tamamen kapalı topluluğun) içerik ve gönderilerin beğeni satırları üye olmayana okunabiliyordu (kimlik + hedef kimliği + beğenen).
--
-- ÇÖZÜM (kalıcı, veritabanında): satır, AÇAN KİŞİ HEDEFİ OKUYABİLİYORSA okunur. Hedefin okunabilirliği ayrıca yazılmaz — hedef tablonun
-- kendi RLS'i neyi gösteriyorsa onu izler (`exists (select 1 from <hedef> …)` çağıranın yetkisiyle çalışır). Böylece yeni bir okuma
-- kuralı (örn. başka bir topluluk düzeyi) eklense bile beğeni satırları kendiliğinden uyar. Kişi kendi satırını her zaman okur.
--
-- Yalnızca politika değişir: tablo/veri/sayaç/tetikleyici dokunulmaz. Sayaçlar SECURITY DEFINER tetikleyicilerle tutulur (RLS'i atlar).
-- NOT: bu dosya iki `drop policy` içerir (aynı adlı politikanın yerine yenisi yazılır).

-- ============================================================================
-- prompt_likes
-- ============================================================================
drop policy if exists "Likes are publicly readable" on public.prompt_likes;
create policy "Likes are readable wherever their target is readable"
  on public.prompt_likes for select
  using (
    user_id = auth.uid()
    or (prompt_id is not null and exists (select 1 from public.prompts p where p.id = prompt_likes.prompt_id))
    or (request_id is not null and exists (select 1 from public.prompt_requests r where r.id = prompt_likes.request_id))
    or (workflow_id is not null and exists (select 1 from public.workflows w where w.id = prompt_likes.workflow_id))
    or (preset_id is not null and exists (select 1 from public.presets s where s.id = prompt_likes.preset_id))
    or (community_post_id is not null and exists (select 1 from public.community_posts c where c.id = prompt_likes.community_post_id))
  );

-- ============================================================================
-- comment_likes (yorumun kendisi zaten hedefinin okunabilirliğini izler)
-- ============================================================================
drop policy if exists "Comment likes are publicly readable" on public.comment_likes;
create policy "Comment likes are readable wherever their comment is readable"
  on public.comment_likes for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.prompt_comments c where c.id = comment_likes.comment_id)
  );

-- ============================================================================
-- prompt_request_tags
-- ============================================================================
drop policy if exists "Request tags are publicly readable" on public.prompt_request_tags;
create policy "Request tags are readable wherever their request is readable"
  on public.prompt_request_tags for select
  using (exists (select 1 from public.prompt_requests r where r.id = prompt_request_tags.request_id));
