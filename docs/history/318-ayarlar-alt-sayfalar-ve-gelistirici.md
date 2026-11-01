# 318 — Ayarlar: ana liste + alt sayfalar, güncel Geliştirici sayfası

> **Durum:** repoda, testli (ağ taklitli). Canlı site GitHub Pages ile merge sonrası yayınlanır. Veritabanı/Edge Function değişikliği YOK.

## Neden
`/settings` tek uzun sayfaydı (altı grup, hepsi alt alta; yan menü sayfa içi bağlantılarla kaydırıyordu). Telefonda çok uzundu ve Geliştirici bölümü (anahtarlar, bağlı uygulamalar) neyi nasıl yapacağını anlatmıyordu;
ayrıca eski metinler artık YANLIŞTI: "uçlar henüz yayında değil" (uçlar canlıda) ve `/developers`'ta "claude.ai sabit başlık gönderemez, anahtarı yapıştırma" (canlıda "Oturum açma yok" + `Authorization: Bearer pmt_…` ile çalıştığı doğrulandı).

## Ne yapıldı
- **Ana liste** `/settings`: altı kategori satırı (Hesap · Gizlilik · Tercihler · Geliştirici · Yasal · Tehlikeli bölge; moderatöre Moderasyon satırı) + Çıkış yap. Her satırın tek satırlık açıklaması var; ayrıntı alt sayfalardadır.
- **Alt sayfalar** (hepsi `RequireAuth` altında, "← Ayarlar" bağlantısı, `SettingsSubpage` iskeleti): `/settings/account` (kullanıcı adı, e-posta, şifre) · `/settings/privacy` (mesaj izni + engellenenler; `/settings/blocked` geri bağlantısı artık Gizlilik'e gider) ·
  `/settings/preferences` (görünüm, dil, tanıtım turu) · `/settings/developer` · `/settings/legal` (iki bağlantı) · `/settings/danger` (hesabı sil). İş mantığı olduğu gibi taşındı (aynı doğrulamalar, aynı çağrılar); e-posta onay dönüşü `/settings/account`.
- **Ortak parçalar** `features/settings/settings-ui.tsx` (`SettingsSubpage`, `SettingsGroup`, `SettingsCard`, `SettingsLinkRow`, `settingsLabelClassName`) ve `components/ui/code-block.tsx` (`/developers`'taki kopyalanabilir blok oraya taşındı; iki sayfa aynı bileşeni kullanır). Yeni bir ayar sayfası bunları kullanır.
- **Geliştirici sayfası** (`features/settings/developer-settings.tsx`): (1) «Yapay zekâ aracına bağla» rehberi — ANAHTARLA (önerilen, doğrulanmış): anahtar oluştur → bağlayıcı ekle → adres (kopyalanabilir, `NEXT_PUBLIC_SUPABASE_URL`'den) → «Oturum açma yok» → başlık adı `Authorization` → değer «Bearer», boşluk, anahtar
  (Bearer'ı unutma uyarısı: kullanıcı ilk denemede unuttu) → Ekle; ardından OAuth «deneysel» notu (claude.ai'da henüz güvenilir değil, takılırsa anahtar yolu); (2) «Anahtarlarım»; (3) «Bağlı uygulamalar»; (4) Geliştirici belgeleri bağlantısı.
- **Eski metinler düzeltildi:** `apiKeys.preview` ("uçlar henüz yayında değil") kaldırıldı; `/developers`'ta «claude.ai başlık gönderemez / anahtarı yapıştırma» yerine güncel anlatım, OAuth bölümü «deneysel» etiketli; `/developers` → `/settings/developer` bağlantısı.
- **İngilizce karşılıkları eklendi** (`translations-settings.ts`, `translations-api-keys.ts`).

## Bilinen sınırlar
- Bildirimlerdeki "yeni API anahtarı / yeni uygulama bağlandı" SQL cümlelerinin hedefi `/settings`'tir (ana liste); doğrudan Geliştirici'ye değil (hedef SQL'de, değiştirmek migration ister).
- Eski `/settings#settings-developer` bağlantıları ana listeyi açar (sayfa içi bağlantılar kalktı).
- Geliştirici rehberi claude.ai'ın arayüz adlarını anar ("Bağlayıcılar → Özel bağlayıcı ekle"); arayüz değişirse metin eskir. ChatGPT'de anahtar yolu DENENMEDİ, rehber onu iddia etmez.

## Test
UI `run-settings.mjs` 12/12 (yeni: ana liste, her satır, geri bağlantısı, hesap doğrulaması, gizlilik, dil, yasal, silme kilidi, Geliştirici rehberi, kopyalama, İngilizce, telefon taşması, eski bağlantı); güncellenen `run-api-keys` 12/12, `run-oauth` 12/12, `run-oauth-connect` 15/15, `run-developers` 15/15, `run-legal-notice` 14/14. Birim 762/762, tsc/eslint/build temiz.
