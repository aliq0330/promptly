# 476 — Ekip · Topluluk · Space bantlarının mockup'a hizalanması

Kaynak: öneri tuvali (`Ekip-Genel`, `Topluluk-Oneri`, `Space-Genel` tahtaları; 390 / 820 / 1440). Karar (kullanıcı): telefondaki bant mockup'taki gibi olsun; birincil düğme bantta uygun yere konsun; mockup'ta olup sitede eksik kalan yerler tamamlansın.

## Ortak bant (`features/hub/hub-kit.tsx` → `HubDetailBand`)
- **Telefon (`< md`):** bant üst çubuğun hemen altında kenardan kenara akar, köşesiz (`HUB_BLEED_CLASS` / `HUB_BLEED_TOP_CLASS`: sayfa kabuğunun kenar boşluğu `sm` altında 12, `sm`–`md` arasında 24 px olduğundan iki ayrı negatif boşluk). Üstte kare kapak + başlık + tek satır alt bilgi, altında (varsa) serif açıklama, en altta TAM GENİŞLİK birincil düğme + yanında ⋮. Sekmeler de kenardan kenara ve bandın hemen altındadır (`HUB_PHONE_TABS_CLASS`; ilk sekmenin yazısı bant içeriğiyle 16 px'te hizalanır).
- **`md+`:** kapak solda (`artSize` `sm` = Ekip 80/104 px, `lg` = Topluluk 88/120 px; köşe boyutla büyür), ortada etiketler (`kicker`) · başlık · alt bilgi · açıklama · üye yüzleri (`faces`), sağda eylemler + ⋮ AYNI kapsayıcıda (`data-hub-band-actions`). Eylem sütunu `md`'de en çok `max-w-sm`, başlık sütunu en az `12rem` (yönetici + bekleyen istek gibi çok düğmeli durumda başlığı ezmesin; `xl`'de sınır kalkar).
- **Geri oku YOK** (mockup): dönüş yan menü / üst çubuk / tarayıcıdadır. `HubDetailBand`'ın `backHref`/`backLabel`/`backAttrs` özellikleri kalktı; Space'in kendi başlığı (`SpaceHeader`) telefonda geri okunu korur (mockup'ta da var).
- Kapak çerçevesi (beyaz kenarlık + gölge) kalktı; `TeamMark` yeni `fill` özelliğiyle kapsayıcıyı doldurur (duyarlı boyut).

## Ekip (`team-band.tsx`)
- Birincil düğme **«Ekip sohbetini aç»** (`data-team-open-chat`). **«Davet et» ⋮ menüsüne taşındı** (`data-team-invite-header`, yalnız `manage_members`); Üyeler sekmesindeki davet formu aynen durur.
- Alt bilgi: «N üye · açıklama · rol» (telefon/tablet) ya da «N üye · açıklama · N proje» (`lg+`; rol etiket satırında). Etiket satırı (`md+`): Ekip · Yalnızca davetle · rol. Üye yüzleri (`md+`, en çok 5; beşincisi yalnız `xl`) + «+N».

## Topluluk (`community-page.tsx`)
- Büyük (48 px) birincil düğme: üyede «Sohbeti aç», üye olmayanda «Katıl / İstek gönder» (`CommunityJoinButton` yeni `phoneFill`; `DropdownMenu` yeni `className`). ⋮ düğmesi 48 px (`HUB_BAND_MENU_BUTTON_LG_CLASS`).
- Telefonda etiket satırı yok: görünürlük (ve «Kapatıldı») alt satıra («Herkese açık · 12 üye · 3 çevrimiçi») taşınır. Bu JS ile (`useMediaQuery`) ayrılır, aynı metin iki kez DOM'a girmez (testler `getByText` strict mode). Bantta üye avatar yığını kalktı (mockup'ta yok); gönderi sayısı `md+`'da.

## Space (`space-header.tsx`, `space-page.tsx`)
- Genel bakış bandı telefonda kenardan kenara; «N öğe» etiketi telefonda yok (sayı çipleri altta); serif açıklama telefonda küçük.

## Ekip Genel bakış (`team-projects-section.tsx`) — mockup'ta olup eksik kalanlar
- «+ Yeni proje» ikincil küçük düğme (mockup `btn sm sec`); proje kartı = Hub kartı (`HubCard`: kapak + «Proje» etiketi, başlık, açıklama, sayılar + «N onay bekliyor»; rol sağ üst köşede).
- «Senden bekleyenler» şeridi iki kart: ilk bekleyen karar/değişiklik («… onay bekliyor» · dosya · «+N daha» · «Aç») ve `md+`'da okunmamış kanal kartı («# genel · 3 okunmamış» · Ekip sohbeti · «Aç»). Telefonda tek kart + küçük başlık. Eski «üç kart» şeridi kalktı (hepsi Onaylar sekmesinde).
- Yan sütun (`lg+`; tablette yok): **Üyeler · N** (ilk üç üye + rol + «+ N üye») ve Son etkinlik. «Kanallar» kartı kalktı (kanallar Sohbet sekmesinde ve şeritteki kartta).

## Mockup'tan sapmalar
- Başlık boyutu `text-h1` (32 px); mockup masaüstünde 36 px ama tip ölçeğinde ara değer yok.
- Mockup'taki sıfır/etiket renkleri sabit hex'tir; bant tonu ekibin kayıtlı rengidir (`BAND_TONE`, token).
- Proje kartında avatar yığını yok: `listProjects` kişi listesi döndürmüyor (yalnız sayı); sayı metni kullanıldı.
- Space tablet/masaüstü bandı 475'te yapıldığı gibi bırakıldı (mockup'la zaten uyumlu).

## Testler
`run-team-hub` 15 (birincil düğme + menüde Davet et + geri oku yok) ve 38 (telefon bandı: kenardan kenara, düğme + ⋮ aynı satırda, sekmeler hemen altında) yeniden yazıldı; `run-community-home` 28 (geri oku yok, ⋮ düğmenin yanında); `run-spaces` 33 (telefonda etiketler + kenardan kenara). Bu işte yakalanan hata: tablette yönetici + bekleyen istekte eylem düğmeleri başlığı sıkıştırıyordu (`run-groups` 16) — yukarıdaki `max-w-sm`/`12rem` kuralı.

Kalan kırmızılar bu değişiklikten ÖNCE de kırmızıydı (aynı paketler önceki derlemeyle koşturuldu): `run-spaces` 30; `run-communities` 13b, 22; `run-team-projects` 32b, 45i; `run-groups` 4, 20, 24, 26, 27; `run-chat` 15, 18, 18b; `run-rooms` 1, 14. Yük altında dalgalananlar (tek başına geçer): `run-community-home` 4, `run-rooms` 11d/12f, `run-nav-layout` 6. Gerçek Supabase'e / cihaza karşı DENENMEDİ (ağ taklitli Playwright + birim testleri); İngilizce karşılıklar eklendi (`tc.over.*`, `build-i18n` çalıştırıldı).
