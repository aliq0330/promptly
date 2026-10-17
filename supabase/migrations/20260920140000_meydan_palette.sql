-- Promptly — 6. renk paleti "Meydan" (yeni varsayılan, docs/history/190-*) için tercih kısıtının genişletilmesi.
-- profiles.theme_palette yalnızca bilinen paletleri kabul eder; 'meydan' eklenmezse
-- başka bir paletten Meydan'a dönen kullanıcının tercihi hesaba yazılamaz.
-- Yalnızca kısıt genişletilir; mevcut satırlara dokunulmaz (eski değerlerin hepsi yeni listede).
alter table public.profiles drop constraint if exists profiles_theme_palette_check;
alter table public.profiles
  add constraint profiles_theme_palette_check
  check (theme_palette in ('meydan', 'mono', 'lavender', 'ocean', 'forest', 'sand'));
