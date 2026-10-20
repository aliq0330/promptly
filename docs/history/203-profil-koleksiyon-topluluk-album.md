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

**İkinci tur — aynı dilin yayıldığı diğer yerler** (kullanıcı: "Önerdiğin kalan yerlere de yap"):
- **Sonuç sayfası** (`result-detail-view.tsx`): detay sayfalarıyla aynı `DetailShell` — bant sonucun görselinden (video/seste kapak) renk alır; kapak = sonucun kendisi (görsel, oynayan video, ses kapağı + oynatıcı; metin sonucunda simge, metin içerik sütununda); büyük **Promptu aç**; Beğeni · Yorum · Paylaş · ⋮; yan sütunda "Bu sonuç hangi promptla oluşturuldu?". `DetailArt` artık `onOpen` olmadan da çizilir (ışık kutusu olmayan kapak).
- **Etiket sayfası** (`tag-view.tsx`): kapak = etiketin en çok beğenilen 4 gönderisinin kolajı (`CollageArt`, koleksiyonla ortak — `detail-parts.tsx`'e taşındı), "ETİKET", büyük `#etiket`, kullanım sayısı; büyük **Takip Et** (etiket takibi) + Paylaş.
- **Kaydedilenler** (`saved-items-view.tsx`): koleksiyonla aynı bant — son kaydedilenlerin kolajı, "SADECE BEN · N çalışma".
- `DetailShell` yan sütun verilmeyince içerik tam genişlik kullanır (etiket, Kaydedilenler).
- **Kartlar** — `CardBandBackdrop` (`content-card.tsx`, gönderi kartının bant arka planı dışarı açıldı) ile: topluluk kartı ve "Sana uygun topluluklar" şeridi (bant topluluk görselinden, köşeli görsel + kategori + büyük ad; altında üyelik düğmesi + sayılar), koleksiyon kartı (bant kapaktan, kapak çerçeveli, büyük ad), yaratıcı kartı (bant avatardan; altında büyük **Takip Et** + takipçi).
- **Haftalık tema** (`weekly-challenge-banner.tsx`): küçük bant — kupa karosu, "HAFTALIK TEMA", büyük başlık, kalan süre, büyük **Katıl**.
- **Keşfet vitrini** (`discover-highlights.tsx` → `PopularHero`): "Bu hafta/ay popüler"in 1 numarası şeridin başında görselinden renk alan bant (kapak, büyük başlık, yazar + beğeni, **Kopyala**); şerit 2. sıradan devam eder.
- **Workflow "Adım adım"** (`workflow-runner.tsx`): her adım küçük bir bantla açılır (adım türü karosu, "ADIM 1 / 2", büyük başlık); Önceki/Sonraki düğmeleri büyük.
- **Workflow "Akış"** (`workflow-flow.tsx`, üçüncü tur): her adım kartı aynı küçük bantla açılır — bant adımın bağlı içeriğinin küçük resminden renk alır; kapak = o küçük resim (köşesinde adım numarası) ya da numara karosu; "ADIM 1 · PROMPT", büyük başlık, açıklama, bağlı içerik; altında Girdi / Çıktı kutuları ve adımlar arası "Çıktı aktarılıyor" bağlantısı değişmedi. `CardBandBackdrop` `as="span"` alır (bant bir `<button>`'un içinde).

**Dördüncü tur — Odak (`/focus`, "Şimdi çalıyor"; kullanıcı tasarım tuvalinde A'yı seçti):** video/ses dışındaki her gönderi (`focus-feed-slide.tsx` → `AlbumSlide`) Odak'ın zaten var olan bulanık arka planının üstünde albüm kapağı gibi durur — görsel kırpılmadan, yuvarlak köşeli ve derin gölgeli (`AlbumArtImage`); görseli olmayan prompt kendi metniyle, workflow/hazır ayar/istek kendi yapısıyla yükseltilmiş bir kartta (`AlbumArtCard`). Altında tür · araç, büyük başlık, açıklama, yazar ve TEK satır eylem: büyük beyaz **Kopyala** (metni olan prompt; kullanım sayar) ya da **Ayrıntıları aç**, yanında aynı Beğeni · Yorum · Kaydet · Paylaş (`FocusFeedRail layout="row"`; telefonda sayılar yalnız ekran okuyucuya), altında küçük "Promptu incele" / "Ayrıntıları aç". Telefon ve tablette kapak üstte, `lg`+ kapak solda + yazılar sağda. Video/ses de aynı düzende: yazarın çıktısı kapağın İÇİNDE oynar (`AlbumArtFrame` — afişin oranında, yoksa video 16:9 / ses kare; kutu kapsayıcı birimleriyle `[container-type:size]` boşluğa sığdırılır; oynat/duraklat ve ilerleme çizgisi kapağın üstünde). Üst çubuk ferahlatıldı (kullanıcının gösterdiği örnek): 44px yuvarlak ✕ ve ses düğmeleri, arada iki akış tek cam kapsülde (`FocusTabs`, seçilen sekme kendi simgesiyle öne çıkar); telefonda "Medya" süzgeci ses düğmesinin hemen altına iner. Telefonda yorumlar açılınca kapak yorum sayfasının üstüne sığdırılır (sığıyorsa küçülmez, yalnız kayar — `run-focus-feed` 18 buna göre güncellendi). Yeni çeviri anahtarı yok.

Çeviri: yeni anahtarlar TR + EN (ikinci tur: `result.kicker`, `result.openPrompt`, `tag.kicker`, `tag.actionsAria`; ilk tur: `profile.actionsAria`, `collection.kicker`, `collection.actionsAria`, `collection.updatedAgo`, `collection.aside.*`, `collection.typeFilterAria`, `collection.typeCommunityPosts`, `communities.band.actionsAria`); "Yaratıcı" ve "Topluluk" için var olan `profile.creatorLabel` / `groups.page.eyebrow` kullanıldı.

## Sınırlar
- Topluluğun kapak fotoğrafı artık bandın kendisi değil, üstündeki şerit; bant fotoğrafın bulanık tonunu alır.
- Bant rengi görselin bulanık hâlinden gelir; çok açık/koyu görsellerde ton zayıf kalabilir.
- Haftalık temanın bandı marka tonundadır (temanın kendi görseli yok).
- Sonuç, etiket, Kaydedilenler ve "Adım adım" için otomatik arayüz testi yok; ağ taklitli ekran görüntüleriyle bakıldı.
- Gerçek Supabase'e, gerçek cihaza ve gerçek fotoğraflara karşı denenmedi.
