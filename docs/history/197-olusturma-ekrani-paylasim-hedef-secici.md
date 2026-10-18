# 197 — Oluşturma ekranlarında "Nerede paylaşmak istiyorsun?" hedef seçici

**Durum:** uygulandı (yalnız istemci kodu, veritabanı değişikliği yok). Ağ taklitli Playwright'ta sınandı; gerçek Supabase'e / oturuma / telefona karşı denenmedi.

## Neden
Kullanıcı, `/create?mode=…` sayfalarındaki paylaşım alanında (Görünürlük + Taslağa kaydet / Paylaş) bir hedef seçici istedi: varsayılan "Genel akış"; dokununca üye olunan topluluklar; seçilen topluluğun adı ve logosu görünsün; "Paylaş" içeriği seçilen hedefe göre hazırlasın.

> Not: ilk deneme yanlış yere (Ana Sayfa'daki paylaşım girişine) uygulandı; kullanıcı istemedi, `c30dc10` geri alındı (`ab21b06`). Ana Sayfa eski hâlinde.

## Yapılan
- `features/content/share-destination-field.tsx` (yeni): `ShareDestinationField` — etiket + seçici düğmesi (Genel akış → `Globe`; topluluk → `GroupAvatar` + ad + görünürlük ipucu) ve `Modal` içinde liste (telefonda bottom sheet): önce "Genel akış", altında "Topluluklarım" (`listMyCommunities("member")`; kapatılmış topluluklar listelenmez). Yükleniyor / hata + tekrar dene / boş durum ("Topluluk bul" → `/communities/all`). `useDestinationBlock`: seçilen topluluğun gerçek gönderi kuralı (yalnız yönetim paylaşır / kapatılmış) okunur; engel varsa "Paylaş" pasif + açıklama (yetki yine sunucuda).
- `CreateFormActions` (ortak alt alan; Prompt, İstek, Workflow, Hazır Ayar hepsi) seçiciyi Görünürlük kartının üstüne koyar; `hideDestination` ile düzenleme modunda (`?edit=`) gizlenir — yayınlanmış içerik taşınmaz.
- Seçim ikinci bir form/akış kurmaz: mevcut topluluk bağlamı (`?community=`) mekanizmasının üzerine biner. `community-return.ts`'te seçim paylaşılan küçük bir depoda (`pickCreateDestination` / `resetCreateDestination`, `useSyncExternalStore`); `useCommunityContext` ve `useCommunityReturn` seçimi adres parametresine tercih eder. Böylece form yeniden kurulmaz, yazılan içerik korunur. Topluluk seçilince 179'daki kurallar aynen geçerli: içerik topluluğa özgü, görünürlük/taslak yok, bant gösterilir, yayın `community_id` ile kaydedilir, yayından sonra topluluk akışına dönülür. Genel akış'a dönünce eski davranış.
- Topluluk sayfasından gelen `?community=<id>` bağlantısı seçiciyi o topluluk (ad + logo) seçili açar ve Genel akış'a çevrilebilir. Ekrandan çıkınca seçim atılır.

## Çeviri
İngilizce karşılıklar EKLENDİ: `home.destination.*` (etiket, genel akış, ipuçları, Topluluklarım, boş durum, topluluk bul, yükleme hatası). Diğer metinler mevcut anahtarlardan.

## Sınama
`tests/messaging-ui/run-create-destination.mjs` 10/10: varsayılan Genel akış; liste yalnız üye olunan kapatılmamış topluluklar; topluluk seçince ad/logo + görünürlük/taslak kalkar + yayın `community_id` ile + yazılan içerik korunur; Genel akış'a dönüş `community_id` göndermez; kapalı topluluk ipucu; yalnız-yönetim topluluğunda pasif Paylaş; `?community=` ile açılış ve dört formda da seçici; boş durum; 390px; İngilizce. Bağlı süitler çalıştırıldı (sonuçlar raporda). Düzenleme modundaki gizleme ayrı bir test senaryosuyla sınanmadı.
