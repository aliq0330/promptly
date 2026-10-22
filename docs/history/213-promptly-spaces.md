# 213 — Promptly Spaces (yaratıcı çalışma alanları)

**Durum:**
- İstemci kodu ve `20260921130000_spaces.sql` repoda.
- Migration yerel PostgreSQL'de sınandı (`supabase/tests/spaces.sql` 59/59; diğer 20 SQL dosyası temiz veritabanında `FAILED=0`).
- Migration **canlıya UYGULANMADI.** İçeriği: yalnızca ekleyici (yeni tablolar, fonksiyonlar, politikalar, `space-media` bucket'ı), ayrıca `orphan_storage_objects` gövdesine iki kaynak eklenir. `drop` yok.
- **Önce migration, sonra istemci.** Migration olmadan `/spaces` "Spaces yüklenemedi" der ve "Space'e ekle" penceresi boş liste gösterir. Başka hiçbir sayfa etkilenmez.
- Arayüz ağ taklitli Playwright'ta sınandı. Gerçek Supabase'e, gerçek oturuma, cihaza ya da iOS Safari'ye karşı **denenmedi**.

Kullanıcının isteği: Promptly'ye Promptly Spaces adlı yeni bir yaratıcı çalışma alanı modülü. Ürün akışı: Keşfet → Space'e ekle → Düzenle → Geliştir → Paylaş. Studio, Canvas ve Lab adları bilerek kullanılmadı. Mevcut `/studio` (API anahtarıyla üretim) olduğu gibi kaldı.

## 1. Mimari kararlar

**Kopya değil, başvuru**
- Space'e eklenen Promptly içeriği kopyalanmaz.
- Görsel öğe, gönderinin görsel kimliğini (`prompt_media.url`) ve `prompt_id`'yi tutar. Prompt kartı yalnız `prompt_id`'yi tutar.
- Metin ve görsel her okuyucuya **kendi yetkisiyle** gelir: RLS ve Storage politikası. Kaynak gizlenir ya da silinirse öğe "Kaynak artık erişilemiyor" / "Kaynak gönderi silindi" yer tutucusuyla çizilir. Hiçbir yol artık okunamayan içeriği göstermez.
- Kaynak silinince `prompt_id` `on delete set null` ile boşalır. CHECK çakışması olmasın diye öğede kaynak zorunluluğu kısıtı yoktur.
- Başkasının görseli Space'e yeniden yüklenmez.

**Topluluğa ait içerik eklenemez**
- `community_id` dolu içerik, kendi topluluğunda bile Space'e eklenemez. İçerik topluluğun dışına çıkmaz.
- Kontrol iki katmanlı: sunucuda tetikleyici, istemcide PostMenu ve Odak.

**Okuma tek yerde: `can_read_space`**
- Okuyabilenler: üye; herkese açık ve arşivlenmemiş Space'te herkes; "bağlantıya sahip olanlar" ayarında bağlantıyı açmış oturumlu kullanıcı (bağlantı iptal edilmemiş olmalı).
- Engel iki yönlüdür: sahiple aranda engel varsa herkese açık ya da bağlantılı Space görünmez.
- Arşivlenen Space yalnız üyelere görünür ve herkes için salt-okunurdur (`can_edit_space`).

**Roller**
- owner: ayarlar, üyeler, paylaşım, arşiv, silme.
- editor: içerik, notlar, pano.
- viewer: yalnız okuma.
- `space_members` sahibi de tutar (tetikleyici ekler). İstemci üyelik yazamaz: davet, kabul, rol ve çıkarma hep RPC ile, sunucuda doğrulanır.

**Bağlantı (link)**
- Token SHA-256 özetiyle saklanır; ham hâli `create_space_link` ile **bir kez** döner. Space başına tek etkin bağlantı vardır, yenisi eskisini iptal eder.
- Bağlantıyla görmek **oturum ister**: Storage politikası token göremez. `open_space_link`, açan kullanıcıya hak kaydeder (`space_link_grants`). Hak, bağlantı iptal edilince ya da görünürlük değişince geçersizleşir.
- Görünürlük "bağlantı"dan çıkınca açık bağlantılar otomatik iptal olur. Geri dönmek eski bağlantıyı canlandırmaz.
- Açılış sayfası `/spaces/link#<token>`: token URL parçasındadır. Girişe yönlendirirken token sorguya konmaz, `sessionStorage`'da bekler.

**Gizli bilgi**
- Gizli notlar (`is_private`, yalnız not öğesinde), üye listesi ve etkinlik geçmişi yalnız üyelere görünür. Dışarıya hiçbir görünürlükte sızmaz.
- Paylaşım penceresi neyin yayımlanacağını açıkça yazar.

**Storage**
- PRIVATE `space-media` bucket'ı, yol `{space}/{uuid}.{jpg|png|webp}`, 10 MB, yalnız görsel.
- Okuma `can_read_space` ile; yükleme ve silme `can_edit_space` ile.
- Yükleme `image-processing.ts` üzerinden gider (ağır fotoğraf küçülür).
- `orphan_storage_objects` artık Space görsellerini ve kapaklarını "kullanımda" sayar. Gönderiye **başvuran** görsel öğeler sayılmaz: gönderi silinince dosyası yine süpürülür.

**Etkinlik geçmişi**
- Yalnız anlamlı değişiklikler kaydedilir: oluşturma, ad, görünürlük, arşiv, görsel/prompt/not/içerik ekleme ve kaldırma, palet, grup, davet, katılma/ayrılma, rol, bağlantı.
- Konum değişikliği yazılmaz.
- Aynı kişinin aynı işi 10 dakika içinde tek satırda birleşir (`count`). Space başına son 500 satır tutulur.
- Yazan yalnız tetikleyiciler ve RPC'lerdir (SECURITY DEFINER).

**Pano**
- Konumlar dünya birimindedir (viewport pikseli değil).
- Toplu kayıt `space_save_layout` ile yapılır (SECURITY INVOKER, RLS'ten geçer). Dönen dizi gerçekten güncellenen öğelerdir; başkasının sildiği öğe istemcide düşer ve kullanıcıya söylenir.

**Sınırlar**
- 200 Space/kişi, 500 öğe/Space, 50 grup, 30 palet, palet başına 24 renk, 50 üye.

**Tür ve şablon**
- Moodboard, karakter, marka, oyun dünyası, iç mekân ve serbest proje ayrı veri modeli değildir: `kind` etiketi artı başlangıç grupları.
- Grup adları oluşturma anında kullanıcının dilinde yazılır ve sonra kullanıcı içeriği gibi davranır.

**Grup**
- Grup hem Görseller'deki süzgeç hem panodaki çerçevedir. Çerçeve saklanmaz, üyelerin sınırından her çizimde hesaplanır.
- Grup silinince öğeler **silinmez**, gruptan çıkar (`on delete set null`). Onay penceresi bunu söyler.

**Gerçek zamanlı ortak düzenleme yok**
- Değişiklikler kaydedilir; başkalarının değişikliği yenileyince görünür. Üyeler sekmesinde açıkça yazar.
- Aynı öğeyi iki kişi taşırsa son kayıt kazanır.

## 2. Veri modeli (`20260921130000_spaces.sql`)

Tablolar:
- `spaces`, `space_members`, `space_invitations`, `space_groups`, `space_items`, `space_palettes`
- `space_activity`, `space_share_links`, `space_link_grants`, `space_user_state` (favori + son açılış)

Fonksiyonlar:
- Yetki yardımcıları: `space_role`, `can_read_space`, `can_edit_space`, `_space_media_space_id`, `_space_valid_upload_url`, `_space_valid_colors`
- İç işler: `_space_log` (birleştiren etkinlik), `_space_touch` ("son düzenleme"; 15 sn'de bir)

**Tetikleyiciler**
- Sahip üyeliği; ad, görünürlük ve arşiv etkinliği; görünürlük değişince bağlantı iptali.
- Öğe doğrulaması **SECURITY INVOKER**: kaynak okunabilirliği çağıranın RLS'iyle denetlenir. Görsel kimliği gerçekten o promptun medyası mı? Yükleme adresi bu Space'in klasöründe mi? `community_id` boş mu?
- Değişmezler: kimlik, tür, kaynak ve `created_by`. Yalnız kaynak silinince null'a düşebilirler.
- Grup, palet ve üyelik etkinlikleri; renklerin küçük harfe normalleştirilmesi.

**RPC'ler**

| Amaç | RPC |
|---|---|
| Oluşturma ve liste | `create_space`, `list_spaces` (INVOKER; arama başlık/açıklama + öğe metinleri + başvurulan prompt başlığı/metni; süzgeç `all/mine/shared/favorites/recent/public/archived`) |
| Yerleşim ve kişisel durum | `space_save_layout`, `set_space_favorite`, `touch_space` |
| Davetler | `invite_space_member` (kullanıcı adıyla; engel/kendine/üye/bekleyen davet reddi; Türkçe `system` bildirimi), `respond_space_invitation`, `revoke_space_invitation`, `my_space_invitations` |
| Üyelik | `set_space_member_role`, `remove_space_member` (sahip çıkarır ya da üye ayrılır; sahip ayrılamaz) |
| Bağlantı | `create_space_link`, `revoke_space_link`, `space_link_status`, `open_space_link` |

**Yetkiler**
- Anon yalnız `list_spaces`'i (herkese açık süzgeç) ve okuma politikalarını kullanır. Diğer RPC'lerde `revoke … from public, anon` vardır.
- İç yardımcılar istemciye kapalıdır. Etkinlik, üyelik, durum ve bağlantı tablolarına istemci yazamaz.

**Bildirimler**
- Yeni cümleler: `Seni "X" Space'ine davet etti.` ve `"X" Space'ine katıldı.`
- `notification-message.ts`'e kalıpları, `translations-spaces.ts`'e `notifMsg.spaceInvited/spaceJoined` karşılıkları eklendi; İngilizce arayüzde çevrilir (Space adı çevrilmez).

## 3. Arayüz (`src/features/spaces/`)

**Rotalar**
- `/spaces` ana sayfa
- `/spaces/local?id=&tab=&focus=` Space
- `/spaces/link#<token>` bağlantı açılışı
- Gezinme: kenar çubuğunda "Kütüphanem → Spaces", telefonda hesap menüsü. Alt menünün 5 yuvası değişmedi.

**Ana sayfa** (`spaces-home.tsx`)
- Başlık + tanıtım cümlesi + "Yeni Space".
- Bekleyen davetler (Kabul et / Reddet).
- Arama: sunucuda, 300 ms gecikmeli.
- Süzgeç çipleri, sıralama, ızgara/liste (tercih `localStorage`'da).
- "Son açılanlar" şeridi, "Daha fazla yükle".
- Boş kütüphanede ilk Space boş durumu: üç adım + "Örnek" etiketli pano çizimi (gerçek veri gibi gösterilmez).
- Ziyaretçi herkese açık Space'leri görür; "Yeni Space" giriş penceresini açar.

**Kart** (`space-card.tsx`)
- Kapak sırası: yüklenen › seçilen görsel › son dört görselin kolajı › simge.
- Tür, ad, açıklama, görünürlük, görsel/prompt/not/üye sayıları, sahip, son düzenleme, favori.
- ⋮ menüsü (yetkiye göre): aç, yeniden adlandır/kapak, favori, paylaş, arşivle/çıkar, ayrıl, sil.

**Oluşturma** (`space-modals.tsx`, `space-forms.tsx`)
- Alanlar: ad (zorunlu), açıklama, tür, başlangıç (boş / hazır pano düzeni + grupları listelenir), görünürlük (neyin yayımlanacağı yazar; varsayılan **Özel**), kapak.
- Kapak yüklenemezse Space yine oluşmuştur: pencere bunu söyler ve "Space'e git" önerir.

**Space sayfası** (`space-page.tsx`)
- Kompakt Albüm bandı: kolaj kapak, `SPACE · tür`, görünürlük, arşiv rozeti, ad, açıklama, sahip, son düzenleme, ⋮ (ayarlar/arşiv/ayrıl/sil).
- Eylem satırı: "Panoyu aç", Paylaş, Favori, kayıt durumu.
- Hap sekmeler: Genel bakış · Pano · Görseller · Promptlar · Palet · Notlar · Üyeler (yalnız üyelere).
- Okunamayan Space tek tip "erişemiyorsun / artık yok" bloğu gösterir.

**Sekmeler** (`tabs/*`)

| Sekme | İçerik |
|---|---|
| Genel bakış | "Kaldığın yerden devam et" (son düzenlenen öğeye panoda gider), son görseller/promptlar, notlar, paletler; yanda sayılar, gruplar, üyeye etkinlik geçmişi; boş Space'te ilk adımlar |
| Görseller | Arama (başlık, not, kaynak başlığı/metni), grup süzgeci, ızgara/liste, çoklu yükleme (ilerleme + dosya başına hata), grup yöneticisi, ayrıntı penceresi |
| Promptlar | Kaynağa göre süzgeç (Gönderi / Taslağım / Görselden), sıralama, kopyala, kaynağı aç, "Taslağa kopyala" (bağımsız kopya; özgün gönderi değişmez), taslak düzenle |
| Palet | Birden çok palet; renk ekle (HEX ya da seçici), düzenle, sırala, sil; tek tıkla HEX kopyala, "Tümünü kopyala", "Panoya ekle", "Görselden çıkar" |
| Notlar | Oluşturan (üyeye ad) + tarih; gizli not; öğeye bağlı not; düzenle/sil; "Panoda göster" |
| Üyeler | Kullanıcı adıyla davet (rol seçimi), rol değiştir, çıkar, bekleyen davetler, ayrıl, erişim özeti + paylaşım ayarları, rol açıklamaları, "gerçek zamanlı değil" notu |

**Ayrıntı penceresi** (görsel, prompt, içerik)
- Büyük önizleme + ışık kutusu, kaynak ve üretici.
- Prompt metni (kopyala).
- Paylaşılmayan alanlar uydurulmaz, **"Paylaşılmamış"** yazar: negatif prompt ve üretim parametreleri modelde yok; model/araç gönderinin `tools` alanından gelir.
- Projede başlık + proje notu, grup, "Panoda göster", "Space'ten kaldır".

**Palet çıkarma** (`lib/color-palette.ts`)
- Görsel okuyucunun yetkisiyle (signed URL) indirilir ve tarayıcıda median-cut uygulanır.
- Ortanca değer sınırından bölünür: aynı ton iki kutuya düşmez. Saydam pikseller sayılmaz, yakın tonlar elenir.
- Çıkarılamazsa dürüst hata; sahte palet üretilmez.

**Pano** (`board/space-board.tsx`, `board/board-item.tsx`)
- Yeni bağımlılık yok: Pointer Events ile yazılmış tuval.
- **Fare:** sürükle = taşı (8 birimlik ızgaraya oturur, Alt ile serbest); sağ alt tutamaç = boyutlandır (görsel oranını korur); boş alanda sürükle = seçim kutusu; Shift/⌘ + tıkla = seçime ekle; Boşluk / orta tuş / El aracı = kaydır; tekerlek = kaydır; Ctrl/⌘ + tekerlek ve trackpad kıstırma = imleç noktasında yakınlaştır.
- **Dokunma:** öğeyi sürükle = taşı; boş alanda tek parmak = kaydır; iki parmak = yakınlaştır + kaydır; "Çoklu seçim" modu; çift dokunma = aç; seçim çubuğu bağlam menüsünün yerini alır; **Tam ekran** (z-45: üst menü ve alt gezinmenin üstünde, pencerelerin altında).
- **Seçim çubuğu (her ekranda alt ortada):** aç, not ekle (öğeye bağlı), öne getir / arkaya gönder, grupla / gruptan çıkar, hizala (sol/orta/sağ/üst/orta/alt), eşit dağıt (≥3), ızgaraya diz, kaldır.
- **Klavye (pano odakta):** oklar = it (Shift büyük adım; seçim yoksa panoyu kaydırır), Delete = kaldır, ⌘Z / ⌘⇧Z / ⌘Y, ⌘A, ⌘G / ⌘⇧G, Enter = aç, `[` `]` = öğeler arasında gez, `+ − 0`, Esc. "Klavye kısayolları" penceresi var.
- **Geri al / yinele:** taşı, boyutlandır, sıra, grup, hizala, panodan ekleme ve silme. Geri alınan silme öğeyi **aynı kimlikle** geri koyar. Sunucu reddederse (kaynak artık okunamıyor) hata söylenir ve kayıt geçmişten düşer.
- **Kayıt:** sağlayıcıda (`space-provider.tsx`) tutulur, sekme değiştirmek bekleyen değişikliği kaybettirmez. Akış: yerel durum hemen, ~700 ms sessizlik sonra tek istek.
- **Kayıt durumu:** Kaydediliyor / Kaydedildi / **Kaydedilemedi + Tekrar dene**. Bekleyen değişiklik korunur; 2/5/10 sn arayla 3 otomatik deneme yapılır; bekleyen varken sayfadan çıkmak tarayıcı uyarısı verir; Space'ten çıkarken bekleyen gönderilir.
- **Dayanıklılık:** her öğe kendi hata sınırında (bozuk öğe yalnız kendi kutusunda "gösterilemiyor"); `memo` + ilkel konum özellikleri (sürüklenmeyen öğe yeniden çizilmez); %40 altında sade blok görünümü.

**Space'e ekle** (`add-to-space-modal.tsx`)
- Nereden açılır:
  - `PostMenu`: bütün gönderi kartları (Ana Sayfa, Keşfet, listeler, profil, koleksiyon, topluluk kartları) ve dört detay sayfası. Sonuç ve topluluğa ait içerik hariç.
  - **Odak:** slaytın bağlantı satırı.
  - **Hikâyeler:** görüntüleyicinin ⋮ menüsü, "Bağlantılı içeriği Space'e ekle". Pencere `Modal overLayers` ile z-70'te açılır. Açıkken hikâye durur, tuşlar pencereye kalır, olaylar görüntüleyiciye kabarmaz.
- Akış: Space seç (arama, "Zaten var" rozeti) ya da adıyla yeni Space oluştur → görselli promptta hangi görseller + "Prompt kartı" seçilir → ekle → "N öğe eklendi" + "Space'i aç".
- Yinelenen ekleme sunucuda benzersizlik kısıtıyla da engellenir; çevrilmiş hata gösterilir.
- Kartın içindeki pencere portal'dadır, ama olaylar React ağacında kartın bağlantısına kabarmasın diye durdurulur.

**Ortak değişiklikler**
- `Modal` isteğe bağlı `overLayers` (z-70) aldı.
- `PROTECTED_MEDIA_BUCKETS` artık `space-media`'yı içerir.
- Kenar çubuğu ve hesap menüsüne Spaces eklendi.

**Çok dillilik:** bütün metinler `translations-spaces.ts`'te TR + EN (≈450 anahtar).

## 4. Testler

| Katman | Kapsam | Sonuç |
|---|---|---|
| Yerel PostgreSQL `supabase/tests/spaces.sql` | Oluşturma; kaynak doğrulaması (özel, topluluk, yanlış görsel, yabancı klasör, yineleme); değişmezler; etkinlik birleştirme; davet (engel, kendine, ikinci davet, davetlinin göremediği Space, bildirim); düzenleyici/görüntüleyici/yabancı matrisi; palet HEX; grup silme; herkese açık + gizli not; ziyaretçi; engel; favori/son açılan; liste sayıları ve arama; bağlantı yaşam döngüsü (özet saklanır, açma, iptal, görünürlük değişince iptal, ziyaretçi açamaz); arşiv; rol, çıkarma, ayrılma; Storage; yetim taraması; kapak; kaynağın gizlenmesi ve silinmesi; Space silme; istemci yazamaz; hesap silme zinciri | 59/59; diğer 20 SQL dosyası `FAILED=0` |
| Birim (`npm test`) | `spaces.test.ts`, `space-board.test.ts`, `color-palette.test.ts` | toplam 400/400 |
| Playwright `run-spaces.mjs` | 24 senaryo (bkz. `tests/messaging-ui/README.md`) | 24/24 |
| `run-focus-feed.mjs` | Odak'tan ekleme (24), Ana Sayfa kartından ekleme ve kartın açılmaması (25) | geçti |
| `run-stories.mjs` | Hikâye bağlantısından ekleme, pencere z-sırası, hikâye ilerlemez (21) | geçti |

## 5. Uygulama adımları

1. Migration'ı canlıya uygula: `20260921130000_spaces.sql`, tek işlem. Ardından `supabase_migrations.schema_migrations`'a dosya sürümüyle kayıt düş.
2. İstemciyi yayınla (GitHub Pages; `deploy.yml`).
3. Supabase Dashboard'da `space-media` bucket'ının **private** olduğunu ve 10 MB / image MIME sınırını doğrula. Migration oluşturur.

## 6. Bilinen eksikler

- Gerçek zamanlı ortak düzenleme ve eşzamanlı düzenleme çakışma uyarısı yok; son kayıt kazanır.
- Bağlantıyla görüntüleme oturum ister: anonim bağlantı yok, Storage politikası token göremediği için.
- Bağlantının kendisi yalnız oluşturulurken gösterilir; kaybolursa yenisi oluşturulur.
- Panodan eklenmeyen öğeler (Görseller/Notlar sekmesinden eklenenler) geri al geçmişine girmez.
- Herkese açık Space'ler yalnız Spaces → "Herkese açık" süzgecinde keşfedilir; profil, Keşfet ve aramaya bağlanmadı.
- Negatif prompt ve üretim parametreleri Promptly gönderi modelinde yok; "Paylaşılmamış" yazılır.
- Pano iOS Safari'de, gerçek dokunmatik cihazda ve çok sayıda öğeyle (yüzlerce) performans açısından **denenmedi**. Dokunma ve kıstırma sentetik Pointer olaylarıyla sınandı.
