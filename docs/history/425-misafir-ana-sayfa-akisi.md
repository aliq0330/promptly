# 425 — Misafir Ana Sayfa akışı

Sorun: oturumsuz ziyaretçi Ana Sayfa'da vitrinden sonra "Sana özel / Takip Ettiklerim" sekmelerini, hiçbir şey yapmayan bir Filtre simgesini ve "Sana özel akış için giriş yap" kutusunu görüyordu (iki sekme de oturum ister, `FeedTabs` misafire giriş çağrısı çiziyordu): vitrinin altında boş bir sayfa.

Çözüm (`features/feed/guest-feed.tsx`, yalnız istemci, migration yok):
- Ana Sayfa artık `HomeFeed`'i çizer: oturum çözülürken ya da oturumluyken eski `FeedTabs` (davranış DEĞİŞMEDİ, oturum geri yüklenirken iskelet), oturumsuzken `GuestFeed`.
- `GuestFeed` Keşfet'in "Tümü · Önerilen" sorgusunun aynısını okur (`useFeedPages`, `scope: all`, `order: recommended`; anon okuyabilir). Başlık "Popüler gönderiler", Sana özel/Takip/Filtre YOK; tek sessiz bant (`Banner`): "Üye ol: …" + Kayıt ol / Giriş yap (`?next=/`). Sayfalama `LoadMoreButton` (kendiliğinden yükler), hata → "Tekrar dene".
- Sana özel / Takip akışı misafir için hiç istenmez.
- `FeedTabs` içindeki eski misafir dalı (`needsLogin`) artık Ana Sayfa'dan erişilmez ama silinmedi (başka çağıran yok; ayrı temizlik).
- TR + EN metinler: `home.guestFeed*` (`translations.ts`).

Doğrulama: `tests/messaging-ui/run-feed-filters.mjs` senaryo 7 (misafir: sekme/Filtre yok, gönderiler, bant bağlantıları, `p_scope=all`/`p_order=recommended`, Sana özel/Takip çağrısı yok) ve 7b (İngilizce); `run-home-motion` (misafir vitrin) ve `run-first-run` yeşil. Gerçek Supabase'e karşı DENENMEDİ (anon `feed_page` okuması Keşfet'in zaten kullandığı yoldur).
