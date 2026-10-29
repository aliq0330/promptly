# 194 — Mobilde açık sohbette alt menü gizli

**Durum:** uygulandı (yalnız istemci kodu, veritabanı değişikliği yok). Ağ taklitli Playwright'ta sınandı; gerçek iPhone/Android'de DENENMEDİ.

## Ne değişti
- `components/layout/mobile-nav.tsx`: yol `/messages/local` ile başlıyorsa (açık bir konuşma ya da yeni sohbet taslağı — ikisi de bu rota) menü hiç çizilmez. Mesajlar LİSTESİ (`/messages`) ve yıldızlı mesajlar (`/messages/starred`) menüyü korur; geri dönünce menü geri gelir.
- `features/messages/local-conversation-view.tsx` ve `new-chat-draft-view.tsx`: mobilde sabit sohbet paneli artık `bottom-0` (önceden menünün üstünde `4rem + safe-area`). Composer alt boşluğunu zaten `max(0.75rem, safe-area)` ile kendisi taşır; klavye mantığı (`VisualViewport` → `bottom`) aynen çalışır, yalnız taban 0'dır. Masaüstü/tablet iki bölmeli düzen değişmedi.

## Sınama
`run-chat` yeni senaryolar: 19 (390px: listede menü var → sohbet açılınca menü yok, composer ekranın alt kenarında, yatay taşma yok → geri gelince menü var), 19b (yeni sohbet taslağı), 19c (masaüstü düzeni aynı). Çeviri: yeni metin yok.

## Açık
- iOS klavyesi + safe-area ile composer'ın gerçek cihazdaki konumu denenmedi (klavye mantığı sandbox'ta yalnız saf fonksiyonla sınanabiliyor).

## Ek: üst menü de gizli (telefon)
- `components/layout/header.tsx`: yol `/messages/local` ile başlıyorsa üst menü `< md`'de gizlenir (`max-md:hidden`); sohbet paneli (`local-conversation-view.tsx`, `new-chat-draft-view.tsx`) telefonda `top-0`'dan başlar, başlık satırı `env(safe-area-inset-top)` kadar ek üst boşluk alır. Tablet/masaüstü değişmedi.
- Sohbet başlığındaki arama düğmesinin kenarlığı kaldırıldı (yalnız hover/açık durumda dolgu). Grup sohbetindeki "Topluluğa git" düğmesi kenarlığını korur.
- Çeviri: yeni metin yok. Yalnız `tsc` + `lint` çalıştırıldı; Playwright ve gerçek iPhone'da DENENMEDİ.
