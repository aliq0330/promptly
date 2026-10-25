# 234 — Tür listeleri, konu sayfaları, Kaydedilenler/Koleksiyon, Bildirimler, Mesajlar: sade düzen (özellik eksiltmeden)

**Durum:** uygulandı (yalnız istemci kodu, migration yok). **Gerçek Supabase'e / gerçek telefona karşı denenmedi.** İngilizce karşılık eklendi (`saved.myCollections`, `notifications.categoriesAria`, `messages.sectionsAria|requestsBanner|requestsOpen|requestsEmpty`; diğer metinler mevcut anahtarlar). Tasarım önce tuvalde çizildi (231–233 ile aynı kalıp); kullanıcı "hepsini yap" dedi.

## Ne değişti
- **Ortak `ListControlRow` + `SadeTitle`** (`features/content/list-control-row.tsx`): büyük başlık + tek kontrol satırı — bölüm menüsü (`SectionMenu`) · arama simgesi · Filtre (paylaşılan `ListFilterSheet`) · Kart/Izgara · "+" · sayfaya özel `trailing` simgeler. Her denetim isteğe bağlı.
- **Tür listeleri** (`/prompts`, `/requests`, `/workflows`, `/presets`; `ContentListPage`): `Tümü ▾` tür menüsü (Tümü · Görsel · Metin · Ses · Video), arama simgesi chip'li gelişmiş arama kutusunu açar, "+" oluşturma. Eski açıklama + "nasıl çalışır" adımları ve sayfaya özel süzgeç (istek durumu) Filtre penceresinin bölümleri oldu; eyebrow/`mobileTabs` kalktı.
- **Konu sayfaları** (`TopicPage`): `SectionNav variant="menu"` (233) — bölüm menüsü + Filtre + Kart/Izgara; tür çipleri yalnız Filtre penceresinde.
- **Kaydedilenler ve koleksiyon detayı** (`CollectionEntryList`, ikisi de aynı liste): tür menüsü (yalnız birden çok tür varken, sayılarla) · arama simgesi (alanı açar, ✕ kapatır) · Kart/Izgara; `/saved`'e "Koleksiyonlarım" rafı eklendi (kendi koleksiyonları, her biri kendi sayfasını açar). Filtre/"+" simgesi eklenmedi: süzülecek başka bir şey ya da "+" eylemi yok.
- **Bildirimler**: `Tümü ▾` kategori menüsü (okunmamış sayılar rozet; düğmede nokta), "tümünü okundu say" ve "hepsini sil" simgeleri (aynı onay penceresi); gün grupları aynı. `NotificationCategoryFilter` kalktı.
- **Mesajlar** (`ConversationsPane`): `Sohbetler ▾` menüsü — Sohbetler · Mesaj istekleri (sayaçlı) · Arşiv (sayılı) · çizgi · Yıldızlı mesajlar (`/messages/starred`) · Topluluk sohbetleri (`/communities`); arama simgesi alanı açar, "+" yeni sohbet. Mesaj istekleri artık listenin üstünde bölüm değil: bekleyen istek varken sohbet listesinin üstünde tek satırlık banner (Spaces'in davet kartı gibi) ve menüde ayrı görünüm; aramada istekler ayrı başlıkla yine aranır. Geri oku kalktı (menü geri döndürür).

## Eksiltilmeyenler (kasıtlı)
Tüm türler/süzgeçler/sıralama/arama/Kart-Izgara, "nasıl çalışır" adımları, istek durumu süzgeci, tüm bildirim kategorileri + okundu/silme, mesaj istekleri/arşiv/yıldızlı/topluluk girişleri, sohbet paylaşım akışı (`sharePromptId` vb.).

## Notlar
- Test uyarlamaları: `run.mjs` (Arşivlenenler/Sohbetler menü satırları, istek banner'ı + Mesaj istekleri görünümü), `run-chat` 11, `run-communities` 20, `run-search-notifications` 1/1b (bildirim menüsü; satır adı okunmamış sayıyı içerir, bu yüzden başı eşleşir). Yeni senaryolar: `run-feed-filters` 18 (tür listesi), `run-profile-collections` 9 (Koleksiyonlarım rafı).
- Aralıklı senaryolar: `run-feed-filters` menü tıklaması hidrasyondan önce düşebiliyordu (`openMenu` yeniden dener); `run-communities` 33b (kapak imzalı adres), `run-focus-feed` 2 yük altında aralıklı zaman aşımı veriyor — bu değişiklikten bağımsız.
- Bilinçli sapmalar: Kaydedilenler/koleksiyon satırında Filtre ve "+" simgesi yok (süzülecek başka şey / eylem yok); Mesajlar'da arama kutusu artık simgeyle açılıyor.
