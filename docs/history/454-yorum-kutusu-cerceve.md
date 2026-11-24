# 454 — Yorum yazma kutusu: tek çerçeveli kutu, telefonda satır içi yanıt

Kullanıcı mockup'ı seçti (dev.to'nun yazma kutusundan esinlenen, bizim token'larımızla çizilmiş): yorum ve yanıt kutusunun çevresinde çizgi var, araçlar kutunun içinde.

## Arayüz (`features/prompts/`)
- **`comment-composer-box.tsx`** (yeni): yazı alanı (`MentionTextarea`, `field-sizing-content`, `max-h-60`) + ince ayırıcı (`border-soft`) + araç satırı, hepsi tek `rounded-lg border-border-strong`
  çerçevede; odakta kenarlık `primary` + halka. Seçili ekin önizlemesi çerçevenin içinde, araç satırının üstünde. Gönder (ve varsa Vazgeç) araç satırının sağında; **telefonda Vazgeç'li kutuda
  (yanıt) düğmeler kutunun altına iner** (Gönder solda, Vazgeç sağda): üç araç + iki düğme dar kutuya sığmıyordu (mockup'ın telefonda taşan hâli). Sayaç telefonda yalnız 1800 karakterden sonra görünür.
- **Ana yorum kutusu** (`comment-section.tsx`): tek satırlık `input` + ayrı Gönder yerine bu kutu; Gönder (simgeli) kutunun sağ altında. Enter artık gönderme değil satır sonudur (çok satırlı).
- **Yanıt her genişlikte satır içidir** (`comment-node.tsx`): telefondaki alttan açılan yanıt kartı kalktı (452'nin kararı değişti). Düzenleme masaüstü/tablette satır içi (aynı kutu), telefonda
  alttan kart kaldı (`comment-compose-sheet.tsx`, içinde aynı kutu; yanıtlanan özeti `quote` kaldırıldı çünkü yalnız yanıtta kullanılıyordu).
- Yeni çeviri anahtarı YOK (mevcut `comments.*`, `common.*`); İngilizce karşılıklar zaten var. `comments.replySheetTitle` artık kullanılmıyor, silinmedi.

## Testler
`run-comment-redesign.mjs` (11 Gönder çerçevenin içinde; 12 telefonda satır içi yanıt + düğmeler kutunun altında + taşma yok), `run-detail-pages.mjs` 3b, `run-comment-extras.mjs` (seçiciler
`[data-comment-id] textarea`). Derleme GIPHY anahtarıyla alınmalı (README). Gerçek cihazda/gerçek Supabase'e karşı denenmedi.

## Açık
- Kenarlık `border-strong`; form alanı kuralı `--p-control-border` (≥3:1) ister, kullanıcı mockup'taki tonu onayladı.
- Klavye açıkken telefonda kutunun altındaki Gönder/Vazgeç satırı klavyenin altında kalabilir (tarayıcının odak kaydırmasına güveniliyor); gerçek cihazda bakılmalı.
