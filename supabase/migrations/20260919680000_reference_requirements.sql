-- Referans gereksinimi: bir prompt/generator, türüne göre bir referans
-- görsel, video ve/veya ses ile birlikte kullanılır. Video için iki ayrı
-- bayrak vardır (referans video + referans görsel) ve bağımsız seçilebilir.
-- prompts.requires_reference_image zaten var (20260919670000).
alter table public.prompts
  add column if not exists requires_reference_video boolean not null default false,
  add column if not exists requires_reference_audio boolean not null default false;

alter table public.generators
  add column if not exists requires_reference_image boolean not null default false,
  add column if not exists requires_reference_video boolean not null default false,
  add column if not exists requires_reference_audio boolean not null default false;
