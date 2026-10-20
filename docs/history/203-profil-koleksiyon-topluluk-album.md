# 203 — Profil, koleksiyon ve topluluk sayfaları: Albüm

**Durum:** uygulandı (yalnız istemci kodu, veritabanı/migration YOK). Ağ taklitli Playwright'ta sınandı; gerçek Supabase'e / gerçek cihaza karşı denenmedi.

## Neden
Detay sayfaları (`201-*`) ve gönderi kartları (`202-*`) Albüm diline geçtikten sonra kullanıcı aynı dilin profil, koleksiyon ve topluluk sayfalarında nasıl duracağını sordu; tasarım tuvalinde masaüstü + telefon örnekleri gösterildi, kullanıcı "Yap bunları" dedi.

## Yapılan
Üç sayfa da detay sayfalarının parçalarını kullanır (`features/content/detail-parts.tsx`), ikinci bir bant/başlık bileşeni yazılmadı:
- `DetailBand` iki seçenek kazandı: `align="center"` (telefon/tablette metin kapağın altında ortalı; `lg`+ yanında sola hizalı) ve `before` (bandın üstünde kenardan kenara çizilen öğe — topluluğun kapak fotoğrafı).
- `BandActionRow` + `BAND_PRIMARY_CLASS`: bandın altındaki eylem satırı — sayfanın TEK büyük birincil düğmesi, ikincil düğmeler, sağda ⋮. Detay sayfalarının `DetailActionBar`'ından farkı: etkileşim simgeleri yok.
- `ContentGridColumns` (`content-card.tsx`): yanında yardımcı sütun olan sayfa, altındaki BÜTÜN `ContentGrid`'lerin sütununu bir kez belirler (`sm:columns-2`) — profilin sekmeleri ayrı bileşenlerdir ve her biri kendi ızgarasını çizer.

**Profil** (`profile-view.tsx`, `profile-header.tsx` → `ProfileBand`, `profile-actions.tsx`, yeni `profile-aside.tsx`):
- Bant avatardan renk alır (avatar yoksa marka tonu); kapak = büyük avatar (hikâye halkası ve kendi profilinde kalem korunur), "YARATICI · ilk ilgi alanı", büyük ad, @kullanıcı, sayılar, biyografi, ilgi alanı/rozet çipleri.
- Eylem satırı: başkasının profilinde büyük **Takip et** + Mesaj gönder + Paylaş + ⋮; kendi profilinde büyük **Profili düzenle** + Paylaş + Ayarlar. Takipçi sayısı ve düğme tek `useFollowState` örneğini paylaşır (artık `ProfileView`'da).
- Öne çıkan hikâyeler + koleksiyon halkaları sekmelerin üstünde (her genişlikte); `lg`+ sağda "Hakkında" sütunu (web sitesi, katılma, ilgi alanları) — o genişlikte "Hakkında" sekmesi yalnız katkı haritasını gösterir.

**Koleksiyon** (`collection-detail-view.tsx`, yeni `collection-band.tsx`, `collection-aside.tsx`):
- Kapak = ilk dört içeriğin hareketsiz görselleri 2×2 kolaj (tek görsel tüm karoyu doldurur; görsel yoksa simge karosu); bant ilk görselden renk alır. Video/ses dosyası görsel sayılmaz.
- "KOLEKSİYON · Herkese açık/Sadece ben" (+ Varsayılan rozeti), büyük ad, sahip · çalışma · takipçi · güncellenme.
- Eylem satırı: başkasının herkese açık koleksiyonunda büyük **Takip et**, sahibinde büyük **Koleksiyonu düzenle** + ⋮ (düzenle/sil); herkese açıksa Paylaş.
- Listenin üstünde tür çipleri (Tümü / Promptlar / Workflow'lar / Hazır Ayarlar / Topluluk gönderileri, sayılı; yalnız birden çok tür varsa) — `CollectionEntryList` ortak olduğu için `/saved`'da da görünür.
- Yan sütun: Hakkında (oluşturan, oluşturulma, çalışma, gizlilik, takipçi) + sahibinin diğer herkese açık koleksiyonları (gerçek liste, `fetchPublicCollectionsByOwner`; boşsa çizilmez). "Takip edenler" ve "Benzer koleksiyonlar" tasarımda vardı ama veri kaynağı yok — eklenmedi.

**Topluluk** (`community-page.tsx`):
- Bant topluluğun kapağından renk alır (fotoğraf › renk › topluluk görseli; `CommunityCover` arka plan olarak); kapak fotoğrafı varsa ayrıca bandın üstünde keskin bir şerit olarak görünür. Kapak = büyük köşeli topluluk görseli; "TOPLULUK · kategori", büyük ad, görünürlük/üye yığını/üye sayısı/rol/kapatıldı rozetleri, açıklama (iki satır).
- Eylem satırı (`data-community-actions`): üyeye büyük **Sohbeti aç** (okunmamış sayısıyla) + "Katıldın ▾" menüsü + (yetkiliye) bekleyen istekler; üye olmayana büyük **Topluluğa katıl / Katılma isteği gönder**. "← Topluluklar" bağlantısı kaldırıldı (detay sayfalarında da yok; menüde Topluluklar var).
- Sekmeler, akış ve `xl`+ yardımcı sütun (`CommunityAside`) değişmedi.

Çeviri: yeni anahtarlar TR + EN (`profile.actionsAria`, `collection.kicker`, `collection.actionsAria`, `collection.updatedAgo`, `collection.aside.*`, `collection.typeFilterAria`, `collection.typeCommunityPosts`, `communities.band.actionsAria`); "Yaratıcı" ve "Topluluk" için var olan `profile.creatorLabel` / `groups.page.eyebrow` kullanıldı.

## Sınırlar
- Topluluğun kapak fotoğrafı artık bandın kendisi değil, üstündeki şerit; bant fotoğrafın bulanık tonunu alır.
- Bant rengi görselin bulanık hâlinden gelir; çok açık/koyu görsellerde ton zayıf kalabilir.
- Gerçek Supabase'e, gerçek cihaza ve gerçek fotoğraflara karşı denenmedi.
