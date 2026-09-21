-- Promptly — Bildirim sisteminin tamamlanması.
--
-- === AŞAMA 1: mevcut sistemin envanteri (bu migration'ı yazmadan önce
-- kod/şema taranarak çıkarıldı) ================================================
--
-- Var olan 4 bildirim üreticisi (hepsi doğru çalışıyor, DOKUNULMADI ya da
-- yalnızca eksik bir dalı tamamlamak için genişletildi — aşağıda belirtilen
-- yerler hariç):
--   1. notify_new_request_response (prompts AFTER INSERT, origin_type=
--      'request_response') → istek sahibine. DOĞRU, değişmedi.
--   2. notify_selected_response (prompt_requests AFTER UPDATE) → yalnızca
--      YENİ seçilen yanıtın sahibine bildirim gönderiyordu; seçim
--      KALDIRILDIĞINDA (yeni değer null) veya DEĞİŞTİRİLDİĞİNDE (eski
--      sahip) hiç bildirim üretmiyordu — GERÇEK EKSİK, aşağıda düzeltildi.
--   3. notify_comment_reply (prompt_comments AFTER INSERT, parent_id
--      dolu) → doğrudan üst yorumun/yanıtın sahibine. DOĞRU (iç içe
--      yanıtlarda yalnızca doğrudan üst sahibine gidiyor, tüm zincire
--      değil) — ama parent_id BOŞ olan (bir gönderiye doğrudan yapılan
--      ilk yorum) hiç ele alınmıyordu — GERÇEK EKSİK, aşağıda tamamlandı.
--   4. notify_comment_like (comment_likes AFTER INSERT) → yorum sahibine.
--      DOĞRU ama beğeni GERİ ÇEKİLDİĞİNDE bildirimi silen bir karşılığı
--      YOKTU — GERÇEK EKSİK, aşağıda eklendi.
--
-- Tamamen EKSİK olan bildirim üreticileri (hiç trigger yoktu):
--   - Prompt gönderisi beğenisi → gönderi sahibi (prompt_likes tablosu
--     zaten vardı, hiç bildirim üretmiyordu).
--   - Gönderiye/isteğe DOĞRUDAN yapılan ilk yorum → sahibi (yalnızca
--     yanıtlar bildirim üretiyordu, ana yorumlar üretmiyordu).
--   - Remix → orijinal çalışmanın sahibi (`remix` bildirim tipi
--     20260919120400'den beri `notifications.type` CHECK kısıtında
--     tanımlıydı ama HİÇ tetiklenmiyordu).
--   - Takip → takip edilen kullanıcı (`handle_follow_change` yalnızca
--     sayaçları güncelliyordu, `follow` tipi de tanımlıydı ama hiç
--     tetiklenmiyordu).
--   - Yeni mesaj → alıcı (`handle_new_message` yalnızca `unread_count`'u
--     güncelliyordu, `message` tipi de tanımlıydı ama hiç tetiklenmiyordu).
--   - İstek kapatıldığında gerçek yanıt veren kullanıcılar → hiç
--     ele alınmıyordu.
--   - Bir beğeni geri çekildiğinde İLGİLİ bildirimin silinmesi (yalnızca
--     yorum beğenisi için değil, hiçbir beğeni türü için bu yoktu).
--
-- Client tarafında da gerçek eksik: `src/lib/supabase/notifications.ts`
-- yalnızca OKUMA yapıyordu (`fetchNotificationsForUser`) — okundu
-- işaretleme veya silme için HİÇBİR fonksiyon yoktu, ve `notifications`
-- tablosunda bir DELETE RLS politikası da yoktu (yalnızca SELECT + kendi
-- UPDATE'i, Bölüm 19). `/notifications` sayfası hiçbir bildirimi hiçbir
-- zaman okundu işaretlemiyordu (link'e tıklamak yalnızca yönlendiriyordu).
--
-- Kapsam dışı bırakılan (bu görevin "gereksiz tablo/paralel sistem
-- oluşturma" kısıtına göre, gerçek bir eksiklik DEĞİL — bkz. commit/rapor):
--   - "Prompt isteği gönderisini beğenme": uygulamada böyle bir özellik
--     hiç yok — `prompt_requests` için hiçbir beğeni tablosu/UI'ı
--     (LikeButton yalnızca promptlarda kullanılıyor) mevcut değil. Bu
--     görev yalnızca bildirim kurallarını kapsadığından, var olmayan bir
--     "isteği beğenme" özelliğini icat etmek kapsam dışı — bu haliyle
--     rapor edildi, hiçbir sahte/yarım tablo eklenmedi.
--   - Sistem duyuruları: uygulamada hiçbir admin/moderasyon paneli
--     (Bölüm 22 henüz yazılmadı) yok, bu yüzden `system` tipini
--     tetikleyecek gerçek bir üretici de yok — eklenecek bir şey yok.

-- === Notifications tablosuna dedupe_key ====================================
-- Yalnızca "aç/kapa" (toggle) tarzı olaylar için gerekli — bir beğeni
-- eklendiğinde/kaldırıldığında TAM OLARAK hangi bildirimin silineceğini
-- (başka hiçbir bildirimi etkilemeden) belirlemek için. Diğer bildirim
-- türleri (yorum, remix, takip, mesaj, seçim, kapanış) toggle değil, tek
-- seferlik olaylar olduğundan bu anahtara ihtiyaç duymuyor — üreten
-- tablonun kendi birincil anahtarı zaten aynı olayın iki kez işlenmesini
-- (idempotency) doğal olarak engelliyor.
alter table public.notifications add column dedupe_key text;
create unique index notifications_dedupe_key_key
  on public.notifications (dedupe_key)
  where dedupe_key is not null;

-- === Manuel silme için RLS ==================================================
-- Bölüm 19 kasıtlı olarak yalnızca SELECT + kendi UPDATE'ini (okundu
-- işaretleme) vermişti; DELETE politikası hiç yoktu. "Kullanıcı bildirimi
-- manuel silerse yalnızca bildirim kaydı silinmeli" ve "başka kullanıcının
-- bildirimi silinemiyor" kuralları için gerekli.
create policy "Users can delete their own notifications"
  on public.notifications for delete
  using (auth.uid() = recipient_id);

-- === İçerik silindiğinde geçersiz hedefe yönlendiren bildirimleri temizle ==
-- Bir prompt/istek tamamen silindiğinde, ona yönlendiren HER bildirim
-- (beğeni, yorum, remix, yanıt vb.) artık kırık bir bağlantıya işaret
-- eder — `target_href` eşleşmesiyle hepsini tek seferde temizliyoruz.
-- Yorumlar için ayrı bir temizlik gerekmiyor: bir yorum yanıtı olduğu
-- sürece asla gerçekten silinmiyor (yalnızca soft-delete, Bölüm 9.5),
-- yanıtı yoksa gerçekten siliniyor ama ona ait bildirimler zaten gönderinin
-- KENDİ sayfasına yönlendiriyor (yorumun kendine özel bir sayfası yok) —
-- gönderi hâlâ var olduğu sürece bu bağlantı hiçbir zaman kırılmıyor.

create or replace function public.cleanup_notifications_for_deleted_prompt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where target_href = '/prompts/local?id=' || old.id;
  return old;
end;
$$;

create trigger prompts_after_delete_cleanup_notifications
  after delete on public.prompts
  for each row
  execute function public.cleanup_notifications_for_deleted_prompt();

create or replace function public.cleanup_notifications_for_deleted_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where target_href = '/requests/local?id=' || old.id;
  return old;
end;
$$;

create trigger prompt_requests_after_delete_cleanup_notifications
  after delete on public.prompt_requests
  for each row
  execute function public.cleanup_notifications_for_deleted_request();

-- === AŞAMA 3: Prompt gönderisi beğenisi (tamamen yeni) =====================

create or replace function public.notify_prompt_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
begin
  select author_id into v_author_id from public.prompts where id = new.prompt_id;
  if v_author_id is null or v_author_id = new.user_id then
    return new; -- gönderi bulunamadı ya da kendi gönderisini kendi beğendi
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_author_id, new.user_id, 'like', 'Paylaşımını beğendi.',
    '/prompts/local?id=' || new.prompt_id,
    'prompt_like:' || new.prompt_id || ':' || new.user_id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return new;
end;
$$;

create trigger prompt_likes_after_insert_notify
  after insert on public.prompt_likes
  for each row
  execute function public.notify_prompt_like();

-- Beğeni geri çekildiğinde YALNIZCA o beğeniye ait bildirim silinir —
-- aynı gönderideki yorum, remix, seçim vb. bildirimler dedupe_key'i farklı
-- olduğundan hiç etkilenmez. Okunmuş olsa bile silinir (WHERE'de is_read
-- kontrolü yok, şartnamenin istediği tam olarak bu).
create or replace function public.cleanup_prompt_like_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
  where dedupe_key = 'prompt_like:' || old.prompt_id || ':' || old.user_id;
  return old;
end;
$$;

create trigger prompt_likes_after_delete_cleanup_notification
  after delete on public.prompt_likes
  for each row
  execute function public.cleanup_prompt_like_notification();

-- === AŞAMA 3 (devam): Yorum/yanıt beğenisi — var olan trigger'a dedupe_key
-- eklendi + eksik olan "geri çekildiğinde sil" karşılığı eklendi ===========

create or replace function public.notify_comment_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comment_author uuid;
  v_prompt_id uuid;
  v_request_id uuid;
  v_href text;
begin
  select author_id, prompt_id, request_id
    into v_comment_author, v_prompt_id, v_request_id
    from public.prompt_comments where id = new.comment_id;

  if v_comment_author is null or v_comment_author = new.user_id then
    return new; -- yorum bulunamadı ya da kendi yorumunu kendi beğendi
  end if;

  v_href := case
    when v_prompt_id is not null then '/prompts/local?id=' || v_prompt_id
    else '/requests/local?id=' || v_request_id
  end;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_comment_author, new.user_id, 'like', 'Yorumunu beğendi.', v_href,
    'comment_like:' || new.comment_id || ':' || new.user_id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return new;
end;
$$;
-- Trigger zaten var (20260919160000), CREATE OR REPLACE yeterli.

create or replace function public.cleanup_comment_like_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
  where dedupe_key = 'comment_like:' || old.comment_id || ':' || old.user_id;
  return old;
end;
$$;

create trigger comment_likes_after_delete_cleanup_notification
  after delete on public.comment_likes
  for each row
  execute function public.cleanup_comment_like_notification();

-- === AŞAMA 4: Gönderiye/isteğe doğrudan yapılan yorum — eksik dal eklendi ==
-- `notify_comment_reply`'nin `parent_id` dolu (bir yoruma/yanıta yanıt)
-- dalı zaten doğruydu ve DEĞİŞMEDİ; burada yalnızca `parent_id` boş
-- (gönderinin/isteğin kendisine doğrudan yorum) dalı eklendi.

create or replace function public.notify_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_author uuid;
  v_post_author uuid;
  v_href text;
begin
  v_href := case
    when new.prompt_id is not null then '/prompts/local?id=' || new.prompt_id
    else '/requests/local?id=' || new.request_id
  end;

  if new.parent_id is not null then
    -- Bir yoruma/yanıta doğrudan yanıt: yalnızca doğrudan üst mesajın
    -- sahibine gider — gönderi sahibine ya da zincirdeki başka bir üst
    -- yorumun sahibine OTOMATİK olarak gitmez (şartnamenin özellikle
    -- yasakladığı davranış).
    select author_id into v_parent_author
      from public.prompt_comments where id = new.parent_id;

    if v_parent_author is null or v_parent_author = new.author_id then
      return new; -- üst mesaj bulunamadı ya da kendi yorumuna/yanıtına kendi yanıtı
    end if;

    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (v_parent_author, new.author_id, 'comment_reply', 'Yorumuna bir yanıt geldi.', v_href);
  else
    -- Gönderinin/isteğin kendisine doğrudan yorum: gönderi/istek sahibine
    -- gider.
    if new.prompt_id is not null then
      select author_id into v_post_author from public.prompts where id = new.prompt_id;
    else
      select author_id into v_post_author from public.prompt_requests where id = new.request_id;
    end if;

    if v_post_author is null or v_post_author = new.author_id then
      return new; -- gönderi/istek bulunamadı ya da kendi gönderisine/isteğine kendi yorumu
    end if;

    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_post_author, new.author_id, 'comment',
      case when new.prompt_id is not null then 'Paylaşımına yorum yaptı.' else 'İsteğine yorum yaptı.' end,
      v_href
    );
  end if;

  return new;
end;
$$;
-- Trigger zaten var (20260919160000), CREATE OR REPLACE yeterli.

-- === AŞAMA 5: Remix (tamamen yeni) =========================================

create or replace function public.notify_new_remix()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_author uuid;
begin
  if new.origin_type <> 'remix' or new.source_prompt_id is null then
    return new;
  end if;

  select author_id into v_source_author from public.prompts where id = new.source_prompt_id;
  if v_source_author is null or v_source_author = new.author_id then
    return new; -- kaynak bulunamadı (FK zaten engeller) ya da kendi çalışmasını kendi remixledi
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (
    v_source_author, new.author_id, 'remix', 'Çalışmanı remixledi.',
    '/prompts/local?id=' || new.id
  );

  return new;
end;
$$;

create trigger prompts_after_insert_notify_remix
  after insert on public.prompts
  for each row
  execute function public.notify_new_remix();

-- === AŞAMA 6: Yanıt seçimi/değiştirme/kaldırma — eksik dallar eklendi ======
-- Eski sürüm YALNIZCA yeni seçilen yanıtın sahibine bildirim gönderiyordu.
-- Artık üç durum da ayrı ayrı, doğru kişiye, birbirine karıştırılmadan ele
-- alınıyor: (a) yeni bir seçim yapıldı → yeni sahibine "seçildi"; (b) önceki
-- seçim değişti/kaldırıldı → ÖNCEKİ sahibine "artık seçili değil". İkisi
-- aynı UPDATE'te birlikte de olabilir (seçim A'dan B'ye değiştiğinde) —
-- bu durumda A'ya "kaldırıldı", B'ye "seçildi" ayrı ayrı gider.

create or replace function public.notify_selected_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_response_author uuid;
begin
  if new.selected_response_prompt_id is not distinct from old.selected_response_prompt_id then
    return new; -- seçimde gerçek bir değişiklik yok (no-op UPDATE)
  end if;

  -- Önceki seçim varsa ve değiştiyse/kaldırıldıysa, o yanıtın sahibine bildir.
  if old.selected_response_prompt_id is not null then
    select author_id into v_response_author
      from public.prompts where id = old.selected_response_prompt_id;

    if v_response_author is not null and v_response_author <> new.author_id then
      insert into public.notifications (recipient_id, actor_id, type, message, target_href)
      values (
        v_response_author, new.author_id, 'request_response',
        'Yanıtın "' || new.title || '" isteği için artık seçili değil.',
        '/requests/local?id=' || new.id
      );
    end if;
  end if;

  -- Yeni bir seçim yapıldıysa, o yanıtın sahibine bildir.
  if new.selected_response_prompt_id is not null then
    select author_id into v_response_author
      from public.prompts where id = new.selected_response_prompt_id;

    if v_response_author is not null and v_response_author <> new.author_id then
      insert into public.notifications (recipient_id, actor_id, type, message, target_href)
      values (
        v_response_author, new.author_id, 'request_response',
        'Yanıtın "' || new.title || '" isteği için seçildi!',
        '/requests/local?id=' || new.id
      );
    end if;
  end if;

  return new;
end;
$$;
-- Trigger zaten var (20260919150000), CREATE OR REPLACE yeterli.

-- === AŞAMA 6 (devam): İstek kapatıldığında gerçek yanıt verenler =========
-- Yalnızca MANUEL kapatmayı (status → 'closed') kapsar — bir yanıt
-- seçildiğinde otomatik oluşan 'answered' durumu zaten yukarıdaki
-- `notify_selected_response` ile o yanıtın sahibine ayrıca bildiriliyor;
-- bu ikisini karıştırıp seçilen yanıt sahibine iki kez bildirim
-- göndermemek için bilinçli olarak yalnızca 'closed' durumuna geçişte
-- tetikleniyor. Aynı kullanıcının birden fazla yanıtı varsa `distinct`
-- ile tek bildirim alması garanti ediliyor; istek sahibinin kendisi asla
-- kendi kapanış bildirimini almıyor (yanıt verenler arasında olsa bile).

create or replace function public.notify_request_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_responder record;
begin
  if new.status <> 'closed' or old.status is not distinct from 'closed' then
    return new; -- yalnızca 'closed' durumuna YENİ geçişte tetiklen (yeniden aç+kapat = yeni olay, yine tetiklenir)
  end if;

  for v_responder in
    select distinct author_id
    from public.prompts
    where request_id = new.id
      and origin_type = 'request_response'
      and author_id <> new.author_id
  loop
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_responder.author_id, new.author_id, 'request_response',
      'Yanıt verdiğin "' || new.title || '" isteği kapandı.',
      '/requests/local?id=' || new.id
    );
  end loop;

  return new;
end;
$$;

create trigger prompt_requests_after_update_notify_closed
  after update on public.prompt_requests
  for each row
  execute function public.notify_request_closed();

-- === AŞAMA 7: Takip (tamamen yeni) =========================================
-- `follows_no_self_follow` CHECK kısıtı (Bölüm 18) kendi kendini takibi
-- veritabanı seviyesinde zaten imkansız kılıyor, ama tutarlılık için aynı
-- kontrol burada da var. Takipten çıkma bir DELETE'tir, bu trigger yalnızca
-- INSERT'te çalıştığından hiç tetiklenmez — "takipten çıkma bildirim
-- oluşturmamalı" kuralı yapısal olarak garanti. Yeniden takip etmek gerçek,
-- yeni bir INSERT (follows'un birincil anahtarı `(follower_id,
-- following_id)` olduğundan önceki takipten çıkma satırı gerçekten
-- silinmiş olur) olduğundan doğal olarak yeni bir bildirim üretir.

create or replace function public.notify_new_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  if new.follower_id = new.following_id then
    return new;
  end if;

  select username into v_username from public.profiles where id = new.follower_id;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (
    new.following_id, new.follower_id, 'follow', 'Seni takip etmeye başladı.',
    '/profile/real?username=' || coalesce(v_username, '')
  );

  return new;
end;
$$;

create trigger follows_after_insert_notify
  after insert on public.follows
  for each row
  execute function public.notify_new_follow();

-- === AŞAMA 8: Mesaj (tamamen yeni) =========================================
-- 1:1 konuşmalar için tek bir alıcı satırı üretir; şema teknik olarak grup
-- sohbetini desteklese de (CLAUDE.md Bölüm 21 Faz 6) uygulama bunu hiç
-- kurmadığından `for each row` döngüsü genel kalsın diye üye tablosu
-- üzerinden dolaşılıyor — ileride grup sohbeti eklenirse otomatik olarak
-- doğru çalışmaya devam eder.

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient record;
begin
  for v_recipient in
    select user_id from public.conversation_members
    where conversation_id = new.conversation_id and user_id <> new.sender_id
  loop
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_recipient.user_id, new.sender_id, 'message', 'Sana bir mesaj gönderdi.',
      '/messages/local?id=' || new.conversation_id
    );
  end loop;

  return new;
end;
$$;

create trigger messages_after_insert_notify
  after insert on public.messages
  for each row
  execute function public.notify_new_message();
