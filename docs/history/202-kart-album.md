# 202 — Gönderi kartları: Albüm kartı

**Durum:** uygulandı (yalnız istemci kodu, veritabanı/migration YOK). Ağ taklitli Playwright'ta sınandı; gerçek Supabase'e / gerçek cihaza karşı denenmedi.

## Neden
Kullanıcı detay sayfası için **I · Albüm** düzenini seçtikten sonra gönderi kartları için de örnek istedi. Tasarım tuvalinde mevcut kart + beş yön gösterildi (K1 Albüm kartı, K2 Galeri, K3 Akış, K4 Terminal, K5 Kompakt satır); kullanıcı **K1 · Albüm kartı**nı seçti — detay sayfasıyla aynı dil.

## Yapılan
- **`ContentCardPost`** (`features/content/content-card.tsx`) — beş kart türünün (Prompt, Workflow, Hazır Ayar, İstek, topluluk başvurusu) ortak iç yerleşimi yeniden yazıldı:
  - **Bant:** gönderinin görselinden renk alır (`backdrop` büyütülüp bulanıklaştırılır, üstüne sayfa renginde örtü — detay bandıyla aynı yöntem); görselsizde marka tonu. İçinde `art`, tür satırı, büyük başlık, küçük avatar + ad + "@kullanıcı · zaman", sağda ⋮.
  - **Eylem satırı:** solda kartın tek büyük eylemi (`primary`), sağda sayaçlar + Paylaş (var olan bileşenler: `PromptCardFooter`, istek/başvuru satırları). Büyük eylem yoksa eski düzen.
  - Stacking context yok (⋮ menüsü sonraki kartın üstüne açılabilsin); kontroller kartın gerilmiş bağlantısının üstünde (`z-10`, menü `z-20`).
- **Türlere göre:**
  - Prompt: görsel → çıktı (`OutputThumbnailStrip`, birden çok görselde küçük resim şeridi), video/ses → kapak, görsel yok → prompt metni (`PromptPreviewBox variant="art"`); tür satırında araç; büyük eylem **Kopyala** (tam `promptText`, kullanım sayar). İstek yanıtının kaynağı bantta.
  - Workflow: kapak ya da "N adım + içerik türleri" karosu; büyük eylem **Çalıştır** (detay sayfasını `?run=1` ile adım adım modda açar).
  - Hazır Ayar: parametre karosu (ilk üç parametre, sayı, araç ya da "Genel"); büyük eylem **Studio'da aç**.
  - İstek: referans görseli ya da isteğin metni (+ yaratıcı yön); büyük eylem **Yanıtla** (yalnız açık istekte ve yazarı değilse).
  - Topluluk başvurusu: içeriğin görseli, not bantta; sayaçlar GÖNDERİNİN (değişmedi).
- Kartta açıklama ve etiketler artık yok (başlık + yazar; ayrıntı detay sayfasında). Görselli prompt kartında prompt metni gösterilmez (tasarımdaki gibi; "Kopyala" yine tam metni kopyalar).
- Kart köşesi 22px (`rounded-xl`), iskelet (`PromptCardSkeleton`) yeni yerleşimi izler.
- Çeviri: yeni anahtar yok (`common.copy`, `run.button`, `studio.openInStudio`, `request.reply` yeniden kullanıldı) — TR + EN mevcut.

## Sınırlar
- Bant rengi görselin bulanık hâlinden gelir; çok açık/koyu görsellerde ton zayıf kalabilir.
- Gerçek cihazda ve gerçek görsellerle denenmedi.

## Sınama
`tsc`, `lint`, `npm test`, `next build --webpack`; tüm `tests/messaging-ui/run-*.mjs` paketleri; Ana Sayfa ekran görüntüleri 1440 + 390 (eylem satırı hiçbir kartta taşmıyor: `scrollWidth == clientWidth`).
