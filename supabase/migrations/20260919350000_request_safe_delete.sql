-- Promptly — gerçek yanıtı olan bir prompt isteğinin güvenli silinmesi.
--
-- Kullanıcının açık isteği üzerine (birebir): "prompt isteğinde yanıt
-- varsa silinmiyor, yorumlardaki olay gibi tıpkı yanıt olan promptu
-- sildigimizde silindiğini belirten bisey yazsın" — ve bunun yorumlardaki
-- düzeltmeyle (Bölüm 9.5, `handle_comment_delete`) aynı mantık olup
-- olmadığını sordu. Cevap: EVET, birebir aynı mimari desen; bu migration
-- onu `prompt_requests` için uyguluyor.
--
-- Kök neden (önceden, Bölüm 9.6/9.12'de tespit edilip "kullanıcının karar
-- vermesi gereken bir sonraki adım" diye bilinçli olarak açık
-- bırakılmıştı — şimdi kullanıcı kararını verdi): `prompts.request_id`
-- (20260919120200) `on delete set null` ile tanımlı, ama
-- `prompts_origin_shape` CHECK kısıtı `origin_type = 'request_response'`
-- olan bir satırda `request_id`'nin ASLA null olmamasını şart koşuyor.
-- Gerçek bir yanıtı olan bir istek silinmeye çalışıldığında, FK cascade'i
-- o yanıtın `request_id`'sini null'a çekmeye çalışırken CHECK kısıtına
-- çarpıp TÜM silme işlemi veritabanı hatasıyla reddediliyordu — kullanıcının
-- "bazı promptlarda [aslında isteklerde] siliniyor, bazılarında
-- silinmiyor" gözlemi tam olarak bu: yalnızca GERÇEK yanıtı olan bir istek
-- bu duruma düşebiliyor.
--
-- Çözüm — Bölüm 9.5'in `handle_comment_delete`'iyle (ve daha önce Bölüm
-- 9.7'nin, artık kaldırılmış, `handle_prompt_delete`'iyle) BİREBİR AYNI,
-- kanıtlanmış desen: bir BEFORE DELETE trigger'ı, gerçek DELETE
-- gerçekleşmeden ÖNCE bu isteğin gerçek yanıtı olup olmadığına bakıyor —
-- varsa DELETE'i iptalleyip yerine bir soft-delete UPDATE'i (`deleted_at`
-- damgalama + başlık/açıklama/yaratıcı yön/referans görseli boşaltma)
-- uyguluyor (istemci tarafında "önce kontrol et" gibi bir yarış durumuna
-- açık bir dal YOK — silme anında araya yeni bir yanıt girse bile bu
-- trigger'ın kendi `exists (...)` kontrolü aynı transaction içinde,
-- atomik olarak doğru kararı veriyor); hiç yanıtı yoksa DELETE olduğu
-- gibi geçip satırı gerçekten siliyor. Frontend HER ZAMAN aynı basit
-- `DELETE FROM prompt_requests WHERE id = ...` çağrısını yapıyor
-- (`deleteRealRequest`, src/lib/supabase/requests.ts — hiç değişmedi) —
-- hangi davranışın uygulanacağına veritabanı, tek ve atomik bir işlemde
-- karar veriyor.
--
-- `security invoker` (varsayılan) yeterli: bir kullanıcı zaten kendi
-- isteğini silme YETKİSİNE sahipse ("Authors can delete their own
-- requests" DELETE politikası, 20260919130000), aynı kullanıcının kendi
-- isteğini güncelleme yetkisi de zaten var ("Authors can update their own
-- requests" UPDATE politikası) — cross-user sayaç/bildirim trigger'larının
-- aksine burada SECURITY DEFINER gerekmiyor (aynı gerekçe,
-- 20260919170000_comment_edit_delete.sql'in kendi başlık yorumunda da
-- kullanılmıştı).
--
-- Soft-delete sonrası satır hâlâ var olduğundan (yalnızca içeriği
-- boşaltılmış), mevcut SELECT RLS politikası ("Requests are publicly
-- readable") hiç değişmedi/dokunulmadı — bir "istek silindi" yer
-- tutucusu render edebilmek için gerekli; `status`/`response_count`/
-- `selected_response_prompt_id`/`closed_by_owner` hiçbirine dokunulmuyor
-- (tıpkı eski `handle_prompt_delete`'in `like_count`/`comment_count`/
-- `remix_count`'a hiç dokunmaması gibi) — bu yüzden
-- `prompt_requests_status_shape` CHECK kısıtı bu UPDATE'ten hiç
-- etkilenmiyor, önceki durumuyla otomatik olarak tutarlı kalıyor.

alter table public.prompt_requests
  add column deleted_at timestamptz;

create or replace function public.handle_prompt_request_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.prompts
    where request_id = old.id and origin_type = 'request_response'
  ) then
    update public.prompt_requests
      set deleted_at = now(),
          title = '',
          description = '',
          creative_direction = null,
          reference_image_url = null,
          reference_image_width = null,
          reference_image_height = null
      where id = old.id;
    delete from public.prompt_request_tags where request_id = old.id;
    return null; -- gerçek DELETE'i iptalle, yukarıdaki UPDATE zaten uygulandı
  end if;
  return old; -- hiç gerçek yanıtı yok, gerçek DELETE'e izin ver
end;
$$;

drop trigger if exists prompt_requests_before_delete_protect_responses on public.prompt_requests;
create trigger prompt_requests_before_delete_protect_responses
  before delete on public.prompt_requests
  for each row
  execute function public.handle_prompt_request_delete();

-- === Soft-deleted bir isteğe yeni yanıt eklenmesini de engelle ===========
--
-- Gerçek bir eksiklik: `validate_prompt_response_target()` (20260919150000)
-- yalnızca `status <> 'open'` kontrolü yapıyordu — yeni `deleted_at`
-- kolonundan hiç haberdar değildi. Soft-delete sonrası `status` hâlâ
-- eski değerinde kalabildiğinden (yukarıdaki trigger `status`'a hiç
-- dokunmuyor), status hâlâ 'open' olan soft-deleted bir isteğe teorik
-- olarak yeni bir yanıt eklenebilirdi — içeriği boşaltılmış bir isteğe
-- "gerçek" bir yanıt yapıştırmak anlamsız/tutarsız olurdu. Bu fonksiyon
-- `create or replace` ile, davranışı DEĞİŞTİRMEDEN (aynı iki hata mesajı,
-- aynı sıralama) yalnızca `deleted_at` kontrolünü ekleyecek şekilde
-- genişletildi.
create or replace function public.validate_prompt_response_target()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_deleted_at timestamptz;
begin
  if new.origin_type = 'request_response' then
    select status, deleted_at into v_status, v_deleted_at
      from public.prompt_requests where id = new.request_id;
    if v_status is null then
      raise exception 'Yanıt verilen istek bulunamadı.';
    elsif v_deleted_at is not null then
      raise exception 'Bu istek silindi, artık yeni yanıt kabul edilmiyor.';
    elsif v_status <> 'open' then
      raise exception 'Bu istek kapandı, artık yeni yanıt kabul edilmiyor.';
    end if;
  end if;
  return new;
end;
$$;
