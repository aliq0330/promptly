# 333 — MCP / kişisel API ile taslağa görsel ekleme (`attach_image`)

**Soru (kullanıcı):** Claude / ChatGPT'ye MCP ile bağlıyız ve oradan şablon (prompt taslağı) kaydedebiliyoruz; orada üretilen görseli de
taslağa ekleyemez miyiz? **Önceki durum:** hayır — `save_prompt_draft` yalnız metin alanlarını alıyordu (medya yoktu).

**Dürüst sınır (en önemlisi):** MCP'de akış tek yönlüdür; Promptly modelin araç çağrısına yazdığı parametreleri görür, sohbetteki görsele
KENDİ BAŞINA erişemez. Görselin bize ulaşması için model onu parametre olarak vermelidir: (1) herkese açık **https adresi**, (2) base64
(pratikte çalışmaz — model görseli metin olarak yazamaz), (3) istemcinin dosya aktarımı (ChatGPT Apps SDK `openai/fileParams` →
`download_url`). Bu sürüm (1) ve (3)'ü destekler; **gerçek ChatGPT / Claude ile DENENMEDİ** — üretilen görselin araca hangi biçimde (adres var
mı, kalıcı mı) geldiği canlı denemeyle öğrenilecek. Adres yoksa ya da kısa ömürlüyse yol çalışmaz; yedek: siteden elle yükleme.

## Ne yapıldı
- **Araç:** `attach_image(prompt_id, image_url? | image_file?, alt?)` — yalnız `/mcp/me` (kişisel) adresinde, `write` kapsamıyla. Hiçbir şeyi
  yayınlamaz/silmez; kapsam 321'in sınırıyla aynı: yalnız KENDİ, yayınlanmamış, topluluğa özgü olmayan, `image` türlü taslak, en çok 4 görsel.
  Önce `save_prompt_draft` (`content_type: "image"`), sonra bu araç.
- **Yeni Edge Function `media-upload`** (`verify_jwt` kapalı; POST `{prompt_id, image_url, alt?}` + `Authorization: Bearer pmt_…`): görseli
  indirir, doğrular, `prompt-media/{kullanıcı}/{uuid}.{jpg|png|webp}` yoluna yazar, `prompt_media` satırını ekler. `mcp` işlevi ona yalnız
  istemci olarak bağlanır (`createMediaUploadClient`).
- **Migration `20261104130000_api_me_media.sql`:** `api_me_media_begin` (sahiplik/taslak/tür/≤4/saatte 20 deneme; SECURITY DEFINER çünkü
  `_rate_limit` istemci rollerine kapalı) ve `api_me_media_commit` (INVOKER: yol çağıranın klasöründe + uuid adlı jpg/png/webp, adres o
  yolun kimlik URL'si, dosya `storage.objects`'te var, boyut/alt sınırları, satırı yazar). Yalnız ekleyici (expand).
- **Çekirdek `src/lib/public-api/media.ts`** (bağımlılıksız; ağ/DNS/Storage dışarıdan verilir → birim testli).

## Güvenlik kararları (gözden geçir)
1. **Service role kullanan YENİ bir Edge Function eklendi** (CLAUDE.md §7'deki listeye `media-upload` girdi). Neden: kişisel anahtarla kullanıcı
   JWT'si yoktur ve Storage'a bayt yazmak SQL'den yapılamaz. `api` ve `mcp` işlevlerinde service role hâlâ YOK; yükleme bu yüzden ayrı ve küçük.
   Service role yalnız iki iş yapar: kurulan yola yazmak ve commit başarısızsa onu silmek. **Yol sunucuda kurulur**: kullanıcı kimliği
   veritabanından (begin), uzantı BAYTLARDAN okunan biçimden gelir — istemci yol/tür veremez.
2. **SSRF:** yalnız https/443, kimlik bilgisi yok, IP/`localhost`/`.local`/`.internal` ad yok; ad `Deno.resolveDns` ile çözülür ve TÜM adresler
   genel olmalı (özel, döngü, bağlantı-yerel/bulut meta verisi, CGNAT, IPv6 ULA/bağlantı-yerel, `::ffff:` sarmalı reddedilir); yönlendirmeler
   elle, her adımda yeniden denetlenerek izlenir (≤3); 15 sn; gövde 8 MB'ta kesilir. **Kalan açık:** DNS yeniden bağlama (TOCTOU) — `fetch` adı
   yeniden çözer ve IP sabitlenemez; ek korumalar yukarıdakilerdir.
3. **Tür doğrulaması baytlardan** (PNG/JPEG/WebP imzası + boyut); SVG/HTML/GIF reddedilir, istemcinin söylediği tür/uzantıya güvenilmez.
4. Hız sınırı: kişisel anahtar başına `api_me_throttle` (30 yazma/dk) + `api_me_media` saatte 20 DENEME.

## Bilinen sınırlar
- Sunucuda **yeniden boyutlandırma/yeniden kodlama yok** (Deno'da görüntü kütüphanesi yok): 8 MB üstü reddedilir, küçültülmez (site formu
  1600 px'e küçültüyordu). Baskın renk / bulanık önizleme hesaplanmaz → `/moderation → Görsel renklerini doldur` doldurur.
- Yalnız ekleme: görseli kaldırma/sıralama bu yüzeyde yok (siteden). Workflow/İstek/Hazır ayar görseli yok.
- `image_file` + `_meta["openai/fileParams"]` ChatGPT için en iyi çaba; sözleşmesi doğrulanmadı.
- OAuth onay ekranındaki yazma metni "özel taslak ekleme/düzenleme" der; görsel ekleme taslak düzenlemesi sayıldı (metin değişmedi).

## Test
`src/lib/public-api/media.test.ts` 16 madde (biçim/boyut okuma, SSRF, indirme, akış, işleyici, istemci); `mcp/test/remote.test.ts` +3
(toplam 36/36); `supabase/tests/api-me-media.sql` 14 madde (yerel PostgreSQL 16, FAILED=0); `scripts/smoke-test.mjs` iki yeni RPC. İngilizce
karşılık: araç adı/metni zaten İngilizce; site metni `translations-api-keys.ts` (TR+EN) güncellendi.
**Gerçek Supabase / Storage / ChatGPT / Claude'a karşı DENENMEDİ.** Canlıya alma sırası: migration (boru hattı) → `./scripts/deploy-functions.sh media-upload`
→ `./scripts/deploy-functions.sh mcp` (araç listesi değişti).
