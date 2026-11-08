# 357 — Telefonda "liste → alt sayfa" kalıbı (Yön C)

2026-11-08. Kullanıcı telefonda Yönetim'de ekip sekme menüsü + bölüm menüsü + süzgeç hapları alt alta (5 katman) gördü ve "başka çözüm sun, site genelinde tutarlılık yok, mockup sun" dedi. Üç yön mockup'ı hazırlandı (A: tek başlık + tek denetim satırı, B: kaydırmalı sekme şeridi, C: liste → alt sayfa); kullanıcı **C'yi** seçti. Bu not C'nin uygulanışıdır. Yalnız TELEFON (`< md`); masaüstü düzen değişmedi. Veritabanı değişikliği yok.

## Kural

İki seviyeli sayfalarda (Ekip, Topluluk, Yönetim bölümleri) bölümler bir **liste**dir; bir satıra dokunmak **alt sayfa**yı açar ve alt sayfa kendi geri çubuğunu çizer ("‹ Atölye Mor · Yönetim / Denetim günlüğü"). Aynı ekranda iki kontrol satırı (hap + hap) olmaz; hap/şerit yok. Liste sayfaları (Topluluklar, Ekipler, Spaces) "Sade" kalıbında kalır: büyük başlık + tek denetim satırı. Adres = bölüm (`?tab=`, `?section=`): geri düğmesi, paylaşılan bağlantı ve yenileme aynı yere döner.

## Parçalar

- `features/content/phone-sections.tsx`: `PhoneSubBar` (geri + iki satırlı başlık + sağda sayfanın eylemleri; `data-phone-subbar`, `data-phone-back`) ve `PhoneSectionList` (simge dairesi + ad + sağda sayı/rozet + ›; gerçek `<Link>`; `data-phone-section-list`, `data-phone-section=<anahtar>`). Yeni iki seviyeli telefon sayfası bunları kullanır, ikinci bir menü kalıbı yazılmaz.
- **Ekip sayfası** (`team-page.tsx`): `?tab=` yoksa (telefon) kök = geri bağlantısı + kimlik + "Ekip sohbetini aç" + bölüm listesi (Space'ler N, Kütüphane, Sohbet [okunmamış rozeti], Üyeler N, Panel, Yönetim); `?tab=x` varsa alt sayfa çubuğu. Masaüstünde `tab` yoksa hâlâ Space'ler açılır. Eski `ctx.sectionMenu` yuvası hep `null` (bölüm kodları geriye uyumluluk için okur).
- **Ekip › Yönetim** (`team-admin-section.tsx`): `?section=` yoksa bölüm listesi (Tehlikeli bölge kırmızı); varsa "Atölye Mor · Yönetim / Bölüm" çubuğu, geri Yönetim listesine döner. Denetim'in süzgeçleri tek satır kalır (Tüm olaylar · Son N gün · CSV).
- **Topluluk sayfası** (`community-page.tsx`): telefonda dev kapak bandı yerine kompakt kapak (64 px kare + ad + meta, `community-header-compact`); `?tab=` yoksa kök = kapak + "Sohbeti aç / Katıldın" + bölüm listesi (Akış, Etkinlikler, Üyeler [bekleyen istek rozeti], Hakkında, Yönetim); alt sayfada kapak ve eylem satırı yok, Akış'ın "+" yuvası alt sayfa çubuğunun sağında. **Yönetim** (`manage-tab.tsx`): liste → alt sayfa (Özet, Ayarlar, Sohbet odaları, Duyurular, Moderasyon, İşlem geçmişi).
- **Ekipler listesi** (`teams-page.tsx`): telefonda Topluluklar ile aynı iskelet: büyük başlık + süzgeç hapı (Tümü / Yönettiklerim) + ara + "+".

## Bilinçli sınırlar / dürüst notlar

- Telefon kökünde Akış/Space'ler artık ilk ekran değil; bir dokunuş uzakta (mockup'taki seçim bu). Doğrudan bağlantılar (`?tab=feed`, bildirimler, `postHref`) alt sayfayı açar.
- Bölümden bölüme geçmek iki dokunuş (geri + yeni); sık gezilen sekmelerde (Space'ler ↔ Kütüphane) mockup'taki dezavantaj aynen geçerli. Gerekirse ileride Ekip kökünde son açılan bölüme kısayol eklenebilir.
- Ekipler listesindeki "Yönettiklerim" yalnız sahip/yönetici rolüne bakar; ara kutusu yüklenmiş ekiplerde ada göre istemcide süzer.
- Telefon/masaüstü ayrımı `useMediaQuery(max-width: 767.98px)`: ilk boyama (statik HTML) masaüstü düzeniyle gelir, hidrasyonda telefona geçer (kısa titreme olabilir; gerçek cihazda denenmedi).
- Spaces, Profil, Keşfet sayfalarına dokunulmadı (zaten tek menü hapı; ≤6 bölüm kuralı). Profil'in 9 bölümü ileride bu listeye taşınabilir — karar bekliyor.

## Test

- Birim 998/998; `tsc`, `lint`, `build` temiz.
- Ağ taklitli: `run-team-hub` (yeni senaryo 38–40: kök liste → alt sayfa → geri, Yönetim listesi → Denetim, Ekipler Sade başlık), `run-community-home` (yeni 28: kök liste, Akış alt sayfa, Yönetim → Ayarlar), `run-communities` 23 (telefon için liste yolu) ve 33b (imzalı URL beklemesi, yarış), `run-community-home` 26b telefon `tab=feed`.
- Çevirilerde yeni anahtar: `tm.filter.*` (TR+EN). Diğer metinler mevcut anahtarlar (`common.back` vb.).
- Gerçek Supabase / gerçek cihaz DENENMEDİ.
