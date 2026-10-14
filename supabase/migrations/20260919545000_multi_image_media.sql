-- Çoklu görsel desteği — Prompt İsteği / Generator / Workflow.
--
-- NOT (uzlaştırma): Bu migration canlıya MCP ile `20261002110844 multi_image_media`
-- olarak uygulanmıştı ama dosyası repoya hiç girmemişti; bu dosya canlı
-- `supabase_migrations.schema_migrations.statements` kaydından BİREBİR geri
-- yazılmıştır (yalnız bu not eklendi). Sıra: 540000 ile 550000 arası.
--
-- Prompt zaten `prompt_media` ile gerçek bir one-to-many tabloya sahipti
-- (unique kısıtı yok, `position` kolonu baştan beri vardı, Storage bucket'ının
-- kendi yol konvansiyonu `{prompt_id}-{n}.<ext>` zaten çoklu görseli
-- öngörüyordu) — bu yüzden Prompt için HİÇBİR migration gerekmiyor, yalnızca
-- frontend/data-layer değişiyor.
--
-- Prompt İsteği/Generator/Workflow ise tek bir skaler kolona (reference_
-- image_url/width/height, cover_url) sahipti — üçü için de `prompt_media`
-- ile BİREBİR AYNI şekilde (id, <owner>_id, url, width, height, alt,
-- position) yeni birer junction tablosu ekleniyor, RLS her üçünün de kendi
-- SELECT/UPDATE politikasının birebir aynı görünürlük koşulunu tekrarlıyor
-- (bu projenin `prompt_media` politikasında zaten kurduğu "koşulu
-- tekrarla, bir üst tabloya güvenme" konvansiyonu). Eski skaler kolonlar
-- SİLİNMİYOR (geriye dönük veri kaybı riski almama kararı, Bölüm 9.22'nin
-- `prompt_saves`'i atıl bırakma kararıyla aynı ilke) — yalnızca artık hiçbir
-- yeni kod onları okumuyor/yazmıyor, bir kerelik backfill ile yeni
-- tablolara taşınıyorlar.
--
-- Mimari karar: Request yeni görselleri GERÇEK Storage'a (`request-
-- references` bucket, zaten var — Bölüm 20) yüklemeye devam ediyor, yalnızca
-- dosya adı `{request_id}-{n}.<ext>` oluyor (bucket'ın RLS politikası yalnızca
-- "klasör = auth.uid()" kontrolü yaptığından, hiçbir policy değişikliği
-- GEREKMEDİ). Generator/Workflow ise Bölüm 9.27'nin "kapak görseli için ayrı
-- bir Storage bucket'ı yok, gerçek bir küçültülmüş data URL gömülü" kararını
-- AYNEN koruyor — yeni görseller de aynı şekilde `resizeImageToDataUrlFit`
-- ile üretilen data URL'ler, yalnızca artık bir dizi halinde.

-- === prompt_request_media ===================================================

create table public.prompt_request_media (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.prompt_requests (id) on delete cascade,
  url text not null,
  width integer not null default 0,
  height integer not null default 0,
  alt text,
  position integer not null default 0
);

alter table public.prompt_request_media enable row level security;
create index prompt_request_media_request_id_idx on public.prompt_request_media (request_id);

create policy "Request media is readable wherever its request is readable"
  on public.prompt_request_media for select
  using (
    exists (
      select 1 from public.prompt_requests r
      where r.id = prompt_request_media.request_id
        and (not r.is_draft or r.author_id = auth.uid())
    )
  );

create policy "Request authors manage their own request media"
  on public.prompt_request_media for all
  to authenticated
  using (
    exists (select 1 from public.prompt_requests r where r.id = prompt_request_media.request_id and r.author_id = auth.uid())
  )
  with check (
    exists (select 1 from public.prompt_requests r where r.id = prompt_request_media.request_id and r.author_id = auth.uid())
  );

insert into public.prompt_request_media (request_id, url, width, height, alt, position)
select id, reference_image_url, coalesce(reference_image_width, 0), coalesce(reference_image_height, 0), title, 0
from public.prompt_requests
where reference_image_url is not null;

-- === generator_media =========================================================

create table public.generator_media (
  id uuid primary key default gen_random_uuid(),
  generator_id uuid not null references public.generators (id) on delete cascade,
  url text not null,
  width integer not null default 0,
  height integer not null default 0,
  alt text,
  position integer not null default 0
);

alter table public.generator_media enable row level security;
create index generator_media_generator_id_idx on public.generator_media (generator_id);

create policy "Generator media is readable wherever its generator is readable"
  on public.generator_media for select
  using (
    exists (
      select 1 from public.generators g
      where g.id = generator_media.generator_id
        and (g.creator_id = auth.uid() or (g.status = 'published' and g.visibility in ('public', 'unlisted')))
    )
  );

create policy "Generator owners manage their own generator media"
  on public.generator_media for all
  to authenticated
  using (
    exists (select 1 from public.generators g where g.id = generator_media.generator_id and g.creator_id = auth.uid())
  )
  with check (
    exists (select 1 from public.generators g where g.id = generator_media.generator_id and g.creator_id = auth.uid())
  );

insert into public.generator_media (generator_id, url, width, height, alt, position)
select id, cover_url, 0, 0, title, 0
from public.generators
where cover_url is not null;

-- === workflow_media ===========================================================

create table public.workflow_media (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  url text not null,
  width integer not null default 0,
  height integer not null default 0,
  alt text,
  position integer not null default 0
);

alter table public.workflow_media enable row level security;
create index workflow_media_workflow_id_idx on public.workflow_media (workflow_id);

create policy "Workflow media is readable wherever its workflow is readable"
  on public.workflow_media for select
  using (
    exists (
      select 1 from public.workflows w
      where w.id = workflow_media.workflow_id
        and (w.status = 'published' or w.creator_id = auth.uid())
    )
  );

create policy "Workflow owners manage their own workflow media"
  on public.workflow_media for all
  to authenticated
  using (
    exists (select 1 from public.workflows w where w.id = workflow_media.workflow_id and w.creator_id = auth.uid())
  )
  with check (
    exists (select 1 from public.workflows w where w.id = workflow_media.workflow_id and w.creator_id = auth.uid())
  );

insert into public.workflow_media (workflow_id, url, width, height, alt, position)
select id, cover_url, 0, 0, title, 0
from public.workflows
where cover_url is not null;
