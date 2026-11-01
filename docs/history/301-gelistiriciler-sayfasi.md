# 301 — Geliştiriciler sayfası (`/developers`)

**Durum:** uygulandı (kodda); canlıda henüz yok — PR birleşince `deploy.yml` yayınlar.

## Neden
297/299 ile salt-okunur API ve MCP (yerel paket + internet üzerinden) yayında, ama sitede bunlara giden hiçbir yol yoktu; kullanıcı ne olduklarını ve nasıl bağlanacaklarını bulamazdı.

## Ne
- **`/developers`** (herkese açık, giriş istemez, TR+EN): MCP bağlayıcı adresi (kopyala düğmeli), Claude uygulaması / claude.ai, Claude Code, Cursor ve yerel `npx` adımları, dört aracın tek satırlık açıklaması, "dene" örnek cümlesi; HTTP API adresi + curl (ara / oku / doldur) + JavaScript örneği + OpenAPI bağlantısı; "Bilmen gerekenler" (salt okunur, yalnız herkese açık, atıf, kullanıcı içeriği, makul kullanım) ve Kullanım Koşulları'na bağlantı.
- **Adresler uydurulmaz:** `lib/developers.ts` (saf, birim testli) `NEXT_PUBLIC_SUPABASE_URL`'den `…/functions/v1/mcp` ve `…/functions/v1/api/v1`'i türetir; adres tanımsız/https değilse sayfa örnek göstermez, yalnız açıklama gösterir.
- **Giriş noktaları:** geniş kenar çubuğunun alt köşesi (ziyaretçi dahil), Ayarlar → Tercihler'de bir satır, telefonda hesap menüsünde (Ayarlar'ın yanında).

## Bilerek yapılmayanlar
- **Prompt ⋮ menüsünde "Claude'da kullan" yok.** `PostMenu` içeriğin yayında/herkese açık olduğunu bilmiyor; özel ya da taslak promptta kopyalanan "şu promptu getir" cümlesi Claude'da `not_found` verirdi. Eklenirse görünürlük bilgisi menüye iletilmeli.
- Hız sınırı ve kullanım ölçümü yok; sayfa "yoğun çekmeden önce yaz" der, sayısal söz vermez.
- Resmî MCP Registry / npm 0.1.1 (README + `mcpName`) yapılmadı.

## Doğrulama
`tsc` ✅ · `lint` ✅ (0 hata) · yeni birim testi `src/lib/developers.test.ts` (3) · yeni arayüz paketi `tests/messaging-ui/run-developers.mjs` (9/9: adres + araçlar, API örnekleri + OpenAPI bağlantısı, kopyalama panoya yazar, ziyaretçi, İngilizce, telefonda taşma yok, kenar çubuğu/Ayarlar/hesap menüsü bağlantıları). İngilizce karşılıklar (`dev.*`) eklendi. Ağ taklitli; gerçek cihaza KARŞI DENENMEDİ, "Claude'a bağla" adımları claude.ai'da denenmedi (kullanıcı bağlayıcıyı eklediğini bildirmişti, adım metni arayüz adlarına göre yazıldı ve arayüz değişirse eskir).
