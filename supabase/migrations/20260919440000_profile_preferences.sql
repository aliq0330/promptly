-- Promptly — Dil / tema tercihlerinin hesaba (backend) yazılması.
-- Null = kullanıcı henüz açıkça seçim yapmadı (ilk açılışta konuma göre
-- varsayılan dil kullanılır). RLS: mevcut "kendi profilini güncelle"
-- politikası bu sütunları da kapsar; ayrıca politika gerekmez.
alter table public.profiles
  add column if not exists language text check (language in ('tr', 'en')),
  add column if not exists theme_mode text check (theme_mode in ('light', 'dark')),
  add column if not exists theme_palette text check (theme_palette in ('lavender', 'ocean', 'forest', 'sand'));
