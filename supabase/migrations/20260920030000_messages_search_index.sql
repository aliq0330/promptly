-- Sohbet içi arama için trigram indeksi (docs/history/174-*). Ayrı dosyadır: `pg_trgm` uzantısı yetki nedeniyle kurulamazsa yalnızca bu
-- dosya başarısız olur, diğer sohbet migration'ları etkilenmez (arama indeks olmadan da doğru çalışır; yalnız büyük geçmişte yavaşlar).
create extension if not exists pg_trgm with schema extensions;
create index if not exists messages_body_trgm_idx on public.messages using gin (body extensions.gin_trgm_ops) where deleted_at is null;
