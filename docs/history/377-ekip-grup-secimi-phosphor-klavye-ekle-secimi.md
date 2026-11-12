# 377 — Ekip: çoklu seçim + Gruba ekle (Yön C), Phosphor Regular ikonlar, klavye düzeni, Ekle seçimi, kaynak hatası

Tarih: 2026-11-12 · Durum: uygulandı (kodlandı; gerçek Supabase/cihaz DENENMEDİ) · Önceki: 375 (ekip nesne grupları), 376 (Ekle), 343 (Solar ikonlar, KALKTI)

Kullanıcı üç yönlü mockup'tan **C**'yi seçti ve beş iş istedi.

## 1. Eklenen öğeler gruba eklenemiyordu → Yön C

- Eski durum: ekip dosyası listesinde öğeyi gruba atamanın tek yolu yoktu (çekmecede yalnız grup ROZETİ vardı; seçici yalnız `ItemDetailModal` düzenlemesindeydi), "Grupları yönet" ayrı düğmeydi, grup çipleri satırı taşıyordu.
- Yeni (mockup C): dosya listesinde **"Seç"** düğmesi (ya da karta uzun basma, `useLongPress`) seçim kipini açar; kartlarda onay işareti, altta sabit çubuk: `X · N seçili · Tümünü seç · Gruba ekle` (telefonda alt menünün üstünde). **`GroupAssignDialog`** (`features/teams/group-assign.tsx`) gruplar karo olarak (ad + öğe sayısı), "Grupsuz" (gruptan çıkar) ve "Yeni grup" (aynı pencerede grup açıp seçer); "Grupları yönet" pencerenin altında bağlantı. Öğe çekmecesinin ⋮ menüsüne **"Gruba ekle"** (aynı pencere, tek öğe) eklendi.
- Grup süzgeç çipleri tek kaydırmalı satır; sondaki "+ Grup" çipi grup oluşturma/yönetme penceresini açar. Eski "Grupları yönet" düğmeleri (masaüstü + telefon) kalktı.
- Grup değişikliği asıl öğeye yazılır (`patchItem(id, { groupId })`); pano yansımalarının grubu ayrı kalır (376).
- **Yapılmadı:** mockup'taki toplu "Panoya ekle" ve toplu "Sil" eylemleri (yetki/onay kuralları öğe başına; tek öğe menüsünde mevcut).

## 2. Tüm site Phosphor Regular

- `scripts/build-icons.mjs` artık `@iconify-json/ph` (Phosphor Icons, MIT) okur; `@iconify-json/solar` kaldırıldı. 251 bileşen adı AYNI kaldı (`Heart`, `X`, `Search`…), prop'lar aynı (`size`, `className`; `strokeWidth` artık etkisiz — kalınlık sabit Regular). Tek istisna **Play/Pause**: `fill` verilince Phosphor Fill gövdesine geçer (`FILL_VARIANTS`). `Loader2` kendi halkamız.
- Duotone/Linear ayrımı, `icon-solid` ve `icon-accent` (turuncu ikinci ton) **kalktı**. Etkin/seçili durum bir RENKTİR: seçili sekme/yapılabilir `text-primary` (alt menü ve kenar çubuğu), "senin olan" `text-heart`.
- `components/ui/motion-icons.tsx`: şekiller Phosphor'a çevrildi. 256'lık şekil 24'lük `viewBox` içinde `<g transform="scale(.09375)">` (`Ph`) ile çizilir; böylece `globals.css`'teki `.mi-*` hareketleri değişmedi. Çöp, zil, ev, odak çizgi parçalarıyla (kalınlık 16/256 = Phosphor Regular) kuruldu; yer imi ve raptiye Regular ↔ Fill gövdesi.
- Atıf: Kullanım Koşulları'ndaki ikon satırı Phosphor MIT'ine çevrildi (TR+EN). `icons.test.ts` Phosphor atfını/MIT'i, barrel yokluğunu, güncellik ve "iki ad aynı ikon" kuralını denetler.
- Bazı eşlemeler yaklaşıktır (Phosphor'da birebir yok): `ImagePlus → image-square`, `PackagePlus → cube`, `Blocks → puzzle-piece`, `MessageCircleHeart → chat-centered-dots`, `Podcast → broadcast`, `Swords → sword`. Daha iyi karşılık görülürse `ICON_MAP`'te değişir.

## 3. Klavye açılınca alt kısım bozukluğu (site geneli)

- `KeyboardState` (kök layout): görünür alan klavye eşiğinden fazla küçülmüş VE odak bir yazma alanındaysa `html[data-keyboard-open]` (saf karar `lib/keyboard-open.ts`, birim testli). `globals.css` bu öznitelikle `< lg`'de alt menüyü, ayrıntı sayfasının eylem satırını ve `data-keyboard-hide` taşıyan her şeyi gizler — klavyenin üstünde asılı kalıp alt sayfanın altında bulanık şerit olarak görünmezler.
- `Modal`: klavye açıkken arka plan bulanıklığı (`backdrop-blur`) ve alt güvenli alan dolgusu kalkar (kart klavyeye yapışır); odaktaki yazma alanı kartın kaydırılan gövdesinde `scrollIntoView` ile görünür tutulur.
- **Sınır:** bu, ekran görüntülerinden çıkarılan bir okumadır; gerçek iPhone/Safari'de (özellikle iOS 26 adres hapı + form aksesuar çubuğu) DENENMEDİ — bu ortamda ekran klavyesi açılamaz.

## 4. "Ekle" seçimi

- Dosya "Ekle" penceresi ve pano araç çubuğu: her tür (Prompt, İstek, Workflow, Ayar paketi) **tek satır**. Dokununca ekranın ORTASINDA küçük pencere (`ContentAddChoice`): **Oluştur** (gerçek oluşturma ekranı) / **Seç** (iki sekmeli seçici). `Modal`'a `centered` eklendi (telefonda da ortada, sürükleyerek kapanmaz).

## 5. "Kaynak artık erişilemiyor" (yenileyince düzeliyordu)

- Neden: `SpaceProvider` kaynakları yalnız ilk yüklemede ve `addItems` ile getiriyordu; `setItems` ile dışarıdan gelen yeni öğeler (dosyaya içerik ekleyince yeniden okuma) kaynaksız çiziliyordu. Düzeltme: `items` her değiştiğinde eksik kaynaklar tamamlanır (`loadedRefs` yineleneni atlar). Test (`run-team-projects` 32e) düzeltme olmadan KIRMIZI, ile yeşil.

## Testler

Birim: `keyboard-open.test.ts` (5), `icons.test.ts`. Ağ taklitli: `run-team-projects` 55/55 (yeni 32e, 45b, 45c; 14/32b/32c güncellendi), `run-team-board` 23/23, `run-team-hub` 42/42. i18n: `tf.select.*`, `tf.group.*`, `tf.add.kind*`/`choice*` — Türkçe + İngilizce eklendi.
