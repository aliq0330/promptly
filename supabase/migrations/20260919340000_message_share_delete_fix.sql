-- Promptly — mesajlarda paylaşılan bir prompt/istek silinince
-- "messages_has_content" CHECK ihlali düzeltmesi.
--
-- Gerçek, kullanıcı tarafından bildirilen hata (kod adı verilmeden,
-- birebir): "new row for relation "messages" violates check constraint
-- "messages_has_content"" — bazı promptları silmeye çalışınca ortaya
-- çıkıyordu.
--
-- Kök neden: Bölüm 9.8'in (20260919200000_messaging_content_and_edit.sql)
-- eklediği `messages.shared_prompt_id`/`shared_request_id` kolonları
-- `on delete set null` ile tanımlı — ama `messages_has_content` CHECK'i
-- `deleted_at is not null OR body is not null OR shared_prompt_id is not
-- null OR shared_request_id is not null` şart koşuyor. Bir mesaj hiç
-- metin yazılmadan, yalnızca bir paylaşılan prompt/istekle gönderilmiş
-- olabiliyor (Bölüm 9.8'in kendisinin açıkça desteklediği bir senaryo —
-- "yalnızca-paylaşılan-içerik (metinsiz) kabulü" test edilmişti). Böyle
-- bir mesajın (body=null, diğer shared_* alanı da null, deleted_at=null)
-- TEK içeriği paylaştığı o prompt/istek olduğundan, o prompt/istek
-- silinince FK'nin ON DELETE SET NULL eylemi shared_prompt_id/
-- shared_request_id'yi null'a çekip mesajı ÜÇ alanın da null olduğu bir
-- duruma düşürüyor — CHECK ihlal ediliyor ve (FK eylemi aynı transaction/
-- statement içinde çalıştığından) TÜM prompt/istek silme işlemi
-- başarısız oluyor. Bu, "bazı promptlarda" oluyor çünkü yalnızca gerçekten
-- metinsiz paylaşılmış promptlar/istekler bu duruma düşebiliyor — normal
-- metinli bir mesajda paylaşılan prompt silinirse `body` hâlâ dolu
-- olduğundan CHECK zaten sağlanıyor, sorun hiç ortaya çıkmıyor.
--
-- ÖNEMLİ — REMIX'LE HİÇ İLGİSİ YOK: Bölüm 9.7'nin (Bölüm 9.39'da
-- kaldırılan) `handle_prompt_delete` trigger'ı yalnızca "bu promptun
-- remix'i var mı" diye bakıyordu (`source_prompt_id = old.id`) —
-- `messages.shared_prompt_id`'yi hiç kontrol etmiyordu. Yani bu hata
-- remix sistemi kaldırılmadan ÖNCE de, Bölüm 9.8'den (mesajlarda içerik
-- paylaşımı eklendiğinden) beri zaten vardı; remix'in kaldırılmasıyla
-- ortaya çıkmadı, yalnızca şimdi fark edilip bildirildi.
--
-- Çözüm — Bölüm 9.5'in yorum-silme (`handle_comment_delete`) ve Bölüm
-- 9.7'nin remix-silme (kaldırıldı) trigger'larıyla BİREBİR AYNI, kanıtlanmış
-- desen: bir BEFORE DELETE trigger'ı, gerçek silme gerçekleşmeden ÖNCE
-- yalnızca "içeriği tamamen bu paylaşıma bağlı" olan mesajları önceden
-- soft-delete'liyor (Bölüm 9.8'in kendi "herkesten sil" UPDATE'iyle aynı
-- şekil: `deleted_at` damgalanıyor) — CHECK artık `deleted_at` üzerinden
-- sağlanmış oluyor, `shared_prompt_id`/`shared_request_id` FK'nin kendi
-- `ON DELETE SET NULL` eylemiyle null'a çekilmeye devam ediyor, hiçbir
-- çelişki kalmıyor. Bu trigger, Bölüm 9.7'nin aksine DELETE'i iptal
-- ETMİYOR (`return old`) — promptun/isteğin kendisi hep gerçek, kalıcı
-- olarak siliniyor; yalnızca ona bağımlı, içeriksiz kalacak mesaj(lar)
-- önden güvenli hâle getiriliyor.
--
-- SECURITY DEFINER gerekli: mesajın UPDATE RLS politikası (Bölüm 9.8)
-- yalnızca "auth.uid() = sender_id AND created_at şu andan 15 dakika
-- içinde" izin veriyor — bir promptu/isteği silen kullanıcı genelde o
-- mesajın göndereni bile DEĞİL (paylaşan başka biri olabilir) ve
-- paylaşım çoktan 15 dakikayı geçmiş olabilir; bu cross-user güncelleme
-- Bölüm 19/9.35'in defalarca belgelenen "SECURITY DEFINER olmadan
-- sessizce 0 satır etkiler" tuzağına düşmesin diye SECURITY DEFINER +
-- sabit search_path kullanıyor.

create or replace function public.handle_shared_prompt_delete_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.messages
    set deleted_at = now()
    where shared_prompt_id = old.id
      and deleted_at is null
      and body is null
      and shared_request_id is null;
  return old;
end;
$$;

drop trigger if exists prompts_before_delete_cleanup_shared_messages on public.prompts;
create trigger prompts_before_delete_cleanup_shared_messages
  before delete on public.prompts
  for each row
  execute function public.handle_shared_prompt_delete_cleanup();

create or replace function public.handle_shared_request_delete_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.messages
    set deleted_at = now()
    where shared_request_id = old.id
      and deleted_at is null
      and body is null
      and shared_prompt_id is null;
  return old;
end;
$$;

drop trigger if exists prompt_requests_before_delete_cleanup_shared_messages on public.prompt_requests;
create trigger prompt_requests_before_delete_cleanup_shared_messages
  before delete on public.prompt_requests
  for each row
  execute function public.handle_shared_request_delete_cleanup();
