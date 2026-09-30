-- Ortak içerik taksonomisi: içerik türü -> kategori -> alt kategori.
-- Kaynak: src/lib/content-taxonomy.ts (slug'lar orada tanımlı, burada
-- yalnızca serbest metin olarak saklanır; geçersiz/eski değerler istemcide
-- yok sayılır, içerik hiçbir zaman gizlenmez).
--
-- 1) prompts / prompt_requests: yeni category + subcategory kolonları,
--    içerik türü 5 değerden (image/text/video/code/music) 4 değere iner:
--      code  -> text  (+ category 'coding')
--      music -> audio (+ category 'music')
-- 2) generators: yeni content_type; eski "konu" (generators.category)
--    türe taşınır, category artık taksonomi kategorisidir (null olabilir).

-- ---- prompts ---------------------------------------------------------------
alter table public.prompts add column if not exists category text;
alter table public.prompts add column if not exists subcategory text;

alter table public.prompts drop constraint if exists prompts_content_type_check;
update public.prompts set content_type = 'text', category = coalesce(category, 'coding') where content_type = 'code';
update public.prompts set content_type = 'audio', category = coalesce(category, 'music') where content_type = 'music';
alter table public.prompts
  add constraint prompts_content_type_check check (content_type in ('image', 'text', 'audio', 'video'));

-- ---- prompt_requests -------------------------------------------------------
alter table public.prompt_requests add column if not exists category text;
alter table public.prompt_requests add column if not exists subcategory text;

alter table public.prompt_requests drop constraint if exists prompt_requests_content_type_check;
update public.prompt_requests set content_type = 'text', category = coalesce(category, 'coding') where content_type = 'code';
update public.prompt_requests set content_type = 'audio', category = coalesce(category, 'music') where content_type = 'music';
alter table public.prompt_requests
  add constraint prompt_requests_content_type_check check (content_type in ('image', 'text', 'audio', 'video'));

-- ---- generators ------------------------------------------------------------
alter table public.generators add column if not exists content_type text;

update public.generators set content_type = case category
  when 'image' then 'image'
  when 'design' then 'image'
  when 'video' then 'video'
  when 'audio' then 'audio'
  else 'text' -- text, writing, marketing, code, other
end
where content_type is null;

-- Eski konudan çıkarılabilen kategori (taksonomi slug'ları).
alter table public.generators drop constraint if exists generators_category_check;
alter table public.generators alter column category drop not null;
update public.generators set category = case category
  when 'design' then 'design'
  when 'writing' then 'writing'
  when 'marketing' then 'marketing'
  when 'code' then 'coding'
  else null
end;
-- Eski serbest metin alt kategori artık taksonomi slug'ı olmak zorunda;
-- tanınmayan değerler istemcide yok sayılır, satır silinmez.

alter table public.generators alter column content_type set not null;
alter table public.generators
  add constraint generators_content_type_check check (content_type in ('image', 'text', 'audio', 'video'));

-- ---- filtre indeksleri -----------------------------------------------------
create index if not exists prompts_taxonomy_idx on public.prompts (content_type, category, subcategory);
create index if not exists prompt_requests_taxonomy_idx on public.prompt_requests (content_type, category, subcategory);
create index if not exists generators_taxonomy_idx on public.generators (content_type, category, subcategory);
