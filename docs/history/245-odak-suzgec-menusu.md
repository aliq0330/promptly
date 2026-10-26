# 245 — Odak: tek süzgeç menüsü + yukarı kaydır = Bilgi; Ana Sayfa'ya içerik türü süzgeci

**Durum:** uygulandı (yalnız istemci kodu, migration yok). Ağ taklitli Playwright'ta sınandı (`run-focus-feed`, `run-feed-filters`), birim testleri `focus-feed.test.ts`. **Gerçek Supabase'e / gerçek telefonda (iOS Safari dokunmatik dikey/yatay kaydırma) / gerçek fare-trackpad'e karşı denenmedi.**

## Neden
239'da Odak'a eklenen "dikey kaydırma = bölüm" (Tümü · Prompt · İstek · Workflow · Hazır ayar) şunlar yüzünden zayıftı: (1) soldaki yazısız noktaların ne yaptığı belli değildi; (2) alttaki "Bilgi ⌃" düğmesinin doğal hareketi (yukarı çek) ile çelişiyordu; (3) tür seçimi Ana Sayfa/Keşfet'te çip/menü, Odak'ta hareketti; (4) üst çubuk + şerit + noktalar ekranı kalabalıklaştırıyordu, her bölüm ayrı sunucu sorgusuydu. Taslak (artifact) üzerinde "Şimdi / Önerilen" karşılaştırıldı, kullanıcı önerilen düzeni onayladı; küçük resim şeridinin de küçültülmesini istedi. Aynı turda Ana Sayfa'nın Filtre penceresine içerik türü (Görsel · Metin · Ses · Video) süzgeci istendi.

## Yapılan
- **Tek süzgeç çipi** (`features/focus/focus-filter-menu.tsx`): üst çubukta "Tümü · En yeni ▾". Menüde **Gönderi türü** (Tümü · Promptlar · İstekler · Workflow'lar · Hazır ayarlar) ve **Kaynak** (En yeni · Takip Ettiklerim) `menuitemradio` olarak, ikonlu ve yazıyla. İki akış kapsülü (`FocusTabs`) kalktı. Seçim sunucu sorgusunu değiştirir (`feed_page` `p_kinds` / `p_scope`), önceki gibi her tür kendi başlangıcından açılır. Esc önce menüyü kapatır.
- **Yukarı kaydır = Bilgi**: dokunmatikte baskın dikey yukarı hareket (> 60 px ya da hızlı) etkin gönderinin Bilgi sayfasını açar; klavyede ↑ / k. Aşağı çekme, tekerlek ve ↓ artık hiçbir şey yapmaz (tür değiştirmez). Bilgi sayfası kendi tutamacından/X'ten/Esc'den kapanır (değişmedi).
- **Kalkanlar**: soldaki bölüm noktaları (`FocusChannelRail`), bölüm adı balonu (`ChannelToast`), `focusChannelStep` (lib + testi). `FOCUS_CHANNELS` kaldı (menü listesi).
- **Küçük resim şeridi küçüldü**: telefonda adım 3 rem → 2,25 rem (küçük resim 28 px, etkin olan ~2,4 rem), şerit yüksekliği 4,75 → 3,5 rem; `md`+'da 4 → 3 rem, 5,75 → 4,25 rem. Slayt üst boşluğu (`SLIDE_TOP`) ve yükleme iskeleti buna göre 9,25 → 8 rem (md: 10,75 → 9,25 rem); kart bu kadar büyür.
- **Ana Sayfa → Filtre → "İçerik türü"** (`feed-tabs.tsx`): Tümü · Görsel · Metin · Ses · Video (`TaxonomyTypeChips`; mevcut anahtarlar). `feed_page` ve `for_you_page` zaten `p_content_type` alıyordu, **migration yok**. İki görünümde (Sana özel, Takip Ettiklerim) ortaktır, gönderi türü çipleriyle birlikte AND'lenir; Filtre düğmesi sayacına girer, "Temizle" sıfırlar; süzgeç boş sonuç verirse "Bu filtrelere uyan paylaşım yok" + "Filtreleri temizle". Kategori / alt kategori Ana Sayfa'da yine yok.
- Çeviri: `focusFeed.filter`, `focusFeed.source` eklendi (TR+EN), `focusFeed.keyboardHint` güncellendi, `focusFeed.channels` silindi. Ana Sayfa için yeni anahtar yok.

## Bilinçli sınırlar
- İçerik türü süzgeci sunucuda her gönderi türüne uygulanır (istek/hazır ayar kendi `content_type`'ı, workflow `content_types`'ı üzerinden); Ses/Video seçilince sonuç az olabilir.
- Odak'ta içerik türü (Görsel/Metin/Ses/Video) süzgeci YOK (yalnız Ana Sayfa'ya istendi); Odak'ın "Medya" anahtarı ⋮ menüsünde.
- Üst çubukta çip + tür etiketi + kaynak etiketi dar ekranda `truncate` olur (en uzun hâl "Hazır ayarlar · Takip Ettiklerim"); gerçek 360 px cihazda denenmedi.
- Dokunmatik yukarı kaydırma eşiği 239'daki bölüm eşiğiyle aynı (60 px / 0,5 px/ms); gerçek parmakla ayarlanmadı.
