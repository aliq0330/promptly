# 326 — Bildirim merkezi: zilin altında hızlı eylemli panel, gruplu kartlar, bölünmüş gelen kutusu, sessize al / ertele

Tarih: 2026-11-03 · Durum: **kodda uygulandı; iki migration canlıya UYGULANMADI** (`20261103110000_notification_center.sql`, `20261103120000_comment_reactions.sql` — deploy hattı uygular). Mockup: https://claude.ai/artifact/DEhUsKXH383fnREotaqCcF (4 ekran: masaüstü açılır panel · masaüstü detay sayfası · mobil liste · mobil detay).

## 1. Amaç ve kararlar

Bildirim satırı bugüne dek tek bir `Link`'ti: tıklayınca hedef sayfaya gidilir, karttan hiçbir şey yapılamaz, her beğeni ayrı satırdı ("Ali beğendi", "Veli beğendi"). Kullanıcıyla birlikte verilen kararlar:

| Karar | Sonuç |
|---|---|
| Masaüstü | Zil → **zilin altında** 440 px'lik açılır panel (arka plan loşlanmaz, ok zile bağlı, `md`+). "Ayrıntı"/"Tüm bildirimleri gör" → `/notifications` **bölünmüş gelen kutusu** (`lg`+: solda liste, sağda ayrıntı, `?n=<kart anahtarı>`). |
| Mobil | Zil panel açmaz, doğrudan `/notifications`; kartlar dokununca genişler (tek açık kart), "Ayrıntı" tam sayfa (`fixed inset-0`, alta sabit yanıt çubuğu). |
| Gruplama | **Sunucuda** (`notifications_grouped_page`), aynı hedefe gelen satırlar **zaman penceresi olmadan** tek kart ("Ali, Veli ve 10 kişi daha promptunu beğendi"), kartın zamanı = en yeni satır. Yalnız SAYI bildirimleri gruplanır: beğeni/tepki, takip, hikâye tepkisi/anket oyu. Yorum, yanıt, mesaj, öneri, istek yanıtı, alıntı, sonuç, sistem → tek satırlık kart (üzerlerinde o satıra özgü eylem var). |
| Zil rozeti | Okunmamış **kart** sayısı (99+), veritabanı sayar. |
| Ertele / Sessize al | İlk sürümde VAR. |
| `/notifications` | Eski tek sütunlu düz liste **kalktı**; hedef sayfaya ayrıntıdaki "Aç" bağlantılarıyla gidilir. |

## 2. Veritabanı (`20261103110000_notification_center.sql`, yalnız EKLER)

- `notifications.snoozed_until` + kısmi indeks, `(recipient_id, created_at desc, id desc)` indeksi.
- `notification_mutes(user_id, kind 'actor'|'content', target, label)` (≤200) ve `notification_type_prefs(user_id, pref_key, enabled)`; ikisi de istemciye yalnız SELECT, yazma `set_notification_mute` / `set_notification_type_pref` RPC'leriyle.
- SQL yardımcıları (immutable, TS aynaları `src/lib/notification-mirror.ts`; `notification-mirror.test.ts` listeleri migration dosyasından okuyup karşılaştırır): `_notification_href_base`, `_notification_category`, `_notification_pref_key`, `_notification_group_key`, `_notification_ids_for_key`.
- **Sessize alma + tür tercihi TEK yerde**: `notifications` üzerindeki BEFORE INSERT tetikleyicisi (`_notifications_apply_preferences`); 20'den fazla `notify_*` fonksiyonuna dokunulmadı. Sessize alınan/kapatılan bildirim **hiç yazılmaz** → Telegram anlık/özet gönderimi de görmez. Sistem (güvenlik, topluluk) ve mesaj isteği muaf; kilometre taşı içeriğe göre sessize alınabilir.
- Okuma/yazma RPC'leri (SECURITY INVOKER, RLS atlanmaz): `notifications_grouped_page` (keyset `(sort_at, group_key)`, süzgeçler sunucuda), `notifications_unread_group_count`, `notifications_unread_by_category`, `notifications_snooze_summary`, `notifications_group_members`, `notifications_group_mark_read/unread/delete/snooze/unsnooze`. Gruplama taraması kullanıcı başına **en yeni 5000 satırla** sınırlı (daha eskisi listede görünmez ama silinmez).
- Erteleme: ertelenen satır listede/sayımda yok; erteleyince `is_read=false` yapılır, süre dolunca **okunmamış** olarak `sort_at = greatest(created_at, snoozed_until)` ile en üste döner (zamanlayıcı yok; istemci tek `setTimeout` + `visibilitychange`).
- **Yorum tepkisi** (`20261103120000_comment_reactions.sql`): `comment_likes.reaction` (varsayılan `love`), yalnız kendi satırının `reaction`'ı değişir (`enforce_comment_reaction_only_update`), askı/hız sınırı güncellemede de geçerli, bildirim satırındaki `reaction` yerinde güncellenir (`sync_comment_like_notification_reaction`).
- Test: `supabase/tests/notification-center.sql` (42 kontrol, `FAILED=0`); `anon-hardening` dahil bildirimle ilgili 24 mevcut SQL testi yeni migration'larla yeniden koşuldu, hepsi `FAILED=0`.

## 3. İstemci

- Veri: `lib/supabase/notifications.ts` (kart RPC'leri, sessize alma, tür tercihi), `notification-context.ts` (görünür kartlar için **tür başına tek toplu sorgu**: yorum gövdesi + benim tepkim, takip-geri, öneri + prompt metni, bağlı içerik), `notification-reply.ts` (kartın yanıtı mevcut `postCommentOn*` ailesiyle; `useCommentThread` AĞIR olduğu için kullanılmaz).
- Saf mantık + test: `notification-mirror.ts`, `notification-card.ts` (gruplu cümle, tepki özeti, tür etiketi), `notification-actions.ts` (karttan hızlı eylem türü ve adres ayrıştırma), `notification-snooze.ts`, `text-diff.ts` (öneri −/+ farkı).
- `features/notifications/`: `notifications-provider.tsx` (rozet sayacı, gerçek zamanlı `incoming`, iyimser kart olayları, **tek "Geri al" şeridi**; açılışta yalnız iki ucuz sayım RPC'si — liste çekilmez), `use-notification-cards.ts` (kart listesi: keyset, sunucu süzgeci, sağlayıcı olaylarını uygular, gerçek zamanlı yeni bildirim listeyi **yeniden dizmez**: "N yeni" hapı), `use-card-actions.ts` (TÜM kart eylemlerinin tek yeri), `notification-card-view.tsx` (popover/page iki yerleşim), `notification-detail.tsx` (panel/page), `notification-popover.tsx`, `notification-bell.tsx`, `notification-inbox.tsx`, `notification-menus.tsx` (Sessize al / Yarın hatırlat / Bu tür bildirimleri kapat), `undo-bar.tsx`.
- Ayarlar: `/settings/notifications` (11 tür anahtarı, sessize alınanlar, ertelenenler).
- Yorum evresi: `CommentNode` / Odak satırı, benim **varsayılan olmayan** tepkimi kalbin yanında emoji olarak gösterir; kalbe dokunmak hâlâ `love` (seçici bildirim kartındadır).

## 4. Mockup parite ve bilinçli sapmalar

Mockup'taki her eleman karşılandı (panel, "Tümü ▾", "N yeni", 5 kart türü + mesaj isteği, hızlı beğen + 6 tepki, satır içi yanıt + balon, takip-geri, fark + kabul/reddet, kilometre taşı, geri al, bölünmüş sayfa, mobil genişleyen kart + tam sayfa detay, hızlı tepki satırı, yanıt (foto · GIF · içerik eki), sessize al / hatırlat / tür kapat). Sapmalar ve eklenenler:

- **Reddetme ve öneri kabulü geri alınamaz** (sunucuda "yeniden aç" RPC'si yok; kabul prompt metnini değiştirir ve sürüm kaydı üretir): iki eylemde şerit yerine tek satırlık onay çıkar. Plan "reddetme geri alınabilir" diyordu; doğru değildi.
- Satır içi **"Kabul et"** yalnız öneren tam yeni metin yazdıysa vardır (`proposed_prompt_text`); yoksa "Düzenleyerek kabul et" bağlantısı önerinin sayfasına götürür (`accept_prompt_edit_suggestion` sahibin gözden geçirdiği metni ister).
- Tepki simgeleri: mockup'taki çizgi ikonlar yerine ürünün gerçek tepki posterleri (`ReactionIcon`).
- **Masaüstünde `/notifications` açılınca seçili ilk kart okundu sayılır** (ayrıntı açıldığı için; `?n=` ile başka kart seçilebilir).
- Takip ayrıntısında "Mesaj gönder" YAPILMADI (doğru sohbet başlatma rotası doğrulanmadı).
- Eklenenler (mockup'ta yok): mesaj isteği Kabul/Reddet, "Okunmamış" ve "Ertelenenler" menü öğeleri, Bu akşam/Gelecek hafta erteleme, Düzenleyerek kabul et, J/K/L/R/E klavye kısayolları, `/settings/notifications`.
- Telegram'da gruplama YOK (bildirimler satır başına gider); sessize alınan/kapatılan yazılmadığı için Telegram'a da gitmez.

## 5. Doğrulama (bu ortamda)

- `npx tsc --noEmit` temiz · eslint (değişen dosyalar) temiz · `npm test` 889/889 (yeni: `notification-mirror` · `-card` · `-actions` · `-snooze` · `text-diff`) · `npm run build` temiz.
- Ağ taklitli Playwright: `run-notifications.mjs` **30/30** (iki ardışık koşu), `run-search-notifications.mjs` 9/9 (eski bildirim senaryoları `run-notifications.mjs`'e taşındı), `run-insights.mjs` 22/22 (kilometre taşı senaryoları yeni arayüze uyarlandı); `run-communities` 68/68, `run-community-home` 38/38, `run-community-posts` 36/36, `run-settings` 13/13, `run-developers` 23/23, `run-legal-notice` 14/14, `run-focus-feed` 35/35, `run-shared-cards` 11/11.
- `run-groups` aralıklı 35/36 verir — değişiklik öncesi (`f2b2029`) derlemede de aynı aralıklı düşüş görüldü (3 koşuda 1). `run-comment-extras` (GIF senaryosu 2) ve `run-telegram-settings` (8/10) değişiklik öncesi derlemede de AYNI sonucu verir.
- **Denenmedi:** gerçek Supabase'e, gerçek Realtime'a, fiziksel iOS/Android'e, gerçek Telegram'a karşı; migration'lar canlıda yok (SQL yalnız yerel PostgreSQL 16'da oynatıldı); `notifications_grouped_page` canlı veri hacminde ölçülmedi (`EXPLAIN` + `pg_stat_statements` migration uygulandıktan sonra yapılmalı, CLAUDE.md §8.13).
