-- Promptly — Remix özelliğinin veritabanından tamamen kaldırılması.
--
-- Kullanıcının açık talebi üzerine ("Remix'i tamamen kaldır") — bu
-- migration, Bölüm 8/9.14/9.27/9.36'nın kurduğu remix ilişkisini
-- (`prompts`/`generators`'ın `source_*_id`/`root_*_id`/`origin_type =
-- 'remix'`/`remix_count`) ve ona bağlı Remix Dallanma Haritası/Merge
-- sistemini (`merge_requests`, `prompt_versions`, `fetch_remix_graph`,
-- `fetch_generator_remix_graph`, `audit_log`) veritabanı seviyesinde
-- tamamen kaldırıyor.
--
-- KESİNLİKLE DOKUNULMAYAN, korunması gereken ayrı bir sistem:
-- `origin_type = 'request_response'` (bir isteğe verilen gerçek yanıt,
-- Bölüm 9/10) — remix ile aynı `origin_type` sütununu paylaşıyor ama
-- tamamen bağımsız bir özellik (Prompt İstekleri modülü). Bu migration
-- yalnızca 'remix' değerini/onun alanlarını kaldırıyor,
-- 'request_response' hiç etkilenmiyor.
--
-- Gerçek kullanıcı içeriğini korumak için (bu görevin §8/§9 kuralı —
-- "mevcut kullanıcı içeriğini bozma"): `origin_type = 'remix'` olan
-- var olan promptlar/generatorlar SİLİNMİYOR — yalnızca kendi remix
-- ilişkisi temizlenip `origin_type = 'original'`e çevriliyor (prompt/
-- generator'ın kendisi, başlığı, içeriği vb. hiç değişmeden kalıyor,
-- yalnızca artık "bir şeyin remix'i" olarak işaretli değil).

-- === 0) Var olan remix bildirimlerini temizle (aşağıdaki tip/trigger
--        kaldırmalarından önce, artık geçersiz bir türe referans
--        kalmasın diye) ===========================================
delete from public.notifications
  where type in (
    'remix',
    'merge_request_received', 'merge_request_accepted', 'merge_request_rejected',
    'merge_request_withdrawn', 'merge_request_cancelled'
  );

-- === 1) Merge/sürüm sistemi — tamamen remix'e bağımlı, kaldırılıyor ===
drop trigger if exists prompts_after_update_cancel_pending_merges on public.prompts;
drop function if exists public.handle_prompt_soft_delete_cancels_merges();

drop function if exists public.withdraw_merge_request(uuid);
drop function if exists public.reject_merge_request(uuid, text);
drop function if exists public.accept_merge_request(uuid);
drop function if exists public.create_merge_request(uuid, uuid, text, text);
drop function if exists public._perform_merge_acceptance(uuid, uuid);
drop function if exists public.fetch_remix_graph(uuid);
drop function if exists public.fetch_generator_remix_graph(uuid);

drop table if exists public.merge_requests cascade;
drop table if exists public.prompt_versions cascade;
-- `audit_log` bu depoda yalnızca merge_request eylemleri için vardı
-- (bkz. 20260919250000_remix_merge_system.sql'in kendi yorumu — "yalnızca
-- merge_request eylemleri kaydediliyor") — başka hiçbir tablo/özellik onu
-- kullanmıyor, remix ile birlikte tamamen kaldırılıyor.
drop table if exists public.audit_log cascade;

-- === 2) Remix bildirim üreticileri ==================================
drop trigger if exists prompts_after_insert_notify_remix on public.prompts;
drop function if exists public.notify_new_remix();
drop trigger if exists generators_after_insert_notify_remix on public.generators;
drop function if exists public.notify_generator_remix();

-- === 3) Remixi silmeye karşı koruyan soft-delete artık gereksiz =====
-- `handle_prompt_delete`/`prompts_before_delete_protect_remixes`
-- (Bölüm 9.7) yalnızca "bu promptun remixleri varsa DELETE'i soft-
-- delete'e çevir" içindi — remix ilişkisi tamamen kalkınca hiçbir prompt
-- bir başkasının `source_prompt_id`'si olamayacağından bu koruma
-- kalıcı bir no-op'a dönüşür; temiz kod için kaldırılıyor. `prompts.
-- deleted_at` kolonunun kendisi VE ona bağlı, halihazırda var olan
-- geçmiş soft-delete kayıtları DOKUNULMADAN kalıyor (geriye dönük veri
-- kaybı riski almamak için — Bölüm 9.22'nin `prompt_saves`'i atıl
-- bırakma kararıyla aynı ilke) — bundan sonraki her silme artık gerçek,
-- kalıcı bir DELETE.
drop trigger if exists prompts_before_delete_protect_remixes on public.prompts;
drop function if exists public.handle_prompt_delete();

-- === 4) Sayaç trigger'ı — yalnızca remix dalı kaldırılıyor, isteğe
--        yanıt sayacı (request_response) hiç değişmeden kalıyor ======
create or replace function public.handle_prompt_origin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.origin_type = 'request_response' then
      update public.prompt_requests set response_count = response_count + 1 where id = new.request_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.origin_type = 'request_response' then
      update public.prompt_requests set response_count = response_count - 1 where id = old.request_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists generators_after_insert_remix on public.generators;
drop function if exists public.handle_generator_remix_created();

-- === 5) Var olan remix ilişkilerini gerçek içeriği bozmadan temizle =
-- (Yukarıdaki trigger/fonksiyon kaldırmalarından SONRA — artık remix
-- sayacını/bildirimini tetiklemeden sessizce çalışır.)
update public.prompts
  set origin_type = 'original', source_prompt_id = null, root_prompt_id = null
  where origin_type = 'remix';

update public.generators
  set origin_type = 'original', source_generator_id = null, root_generator_id = null
  where origin_type = 'remix';

-- === 6) `prompts` — remix'e özel kolonları/kısıtları kaldır =========
alter table public.prompts drop constraint if exists prompts_origin_shape;
alter table public.prompts drop constraint if exists prompts_origin_type_check;
alter table public.prompts
  add constraint prompts_origin_type_check check (origin_type in ('original', 'request_response'));
alter table public.prompts
  add constraint prompts_origin_shape check (
    (origin_type = 'original' and request_id is null)
    or (origin_type = 'request_response' and request_id is not null)
  );

drop index if exists prompts_source_prompt_id_idx;
alter table public.prompts drop column if exists source_prompt_id;
alter table public.prompts drop column if exists root_prompt_id;
alter table public.prompts drop column if exists remix_count;
-- `prompts.generator_id`/`generator_version_id`/`generator_run_id`
-- (Generator Builder'ın "Open in Prompt" köprüsü, Bölüm 9.27) BİLİNÇLİ
-- OLARAK dokunulmadı — remix ile hiç ilgisi yok, ayrı bir "provenance"
-- ilişkisi (bkz. bu görevin §9 kuralı: remix'ten bağımsız bir sistem
-- otomatik silinmez).

-- === 7) `generators` — remix'e özel kolonları/kısıtları tamamen
--        kaldır (generatorda `origin`/remix dışında hiçbir ilişki hiç
--        var olmadı, bu yüzden tüm dörtlüsü — origin_type/source_
--        generator_id/root_generator_id/remix_count — kaldırılıyor,
--        `allow_remix` ayarı da artık anlamsız olduğundan onunla
--        birlikte kaldırılıyor) =====================================
alter table public.generators drop constraint if exists generators_origin_shape;
drop index if exists generators_source_generator_id_idx;
alter table public.generators drop column if exists origin_type;
alter table public.generators drop column if exists source_generator_id;
alter table public.generators drop column if exists root_generator_id;
alter table public.generators drop column if exists remix_count;
alter table public.generators drop column if exists allow_remix;

-- === 8) `notifications.type` — remix/merge değerlerini kaldır =======
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'follow', 'like', 'comment', 'comment_reply', 'request_response',
    'message', 'message_request', 'system',
    'prompt_edited', 'request_edited', 'generator_edited'
  ));
