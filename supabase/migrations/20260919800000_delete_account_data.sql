-- Kullanıcının KENDİ hesabını silmesi: `delete-account` Edge Function'ının çağırdığı iç fonksiyon.
--
-- Hesap silmek `auth.users` satırını silmektir; profil, içerik, koleksiyon, mesaj
-- vb. mevcut `ON DELETE CASCADE` kurallarıyla gider. İki koruyucu trigger (ve
-- başkalarının içeriğine dokunan üç ilişki) düz bir cascade'i engeller; bu yüzden
-- düz `delete from auth.users` HİÇBİR kullanıcı için çalışmaz:
--   • collections_before_delete  — varsayılan ("Genel") koleksiyonun silinmesini reddeder
--   • prompt_comments_before_delete_protect_replies — başkalarının yanıtı olan yorumu korur
-- Moderatörün hesap silme yolu (`admin_delete_user`) aynı ön işlemleri yapar; bu
-- fonksiyon onların aynısını yapar ama o yolu KOPYALAMAZ: hedef kullanıcıyı çağıran
-- vermez, kimlik JWT'den doğrulanıp Edge Function (service role) tarafından geçirilir;
-- moderatör kontrolü/denetim kaydı yoktur, moderatör hesapları kendini bu yolla silemez.
--
-- Her şey TEK transaction'dadır: herhangi bir adım hata verirse (trigger'ların
-- devre dışı bırakılması dahil) tamamı geri alınır ve hesap olduğu gibi kalır.
--
--   • EXECUTE yalnızca `service_role`'de: `anon`/`authenticated` (yani tarayıcı)
--     bu fonksiyonu HİÇ çağıramaz; yetki kontrolü Edge Function'dadır.
--   • SECURITY DEFINER + sabit `search_path`.
--   • Storage dosyaları bu fonksiyonda silinmez (SQL ile `storage.objects` satırı
--     silmek diski temizlemez); Edge Function hesap silindikten sonra o kullanıcının
--     artık hiçbir satıra bağlı olmayan dosyalarını Storage API'siyle kaldırır.
--
-- Not: `admin_delete_user` ile aynı ön işlemleri taşır; ikisinden biri değişirse
-- diğeri de gözden geçirilmelidir.

create or replace function public.delete_account_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'user_not_found';
  end if;
  if (select role from public.profiles where id = p_user_id) = 'moderator' then
    raise exception 'moderator_account';
  end if;

  -- Başkalarının yanıtları / yorumları silinmesin.
  update public.prompts set origin_type = 'original', request_id = null
    where origin_type = 'request_response' and request_id in (select id from public.prompt_requests where author_id = p_user_id);
  update public.prompt_requests set selected_response_prompt_id = null, status = 'closed', closed_by_owner = true
    where selected_response_prompt_id in (select id from public.prompts where author_id = p_user_id);
  update public.prompt_comments set parent_id = null
    where parent_id in (select id from public.prompt_comments where author_id = p_user_id) and author_id <> p_user_id;

  -- Koruyucu trigger'lar bu silmeyi iptal etmesin (transaction'la birlikte geri alınır).
  alter table public.prompt_comments disable trigger prompt_comments_before_delete_protect_replies;
  alter table public.collections disable trigger collections_before_delete;
  delete from auth.users where id = p_user_id;
  alter table public.prompt_comments enable trigger prompt_comments_before_delete_protect_replies;
  alter table public.collections enable trigger collections_before_delete;
end $$;

revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
