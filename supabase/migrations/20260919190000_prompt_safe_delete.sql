-- Promptly — Remixlenmiş bir promptun güvenli silinmesi.
--
-- Bölüm 9.6'da test sırasında keşfedilen, bildirim sisteminden bağımsız,
-- önceden var olan bir mimari boşluk: `prompts.source_prompt_id`
-- (20260919120200) `on delete set null` ile tanımlı, ama aynı migration'ın
-- `prompts_origin_shape` CHECK kısıtı `origin_type = 'remix'` olan bir
-- satırda `source_prompt_id`'nin ASLA null olmamasını şart koşuyor. Sonuç:
-- remixlenmiş herhangi bir orijinal prompt silinmeye çalışıldığında, FK
-- cascade'i kendi remixinin `source_prompt_id`'sini null'a çekmeye
-- çalışırken CHECK kısıtına çarpıp veritabanı hatasıyla reddediliyordu.
--
-- Çözüm, Bölüm 9.5'in yorum/yanıt "güvenli silme" deseninin birebir aynısı
-- (bkz. 20260919170000_comment_edit_delete.sql → handle_comment_delete):
-- bir promptun gerçek remixleri VARSA, DELETE'i istemci tarafında bir
-- "önce kontrol et" dalıyla DEĞİL (yarış durumuna açık — silme anında
-- araya yeni bir remix girebilir), veritabanı seviyesinde bir BEFORE
-- DELETE trigger'ıyla iptalleyip yerine bir "soft delete" (`deleted_at`
-- damgalama + başlık/açıklama/prompt metnini boşaltma + görsellerini
-- silme) UPDATE'i uyguluyoruz; hiç remixi yoksa DELETE olduğu gibi geçip
-- satırı gerçekten siliyor. Frontend HER ZAMAN aynı basit
-- `DELETE FROM prompts WHERE id = ...` çağrısını yapıyor
-- (`deleteRealPrompt`, hiç değişmedi) — hangi davranışın uygulanacağına
-- veritabanı, tek ve atomik bir işlemde karar veriyor.
--
-- `security invoker` (varsayılan) yeterli: bir kullanıcı zaten kendi
-- promptunu silme YETKİSİNE sahipse ("Authors can delete their own
-- prompts" DELETE politikası), aynı kullanıcının kendi promptunu
-- güncelleme yetkisi de zaten var ("Authors can update their own
-- prompts" UPDATE politikası) — Bölüm 19/9.2/9.4/9.6'nın cross-user
-- sayaç/bildirim trigger'larının aksine burada SECURITY DEFINER
-- gerekmiyor.
--
-- Soft-delete sonrası satır hâlâ var olduğundan (yalnızca içeriği
-- boşaltılmış), mevcut SELECT RLS politikası ("Published prompts are
-- public, drafts are author-only") ve 20260919180000'in `prompts` AFTER
-- DELETE bildirim-temizleme trigger'ı hiç değiştirilmedi/dokunulmadı —
-- ikisi de zaten doğru davranıyor: RLS soft-deleted satırı da (published
-- kaldığından) herkese açık okunur bırakıyor (bir "silindi" yer
-- tutucusu render edebilmek için gerekli), ve bildirim temizleme
-- trigger'ı yalnızca GERÇEK bir DELETE'te tetiklendiğinden soft-delete
-- durumunda hiç çalışmıyor — bu da doğru: bildirim hâlâ var olan bir
-- sayfaya (artık "silindi" gösteren) işaret etmeye devam ediyor, tıpkı
-- soft-deleted bir yorumun bildiriminin hâlâ var olan gönderiye işaret
-- etmesi gibi.

alter table public.prompts
  add column deleted_at timestamptz;

create or replace function public.handle_prompt_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.prompts where source_prompt_id = old.id) then
    update public.prompts
      set deleted_at = now(),
          title = '',
          description = '',
          prompt_text = ''
      where id = old.id;
    delete from public.prompt_media where prompt_id = old.id;
    delete from public.prompt_tags where prompt_id = old.id;
    return null; -- gerçek DELETE'i iptalle, yukarıdaki UPDATE zaten uygulandı
  end if;
  return old; -- hiç remixi yok, gerçek DELETE'e izin ver
end;
$$;

create trigger prompts_before_delete_protect_remixes
  before delete on public.prompts
  for each row
  execute function public.handle_prompt_delete();
