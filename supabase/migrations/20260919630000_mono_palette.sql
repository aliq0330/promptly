-- Promptly — 5. renk paleti "Beyaz" (mono) için tercih kısıtının genişletilmesi.
-- profiles.theme_palette yalnızca bilinen paletleri kabul eder; yeni 'mono'
-- değeri eklenmezse Beyaz'ı seçen kullanıcının tercihi hesaba yazılamaz.
alter table public.profiles drop constraint if exists profiles_theme_palette_check;
alter table public.profiles
  add constraint profiles_theme_palette_check
  check (theme_palette in ('mono', 'lavender', 'ocean', 'forest', 'sand'));
