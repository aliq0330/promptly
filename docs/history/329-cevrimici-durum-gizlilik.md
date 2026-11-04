# 329 — Çevrimiçi durum, son görülme ve gizlilik (tüm platform)

Tarih: 2026-11-04 · Durum: **uygulandı, CANLIDA** — PR #435 `main`'e birleşti, deploy hattı (migration + duman testi + yayın) yeşil. Canlıda doğrulandı (salt-okunur SQL): `20261104110000` `schema_migrations`'ta, `presence_state` her profil için bir satır (20/20), `realtime.messages` üzerinde "Allowed viewers can receive presence" + "Owners can track their presence" politikaları, `notifications.push_suppressed` sütunu, `authenticated` tabloyu okuyamıyor. Gerçek Realtime/Telegram/cihaz davranışı hâlâ DENENMEDİ. Kaynak: kullanıcının isteği ("bir profilin çevrimiçi/çevrimdışı durumunu göstermek, istenirse çevrimiçiyken bile değiştirebilmek; mesajlar, topluluk, topluluk grubu bağlantıları") ve ardından tek teslimde tam kapsam talimatı (faz yok).

## Davranış

| Yer | Ne görünür |
|---|---|
| Sohbet listesi, Mesajlar dock'u (hap + panel), yeni sohbet taslağı | Birebir sohbette karşı tarafın avatarının sağ altında yeşil nokta |
| Sohbet başlığı (sayfa + dock), Kişi bilgisi | "Çevrimiçi" / "Son görülme 5 dakika önce"; görülemiyorsa eskisi gibi `@kullanıcı` (gizli olduğu söylenmez) |
| Yeni sohbet penceresi, paylaşım için sohbet seçici (`/messages?share…`), @bahsetme önerileri | Çevrimiçi kişiler önce (kararlı sıralama; grup içi sıra korunur) + nokta |
| Topluluk sohbeti başlığı, Topluluk bilgisi | "N çevrimiçi" (toplu sayı) + bilgi sayfasında "Şu an çevrimiçi" üyeler şeridi |
| Topluluk → Üyeler | "Çevrimiçi" süzgeci (sunucudan, kişi başına gizlilikle) + üye satırlarında nokta; katılım isteklerinde başvuranın noktası |
| Topluluk → Hakkında | "Yönetim ekibinden çevrimiçi olanlar" (sahip/yönetici/moderatör, rol etiketiyle) — şikâyet/katılım isteği için kime ulaşılabileceği |
| Topluluk kartları, "Topluluklarım" rafı | "N aktif" (son 5 dk) |
| Davet bağlantısı sayfası | YALNIZ herkese açık toplulukta "N üye şu an aktif" |
| Etkinlikler | "N katılımcı şu an çevrimiçi" + (üyeye) görebildiği çevrimiçi katılımcıların avatarları |
| Profil | Avatarın sağ altında nokta (hikâye halkasının DIŞINA teğet); Hakkında'da "Çevrimiçi"/"Son görülme …" |
| Hesap menüsü | Tetikleyici avatarda kendi noktan (başkalarına çevrimiçi görünüyorsan); "Görünmez ol" anahtarı + "Durum gizliliği" bağlantısı |
| Ayarlar → Gizlilik | Durum (Otomatik / Görünmez) + "Kimler görebilir?" (Herkes / Takip ettiklerim / Karşılıklı takip / Hiç kimse) + karşılıklılık notu |

Varsayılan: **Otomatik + Herkes**. "Takip ettiklerim" = KİŞİNİN takip ettiği izleyiciler. Ziyaretçi (oturumsuz) hiçbir şey görmez ve hiçbir istek atılmaz.

## Mimari

### İki katman

1. **Canlı — Realtime Presence, kişi başına private kanal** `presence:<kullanıcı>:<anahtar>`. Kişi yalnız KENDİ kanalında `track` eder (anahtar = kullanıcı kimliği; çok sekme aynı anahtarın birden çok `meta`'sıdır). İzleyici yalnız dinler. Tüm kullanıcıları tek dev kanala koymak yok: kanal başına tek kişi izlenir ve izleyici yalnız ekranda gösterilen, görmeye yetkili olduğu kişilerin kanalına katılır.
2. **Son görülme — `presence_state.last_active_at` (UTC)**: yalnız `presence_heartbeat` RPC'si yazar; istemci cihaz başına en sık 2,5 dk'da bir (`shouldRunNow`, çok sekmede tek çağrı) ve yalnız sekme görünürken çağırır, sunucu da kişi başına 60 sn'den sık yazmaz. Görünmez modda HİÇ yazmaz. Topluluk/etkinlik "aktif" sayıları bu sütundan, "son 5 dk" penceresiyle (`_presence_active_window()` = `PRESENCE_ACTIVE_WINDOW_MS`) hesaplanır.

**Neden `profiles.last_active_at` DEĞİL** (istenen ad buydu, bilerek ayrıldı): `profiles` `supabase_realtime` yayınındadır. Her nabız profil satırını güncelleseydi (a) her profil aboneliğine UPDATE olayı giderdi, (b) Realtime postgres_changes sütun düzeyi SELECT yetkisini uygulamadığından son görülme ve görünmez mod herkese sızardı, (c) `updated_at` ve profil tetikleyicileri 2–5 dk'da bir çalışırdı. Ayrı tablo istemciye TAMAMEN kapalıdır.

### Veri modeli — `presence_state`

`user_id` (PK, `profiles` CASCADE) · `mode` (`auto`|`invisible`) · `audience` (`everyone`|`following`|`mutual`|`nobody`) · `topic_key` (32 hex) · `last_active_at` · `focus_key/focus_since/focus_until` (Telegram) · `updated_at`. RLS açık, politika YOK, `anon`/`authenticated`'ın hiçbir tablo yetkisi yok — her şey RPC. Her profilin bir satırı vardır (migration doldurur + `profiles_presence_row` tetikleyicisi): "satırı yok" ile "görmeye yetkin yok" ayırt edilemesin diye. Dizinler: `presence_state_active_idx` (`mode='auto' and audience<>'nobody'`), `presence_state_public_active_idx` (`audience='everyone'`).

### Gizlilik kuralı — TEK yer `_presence_can_view(izleyici, hedef)`

- izleyici = hedef → evet; aksi hâlde:
- **Karşılıklılık:** izleyici kendini gizliyorsa (`_presence_hidden`: görünmez ya da "Hiç kimse") → hayır.
- Hedef `auto` olmalı; kitle: Herkes · Takip ettiklerim (hedef → izleyici takip) · Karşılıklı (iki yön) · Hiç kimse.
- **Engel iki yönlü** → hayır.

Görünmez kişi, izin vermeyen kişi ve var olmayan kişi `presence_lookup`'ta aynı görünür: **satır yok**. Görünmez kişinin eski son görülmesi de gösterilmez.

### RPC'ler (hepsi SECURITY DEFINER, `search_path` sabit, `anon`'a kapalı)

| RPC | İş |
|---|---|
| `my_presence()` | Kendi ayarım + kendi kanal adım (satır yoksa oluşturur) |
| `set_my_presence(mode, audience)` | Ayar; değer DEĞİŞİRSE `topic_key` döner (aynı değer döndürmez). Geçersiz değer `invalid_presence_mode/audience` |
| `presence_heartbeat()` | Son görülme (görünmezde yazmaz, 60 sn sınırı) + güncel ayarı döndürür (başka cihazdaki değişiklik böyle gelir) |
| `presence_set_focus(key)` | Telegram odağı; bildirim isteyen Telegram bağlantısı yoksa `false` (istemci 10 dk sormaz) |
| `presence_lookup(ids[])` | Görmeye yetkili olduğum kişilerin kanal adı + son görülmesi (≤200; kendim hariç) |
| `can_use_presence_topic(topic, write)` | Realtime politikası: okuma = sahip ya da `_presence_can_view`; yazma (track) = yalnız sahip + `auto` + kitle ≠ Hiç kimse; anahtar GÜNCEL olmalı |
| `community_presence_counts(ids[])` | Topluluk başına "aktif" sayısı (≤50 topluluk, sayı 10 000'de kesilir); yalnız `can_read_community`; kapalı topluluk üye olmayana HİÇ dönmez |
| `community_link_presence_count(token)` | Davet sayfası: önizleme üye olmayana topluluk kimliğini vermediği için JETONLA; yalnız geçerli bağlantı + herkese açık + yasaklı/engelli değil, aksi NULL |
| `community_online_members(group, staff_only, limit)` | Kimlikli çevrimiçi liste; tam liste yalnız ÜYEYE, `staff_only` herkese açık topluluğun okuyucusuna da; her satır `_presence_can_view` |
| `community_events_presence(event_ids[])` | Etkinlik başına aktif Gidiyorum/Belki sayısı (okuyucuya) + görebildiği çevrimiçi katılımcılar (yalnız üyeye, ≤12) |

**Toplu sayılar** (kart, sohbet başlığı, davet, etkinlik) kimlik vermediği için kişi başına kitle uygulanamaz; bu yüzden EN DAR yorum seçildi: yalnız **Otomatik + Herkes** kitleli etkin üyeler sayılır. Karşılıklılık sayılara da uygulanır (gizleyen hiç sayı almaz).

### Realtime Authorization

`realtime.messages` üzerinde iki politika (`extension = 'presence'`): "Allowed viewers can receive presence" (SELECT) ve "Owners can track their presence" (INSERT), ikisi de `can_use_presence_topic((select realtime.topic()), …)`. `realtime.messages` yoksa (yerel test) migration atlar → private presence kanalları HERKESE kapalı (güvenli taraf). Dashboard'da "Allow public access" KAPALI olmalı (174'teki yazıyor kanalıyla aynı şart). Yazıyor kanalı (`typing:<konuşma>`, broadcast) ayrı kalır, değiştirilmedi.

**Anında gizlenme:** ayar değişince istemci ÖNCE kendi kanalından `untrack` edip çıkar (izleyiciler anında "ayrıldı" görür), sonra sunucu anahtarı döndürür; eski kanal adına yeni katılım reddedilir, yeni adı yalnız yetkili izleyici `presence_lookup`'tan alır. İzleyici bir kişinin kanaldan çıktığını görünce 1,2 sn sonra kanal adını yeniden sorar (sekmesini mi kapattı, anahtarını mı döndürdü?). **Görünür olmak** (gizliden açığa) en geç periyodik yenilemede (2 dk) yansır — gizlenme anında, açılma gecikmeli: bilinçli asimetri.

### Telegram akıllı bildirimi

`notifications.push_suppressed` (yeni sütun, varsayılan false) + BEFORE INSERT `_notifications_presence_focus`: Telegram türündeki bildirimin `_presence_focus_key(target_href)` anahtarı alıcının TAZE odak kaydıyla (`focus_since <= now <= focus_until`) eşleşiyorsa işaretlenir. `notifications_telegram_push` tetikleyicisinin WHEN koşulu ve `_telegram_pending` bastırılanı atlar (imza aynı; Edge Function değişmedi). Karar yazma anında verilir → yedek zamanlayıcı da sonradan göndermez. Odak yok/süresi geçmiş/başka sayfa → GÖNDERİLİR (belirsizlikte güvenli varsayılan); yalnız çevrimiçi olmak yetmez. Sitedeki bildirim her durumda yazılır, tercihler (`_notifications_apply_preferences`) aynen çalışır. Odak anahtarı = yol (sondaki `/` atılır) + varsa `id` (`hl`/hash atılır); istemci aynası `presenceFocusKey`, iki tarafın test tablosu aynı.

İstemci: `PresenceFocusTracker` (Suspense içinde, `usePathname`/`useSearchParams`) görünür sekmede sayfa değişince ve 60 sn'de bir `presence_set_focus` çağırır (kayıt 75 sn geçerli), sekme gizlenince `null`. Telegram bildirimi olmayan kullanıcı için ilk çağrı `false` → 10 dk boyunca hiç çağrılmaz.

### İstemci

- `lib/presence.ts` — saf kurallar ve sabitler (pencere, aralıklar, kanal sınırı, odak anahtarı, `derivePresence`, `selectLiveIds`, `sortOnlineFirst`), birim testi `presence.test.ts`.
- `lib/supabase/presence.ts` — RPC katmanı; fonksiyon yoksa `PresenceUnavailableError` (migration canlıda değilken özellik sessizce kapanır), beklenmeyen yanıtta (geçersiz kanal adı) özellik kapalı sayılır.
- `features/presence/presence-store.ts` — **tek durum kaynağı** (modül tekili, `useSyncExternalStore`): kişi başına sayaçlı izleme, 30 ms'de toplanan tek `presence_lookup` (≤200'lük parçalar), en son istenen en çok **40** kişinin canlı kanalı (fazlası son görülme penceresiyle), kanal hata/kopmada son görülmeye düşüş + 3/10/30/60 sn geri çekilmeyle yeniden katılım, bırakılan kişinin kanalı 5 sn sonra kapanır (sayfa geçişinde aynı kanal sürer), sekme 60 sn gizli kalınca bütün kanallar kapanır, izleyici kendini gizleyince her şey temizlenir.
- `presence-provider.tsx` (`AppProviders`'ta) — kendi kanalım (Otomatik + kitle açık + sekme etkin iken track; her yeniden bağlanışta yeniden track; `pagehide`'da untrack), nabız + 2 dk'da bir izlenenlerin toplu yenilemesi (yalnız görünürken), görünürlük/ağ olayları, **çok sekme eşitleme** (`BroadcastChannel('promptly-presence')`, yoksa `storage` olayı), Telegram odağı; `useMyPresence()` = `{ me, available, update }`.
- `use-presence.ts` — `usePresence(userId)` ve `useOnlineIds(ids)`; `community-presence.ts` — `useCommunityPresenceCount(s)` (60 sn önbellek, kartlar TEK çağrıda), `useCommunityOnlineMembers`, `useEventsPresence`, `useLinkPresenceCount`.
- Bileşenler: `presence-ui.tsx` (`PresenceDot`, `UserPresenceDot`, `PresenceAvatar`, `PresenceStatusText`, `OnlineCountText`, `usePresenceLabel`), `online-members.tsx` (`OnlineMembersStrip`), `presence-settings.tsx` (`PresenceSettingsCard`), `presence-menu.tsx` (`PresenceMenuToggle`, `OwnPresenceDot`).
- `components/ui/avatar.tsx` yeni `badge` yuvası (avatar `overflow-hidden` olduğundan rozet dış sarmalayıcıda; rozet yoksa DOM değişmez). Nokta 8–14 px, `bg-success` + `ring-2 ring-surface`, animasyonsuz; konum dairenin 45°'deki kenarına göre hesaplanır, profilde halkanın dışına teğet (`outside` + `borderInset`).
- Çeviriler `translations-presence.ts` (TR+EN).

## Testler

- **SQL** `supabase/tests/presence.sql` — **80 madde, FAILED=0** (yerel PostgreSQL 16, tüm migration'lar baştan): tablo/yetki (anon + authenticated tablo yetkisi yok, RPC'ler anon'a kapalı), kitle matrisi (Herkes/Takip ettiklerim/Karşılıklı/Hiç kimse), anahtar dönmesi (değişince evet, aynı değerde hayır), nabız sınırı, görünmezde yazmama + gösterilmeme, görünmez ↔ var olmayan ayırt edilemez, geçersiz değerler, engel iki yön, Realtime politikası (sahip track eder, başkası edemez; yetkili dinler, yetkisiz/eski anahtar/bozuk konu dinleyemez; ayar değişince eski kanal hem dinlemeye hem track'e kapanır), topluluk sayıları (açık → üye olmayana var, kapalı → yok, görünmez sayılmaz, karşılıklılık, 5 dk penceresi), kimlikli liste (kişi başına izin, rol sırası, üye olmayan tam liste alamaz/yönetim ekibini alır, kapalıda hiçbiri), davet jetonu (açık → sayı, kapalı/geçersiz/iptal → NULL), etkinlik (sayı, üyeye kimlik, üye olmayana yalnız sayı, kapalı etkinlik hiç), Telegram (odak anahtarı eşleşmesi, bağlantısıza yazılmaz, açık sayfa → bastırılır ve bekleyenlere girmez, başka sayfa/süresi geçmiş/yalnız çevrimiçi → gider, beğeni işaretlenmez, temizleme, istemci yazamaz), CASCADE.
- Etkilenen SQL paketleri yeniden: `chat-features`, `notification-center`, `telegram-bot`, `community-privacy` (79), `communities`, `perf-rls`, `anon-hardening` — hepsi FAILED=0.
- **Birim** `src/lib/presence.test.ts` (10) — `npm test` 907/907.
- **Arayüz** `tests/messaging-ui/run-presence.mjs` — **25/25** (ağ + Realtime Presence taklitli, çok oturum): ayarlar ve hızlı menü, liste/başlık/kişi bilgisi, görünmez anında sönme, karşılıklılık (istek bile atılmaz), engel, karşılıklı kitle + yetkisiz doğrudan katılım reddi, çok sekme, bağlantı kopması + geri çekilmeyle yeniden katılım, yeni sohbet sıralaması, dock'ta tek kanal, topluluk sohbeti/bilgisi, Üyeler süzgeci, Hakkında yönetim ekibi, etkinlik, davet sayfası (açık/kapalı), kartlarda toplu çağrı, profil noktası geometrisi (halkanın dışında), Telegram odağı (yazılır/gizlenince temizlenir/bağlantısızda tek sorgu), ziyaretçi (sıfır istek), İngilizce, telefon 390 px (iPhone 13), tablet 820 px koyu tema. `realtime-hub.mjs` presence protokolünü (track/untrack/`presence_state`/`presence_diff`, yazma yetkisi, `kick`) öğrendi; `mock-presence.mjs` SQL kurallarının aynasıdır.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/messaging-ui/run-presence.mjs   # 25/25 beklenir
PGHOST=… PGUSER=postgres supabase/tests/run-local.sh supabase/tests/presence.sql  # FAILED=0
```

**DENENMEDİ:** gerçek Supabase Realtime (private presence kanalı yetkisi, `realtime.topic()`'in presence katılımında politikaya ne verdiği, Presence sınırları), gerçek Telegram, gerçek cihazlar (iOS Safari arka plan sekmesi, `BroadcastChannel` desteği). Taklit, istemci mantığını ve sunucu kurallarının aynasını sınar; canlı davranış ayrıca doğrulanmalı.

## Performans ve sınırlar

- Yazma: kişi başına en çok dakikada bir (`last_active_at`); Telegram odağı yalnız Telegram bildirimi olan kişide, görünürken dakikada bir.
- Okuma: izlenen kişiler TEK `presence_lookup`'ta (30 ms toplama), 2 dk'da bir ve yalnız sekme görünürken; topluluk sayıları kartlar arasında toplu + 60 sn önbellek; kişi başına sürekli sorgu yok.
- Canlı kanal: sekme başına ≤40 izleme kanalı + 1 kendi kanalı (Supabase'in bağlantı başına kanal sınırının altında); çok kişilik listelerde fazlası son görülme penceresine düşer (nokta en çok 5 dk geç söner).
- Topluluk sayımı 100 000 üyeyi dolaşmaz: global etkin kişi dizininden başlar, üyelik birincil anahtarla yoklanır, 10 000'de kesilir. Global etkin kişi sayısı çok büyürse (on binler) bu tarama da büyür — ölçülmedi (§8.13: canlıda `EXPLAIN` ile ölçülmeli).
- Topluluk/etkinlik sayıları canlı Presence DEĞİL, son görülme penceresidir (son 5 dk); "N çevrimiçi" en çok 5 dk geç düşer.
- Kendini açığa çıkarmak (görünmez → otomatik, kitle genişletme) izleyicilere en geç 2 dk içinde yansır; gizlenme anındadır.
- Presence yükündeki anahtar istemci beyanıdır ama yalnız kanal sahibi track edebildiği için (politika) başkası adına "çevrimiçi" gösterilemez.
- Görünmez kişi, profilinde kimsenin durumunu göremez (karşılıklılık) — kendi durumu yalnız hesap menüsünde/Ayarlar'da.
- @bahsetme önerilerindeki çevrimiçi sıralaması arayüz testinde sınanmadı (yalnız `sortOnlineFirst` birim testi + aynı kanca); yorum alanı taklidi bu pakette yok.
