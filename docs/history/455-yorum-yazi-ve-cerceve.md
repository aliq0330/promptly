# 455 — Yorum metni büyük/kalın, çerçeveler belirgin

454'ün üstüne kullanıcı isteği: yorum bölümündeki yazılar kalın ve büyük, yorum/yanıt çerçeveleri daha belirgin.

- Yorum metni `text-body` → `text-h3 font-semibold` (`comment-node.tsx`); yazma/yanıt kutusundaki yazı da aynı (`comment-composer-box.tsx`, ipucu metni normal ağırlıkta kalır). Kalınlık `font-semibold` (DM Sans 600): tasarım kilidi `font-bold`'u yalnız başlıklara bırakır.
- Yazma/yanıt kutusu kenarlığı `border-strong` → `border-control-border` (form alanı kuralı, ≥3:1); yorum kutuları (`BUBBLE_CLASS`) `border-soft` → `border-strong`.
- Odak'ın yorum sayfası (`layout="sheet"`) bu değişikliğe girmedi.
- Test: `run-comment-redesign.mjs` 13'ün seçicisi yeni kenarlık sınıfına güncellendi. Gerçek cihazda denenmedi.
