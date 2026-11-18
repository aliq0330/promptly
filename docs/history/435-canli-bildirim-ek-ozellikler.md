# 435 — Canlı bildirim: ince ayar, Rahatsız etme, ses, sekme sayacı, özet, kutlama, kartta yanıt, "N yeni gönderi"

**Neden:** 434'teki canlı bildirim kartının doğal devamı; kullanıcı altı öneriyi de istedi ("hepsini yap, yapılamayan diye bir şey olmasın"). Görsel kanıt: Artifact "Canlı Bildirim Ek Özellikleri".

## 1. Sekme başlığında ve simgede okunmamış sayısı
`(3) Ana Sayfa · Promptly` + sekme simgesinde turuncu rozet. Sayı zil rozetiyle AYNIDIR (`useNotifications().unreadCount`, okunmamış KART sayısı) — yeni sorgu yok.
- **Başlığın tek sahibi `PageTitle`'dır** (`components/layout/page-title.tsx`; kendi `MutationObserver`'ı başlığı kendi değerine geri yazar). Rozet ayrı bir `<title>` gözlemcisiyle eklenseydi iki gözlemci birbirini sonsuza kadar geri yazıp sekmeyi kilitlerdi (ilk denemede UI paketi tam böyle çöktü). Bu yüzden rozet `setTitleBadge(n)` ile `PageTitle`'a verilir; saf biçim `lib/tab-badge.ts`.
- Simge: `features/notifications/unread-tab-badge.tsx` (AppProviders'ta, çizim yok). Statik dışa aktarmada sayfada hiç `rel=icon` YOKTUR (`favicon.ico` yalnız dosya olarak var, bağlantı yazılmıyor): rozet için `apple-touch-icon` PNG'si tuvale çizilip köşeye rozet eklenir ve bir `<link rel=icon>` EKLENİR; sayı 0 olunca/tercih kapanınca bağlantı silinir.
- Tercih: Ayarlar → "Sekmede okunmamış sayısı" (cihaz başına, varsayılan açık).

## 2. Kartı kişiselleştirme + Rahatsız etme + ses
- **Tür grupları** (`lib/live-notification-prefs.ts`): Beğeni ve tepkiler · Yorumlar ve yanıtlar · Takip · Mesajlar · Diğer; her biri anahtar (varsayılan hepsi açık). Kapalı grup yine gelen kutusuna düşer ve rozeti artırır, yalnız kart çıkmaz. Ana anahtar kapalıyken ince ayar gizlenir. Cihaz başına `localStorage` `promptly-live-toast-prefs` (JSON; bozuk/eksik alan varsayılana döner).
- **Rahatsız etme saatleri = HESAP başına, veritabanında** (migration `20261210100000_notification_quiet_hours.sql`): `notification_quiet_hours` (istemciye kapalı), RPC `get_my_quiet_hours` / `set_my_quiet_hours` (saat dilimi IANA, sunucuda doğrulanır), `_in_quiet_hours` (gece yarısını aşan pencere, bitiş hariç). **Telegram anlık bildirimi de susar:** karar mevcut `notifications` BEFORE INSERT tetikleyicisinde (`_notifications_presence_focus`, 329) `push_suppressed`'a yazılır; hem anlık yol hem yedek zamanlayıcı bu sütuna bakar → sessiz saatte gelen bildirim sonradan da Telegram'a gitmez. Bildirimin kendisi yazılır. Yeni bir "dışarı dürtme" yolu (push, e-posta…) aynı sütunu kullanır, ayrıca saat kontrolü yazılmaz. İstemci aynası `isQuietNow` (Intl ile saat dilimi), önbellek `quiet-hours-store.ts` (10 dk). Ayarlar kartı: anahtar + iki saat + saat dilimi (tarayıcıdan) + hata satırı; kaydedilemezse eski değer geri gelir.
  Gizlilik metni bu veriyle (başlangıç/bitiş saati + saat dilimi) güncellenmedi — ürün/hukuk kararı.
- **Ses:** `lib/notification-sound.ts` (dosya yok, Web Audio ile iki yumuşak nota, ≈ 0,35 sn); varsayılan KAPALI; yalnız kart çıkarken çalar (sessiz saatte ve özet artışlarında çalmaz); "Sesi dene" düğmesi.

## 3. Yoğunlukta özet kartı
10 sn içinde ≥ 5 bildirim gelirse ekrandaki kartlar kapanır ve TEK özet kartı çıkar ("5 yeni bildirim", en yeni kişiler, "Hepsini gör"); sonraki bildirimler aynı özetin sayısını artırır, süre yeniden başlar. Saf: `pushArrival/isBurst` (eşik `LIVE_TOAST_BURST_*`), `addSummaryToast`.

## 4. Kilometre taşı kutlama kartı
`system` + "Promptun "X" 100 kopyalamaya ulaştı." (`milestoneInfo`): kupa simgeli, turuncu tonlu, 14 parçalı CSS konfetisi (hareketi azalt'ta kendiliğinden sönük), "İstatistiği gör", 8 sn kalır. Ton ayrı bir katmandır (`bg-secondary-soft` yarı saydamdır; kartın kendisi opak kalır).

## 5. Kartın içinden yanıt + hızlı tepki (yalnız bilgisayar)
- **Yanıtla** artık kartın içinde yanıt kutusu açar (yorumda mevcut `postCommentOn*` ailesi [`postNotificationReply`], düz birebir/grup sohbet mesajında `sendMessage`); sunucu kuralları (hız sınırı, askı, engel) aynen çalışır. Topluluk odası/ekip kanalı adresi (`room/hub/team/project/channel`) yanlış odaya yazılmasın diye satır içi DEĞİL, sohbeti açar (`liveToastInlineReply`). "Ayrıntı" düğmesi eski yolu (`/notifications?n=`) verir. Yazarken süre tamamen durur.
- **Hızlı tepki:** yorum kartında gönderideki `ReactionButton` (altı emoji seçici); tepki sayısı tek toplu sorguyla (`fetchNotificationContext`) okunur. Seçici gövdeye portallandığı için kart dışında sayılır: açıkken süre dolsa bile kart kapanmaz.
- Telefonda satır içi yanıt/tepki YOK (dokununca açılır).

## 6. Ana Sayfa "N yeni gönderi" hapı
Takip Ettiklerim'de (kronolojik) okuyucu akışı okurken yeni gönderi gelince liste KAYMADAN ekranın üstünde "N yeni gönderi" hapı çıkar (bildirim panelindeki "N yeni" hapıyla aynı dil); basınca liste yerinde yenilenir (iskelet yok) ve en üste kaydırılır. Bir sayfadan fazla yeniyse "18+". **Yoklama, Realtime DEĞİL:** `prompts` UPDATE'leri zaten Realtime'dan geliyor ama herkesin her yeni gönderisini RLS'ten geçirip dinlemek sunucuya yük bindirir; bunun yerine sekme görünürken 45 sn'de bir ve sekme yeniden görününce (≥ 2 sn arayla) `feed_page` ilk sayfası okunur, listede olmayan en yeni kayıtlar sayılır. Açılışta ek sorgu yok. Kod: `useFeedPages(…, { watchNew })` (yalnız Ana Sayfa), `NewPostsPill`.
Prompt detayındaki "N yeni yorum · göster" zaten vardı (`useCommentThread.newCount`, 385) — dokunulmadı.

## Web Push bilerek yapılmadı
Site kapalıyken tarayıcı bildirimi service worker ister; CLAUDE.md "service worker yok (bilerek)". Kapalıyken ulaşmak için Telegram botu (323/324) var ve Rahatsız etme onu da susturur.

## Testler
`live-notification-prefs.test.ts`, `tab-badge.test.ts`, genişletilmiş `live-notification-toast.test.ts` (toplam 25 birim test, `npm test` 1400+), SQL `supabase/tests/notification-quiet-hours.sql` (32 kontrol: pencere/saat dilimi/doğrulama/yetki/tetikleyici/yedek yol; yerel PostgreSQL 16'da FAILED=0), UI `run-live-notify-extras.mjs` (21 senaryo) + güncellenen `run-live-toasts.mjs` (19). `scripts/smoke-test.mjs`'e iki "ziyaretçiye KAPALI" kontrolü. Gerçek Supabase'e / Realtime'a / cihaza / gerçek sesli çıkışa KARŞI DENENMEDİ; migration canlıya `deploy.yml` ile uygulanır.
