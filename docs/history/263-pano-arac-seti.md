# 263 — Space panosu araç seti: akıllı kılavuzlar, çoğalt / kopyala-yapıştır, mini harita, pano içi arama

**Durum: uygulandı (repoda). Yalnız istemci kodu — migration YOK, veritabanı değişmedi.** 262'deki ok/bağlantı özelliğinin üstüne, "pano en gelişmiş panolardan biri olsun" isteğinin şema gerektirmeyen kısmı.

## Ne eklendi
- **Akıllı kılavuzlar** (`lib/space-guides.ts`, saf + birim testli): sürüklerken taşınanların birleşik kutusu diğer nesnelerin kenarına / ortasına (6 ekran pikseli içinde) yakalanır; turuncu (`bg-secondary`) kılavuz çizgisi o hizadaki nesnelerin üzerinden geçer, bırakınca kalkar. **Alt basılıyken kapalı** (grid yakalama da kapanır). Izgara yakalamanın üstüne biner.
- **Çoğalt / kopyala-yapıştır** (`lib/space-clipboard.ts`, saf + birim testli): seçim çubuğunda "Çoğalt", ⌘/Ctrl+D, ⌘/Ctrl+C / V (her yapıştırma 32 birim daha kayık). Kopyayla birlikte seçilenler arasındaki **oklar** da kopyalanır; kopya gruba girmez, en üste konur, workflow kaynak işareti geçmez (kopya "Güncelle"nin yönettiği nesne olmaz), iliştirilmiş not yalnız hedefi de kopyalanıyorsa bağlı kalır. Tek adımda geri alınır / yinelenir (`import` geçmiş girdisi).
- **Mini harita** (`board/board-minimap.tsx`): bütün panonun özeti + görünen alan; dokunup sürükleyerek gezilir. Tercih `localStorage` (`promptly-board-minimap`, yalnız bu tarayıcı); `sm` altında (telefon) gizli, araç çubuğu düğmesi de yok.
- **Pano içi arama** (`board/board-search.tsx`): ⌘/Ctrl+F ya da araç çubuğu; başlık / metin / not ve çözülmüş başlıkta arar; Enter ileri, Shift+Enter geri, sayaç "2/5", "Sonuç yok", Esc kapatır; bulunan nesneyi seçip görünümün ortasına alır. Görüntüleyici de arayabilir (yalnız görünümü değiştirir).

## Bilinçli sınırlar (neden bazı şeyler yok)
- **Yalnız not ve taslak prompt çoğaltılabilir.** Veritabanında Space başına tekil dizinler var: aynı görsel dosyası (`space_items_unique_image`), aynı yayınlanmış prompt, aynı içerik, aynı palet. Bunları çoğaltmak depolamada dosya kopyalamayı ya da kuralı gevşetmeyi gerektirir; atlanır ve sayısı bildirilir ("N nesne çoğaltılamaz").
- Kopyala-yapıştır pano İÇİNDE (aynı Space, aynı sekme) çalışır; sistem panosuna yazmaz ve başka Space'e taşımaz.
- **Yapılmadı (şema ister, ayrı iş):** nesne kilitleme, serbest çizim / şekil (dikdörtgen, daire) ve metin kutusu nesneleri, oka yol bulma, nesne yorumları. Bunlar yeni `space_items.kind` değerleri / sütunlar ve migration gerektirir; ister misin diye ayrıca sorulur.
- Mini harita nesneleri tek renkli kutu olarak çizer (görsel/küçük resim yok); `lowDetail` zoom'unda da aynı.
- Gerçek Supabase'e / gerçek dokunmatik cihaza / iOS Safari'ye karşı denenmedi (arayüz ağ taklitli).

## Doğrulama
- Birim: `space-guides.test.ts` (6), `space-clipboard.test.ts` (4); `npm test` 539/539.
- Playwright `run-space-board-tools.mjs` 11/11: kılavuz çıkar ve hizalanır / Alt'ta yok, Çoğalt düğmesi (kopya + ok yazılır, tek adımda geri al/yinele), Ctrl+D ve Ctrl+C/V (32/64 kayık), görsel çoğaltılamaz (açıklayıcı hata), izleyici çoğaltamaz, mini harita (görünür, haritaya basınca kayar, tercih hatırlanır), arama (Ctrl+F, ortalama, ileri/geri, sonuç yok, Esc, izleyici), İngilizce, telefon. Etkilenen paketler geçti: `run-space-connectors` 15, `run-workflow-space` 28, `run-spaces` 32, `run-hscroll` 5.
- `npx tsc --noEmit`, `npm run lint` (0 hata; var olan 10 uyarı), `npm run build` temiz.
- **İngilizce karşılıklar eklendi** (`translations-space-connections.ts`).
