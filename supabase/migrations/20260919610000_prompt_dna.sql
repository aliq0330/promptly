-- Promptly — Prompt DNA: bir promptun, kullanıcının kabul ettiği/elle eklediği
-- bölümleri (konu, ışık, kamera, stil, çıktı, negatif …). Bölümler ham prompt
-- metninden BAĞIMSIZ üst veridir; ham metin her zaman asıl kaynaktır.
--
-- Algılama tamamen yerel/kural tabanlıdır (src/lib/prompt-dna) — veritabanı
-- yalnızca kullanıcının onayladığı bölümleri saklar; öneriler asla buraya
-- otomatik yazılmaz. Desen `prompt_variables` ile birebir aynıdır.
create table public.prompt_dna_sections (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  -- Sabit bölüm türü (subject, lighting, camera … veya 'custom'). Yeni türler migration gerektirmesin diye serbest metin.
  type text not null check (char_length(type) between 1 and 40),
  -- Yalnızca 'custom' bölümler için anlamlı; standart türler çevrilmiş etiketle gösterilir.
  label text check (label is null or char_length(label) <= 60),
  content text not null check (char_length(content) between 1 and 2000),
  order_index integer not null default 0,
  source text not null default 'manual' check (source in ('auto', 'manual')),
  confidence text check (confidence is null or confidence in ('high', 'medium', 'low')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger prompt_dna_sections_set_updated_at
  before update on public.prompt_dna_sections
  for each row
  execute function public.set_updated_at();

create index prompt_dna_sections_prompt_id_idx on public.prompt_dna_sections (prompt_id, order_index);

alter table public.prompt_dna_sections enable row level security;

-- Okuma: bölümleri, promptu görebilen herkes görür (alt sorgu `prompts`'un kendi RLS'ine tabidir).
create policy "Prompt DNA sections are readable wherever their prompt is readable"
  on public.prompt_dna_sections for select
  using (exists (select 1 from public.prompts p where p.id = prompt_dna_sections.prompt_id));

-- Yazma: yalnızca promptun yazarı.
create policy "Prompt authors manage their own prompt DNA sections"
  on public.prompt_dna_sections for all
  to authenticated
  using (exists (select 1 from public.prompts p where p.id = prompt_dna_sections.prompt_id and p.author_id = auth.uid()))
  with check (exists (select 1 from public.prompts p where p.id = prompt_dna_sections.prompt_id and p.author_id = auth.uid()));
