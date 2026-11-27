# 474 — Topluluk · Ekip · Space öneri tasarımlarının uygulanması

Kaynak: öneri tuvali (6 tahta: Öneri özeti · Topluluk · Ekip Genel bakış · Ekip Onaylar · Space Pano · Space Genel bakış; 390 / 820 / 1440). Karar (kullanıcı): önerilen yönler mockup'taki gibi uygulansın. Tahta ilkesi: var olan Hub kalıbını (bant → sekmeler → içerik + yan sütun) koru, her sayfada yalnız eksik parçayı güçlendir.

## Space (`/spaces/local`)
- **Başlık = `SpaceHeader`** (`features/spaces/space-header.tsx`, `HubDetailBand` yerine): Genel bakışta TAM BANT — etiketler (tür · Özel · «N öğe»), büyük başlık, serif açıklama, avatar yığını (`useSpaceMembers`), tek büyük birincil «Panoyu aç», «Davet et» (yalnız `caps.manageMembers`; Üyeler sekmesine gider), ⋮ ve bandın ALT KENARINA yayılan 10 px ilk palet şeridi (dilimler HEX kopyalar, `tap-area`). Diğer sekmelerde TEK SATIR (geri · başlık · etiketler · avatarlar · Davet et · ⋮); telefonda geri + başlık + «tür · N üye» + ⋮. Kapak kolajı sanatı ve «sahip · düzenlendi» satırı kalktı (mockup'ta yok).
- **Genel bakış = koleksiyon duvarı** (`tabs/overview-tab.tsx`): görsel, prompt, not ve palet TEK karışık moodboard (CSS sütunları: telefon/tablet 2, `lg` 3), en çok 18 kutu + 2 palet, fazlası «Tümünü panoda gör». Görsel kutusu görselin oranında (0,7–1,4), prompt koyu mono blok, not rengiyle, palet renk kareleriyle. Yan sütun (`lg`+): Üyeler (ilk 3 + «+ N üye») ve Gruplar (ad · öğe sayısı). Telefonda duvarın üstünde sayı çipleri. «Kaldığın yerden devam», sayaç kartları ve son-X bölümleri KALKTI.
- **Sekmeler** simgesiz; sayılar Görseller · Promptlar · Notlar · Üyeler (Palet sayısı kalktı).
- **Pano:** tuval, tek satırlık başlıktan kalan alanı alır (`h-[calc(100dvh-15rem)]` telefon / `-11rem` `md+`). Pano mantığı değişmedi.
- `fetchSpacePerson` (sahip bilgisi) sayfa yüklemesinden çıktı: bant artık sahibi göstermiyor.

## Topluluk (`/communities/local`)
- **«Odalar ve etkinlik» şeridi** (`community-strip.tsx`): Akış'ta sekmelerin hemen altında tek satır — ilk 3 oda (varsayılan başta, okunmamış sayısıyla; dokununca `/messages/local?id=&room=`) + en yakın etkinlik (`FeedHighlights`'taki «Sıradaki etkinlik» kartı buraya taşındı). Telefonda yatay kayar, `md+` eşit dört kart. Odalar yalnız üyeye; hiçbiri yoksa şerit çizilmez.
- **Yan sütun:** «Hakkında ve kurallar» (kurallar + kuruluş tarihi) ve — durumu görünen çevrimiçi üye varsa — «Çevrimiçi» avatar yığını. «Yöneticiler» kartı kalktı (Üyeler sekmesinde).
- **Bant:** üye sayısı yanına «N çevrimiçi» ve gönderi sayısı eklendi.
- **Sıralama menüsü** (mockup'taki «Önerilen ▾»): akışta «En yeni» (varsayılan) ve «Popüler» (beğeniye göre, keyset: `like_count` + `created_at` + `id`). Mockup'taki «Önerilen» adı kullanılmadı: kişiselleştirilmiş bir sıralama sunucuda yok; menü yalnız gerçekten yapılan iki sırayı sunar. Sabitlenen gönderiler her zaman üstte.

## Ekip (`/teams/local`)
- **Genel bakış** DEĞİŞMEDİ (mockup'ta da aynen korunuyordu).
- **Onaylar sekmesi = liste + ayrıntı** (`team-approvals-section.tsx`, eski üç sütunlu pano yerine): solda Bana bekleyen · Gönderdiklerim · Karar verilen bölümlü liste (satır = durum etiketi + zaman, başlık, yazar · proje › dosya), sağda ayrıntı (içerik, `{değişken}` çipleri, karar notu, Onayla / Değişiklik iste / Öğeyi aç, Geçmiş). Tablette liste 300 px, masaüstünde 420 px. **Telefonda** yalnız liste; satıra dokununca `&decision=<satır>` ile tam ekran ayrıntı sayfası (`team-page` bant/sekmeleri gizler), karar düğmeleri alt menünün üstünde sabit (`data-keyboard-hide`), Geri listeye döner. Saf mantık `lib/team-center.ts` (`approvalRows`, `findApprovalRow`; birim testli).
- Karar notu satır içi alandır; not YALNIZ «Değişiklik iste»de kullanılır (sunucu onayda notu atar — `team_review_decide`), bu yüzden placeholder «Karar notu (değişiklik isterken zorunlu)».
- Mockup'tan sapmalar (veri yok): «Geçmiş» yalnız eldeki alanlardan (gönderildi · onaylandı/değişiklik istendi · öneri) kurulur — sürüm geçmişi yok; «Panoda göster» yerine «Öğeyi aç» (öğenin dosya/pano sayfası, orada «Panoda göster» var); eski «Tümünü onayla» listede küçük bir düğme olarak kaldı; proje süzgeç çipleri kalktı.

## Testler
`run-team-hub` 43–45 yeniden yazıldı (+44b telefon akışı), `run-community-home` 26b güncellendi (+26c şerit 1440/820/390, +26d sıralama), `run-spaces` 33 (Genel bakış 1440/820/390) + 33b (Pano kompakt başlık), `team-center.test.ts` (`approvalRows`/`findApprovalRow`), `communities.test.ts` (`communityRoomHref`). `mock-communities.mjs` `order=like_count` sırasını taklit eder.

Bu değişiklikten ÖNCE de kırmızı olanlar (`main`'de aynı derlemeyle doğrulandı, yeni hata değil): `run-spaces` 2, 19–22, 30–32; `run-communities` 13b, 22; `run-community-home` 4; `run-presence` 18; `run-workflow-space` 1, 6*, 9*, 10b; `run-groups` 4, 20, 24, 26, 27; `run-community-shelf` 1; `run-team-projects` 32b, 45i. Yük altında dalgalananlar (aynı paket tek başına yeşil): `run-nav-layout` 1/6, `run-community-posts` 3d/5/17, `run-team-projects` 9. Gerçek Supabase'e / cihaza karşı DENENMEDİ (ağ taklitli Playwright + birim testleri).
