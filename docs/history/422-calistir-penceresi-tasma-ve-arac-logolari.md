# 422 — "Çalıştır" penceresi taşması + gerçek yapay zekâ aracı logoları

## Sorun
1. Telefonda "Çalıştır" penceresinde araç listesi kartın dışına taşıyordu (kart `Modal`'ın %75 `max-h` sınırıyla kırpılıyor ama içi kaydırılabilir değildi; liste kartın altından dışarı çıkıyordu).
2. Araçların simgesi yalnızca baş harfti ("C", "G"…).

## Yapılan
- `run-with-ai.tsx`: `RunModal` ortak `SpaceDialog` iskeletine taşındı (başlık + ✕ sabit, ortası kayar, "Çalıştır" düğmesi `footer`'da sabit). Elle `max-w-md space-y-4 … p-5` kartı kalktı.
- `public/tools/<araç-id>.svg`: 31 aracın gerçek marka logosu (LobeHub `lobe-icons`, MIT, `@lobehub/icons-static-svg@1.103.0`). Satıcının ayrı logosu olmayan modellerde (Imagen, Veo, Lyria, Wan, Seedance) sağlayıcının logosu kullanıldı.
- `lib/ai-tool-logos.ts` (kayıt: tek renkli/renkli) + `features/content/tool-logo.tsx` (`ToolLogo`): tek renkli logolar `mask` ile metin renginde çizilir (koyu modda okunur), renkliler düz `<img>`; logosu olmayan araç baş harfe döner. Kullanıldığı yerler: Çalıştır penceresi, araç seçici (satır + seçili çip), araç kartı (Keşfet → AI Araçları), `ToolChips`.
- `ai-tool-logos.test.ts`: her katalog aracının SVG dosyası var, `mono` bayrağı dosyayla uyumlu, güvensiz içerik yok. Yeni araç = katalog + SVG + `ai-tool-logos.ts`.
- Kullanım Koşulları → "Üçüncü taraf lisansları" maddesine logo atfı eklendi (bilgi amaçlı; `TERMS_VERSION` artmadı).

## Notlar
- Logolar ilgili sahiplerinin ticari markasıdır; yalnızca aracı belirtmek için kullanılır.
- Test: `tests/messaging-ui/run-run-modal.mjs` (ağ taklitli Playwright; 393×852 koyu/açık + masaüstü: kart ekrana sığar, son araç kartın içinde kalır, her satırda logo var ve yüklenir). `npm test`, `tsc`, `lint`, `build` temiz. Denenmedi: gerçek iPhone/Safari ve gerçek Supabase.
- İngilizce karşılık: yeni görünen metin yalnız Kullanım Koşulları atfıdır (TR+EN eklendi); araç adları marka adı, çevrilmez.
