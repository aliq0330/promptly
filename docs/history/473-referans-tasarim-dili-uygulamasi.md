# 473 — Referans tasarım dilinin tüm siteye uygulanması

Kaynak: `docs/design-references/substack-tasarim-dili.md` (ölçümler), tuval U1–U7 / G1–G5, plan `docs/design-references/uygulama-plani.md`.

## Kararlar (kullanıcı)
- Mockup'ta olan yer mockup'taki gibi, olmayan yer substack.com gibi; kenar yarıçapları kullanıcının gönderdiği ekran görüntüsündeki gibi (kontrol 10, kart 12–16, pencere 20).
- Renk ve yazı tipi de değişir: turuncu `#ff6719` vurgu, nötr gri yüzeyler, sistem yazı tipi + Spectral okuma gövdesi.

## Yapılanlar
- `globals.css`: renk/radius/yazı/odak tokenları, `--shadow-focus`, `--shadow-btn`, `--color-primary-text`, `--color-focus`; `fonts.css`: DM Sans + Bricolage kalktı, Spectral eklendi.
- `text-primary` → `text-primary-text` (571), odak halkaları → `ring-focus`/`outline-focus`/`border-focus`.
- Ortak bileşenler (Button, IconButton, Chip, Field, Tabs, ChoiceGroup, floating katmanlar, DialogShell, Badge, SearchField).
- 827 `rounded-full` sınıflandırıldı (betik: kontroller/ikon düğmeleri/etiketler dönüştü, 336 avatar/nokta/anahtar/çubuk kaldı), kontrol benzeri `rounded-md/lg/xl` 188 yerde 10 px oldu.
- Marka varlıkları yeni renkte yeniden üretildi (ikonlar, favicon, og, manifest).
- Ekip/Topluluk/Space oluşturma: telefonda tam ekran sayfa + `md+` pencere (`CreatePageShell`, `/…/new` rotaları).
- Mesajlar kind segmenti, Bildirimler düz satır, detay eylem düğmeleri, Ayarlar 600 px, Spectral okuma metni.

## Bilinçli sapma
Beyaz üstü `#ff6719` düğme metni 2.9:1 (AA 4.5 altı): referansla birebir; test bunu belgeler, başka hiçbir küçük metin çifti 4.5'in altına düşmez.

## Ek (474): ayar sayfası düzeni (referans "Settings" sayfası)
Kullanıcının paylaştığı yayıncı ayarlar sayfasındaki desen ortak parçalara alındı (`features/settings/settings-ui.tsx`): bölüm kartı = başlık (+ soluk açıklama) + ince ayırıcı + aralıklı gövde (`SettingsCard`, `SettingsSectionHead`, `SETTINGS_SECTION_*`), satır metni = kalın başlık + soluk açıklama (`SettingText`), düz anahtar satırı (`SETTING_SWITCH_ROW_CLASS`), bağlı alt ayar = sol çizgiyle girintili (`SettingNested`), alan etiketi kalın (`settingsLabelClassName`). Uygulandı: tüm `/settings/*` sayfaları (kart başlığı), Bildirimler ve Aramalar'da düz anahtar satırları, Aramalar'da girintili tarayıcı bildirimi izni + cihaz seçici etiketleri, Topluluk → Yönetim → Ayarlar kartları, Ekip → Yönetim ilke kartları. Yapı (kategori listesi + alt sayfalar, 318) DEĞİŞMEDİ: tek uzun sayfa + sayfa içi arama yapılmadı.
