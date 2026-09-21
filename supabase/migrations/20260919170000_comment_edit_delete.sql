-- Promptly — Yorum/yanıt düzenleme ve silme.
--
-- RLS zaten Bölüm 19'dan beri "yalnızca sahibi güncelleyebilir/silebilir"
-- politikalarını taşıyordu (`prompt_comments` için update/delete
-- politikaları) — hiçbir arayüz bunları hiç kullanmıyordu. Bu migration
-- iki şey ekliyor:
--
--   1. `edited_at` — bir yorumun/yanıtın gövdesi değiştiğinde otomatik
--      olarak damgalanır (BEFORE UPDATE trigger, yalnızca `body`
--      gerçekten değiştiğinde — bir beğeni sayacı güncellemesi ya da
--      aşağıdaki soft-delete güncellemesi `edited_at`'i hiç etkilemez).
--
--   2. Güvenli silme: `prompt_comments.parent_id` kendine referans veren
--      bir sütun olduğundan (Bölüm 18) ve `on delete cascade` ile
--      tanımlandığından, bir yorumu DOĞRUDAN silmek onun TÜM alt yanıt
--      ağacını da beraberinde silerdi — tam olarak şartnamenin
--      "silinen yorumların alt yanıtlarını sessizce kaybetme" uyarısının
--      anlattığı tuzak. Çözüm istemci tarafında bir "önce kontrol et,
--      sonra karar ver" dalı DEĞİL (bu bir yarış durumuna açık: silme
--      anında araya başka bir kullanıcının yeni bir yanıtı girebilir) —
--      bunun yerine bir BEFORE DELETE trigger'ı: bir yorumun gerçek alt
--      yanıtları varsa, DELETE'i iptalleyip yerine bir "soft delete"
--      (`deleted_at` damgalama, `body`'yi silme) UPDATE'i uyguluyor; alt
--      yanıtı yoksa DELETE olduğu gibi geçiyor. Böylece frontend HER
--      zaman aynı basit `DELETE FROM prompt_comments WHERE id = ...`
--      çağrısını yapıyor (`deleteRealPrompt` ile aynı desen) — hangi
--      davranışın uygulanacağına veritabanı, tek ve atomik bir işlemde,
--      hiçbir yarış durumuna açık olmadan karar veriyor.
--
--      `security invoker` (varsayılan) yeterli: bir kullanıcı zaten
--      kendi yorumunu silme YETKİSİNE sahipse (DELETE RLS politikası bunu
--      doğruladı), aynı kullanıcının kendi yorumunu güncelleme yetkisi de
--      zaten var (UPDATE RLS politikası) — bu yüzden Bölüm 19/9.2/9.4'ün
--      cross-user sayaç/bildirim trigger'larının aksine burada
--      `SECURITY DEFINER` gerekmiyor.

alter table public.prompt_comments
  add column edited_at timestamptz,
  add column deleted_at timestamptz;

create or replace function public.handle_comment_body_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger prompt_comments_before_update_track_edit
  before update on public.prompt_comments
  for each row
  execute function public.handle_comment_body_edit();

create or replace function public.handle_comment_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.prompt_comments where parent_id = old.id) then
    update public.prompt_comments
      set deleted_at = now(),
          body = ''
      where id = old.id;
    return null; -- gerçek DELETE'i iptalle, yukarıdaki UPDATE zaten uygulandı
  end if;
  return old; -- alt yanıtı yok, gerçek DELETE'e izin ver
end;
$$;

create trigger prompt_comments_before_delete_protect_replies
  before delete on public.prompt_comments
  for each row
  execute function public.handle_comment_delete();
