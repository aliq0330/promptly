# 233 — Keşfet ve Profil: sade düzen (özellik eksiltmeden)

**Durum:** uygulandı (yalnız istemci kodu, migration yok). Ağ taklitli Playwright: `run-discover` 9, `run-feed-filters` 16, `run-profile-collections` 8 (2 yeni senaryo), `run-quotes` 12, `run-hscroll` 5, `run-search-notifications` 10, `run-spaces` 32 geçti. **Gerçek Supabase'e / gerçek telefona karşı denenmedi.** İngilizce karşılık: yeni metin yok, mevcut anahtarlar kullanıldı. Tasarım önce tuvalde çizildi (231/232 ile aynı kalıp); kullanıcı "Keşfet ve Profili yap" dedi, özellik eksiltilmedi.

## Ne değişti
- **`SectionMenu` genişledi** (`features/content/section-menu.tsx`): satır başına `icon`, `meta` (sönük bilgi sayısı — Profil gönderi sayıları; mavi `count` rozetinden/noktasından ayrı) ve `dividerBefore` (menüde gruplar arası çizgi). Spaces/Topluluklar çağrıları aynı kaldı.
- **Keşfet** (`SectionNav variant="menu"`, `discover-feed.tsx`): 11 sekme yerine tek kontrol satırı **"Tümü ▾"** · Filtre · Kart/Izgara. Menüde içerik grubu (Tümü · Promptlar · İstekler · Workflow'lar · Hazır ayarlar · Spaces · Alıntılar), çizgi, takip edilecekler (AI araçları · Etiketler · Yaratıcılar · Topluluklar). Tür çipleri ve sıralama Filtre penceresine taşındı (pencerede zaten vardı; masaüstündeki satır içi tür çipleri/sıralama seçici kalktı). Yükselen etiket/kategori çip satırı, "Bu hafta popüler" şeridi, `xl` sağ sütun, entity bölümlerinde süzgeçsiz görünüm, katlanan çubuk aynı. Üstteki arama kutusu zaten seçili bölümü aradığı için kontrol satırına ayrıca arama simgesi eklenmedi.
- **Profil** (`profile-view.tsx`, `profile-toolbar.tsx`): sekme satırı yerine **"Promptlar ▾"** menüsü; üç grup: içerik (Promptlar · Prompt İstekleri · Workflow'lar · Hazır Ayarlar · Alıntılar, sayılarıyla) · kütüphane (Spaces · [yalnız sahibine: Taslaklar · Kaydedilenler · Beğeniler] · [ziyaretçide: Koleksiyonlar]) · Hakkında. Satırın sağında Promptlar/Beğeniler listesinde Filtre simgesi (tür · sıralama · uzun listede arama, aynı `ListFilterSheet`), Kart/Izgara simgesi (Promptlar, Beğeniler, İstekler, Workflow'lar). `ProfileToolbar` satırı ve `ProfileTabs` kalktı (`ProfileFilterControl` ile `ProfileTabKey` `profile-view.tsx`'te).

## Eksiltilmeyenler (kasıtlı)
Tüm bölümler ve sahip/ziyaretçi ayrımı, sayılar, Albüm bandı, hikâye ve koleksiyon halkaları, Hakkında kenar sütunu, tür/sıralama/arama süzgeçleri, Kart/Izgara tercihi.

## Notlar
- Testlerde `role="tab"`/`tablist` seçicileri menü yardımcılarına taşındı (`run-feed-filters` `openSection`/`sectionNames`/`pickSort`, `run-quotes`, `run-spaces`, `run-search-notifications`); `run-hscroll` 4 artık profil menüsünü sınar (sekme satırı yok).
- `run-chat` 18/18b (232 sonrası topluluk sayfasında sekme seçicisi kalmıştı) menü okumasına taşındı; `run-chat` 38/38. Yük altında `run-feed-filters` 10 ve `run-focus-feed` 2 aralıklı zaman aşımı verebiliyor (yalnız koşuda geçiyor).
