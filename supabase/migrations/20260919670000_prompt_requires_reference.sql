-- Prompt, bir referans fotoğraf/görselle birlikte kullanılıyorsa yazar bunu işaretler;
-- detay sayfasında "Not: Bu prompt bir referans fotoğraf/görsel ile birlikte kullanılır." gösterilir.
alter table public.prompts add column if not exists requires_reference_image boolean not null default false;
