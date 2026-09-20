-- Promptly — Bildirim merkezi: kesin hedefe yönlendirme + içerik önizlemesi.
--
-- === Aşama 1 denetimi (bu migration'ı yazmadan önce yapıldı) ===============
-- Mevcut `notifications` tablosu (Bölüm 18/19) yalnızca `target_href` (düz
-- bir metin URL) ve `message` (düz bir olay cümlesi) tutuyor — ayrı
-- `post_id`/`comment_id`/`reply_id`/`request_id`/`message_id` sütunları hiç
-- yok. Bu görevin kendi talimatı ("mevcut şemayı incele, tüm alanları körü
-- körüne ekleme, eşdeğer mevcut alanları değerlendir") gereği yeni bir sütun
-- seti eklemek yerine, zaten var olan `target_href`'in kendisine tek, genel
-- bir `hl=<tür>:<id>` sorgu parametresi ekleniyor — bu proje zaten
-- `/prompts/local?id=…`, `/requests/local?id=…`, `/messages/local?id=…`
-- rotalarının hepsinde "gerçek kimliği query string'te taşı" desenini
-- (`promptHref`/`requestHref`/`messageHref`, Bölüm 21) kullanıyor; `hl` bu
-- deseni doğal olarak genişletiyor, yeni bir tablo/sütun kategorisi
-- YARATMIYOR. `hl` değerleri: `post:<promptId>` (beğenilen/remixlenen
-- gönderinin kendisi), `comment:<commentId>` (beğenilen/yanıtlanan/yeni
-- eklenen yorum ya da yanıt — hangisi olduğu zaten `notifications.type`'tan
-- belli), `response_new:<responseId>` / `response_selected:<responseId>` /
-- `response_unselected:<responseId>` (bir istek yanıtı — üç alt durum farklı
-- ikon/vurgu gerektirdiğinden ayrı ayrı adlandırıldı), `message:<messageId>`.
-- İstek kapanma bildiriminin `hl`'i yok (tek bir yanıta değil, isteğin
-- kendisine işaret ediyor) — bu, istemci tarafında "hl yoksa kapanma"
-- ayrımını da kendiliğinden sağlıyor.
--
-- Aynı denetimde, içerik önizlemesi eksikliği de bulundu: `message` alanı
-- yalnızca "Yorumunu beğendi." gibi düz bir olay cümlesiydi, önizleme
-- (yorum/gönderi/istek metni) hiç yoktu — yalnızca istek yanıtı bildirimleri
-- zaten isteğin başlığını gömüyordu (bu proje için var olan bir konvansiyon).
-- Bu migration aynı konvansiyonu (dinamik metni doğrudan `message`'a gömme)
-- beğeni/yorum/yanıt/remix/mesaj bildirimlerine de genişletiyor — ayrı bir
-- "preview" sütunu/sistemi YARATMIYOR, var olanı tutarlı şekilde genişletiyor.
--
-- Aşağıdaki 4 üretici DEĞİŞMEDEN kalıyor (zaten doğru, bu görevin kapsamı
-- dışı): notify_new_follow, notify_request_closed'ın gövde mantığı (yalnızca
-- href/mesaj metni değişmedi, çünkü zaten tek bir yanıta değil isteğin
-- kendisine işaret ediyor). Değişenler: notify_prompt_like, notify_comment_
-- like, notify_comment_reply, notify_new_remix, notify_new_request_response,
-- notify_selected_response, notify_new_message — hepsi `create or replace`,
-- trigger'ları DEĞİŞMEDEN kalıyor.

-- === Kısa, güvenli önizleme kırpma yardımcı fonksiyonu ======================
create or replace function public.truncate_preview(t text, n int default 90)
returns text
language sql
immutable
as $$
  select case
    when t is null then ''
    when length(t) <= n then t
    else left(t, n) || '…'
  end;
$$;

-- === Silinen gönderi/istek temizliği artık ÖNEK eşleşmesi kullanıyor =======
-- `target_href` artık bazı bildirimlerde `&hl=...` ile uzuyor — eski TAM
-- eşleşme (`target_href = '/prompts/local?id=' || old.id`) bu satırları
-- ARTIK YAKALAMIYORDU (gerçek bir regresyon riski). UUID'ler sabit
-- uzunlukta olduğundan bir UUID başka bir UUID'nin öneki olamaz — bu yüzden
-- önek eşleşmesi güvenli, yanlış bir satırı asla yakalamaz.
create or replace function public.cleanup_notifications_for_deleted_prompt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where target_href like '/prompts/local?id=' || old.id || '%';
  return old;
end;
$$;

create or replace function public.cleanup_notifications_for_deleted_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where target_href like '/requests/local?id=' || old.id || '%';
  return old;
end;
$$;

-- === Gönderi beğenisi: gönderi başlığı önizlemesi + hl=post: ===============
create or replace function public.notify_prompt_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
  v_title text;
begin
  select author_id, title into v_author_id, v_title from public.prompts where id = new.prompt_id;
  if v_author_id is null or v_author_id = new.user_id then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_author_id, new.user_id, 'like',
    'Paylaşımını beğendi: "' || public.truncate_preview(coalesce(v_title, '')) || '"',
    '/prompts/local?id=' || new.prompt_id || '&hl=post:' || new.prompt_id,
    'prompt_like:' || new.prompt_id || ':' || new.user_id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return new;
end;
$$;

-- === Yorum/yanıt beğenisi: beğenilen metnin önizlemesi + hl=comment: =======
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
  v_body text;
  v_href text;
begin
  select author_id, prompt_id, request_id, body
    into v_comment_author, v_prompt_id, v_request_id, v_body
    from public.prompt_comments where id = new.comment_id;

  if v_comment_author is null or v_comment_author = new.user_id then
    return new;
  end if;

  v_href := (case
    when v_prompt_id is not null then '/prompts/local?id=' || v_prompt_id
    else '/requests/local?id=' || v_request_id
  end) || '&hl=comment:' || new.comment_id;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href, dedupe_key)
  values (
    v_comment_author, new.user_id, 'like',
    'Yorumunu beğendi: "' || public.truncate_preview(v_body) || '"', v_href,
    'comment_like:' || new.comment_id || ':' || new.user_id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return new;
end;
$$;

-- === Yorum/yanıt: yeni yorumun/yanıtın kendi metni + hl=comment:<yeni id> ==
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
  v_href := (case
    when new.prompt_id is not null then '/prompts/local?id=' || new.prompt_id
    else '/requests/local?id=' || new.request_id
  end) || '&hl=comment:' || new.id;

  if new.parent_id is not null then
    select author_id into v_parent_author
      from public.prompt_comments where id = new.parent_id;

    if v_parent_author is null or v_parent_author = new.author_id then
      return new;
    end if;

    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_parent_author, new.author_id, 'comment_reply',
      'Yorumuna yanıt verdi: "' || public.truncate_preview(new.body) || '"', v_href
    );
  else
    if new.prompt_id is not null then
      select author_id into v_post_author from public.prompts where id = new.prompt_id;
    else
      select author_id into v_post_author from public.prompt_requests where id = new.request_id;
    end if;

    if v_post_author is null or v_post_author = new.author_id then
      return new;
    end if;

    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_post_author, new.author_id, 'comment',
      (case when new.prompt_id is not null then 'Paylaşımına yorum yaptı: "' else 'İsteğine yorum yaptı: "' end)
        || public.truncate_preview(new.body) || '"',
      v_href
    );
  end if;

  return new;
end;
$$;

-- === Remix: yeni remixin kendi başlığı + hl=post:<yeni remix id> ===========
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
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (
    v_source_author, new.author_id, 'remix',
    'Çalışmanı remixledi: "' || public.truncate_preview(new.title) || '"',
    '/prompts/local?id=' || new.id || '&hl=post:' || new.id
  );

  return new;
end;
$$;

-- === İstek yanıtı: yeni yanıt + hl=response_new:<yanıtın kendi id'si> ======
create or replace function public.notify_new_request_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_author uuid;
  v_request_title text;
begin
  if new.origin_type <> 'request_response' then
    return new;
  end if;

  select author_id, title into v_request_author, v_request_title
    from public.prompt_requests where id = new.request_id;

  if v_request_author is null or v_request_author = new.author_id then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message, target_href)
  values (
    v_request_author,
    new.author_id,
    'request_response',
    'İsteğine yanıt verdi: "' || public.truncate_preview(coalesce(v_request_title, '')) || '"',
    '/requests/local?id=' || new.request_id || '&hl=response_new:' || new.id
  );

  return new;
end;
$$;

-- === Yanıt seçimi/değiştirme/kaldırma: hl=response_selected:/response_
-- unselected: eklendi (18. migration'ın (20260919180000) iki-dallı sürümüne
-- dokunulmadı, yalnızca href'e hl eklendi) ==================================
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
    return new;
  end if;

  if old.selected_response_prompt_id is not null then
    select author_id into v_response_author
      from public.prompts where id = old.selected_response_prompt_id;

    if v_response_author is not null and v_response_author <> new.author_id then
      insert into public.notifications (recipient_id, actor_id, type, message, target_href)
      values (
        v_response_author, new.author_id, 'request_response',
        'Yanıtın "' || new.title || '" isteği için artık seçili değil.',
        '/requests/local?id=' || new.id || '&hl=response_unselected:' || old.selected_response_prompt_id
      );
    end if;
  end if;

  if new.selected_response_prompt_id is not null then
    select author_id into v_response_author
      from public.prompts where id = new.selected_response_prompt_id;

    if v_response_author is not null and v_response_author <> new.author_id then
      insert into public.notifications (recipient_id, actor_id, type, message, target_href)
      values (
        v_response_author, new.author_id, 'request_response',
        'Yanıtın "' || new.title || '" isteği için seçildi!',
        '/requests/local?id=' || new.id || '&hl=response_selected:' || new.selected_response_prompt_id
      );
    end if;
  end if;

  return new;
end;
$$;

-- === Mesaj: kısa bir önizleme + hl=message:<mesajın kendi id'si> ===========
-- (20260919210000'in mesaj isteği/normal mesaj ayrımı DEĞİŞMEDEN korundu,
-- yalnızca önizleme + hl eklendi.)
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient record;
  v_preview text;
begin
  v_preview := case
    when new.body is not null then '"' || public.truncate_preview(new.body) || '"'
    when new.shared_prompt_id is not null then 'bir prompt paylaştı'
    when new.shared_request_id is not null then 'bir prompt isteği paylaştı'
    else 'bir mesaj gönderdi'
  end;

  for v_recipient in
    select user_id, status from public.conversation_members
    where conversation_id = new.conversation_id and user_id <> new.sender_id
  loop
    insert into public.notifications (recipient_id, actor_id, type, message, target_href)
    values (
      v_recipient.user_id,
      new.sender_id,
      case when v_recipient.status = 'pending' then 'message_request' else 'message' end,
      case
        when v_recipient.status = 'pending' then 'Sana bir mesaj isteği gönderdi: ' || v_preview
        else 'Sana bir mesaj gönderdi: ' || v_preview
      end,
      '/messages/local?id=' || new.conversation_id || '&hl=message:' || new.id
    );
  end loop;

  return new;
end;
$$;
