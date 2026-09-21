-- Seeds the real tags table with the same fixed tag catalog the frontend
-- has used as mock data since Bölüm 5 (src/mocks/tags.ts) — these are
-- curated, not user-generated, so they belong in the database as data,
-- not as application logic. `on conflict do nothing` makes this safe to
-- re-run.
insert into public.tags (slug, label) values
  ('ai-sanat', 'AI Sanat'),
  ('portre', 'Portre'),
  ('fantastik', 'Fantastik'),
  ('siberpunk', 'Siberpunk'),
  ('anime', 'Anime'),
  ('mimari', 'Mimari'),
  ('manzara', 'Manzara'),
  ('karakter-tasarimi', 'Karakter Tasarımı'),
  ('minimalist', 'Minimalist'),
  ('soyut', 'Soyut'),
  ('3d-render', '3D Render'),
  ('neon', 'Neon'),
  ('surreal', 'Sürreal'),
  ('uzay', 'Uzay'),
  ('retro', 'Retro'),
  ('yazarlik', 'Yazarlık'),
  ('siir', 'Şiir'),
  ('video-uretim', 'Video Üretimi'),
  ('kodlama', 'Kodlama'),
  ('muzik-uretim', 'Müzik Üretimi')
on conflict (slug) do nothing;
