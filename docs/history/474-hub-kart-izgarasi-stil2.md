# 474 — Topluluklar · Ekipler · Spaces ana sayfaları: "Stil 2 · Kart ızgarası"

**Durum:** uygulandı (kod). Kaynak mockup: Design tuvali "Topluluklar, Ekipler ve Spaces sayfaları · yeni arayüz" (üç sayfa × üç stil × masaüstü/tablet/telefon); kullanıcı 2. stili (Kart ızgarası) seçti.

## Ne değişti
`/communities`, `/teams`, `/spaces` aynı Hub iskeletini kullanır (`src/features/hub/hub-kit.tsx`); iskelet mockup'a göre yeniden çizildi:
- **Bant** (`HubBand`): simge karosu YOK; büyük başlık (`text-h1`, telefonda üst çubuktaki adla aynı olduğundan gizli) + 15 px açıklama + tek birincil düğme (`HubCreateButton`: tam etiket, telefonda açıklamanın altında 44 px tam genişlik; "kısa etiket" kalktı).
- **Sekmeler** (`Tabs variant="hub"`): 44 px metin sekmesi, seçili olanın altında koyu 2 px çizgi, turuncu sayaç YALNIZ bekleyen iş olan sekmede (Davet ve başvurular, Davetler, Senden bekleyenler). Eski `variant="underline"` ve öteki varyantlar değişmedi.
- **Kontrol satırı** (`HubControls`): solda sayı ("N topluluk"), arama kutusu (yazdıkça listeyi süzer; Topluluklar'da Enter tüm topluluklarda arar, eski davranış), "Yalnız yeni" süzgeç çipi (`HubFilterChip`). Eski `HubControlRow` kalktı.
- **Kart** (`HubCard`): kapak sabit 150 px (telefonda 132), gövde sabit 112 px: başlık · tek satır açıklama · alt satır (solda küçük özet, sağda TEK eylem düğmesi 36 px). Sol üst tür/rol/görünürlük etiketi, sağ üst "N yeni" / "2 onay" rozeti (+ ⋮ menüsü). `href` verilmezse (davet kartı) başlık düz metindir.

## Sayfalara göre
- **Topluluklar:** etiket = görünürlük (Açık · Kapalı), rozet = görmediğin gönderi (yoksa okunmamış mesaj) + bekleyen başvuru, alt satır "480 üye · Yönetici", eylem = mevcut üyelik düğmesi (Katıl · İstek gönder · Katıldın ▼). "Yalnız yeni" = görmediğin gönderisi / okunmamış mesajı / bekleyen başvurusu olan. Yönettiklerim sekmesi artık sayaçsız.
- **Ekipler:** sekmeler Ekiplerim · Davetler (kart kart, Kabul et / Reddet) · Senden bekleyenler (kart kart). "Tümü | Yönettiklerim" bölümlü seçici "Yönettiklerim" çipine döndü. Etiket = rolün, rozet = bekleyen onay ya da okunmamış sohbet, alt satır "8 üye · 3 proje", sohbet kısayolu + "Aç".
- **Spaces:** "Yeni bir Space başlatın" karoları tek satırlık (renk işareti + ad). Etiket = tür, rozet "Yeni" (`spaceIsNew`: hiç açmadığın ya da son açışından sonra değişen), alt satır "14 öğe · Sahip", eylem "Aç". Filtre/sırala penceresi ve ızgara/liste anahtarı korundu (kontrol satırında "Yalnız yeni"nin yanında).

## Bilinçli farklar (mockup ↔ site)
- Kartlarda ⋮ menüsü korundu (kopyala/şikâyet, Space'te yeniden adlandır/arşivle/ayrıl/sil); mockup'ta yoktur ama işlev kaybolmasın diye sağ üstte rozetin yanındadır.
- Kapakta mockup'taki düz renk + baş harf yerine gerçek kapak (topluluk görseli, Space kolajı, ekip rengi + im) durur.
- Topluluk kartında yayın/etkinlik/çevrimiçi sayıları kalktı (topluluk sayfasında); yazar/son düzenleme satırı Space kartından kalktı.
- Gönderiler/Keşfet/Davetler sekmelerinin içeriği (gönderi akışı, öneri şeridi, davet formu) kendi bileşenleridir; yalnız üstündeki bant/sekme/kontrol satırı yeni iskelettir.

## Çeviri
`hub.filter.onlyNew`, `hub.search`, `hub.open`, `hub.badge.*`, `hub.items`, `hub.count.posts`, `tm.home.invitesTab`, `tm.todos.kind.*` — TR + EN eklendi; `hub.*.createShort` kalktı.

## Testler
- Güncellendi: `run-community-shelf` (düğme bantta tam genişlik, kapak 132/150 + gövde 112 px; başlık telefonda gizli olduğundan konumlar açıklamadan), `run-communities` (arama kutusu hep açık), `run-spaces` (arama kutusu hep açık; kalkmış "Herkese açık" sekmesi), `run-team-hub` (Davetler sekmesi + şerit, "3 yeni" rozeti, açıklama, `[data-hub-search]`).
- `tests/messaging-ui/mock.mjs`: `rpc/list_spaces` boş-yanıt kısa devresi `mock-spaces.mjs`'in kendi `list_spaces`'ini eziyordu (Akış 2.1'den beri Spaces ana sayfa senaryoları kırıktı); artık `db.extraRoutes` önce dener.
- Bilinen, bu işle ilgisiz kırık senaryolar: `run-communities` 13b/22, `run-spaces` 30 (klavye penceresi arka planı, 471'den kalma), `run-community-home` 28 (ekran görüntüsü yolu ortamı).
