# 354 — Yön A: tek sohbet, tek bilgi sayfası (ekip + topluluk)

Durum: **uygulandı** (kodlandı, ağ taklitli testler geçti; gerçek Supabase/cihaz DENENMEDİ). Kullanıcının seçtiği Yön A mockup'larının ("Ekip 1–5", "Topluluk 1–5") koda taşınması.

## Sorun
- Mesajlar'da bir ekibin her kanalı ayrı "#genel" satırıydı, topluluğa benzeyen avatarla; hangi ekibe bağlı olduğu belli değildi.
- Ekip sohbetinin başlığına dokununca "Topluluk bilgisi" açılıyordu; topluluk sohbetinde ise iki ayrı ekran (bilgi + "Sohbet Odaları" merkezi) karışıklık yaratıyordu.
- Telefonda ekip sayfası içindeki gömülü sohbet üç katmanlı başlık, fazladan arama satırı ve alt menüyle ekranı yiyordu.

## Karar (Yön A)
Her ekip/topluluk **Mesajlar'da tek satır**, **tek sohbet**, **tek bilgi sayfası**; kanallar/odalar sohbet başlığının altında **çip satırı**.

### Mesajlar listesi
- `rollUpTeamChannels` (`lib/conversation-lists.ts`): bir ekibin kanalları tek satır; satır okunmamışı olan en yeni kanalı (yoksa en yenisini) açar, sayaç sessize alınmayan kanalların toplamı. Birim testli.
- Ekip satırı yuvarlatılmış kare `TeamMark`, topluluk satırı yuvarlak avatar; "Tümü"de `EKİP` / `TOPLULUK` etiketi (`data-kind-tag`); ikinci satırda `# kanal` + son mesaj; meta satırında "N kanalda yeni · N üye".
- Ekip/Topluluk çipinde özet satırı (`data-kind-summary`) ve kesik çizgili CTA (`data-kind-cta`: Ekip oluştur / Topluluk keşfet). Topluluk satırındaki oda merkezi oku kalktı.

### Sohbet başlığı ve çipler
- Başlık: ekip/topluluk adı; alt satır `# kanal · N üye · M çevrimiçi` (topluluk: `# oda · …`). `ChannelChipsRow` (`features/messages/channel-chips-row.tsx`) tek çip satırı: ekip mavi, topluluk teal, okunmamış turuncu rozet.
- Konuk rolünde `GuestBanner` ("Konuk erişimi · N gün kaldı").
- Telefonda ekip sohbeti Mesajlar'daki **tam ekran sohbettir** (`/messages/local?id=<kanal>&from=team`, tek ince başlık + çipler); geri düğmesi ekip sayfasına döner. Ekip sayfasının Sohbet sekmesi telefonda yalnız kanal listesidir; `?new=1` / `?settings=1` Kanal ekle / Kanal ayarları pencerelerini açar.

### Tek bilgi sayfası ve alt sayfalar
- Ekip (E3): `TeamInfoModal` — kimlik, Ekip sayfası · Kanalda ara · Sessize al karoları, kanallar (açık olan işaretli, okunmamış sayılı, her birinin ⓘ'si), ekibin tüm kanallarına bildirim düzeyi (karışıksa "Kanallara göre farklı"), "Ekip sayfasını aç".
- Kanal (E4): `ChannelInfoSheet` — kim görür/yazar, üye/çevrimiçi, bildirim düzeyi, sabit mesajlar · ara · ekip sayfası, yönetene Düzenle · Arşivle · Sil (sunucuda yeniden yetkilendirilir).
- Topluluk (T3): mevcut `GroupInfoModal`'a **Odalar** bölümü eklendi (açık oda işaretli, okunmamış, ⓘ, yetkiliye "Oda ekle"). Eski oda merkezi (`RoomsHub`), `RoomChipRow`, `RoomSwitcher` ve `roomsHubHref` silindi; `?view=rooms` bilgi sayfasına yönlenir (`?panel=about`).
- Oda (T4): `RoomInfoSheet` — kim görür/yazar, bildirim (Tümü / Sessiz), sabit · ara · topluluk sayfası, yönetene Düzenle (mevcut `RoomFormModal`) · Arşivle. ⋮ menüsünde "Oda bilgisi".

## Dürüst sınırlar
- Liste meta satırı üye sayısı gösterir (çevrimiçi sayısı değil); `@` bahsetme rozeti yok.
- Ekip bildirim anahtarı ekibin tüm kanallarına uygulanır; oda bildirimi iki düzeylidir (Tümü / Sessiz) — sunucuda üçüncü düzey yok.
- iOS klavye/safe-area ve gerçek Supabase/Realtime denenmedi.

## Test
`npm test` (conversation-lists 14), ağ taklitli `run-rooms` 29/29 (hub/çip/değiştirici senaryoları bilgi sayfası akışına çevrildi), `run-team-hub` 27/27 (yeni 18–23), `run`, `run-groups`, `run-chat-popovers` geçti.

## Ek: masaüstü ekip sayfası sohbeti — Seçenek 1 "çalışma alanı" (kullanıcı seçti)
- `lg`+: solda kanal kartı (`rounded-[20px]`; açık kanal mavi, okunmamış turuncu rozet, kanallar yanında "+", altta "N çevrimiçi · N üye"), sağda sohbet kartı: `# kanal` + açıklama, üye yüzleri (+N), "Ara…" ve kanal bilgisi (ⓘ) düğmeleri. Kanal bilgisi aynı `ChannelInfoSheet`'tir (gömülü sohbet `EmbeddedChatControls` tutamacıyla `openSearch` / `openChannelInfo` verir; eski başı boş arama satırı kalktı).
- `md`–`lg` (tablet): kanal kartı gizli, kanallar sohbet kartının çip satırındadır (+ yönetene "+"); telefon değişmedi (liste → tam ekran sohbet).
- Eski başlıktaki bildirim seçicisi ve "Ayarlar" düğmesi kalktı: bildirim düzeyi ve Düzenle kanal bilgisindedir.
- Test: `run-team-hub` 29/29 (yeni 24 masaüstü, 25 tablet).
