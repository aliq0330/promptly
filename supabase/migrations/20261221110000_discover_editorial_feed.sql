-- Keşfet editoryal açılışı TEK istekte (docs/history/465-*). `DiscoverEditorial` "haftanın promptu" + metin/ses/video + workflow + açık istek
-- şeritleri için aynı anda 6 ayrı RPC (5 × `feed_page`, 1 × `feed_page_proven`) gönderiyordu: küçük sunucuda her biri ayrı (çoğu soğuk) bağlantı
-- açtırıyor, sayfa açılışındaki dalgayı büyütüyordu. Bu işlev AYNI işlevleri AYNI argümanlarla, tek bağlantıda sırayla çağırır; sonuç birebir
-- aynıdır (`supabase/tests/discover-editorial-feed.sql` karşılaştırır). INVOKER: RLS ve görünürlük kuralları çağıranındır, misafir de çağırır.
-- `pos` = bölüm içindeki sıra (feed_page'in döndürdüğü sıra korunur).

create or replace function public.discover_editorial_feed()
returns table(section text, pos integer, kind text, id uuid, created_at timestamp with time zone, sort_rank bigint)
language sql
stable
set search_path = public
as $$
  select 'proven'::text, f.pos::integer, f.kind, f.id, f.created_at, f.sort_rank
    from public.feed_page_proven(null::text, null::text, null::text, null::text, 1, null::bigint, null::timestamptz, null::uuid)
         with ordinality as f(kind, id, created_at, sort_rank, pos)
  union all
  select 'text', f.pos::integer, f.kind, f.id, f.created_at, f.sort_rank
    from public.feed_page('all', 'recommended', array['prompt'], 'text', null::text, null::text, 2, null::bigint, null::timestamptz, null::uuid)
         with ordinality as f(kind, id, created_at, sort_rank, pos)
  union all
  select 'audio', f.pos::integer, f.kind, f.id, f.created_at, f.sort_rank
    from public.feed_page('all', 'recommended', array['prompt'], 'audio', null::text, null::text, 1, null::bigint, null::timestamptz, null::uuid)
         with ordinality as f(kind, id, created_at, sort_rank, pos)
  union all
  select 'video', f.pos::integer, f.kind, f.id, f.created_at, f.sort_rank
    from public.feed_page('all', 'recommended', array['prompt'], 'video', null::text, null::text, 1, null::bigint, null::timestamptz, null::uuid)
         with ordinality as f(kind, id, created_at, sort_rank, pos)
  union all
  select 'workflow', f.pos::integer, f.kind, f.id, f.created_at, f.sort_rank
    from public.feed_page('all', 'recommended', array['workflow'], null::text, null::text, null::text, 1, null::bigint, null::timestamptz, null::uuid)
         with ordinality as f(kind, id, created_at, sort_rank, pos)
  union all
  select 'request', f.pos::integer, f.kind, f.id, f.created_at, f.sort_rank
    from public.feed_page('all', 'recommended', array['request'], null::text, null::text, null::text, 2, null::bigint, null::timestamptz, null::uuid, true)
         with ordinality as f(kind, id, created_at, sort_rank, pos);
$$;

revoke all on function public.discover_editorial_feed() from public;
grant execute on function public.discover_editorial_feed() to anon, authenticated;
