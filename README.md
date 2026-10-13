# Promptly

Yapay zekâ ile üretilen **prompt'ları** paylaşan, keşfeden ve yeniden kullanan
yaratıcı topluluk platformu. Görsel, metin, ses ve video prompt'ları aynı
akışta yer alır.

**Canlı site:** <https://aliq0330.github.io/promptly/>

## Neler var

- **Prompt** — `{değişken}` jetonlu şablonlar (tipli alanlar, görselli/renkli
  seçenekler, koşullu alanlar, hazır alan kütüphanesi), Prompt DNA (prompt'tan
  otomatik algılanan bölümler), çıktı görselleri / video / ses, sonuç galerisi
- **Prompt İsteği** — bir görsel/stil için yaratıcı talep; yanıtlar normal birer prompt
- **Workflow** — prompt'ları sıralı adımlara bağlayan zincirler
- **Hazır Ayar** — bir prompt için kaydedilebilir, paylaşılabilir parametre setleri
- **Studio** — prompt veya hazır ayarı kendi API anahtarınla (Gemini / OpenAI) deneme alanı
- **Sosyal katman** — beğeni, iç içe yorumlar, koleksiyonlar, takip, mesajlaşma
  (anlık, fotoğraf + emoji, mesaj istekleri), bildirim merkezi, engelleme / şikâyet
- **Keşif** — chip tabanlı gelişmiş arama, kategori / alt kategori taksonomisi,
  etiket sistemi, İlişki Haritası, Kart ve Odak görünümleri
- **Moderasyon konsolu** — şikâyet kuyruğu, site istatistikleri, kullanıcı yönetimi
- İki dilli (Türkçe / İngilizce), 5 renk paleti × açık / koyu mod, mobil – tablet – masaüstü

## Teknolojiler

- [Next.js](https://nextjs.org) 16 (App Router, **statik export**) + React 19 + TypeScript
- Tailwind CSS v4 (merkezi token sistemi)
- [Supabase](https://supabase.com) — Auth, Postgres (RLS), Storage, Realtime, Edge Functions
- lucide-react ikonları; Inter, Instrument Sans, Newsreader, JetBrains Mono yazı tipleri

Uygulama tamamen statik olarak GitHub Pages'e yayınlanır (`basePath: /promptly`);
sunucu çalışma zamanı yoktur, Supabase'e yalnızca tarayıcıdan erişilir.

## Kurulum

Node 20+ gerekir.

```bash
npm install
cp .env.example .env.local   # Supabase URL ve anon key'i doldurun
npm run dev
```

Uygulama <http://localhost:3000/promptly> adresinde açılır (`basePath` yüzünden
`/promptly` öneki gerekir).

## Ortam değişkenleri

| Değişken | Açıklama |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase proje URL'i |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key — güvenlik sınırı RLS'tir |

**Service role key frontend'e veya repoya asla konmaz.** `.env.local` commit edilmez.
Canlı yayında bu iki değer GitHub Actions secret'larından okunur.

## Komutlar

```bash
npm run dev       # geliştirme sunucusu
npm run build     # production derlemesi (statik export → out/)
npm run lint      # ESLint
npm test          # birim testleri (prompt DNA, değişkenler, ilişkiler …)
npx tsc --noEmit  # tip kontrolü
```

Bir görev bitmeden `tsc`, `lint`, `test` ve `build` temiz olmalıdır.

## Veritabanı ve Edge Function'lar

Şema `supabase/migrations/` altındaki sıralı SQL dosyalarıdır; uygulama talimatı
ve ayrıntılar [`supabase/README.md`](./supabase/README.md) içindedir. Tohum veriler
`supabase/seed/`, Edge Function'lar (`analyze-image`, `username-login`,
`cleanup-orphan-storage`) `supabase/functions/` altındadır.

> **Önemli:** GitHub Actions yalnızca statik siteyi yayınlar. **Migration'lar ve
> Edge Function'lar otomatik deploy edilmez** — SQL Editor / Supabase MCP ile ve
> `supabase functions deploy <ad>` ile elle uygulanır.

## Proje rehberi ve tarihçe

- [`CLAUDE.md`](./CLAUDE.md) — kalıcı kurallar: tasarım sistemi, i18n, güvenlik,
  veri modeli kalıpları, çalışma düzeni, güncel durum ve açık işler.
- [`docs/history/`](./docs/history/README.md) — özellik tarihçesi arşivi (hangi
  özellik neden / nasıl yapıldı; "kaldırıldı" etiketliler güncel kodu temsil etmez).
- [`AGENTS.md`](./AGENTS.md) — Next.js CLI'ın ürettiği, bu sürüme özgü kurallar.
