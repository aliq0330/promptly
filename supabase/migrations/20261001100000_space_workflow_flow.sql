-- Workflow'u Space panosunda akış diyagramı olarak göstermek (docs/history/261-*).
--
-- Yeni tablo yok: bir workflow'un Space'e bağı, mevcut `space_items` satırıdır (`kind = 'content'`, `content_type = 'workflow'`,
-- `content_id` = workflow). Satır workflow'un KOPYASI değil başvurusudur; pano adımları workflow'dan canlı okur, yani workflow
-- değişince pano da değişir. Okuma/yazma yetkisi aynı kalır (`can_read_space` / `can_edit_space`, kaynak okunabilirliği tetikleyicide).
--
-- Eklenen tek şey, çerçevede hangi katmanların çizileceği (yalnız workflow öğesinde anlamlıdır, diğer türlerde yok sayılır):
--   flow_show_io        adımların girdi / çıktıları
--   flow_show_links     adımlarda kullanılan prompt / istek kartları
--   flow_show_relations bu içerikler arasındaki ilişkiler (content_relations)
-- Yalnızca ekleyici: `drop` yok, mevcut satırlar varsayılanla (hepsi açık) çalışır.

alter table public.space_items
  add column if not exists flow_show_io boolean not null default true,
  add column if not exists flow_show_links boolean not null default true,
  add column if not exists flow_show_relations boolean not null default true;

-- Bir workflow'un hangi Space'lerde göründüğü (workflow sayfasındaki önizleme, "bağlı Space'ler"): içerik + Space'e göre arama.
create index if not exists space_items_content_idx on public.space_items (content_type, content_id) where kind = 'content';
