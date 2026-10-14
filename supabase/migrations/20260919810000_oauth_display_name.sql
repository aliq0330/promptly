-- Google ile giriş: yeni hesabın görünen adı Google profilinden gelsin.
--
-- `handle_new_user`, `auth.users` satırı oluşunca `profiles` satırını açar. E-posta
-- kaydında görünen ad `raw_user_meta_data.display_name` ile gelir; Google (OAuth)
-- hesabında bu alan yoktur, onun yerine Google `full_name` / `name` gönderir. Eskiden
-- bu durumda ad e-postanın `@` öncesine düşüyordu. Şimdi sıra: kayıt formundaki ad →
-- Google adı → e-posta öneki. Kullanıcı adı (username) aynı kalır: e-posta önekinden
-- türetilir, çakışırsa rakam eklenir, Ayarlar'dan değiştirilebilir. Avatar ELLE
-- eklenir (Google fotoğrafı otomatik alınmaz).
--
-- Yalnızca `create or replace function`: şema, veri, tetikleyici değişmez, yıkıcı
-- ifade yok. Ad 40 karaktere kırpılır (kayıt formundaki `maxLength` ile aynı).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    public.generate_username(split_part(new.email, '@', 1)),
    coalesce(
      nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 40), ''),
      nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), 40), ''),
      split_part(new.email, '@', 1)
    )
  );
  perform public.ensure_default_collection(new.id);
  return new;
end;
$$;
