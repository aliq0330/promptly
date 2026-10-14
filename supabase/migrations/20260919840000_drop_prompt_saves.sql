-- public.prompt_saves artık yok: kaydedilenler `collections` (is_default = "Genel")
-- + `collection_items` üzerindendir (20260919270000 mevcut kayıtları oraya taşıdı;
-- hiçbir kod tabloya yazmaz/okumaz). Tablo atıldı.
--
-- Bu migration YALNIZCA prompt_saves'e dokunur (collections, collection_items,
-- prompt_likes ve diğerleri değişmez). Yıkıcı DROP, kullanıcının açık onayıyla.
-- Canlıda önceden kontrol: 0 satır, yalnızca 3 policy + 2 indeks, trigger/view/
-- fonksiyon bağımlılığı yok. `cascade` KULLANILMAZ: beklenmeyen bir bağımlılık
-- varsa migration hata verip hiçbir şeyi silmez.
--
-- Tablo yoksa (yeniden çalıştırma / taze kurulumda 270000'den sonra) no-op.

do $$
begin
  if to_regclass('public.prompt_saves') is not null then
    drop policy if exists "Users can view their own saves" on public.prompt_saves;
    drop policy if exists "Users can save prompts for themselves" on public.prompt_saves;
    drop policy if exists "Users can remove their own saves" on public.prompt_saves;
    drop index if exists public.prompt_saves_user_id_idx;
    drop table public.prompt_saves;
  end if;
end
$$;
