# 433 — Ayarlar → Geliştirici sayfasının sadeleştirilmesi

**Neden:** sayfa masaüstünde ~4.600 px'lik tek bir uzun sütundu: sihirbaz, Chrome uzantısı (5 yükleme adımı + 8 kullanım + 6 gizlilik paragrafı), anahtar formu + listesi,
bağlı uygulamalar, Telegram (iki kart) ve belge bağlantısı alt alta. Erişim üç ayrı listedeydi (anahtarlar, bağlı uygulamalar, Telegram), her birinde farklı iptal yolu ve izin adı.
Kullanıcı mockup'ı (artifact) onayladı.

## Yeni yapı
- `/settings/developer` = **merkez**: "Bağlan" bölümünde dört kart (Yapay zekâ aracı, Chrome uzantısı, Telegram botu, Kendi kodum; her biri bir durum + bir eylem) ve tek **Erişimlerim** listesi
  + belge satırı. Telegram kartı yalnız bot tanımlıysa ya da bağlantı varsa görünür (eski davranış).
- Alt sayfalar (`/settings/developer/{ai,extension,telegram,api}`): mevcut bileşenler AYNEN taşındı (`ConnectWizard`, `ExtensionSection`, `TelegramSection`, `ApiKeysSection`);
  `SettingsSubpage` `backHref`/`backLabel` aldı ("← Geliştirici").
- **Erişimlerim** (`access-list.tsx`, `useDeveloperAccess`): OAuth izinleri (yapay zekâ aracı / "Promptly Chrome uzantısı" adıyla uzantı), API anahtarları (etkin + süresi dolmuş; iptal edilen listelenmez),
  Telegram bağlantıları, eski Supabase izinleri. Tek satır biçimi, üç izin etiketi **Okuma · Taslak · Etkileşim** (anlamları listenin üstünde BİR kez), kind'a göre mevcut iki adımlı geri alma metinleri.
  Yazma yolu değişmedi: her tür kendi RPC'sini kullanır; bir kaynak okunamazsa diğerleri yine görünür. Eski `ConnectedAppsSection` silindi.
- Anahtar sayfası artık yalnız form + tek seferlik anahtar gösterimi + "N / 10 etkin anahtar" sayacı; liste Erişimlerim'de.
- Uzantı sayfası: üç adım (İndir · Chrome'a yükle · Bağlan) + kapalı `<details>` "Nasıl kullanılır" ve "İzinler ve gizlilik" (metin silinmedi, yalnız gizlendi).
- Metinler: yeni `devSettings.hub.*` / `devSettings.perm.*` / `devSettings.access.*` (TR+EN); "Bağlı uygulamalar'dan geri al" gönderen yerler (OAuth onay ipucu, uzantı giriş ekranı, sihirbaz bitiş notu) "Erişimlerim"e çevrildi.

## Testler
Ağ taklitli UI: `run-settings` (merkez + her kartın alt sayfası + yer tutucu/ham anahtar denetimi), `run-api-keys` (form sayfası + listenin merkezde görünmesi, iptal, süresi dolan,
okunamayan liste), `run-oauth`/`run-oauth-connect` (Erişimlerim satırları), `run-extension-card` (3 adım, kapalı bölümler), `run-telegram-settings` (alt sayfa yolu). Gerçek Supabase'e karşı denenmedi.
