# 482 — Ayar ve yönetim sayfaları: eksiklerin tamamlanması + telefon/tablet/masaüstü tutarlılığı + /settings

481'in «bilinen sınırlar» listesinin tamamı kapatıldı; envanter ve durum `docs/ayar-sayfalari-eksikler.md`'dedir.

## Ne yapıldı
- **Her boyutta AYNI yapı.** Topluluk Yönet, Ekip Yönetim, Topluluk Üyeler → Davetler, Topluluk Hakkında → Bildirim tercihleri, Space Üyeler ve ekip üyesi sayfası artık
  `phone` koşuluna bağlı DEĞİL: kök bir bölüm LİSTESİdir, satır `?section=` alt sayfasını açar (telefonda tam ekran sayfa, tablet/masaüstünde aynı gövde okuma sütunu,
  alt formlar `SxSub` ile pencere). `SxPage` md+'da da başlık çubuğu çizer (geri + üst ad + başlık + eylem); kök listelerde (`root`) ve sekmenin altındaki bölümlerde çubuk yok.
  Eski md+ bileşenleri (SectionMenu + kartlar, çip satırı + iki sütun, Space üyeler sekmesi, Topluluk ayar/duyuru/moderasyon/özet/geçmiş, grup ayarları/davetleri, ekip admin bölümleri) SİLİNDİ.
- **Mockup'ta olmayan yüzeyler aynı dilde yazıldı:** Topluluk Özet · Duyurular (+ yayınla/düzenle formu, silme onayı) · Moderasyon (+ karar onayı) · İşlem geçmişi (`manage-sx-content.tsx`),
  Yasaklılar listesi + yasağı kaldırma (Davetler sayfası), odaları yukarı/aşağı sıralama (Sohbet odaları), Ekip Gruplar (liste · ayrıntı · form · silme) ve Dışa aktar (`teams/admin-sx-more.tsx`),
  kanal «kim yazar» (kanal ayarları), dosya «başka yere kopyala» (dosya ayarları, `CopyItemsDialog` telefonda tam ekran), Space «Space'ten ayrıl».
- **Adres + geri tuşu:** proje/dosya/pano ve Space ayarları `?dlg=` (Space ikinci düzey `?sdlg=`) ile açılır (`lib/use-url-dialog.ts`): açmak geçmişe adım ekler, kapatmak `replace`; geri tuşu sayfayı kapatır.
- **/settings:** `settings-ui.tsx` ortak iskeleti yeni dile geçti (geri oku + üst ad + başlık, büyük harfli bölüm etiketi + kenarlıklı kart, `SettingsLinkCard` ile çizgili satır listesi). Hub, account, privacy,
  notifications, calls, preferences, developer (+ alt sayfalar), legal, danger, blocked hepsi bunu kullanır. Stil `ayar-kit.css` `sx-set-*` — `.sx` kökünü KULLANMAZ (sıfırlamalar içerideki Button/Input/ChoiceGroup'u bozmasın).

## Kural
- Yeni ayar/yönetim yüzeyi telefon/md+ ayrı yazılmaz: `SxPage` (+ `root`) / `SxSub` ile TEK gövde; yeni /settings sayfası `SettingsSubpage` + `SettingsCard`/`SettingsLinkCard` kullanır.
- Telefonda tam ekran sayfa olması gereken bir pencere `SpaceDialog page` ya da `SxSub` olur.

## Test durumu
run-team-hub 43/43 · run-settings 14/14 · run-team-projects 60/61 · run-rooms 32/34 · run-spaces 28/30 · run-communities 56→(16b/16c düzeltildi)/68. Kalan kırmızılar `docs/ayar-sayfalari-eksikler.md` madde 29'da listeli (eski DOM'a bağlı topluluk/grup senaryoları; yeniden yazılmalı).
Mockup karşılaştırması: 33 sayfa 0 fark; B1/D6/E2'ye eklenen yeni satırlar mockup dosyalarına da işlendi.

## Bilinen sınırlar
- Dosya ayarlarındaki «Pano grubu» / «Panoları sırala» ve kanal ayarlarındaki «Üyeler» satırları yalnız sayfayı kapatıp ilgili yüzeye döndürür (ayrı bir düzenleme ekranı yok).
- Mockup'ta olmayan yüzeylerin telefon görünümü mockup'la piksel karşılaştırılmadı (mockup'ı yok); ölçü/dil aynı kit'ten.
- Gerçek Supabase'e/gerçek cihaza KARŞI DENENMEDİ; ağ taklidi + Chromium (390/768/1280 px).
