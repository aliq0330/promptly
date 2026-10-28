# 264 — Telemoji tepki seçici ve "kim ne tepki verdi" listesi (mockup)

**Durum: yalnız mockup (repoda). Siteye BAĞLANMADI — `src/` değişmedi, migration yok, veritabanı değişmedi.** Gönderi kartındaki tek "Beğeni" düğmesinin yerine Telegram tarzı çoklu tepkinin nasıl görüneceğini göstermek için tek dosyalık, etkileşimli HTML demosu.

Dosyalar: `docs/mockups/telemoji-reactions/` — `index.html` (derlenmiş, bağımsız; çift tıkla ya da herhangi bir HTML önizleyicide açılır), `template.html` (kaynak), `build.py` (varlıkları gömüp derler).

## Ne gösteriyor
- **Tepki ver** düğmesine basınca düğmenin üstünde 6 tepkilik seçici açılır (Sevdim, Ateş, Vay be, Alkış, Komik, Faydalı); emojiler telemoji'nin Telegram kaynaklı hareketli emojileridir, üstüne gelince/basınca oynar.
- Seçince düğme o emojiyi gösterir ve emojinin kendi **Telegram emoji efekti** (etrafında patlayan büyük animasyon) kartın üstünde ~3 sn oynar. Aynı emojiye yeniden basmak efekti tekrar oynatır; "Tepkini kaldır" ayrı satırdır.
- Kartın altındaki satır **kimin ne dediğini** yazar: "Sen, Zeynep ve 128 kişi tepki verdi" (önce takip edilenler) + en çok kullanılan 3 emoji. Dokununca alttan açılan **Tepkiler** sayfası: toplam sayı, "Tümü / ❤️ 54 / 🔥 32 …" sekmeleri, her satırda kişi, @kullanıcı, zaman ve verdiği tepki (emoji + ad); "Sen" satırı en üstte, dokununca tepkiyi kaldırır.
- Açık/koyu tema, `prefers-reduced-motion` (efekt ve animasyon kapanır), klavye (Enter/Boşluk açar, ←/→ gezer, Esc kapatır), alttan sayfa %75 yükseklik sınırı (CLAUDE.md alttan açılan kart kuralı).

## Varlık eşlemesi (telemoji deposu)
Zip'e erişilemedi; aynı içerik `github.com/saeedtahmtan/telemoji` deposundan alındı. `webp/` dosyaları Git LFS işaretçisi olduğundan gerçek dosyalar `tgs/` (gzip'li Lottie) olarak kullanıldı; `lottie/*.json` da aslında gzip'lidir (TGS kopyası). Sayfada `DecompressionStream` açar, `lottie-web` (light) oynatır.

| Tepki | Emoji | Efekt (`tgs/reactions/U+0031_U+20E3_N`) |
|---|---|---|
| Sevdim ❤️ | `animated/U+2764_1` | 4 (renkli kalpler) |
| Ateş 🔥 | `animated/U+1F525_1` | 14 (alevler) |
| Vay be 🤯 | `animated/U+1F92F_1` | 21 (kırılan parçalar) |
| Alkış 👏 | `animated/U+1F44F_1` | 22 (eller + "WOW") |
| Komik 😂 | `animated/U+1F602_1` | 11 ("HAH" yazıları) |
| Faydalı 💡 | `animated/U+1F4A1_1` | 16 (yıldızlar) |

`reactions/` klasörünün 121 dosyasının adı anlamsızdır (hepsi `U+0031_U+20E3_N`); eşleşme dosyalar tek tek render edilip gözle yapıldı. **Telegram'da ampul için ayrı efekt bulunmadığından 💡'ya yıldız efekti verildi** (bakılan diğer adaylar — 24, 39, 90, 93, 108, 109, 112, 120 — ampulle ilgisizdi; 109 renkli kristal patlaması da olabilirdi).

## Bilinçli sınırlar
- Yalnız **Türkçe** (mockup); siteye taşınırken `translations.ts`'e `{tr, en}` çiftleriyle eklenmeli (CLAUDE.md Bölüm 4.5).
- Kişiler, sayılar ve zamanlar örnek veridir; hiçbir şey kaydedilmez. "Yorum yap" bu demoda çalışmaz.
- Siteye taşımak için gereken şema (tepki türü sütunu / `prompt_reactions`, sayaç trigger'ı, "kim verdi" listesi için sayfalı RPC — `254-*`/`255-*` kuralları) tasarlanmadı; mevcut tek "Beğeni" davranışı ve 8 etkileşim hedefi zinciri korunur.
- Telegram'ın hareketli emoji dosyaları Telegram'ın koşullarına tabidir (telemoji README'si); üretimde kullanmadan önce lisans netleştirilmeli. Gömülü varlıklar yaklaşık 0,9 MB'lık dosyayı oluşturur; siteye alınırsa tembel yüklenmeli.
- Gerçek iPhone Safari'ye karşı denenmedi (`DecompressionStream` Safari 16.4+); Chromium'da 360/390/430 px telefon ve masaüstü genişliğinde, açık/koyu temada denendi, konsol hatası yok.

## Yeniden derleme
`python3 docs/mockups/telemoji-reactions/build.py <telemoji-klonu> <lottie_light.min.js> docs/mockups/telemoji-reactions` (`lottie_light.min.js`: `npm i lottie-web@5.12.2` → `build/player/`).
