# 358 — Telefonda Ekip ve Topluluk ana ekranı (mockup birebir)

**Durum:** uygulandı (2026-11-08). Yalnız telefon (`< md`); masaüstü ve veritabanı değişmedi.

## Neden
357'deki liste → alt sayfa kalıbı doğruydu ama KÖK ekranlar boştu: Ekip ve Topluluk'un ilk ekranı kimlik bloğu + altı satırlık liste idi; ekranın yarısı boş, son satır alt menünün altında kalıyor, iki sayfanın kimlik bloğu birbirine benzemiyordu (karo şekli, geri bağlantısı, düğme düzeni). Kullanıcı iki gerçek ekran görüntüsüyle sordu, mockup'ı (canvas "Ekip ve Topluluk — telefon ana ekranı") onayladı: "mockupta önerdiğinin birebir aynısı".

## Kural
Telefondaki iki seviyeli sayfaların KÖK ekranı `features/content/phone-home.tsx`'ten kurulur; ikinci bir kimlik bloğu/karo ızgarası yazma:
- `PhoneHomeIdentity`: "‹ Ekipler / Topluluklar" geri bağlantısı · 56 px dolu karo/avatar · küçük etiket · ad · özet · tam genişlik birincil düğme + yanında ikincil düğme.
- `PhoneTileGrid`: 2 sütun bölüm karoları (simge + ad + alt satırda sayı/özet); turuncu rozet = bekleyen/yeni iş. Her karo gerçek bağlantı (`data-phone-section=<bölüm>`).
- `PhoneHomeSection` / `PhoneHomeCard` / `PhoneHomeRow`: altındaki gerçek içerik önizlemeleri.
- `PHONE_HOME_BOTTOM_PAD` (`pb-28`): sayfa sonunda alt menü kadar boşluk.
`PhoneSectionList` (satır listesi) Yönetim alt listelerinde kalır.

## Ekip (`teams/team-phone-home.tsx`)
Kimlik: Ekip etiketi, "N üye · N Space · Yalnız davetle", "Ekip sohbetini aç" (okunmamış rozetli) + "Davet et" (yalnız `manage_members`; yoksa birincil düğme tam genişlik). Karolar: Space'ler "N proje" · Kütüphane "N prompt" + onay bekleyen rozeti · Sohbet "N kanal" + okunmamış rozeti · Üyeler "N kişi" · Panel · Yönetim (rol yetkisine göre `items`). Önizleme: **Senden bekleyenler** (`my_team_todos`, bu ekibin satırları, en çok 3; tek tek inceleme varsa özet "N onay" satırı gizlenir) ve **Son Space'ler** (en son güncellenen en çok 2 Space; kapak `StorageBackground`). Bölüm boşsa çizilmez. Yeni sunucu işi YOK (`team_library_counts`, `my_team_todos`, `team_list_spaces` zaten vardı).

## Topluluk (`communities/community-phone-home.tsx`)
Kimlik: "TOPLULUK · kategori", ad, "N üye · görünürlük · rol", "Sohbeti aç" (üyeye) + üyelik düğmesi (`CommunityJoinButton`, üye değilken birincil yuvada). Karolar: Akış "N gönderi" + görülmemiş rozeti · Etkinlikler · Üyeler (bekleyen istek rozeti) · **Odalar** (yalnız üyeye ve ≥1 oda varsa; sohbeti açar — odalar sohbetin içindedir, Hakkında'da değil) · Hakkında · Yönetim. Önizleme: **Yaklaşan etkinlik** (en yakın tek etkinlik + üyeye "Katıl" = `set_community_event_rsvp('going')`) ve **Son gönderiler** (en çok 2; küçük görsel yerine tür simgesi). Önizleme yalnız o bölüme erişimi olana çizilir (`accessibleTabs`); üye olmayana davet/başvuru geçidi kimlik bloğunun altında çıkar. Gönderi sayısı `community_cards()`'tan (yeni sorgu yok). Erişimsiz kapalı topluluk eski kompakt başlık + geçit düzenini korur.

## Bilinçli sapmalar (mockup ↔ kod)
- "Son açılan Space'ler" yerine **"Son Space'ler"**: kişinin son açtığı veri satırda yok; son güncellenenler gösterilir.
- Önizleme küçük görselleri (gönderi/Space kapağı) simge/kapakla; gönderi için tür simgesi.
- Bölüm başlığındaki "Tümü" Ekip'te `/teams` (todo listesi), Topluluk'ta ilgili sekmedir.

## Testler
Ağ taklitli: `run-team-hub` 41 (45/45), `run-community-home` 29 (40/40). Birim 998/998. Gerçek Supabase/cihaz DENENMEDİ. İngilizce karşılıklar eklendi: `tm.home.*`, `communities.home.*`.
