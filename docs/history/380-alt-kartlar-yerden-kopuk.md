# 380 — Alttan açılan kartlar yerden kopuk (alttan %5 boşluk)

**Karar (kullanıcı, mockup üzerinden):** mobilde alttan açılan kart ekranın dibine yapışmaz. İlk açılış toplam %75 yükseklik: altta %5, üstte %20 boşluk. Yukarı sürükleyince %90: altta ve üstte %5. Aşağı sürükleme sırası değişmedi (%90 → %75 → kapanır). Yalnız istemci; migration YOK.

## Değişen (`src/components/ui/modal.tsx`)
- `dialog` (`< sm`) ve `sheet` (`< sm`) varyantları: sarmalayıcıya `max-sm:mb-[max(5dvh,env(safe-area-inset-bottom))]`, karta `!w-[calc(100%-1.25rem)]` (yanlardan 10 px) ve `!rounded-xl` (dört köşe). Eski `rounded-b-none` / `border-x-0` / `border-b-0` kalktı; alt güvenli alan dolgusu (`pb-[max(1.25rem,…)]`) yerine `pb-5` (güvenli alanı artık dış boşluk karşılar).
- Yükseklik sınırları (`75dvh`, `--sheet-snap` %90) aynı; boşluklar bunların dışına konduğu için üst/alt oranlar kendiliğinden %20/%5 ve %5/%5 çıkar.
- **Klavye açıkken** boşluklar ve yuvarlak köşeler uygulanmaz: `floatWrap`/`floatCard` klavye varken boş, mevcut `cover` (378) kartı görünür alana yayar. Klavye kapanınca kart yerine döner. `visualViewport` mantığı (`use-keyboard-viewport.ts`, `keyboard-frame.ts`) değişmedi.
- Sarmalayıcı `pointer-events-none`, kart `pointer-events-auto`: kartın yanındaki/altındaki boşluğa dokunmak arka plan gibi kapatır.
- Aşağı sürükleyerek kapanma animasyonu kartı `yükseklik + 40 + %10 ekran` aşağı iter (yerden kopuk kart ekran dışına tam çıksın).
- `sm`+ (ortalanmış pencere, `sheet`'in masaüstü hâli) ve `side` DEĞİŞMEDİ; `centered` küçük pencereler zaten ortada.

## Dokunulmayanlar
`Modal` kullanmayan alt sayfalar: Odak (`FocusSheetFrame`), `MessageActionSheet`, hikâye sayfaları, alt menü. İsteklerse ayrıca ele alınır.

## Testler
- Ağ taklitli Playwright: `run-community-home` 27a (alttan %5/üstten %20, %90'da %5/%5, yanlardan 10 px, köşe yuvarlak), `run` 24/24, `run-report-modal` (alttan %5), `run-space-comments` 10/10 (8–9 eskiden Merkez düzeni öncesi `data-detail-band` bekliyordu, `data-hub-detail-band`'e güncellendi), klavye paketleri `run-chat-keyboard` 5/5, `run-prompt-fullscreen` 10/10, `run-spaces` 34/34, `run-team-projects` 61/61, `run-communities` 68/68, `run-team-hub` 42/42, `run-reactions`, `run-result-stats`; birim 1064/1064; tsc/eslint temiz.
- `run-comment-extras` (GIPHY ağı) ve `run-search-notifications` senaryo 2 bu değişiklikten ÖNCE de düşüyordu (aynı derlemeyle doğrulandı).
- **Gerçek iPhone ve Gboard DENENMEDİ.** Özellikle klavye açılırken kartın boşluksuz tam kaplamaya geçişi ve Gboard'un (emoji/GIF paneli, tek el modu) yükseklik değişiklikleri cihazda denenmeli.

İngilizce karşılık gereken metin eklenmedi (yalnız görünüm).
