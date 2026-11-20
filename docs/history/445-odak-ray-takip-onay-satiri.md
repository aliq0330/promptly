# 445 — Odak: ray hizası, boşluk, emoji, takip düğmesi; onay satırları

Telefon ekran görüntülerinden gelen düzeltmeler (yalnız istemci, migration yok, yeni çeviri anahtarı yok).

## Odak (telefon)
- **Sağ ray tek eksende.** `BookmarkIcon` içindeki iki `<svg>` `absolute inset-0` idi; ray `box-content p-1.5` verince ikon dolgulu kutunun sol-üstüne yapışıp ~6 px sola kayıyordu. Artık `m-auto` ile ortada. Paylaş'tan görünür yazı kaldırıldı (rayın tek etiketli öğesiydi); erişilebilir ad (`aria-label`) aynı.
- **Kartın alt satırındaki beğeni düğmesi boş daire değildi, gizleniyordu.** `bar` düzeni `[&>span]:sr-only` ile sayıyı gizliyordu ama seçilen tepki emojisi (`ReactionIcon`) da bir `<span>` olduğu için o da 1 px'e kırpılıyordu. Kural `[&>span:not(:first-child)]:sr-only` oldu (yalnız sayı ekran okuyucuya kalır).
- **Başlık/yazar bloğu ile prompt şeridi arası ~50 px boştu.** Blok ve ray aşağı indi (`5.75rem` / `6.25rem` + güvenli alan; şerit ≈ 4.75rem + güvenli alan).
- **Takip Et / Takip Ediliyor** Odak'ta küçük, saydam, ince kenarlıklı hap: `FollowButton tone="art"` (28 px, `data-small-target` + `tap-area`). Varsayılan görünüm değişmedi.
- **"Ayar paketiyle dene" satırı:** simge + yazı tek grup (sol), sayı rozeti sağda; satır yüksekliği/boşluğu "Ayrıntıları aç" ile aynı. Aynı düğme prompt sayfasında ortalı kalır.

## Onay satırları
- Yeni ortak parça `components/ui/check-row.tsx` (`CheckRow`): "Kim görsün?" seçenekleri gibi geniş kenarlıklı satır + seçilince dolan halka; içinde yerel gizli `checkbox` (klavye/ekran okuyucu aynı).
- "Referans gereksinimi" (`reference-requirements.tsx`) ve "Prompt parçalarını İngilizce yaz" (`extra-settings-panel.tsx`) artık bunu kullanır. Siyah yerel onay kutusu kalktı.

## Test
- `run-focus-feed.mjs` 8. senaryo: kartın beğeni düğmesinde emoji görünür; 14. senaryo: rayın dört ikonu tek eksende, Paylaş'ta yazı yok, başlık bloğu şeride yakın, takip düğmesi küçük + saydam.
- Gerçek cihaza/Supabase'e karşı denenmedi (taklitli Playwright).
- İngilizce karşılıklar: yeni görünür metin yok.
