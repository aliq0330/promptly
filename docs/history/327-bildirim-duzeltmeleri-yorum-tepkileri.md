# 327 — Bildirim merkezi düzeltmeleri: yorum tepkileri gönderideki sistemle, ek önizlemesi, "Sesi aç", telefon düzeni

Tarih: 2026-11-04 · Durum: **kodda uygulandı; `20261104100000_comment_reaction_counts.sql` boru hattıyla uygulanır** (`schema_migrations`'a bak). Kaynak: kullanıcının iPhone ekran görüntüleri (bildirim ayrıntısı + gönderi tepki seçicisi) ve 326'nın canlı denemesi.

## 1. Kullanıcının bulduğu sorunlar ve kök nedenler

| Sorun | Kök neden | Çözüm |
|---|---|---|
| "Bu tür bildirimleri kapat"a basınca ekranda hiçbir şey olmuyor | Telefondaki tam sayfa ayrıntı `fixed inset-0 z-[55]`; onay penceresi `Modal` (z-50) olduğu için **sayfanın ARKASINDA** açılıyordu (326 testi yalnız DOM'da var olmasına baktı, vuruş sınamadı). | `ConfirmDialog` + `ReactionSheet` `overLayers` (z-70) alır; test artık düğmenin merkezinde `elementFromPoint` ile vuruş denetler. |
| Sessize alınan kişi için düğme hâlâ "Sessize al" | Sessize alma durumu hiçbir yerde tutulmuyordu. | `features/notifications/mute-store.ts` (oturum boyu paylaşılan durum, `notification_mutes`'tan bir kez okunur, iyimser). Kişi/içerik sessizse seçenek "…sesini aç"; hepsi sessizse ana düğme "Sesi aç"; tek seçenekte ek adım yok. |
| Seçenekler sabit yanıt çubuğunun altında kalıyor | Telefonda yanıt kutusu `shrink-0` alt çubuktu. | Yanıt kutusu içeriğin AKIŞINDA (iki varyantta da); alt satır hiçbir şeyle örtülmez. "Geri al" şeridi tam sayfa ayrıntıda alt menü yokken en alta yakın (`UndoBar aboveNav=false`). |
| Yorum tepkileri yalnız görünüyor, sayılmıyor | 326'da `comment_likes.reaction` yalnız KAYIT idi: sayı/özet/liste yoktu, seçici düz satırdı. | Gönderideki sistemin aynısı (aşağıda). |
| Ekli yorum bildirimde yalnız kısa metin | Bildirim cümlesi sunucuda 90 karaktere kesiliyor, ekler hiç okunmuyordu. | Yorum bilgisi `media_*`/`attach_*` ile okunur; kartta/ayrıntıda önizlenir. |

## 2. Yorum tepkileri = gönderideki sistem

- Hedef türü `ReactionTargetType` = `LikeableContentType | "comment"` (`lib/supabase/likes.ts`). `likeContent/unlikeContent/changeReaction/fetchMyReaction/fetchReactionCounts/fetchReactionFriends/fetchReactorsPage` türe göre `comment_likes` ya da `prompt_likes` kullanır; arayüz bileşenleri aynıdır.
- **Veritabanı** (expand-only, `20261104100000_comment_reaction_counts.sql`): `comment_reaction_counts(p_ids)` ve `comment_reaction_friends(p_ids, p_per)` — SECURITY INVOKER (RLS atlanmaz; okunamayan yorum boş), anon + authenticated. Özet tablosu/tetikleyici YOK: yorumda sayılar zaten küçük, PK (comment_id, user_id) ile okunur.
- Bileşenler: `ReactionGrid` (seçicinin içeriği, `ReactionPicker` artık onu sarar), `InlineReactionPicker` (sayfada AÇIK emoji menüsü), `CommentReactions` (yorum satırında `ReactionButton` + en çok verilen 3 emojinin yığını → "Tepkiler" penceresi), `ReactionButton tone="action"` (kartın "Hızlı beğen" düğmesi) + `onResult` (Geri al şeridi).
- Bildirim kartı: "Hızlı beğen" dokununca gönderideki 6 hareketli emojili seçici açılır (portal; zil paneli açıkken seçiciye/pencereye tıklamak ve Esc paneli kapatmaz). Ayrıntı: seçici AÇIK gelir + ipucu + tepki özeti ("Tepki verdin" / "Sen, Zeynep ve 3 kişi", dokununca Tepkiler).
- Yorum dizisi (`CommentNode`, hem `thread` hem Odak `sheet` düzeni): eski `LikeToggle` + `MyReactionMark` kalktı; `use-comment-thread`'den beğeni durumu çıkarıldı.
- **Tuzak:** `engagement-store` sayıyı İLK görünümde tohumlar; yorum bilgisi gelmeden çizilen tepki bileşeni sayıyı 0'da kilitlerdi → kartta/ayrıntıda yorum bilgisi gelene kadar iskelet; okunamayan yorum "silinmiş" sayılır (iskelet sonsuza dek kalmaz).

## 3. Ek önizlemesi (`lib/notification-extras.ts`, saf + birim testli)

Kart: yazı kısaltılır (4 satır); 1 ek → "1 ek var" + önizleme; 2 ek → iki önizleme (etiketsiz); 3+ → "N ek var" + ilk iki ek. Ayrıntı: yorumun TAMAMI + her ek tam boy. Bugün bir yorumda en çok bir görsel (fotoğraf/GIF) + bir içerik eki olur (308); 3+ dalı şemaya yeni ek türü eklenirse çalışsın diye var. Yalnız ekli (yazısız) yorum boş alıntı kutusu çizmez. Ek içerik kartları bağlı içerik kartlarıyla aynı toplu okumada (tür başına tek sorgu).

## 4. Kişi profilinde sessize al

`ProfileMoreMenu` (profil ⋮ menüsü; aynı bileşen sohbet başlığında da): "Bu kişiyi sessize al" ↔ "Sesini aç" (`useMuteToggle`, durum bildirim merkeziyle ortak). Kullanıcıyı ENGELLEMEZ; yalnız bildirimlerini keser (sunucuda ekleme anında). Profil sayfasında "Geri al" şeridi yok (bildirim sağlayıcısının şeridi orada çizilmez), onay kısa uyarıyla (`announceNotice`).

## 5. Test ve dürüstlük

- Birim: `notification-extras.test.ts` (5). SQL: `comment-reaction-counts.sql` (10, `FAILED=0`). Arayüz: `run-notifications.mjs` 34/34 (seçici kartta açılır, panel seçiciyle kapanmaz, ayrıntıda açık seçici + özet, mobilde onay penceresi vuruş denetimi, yanıt kutusu sabit değil, ek önizlemesi 1/2 ek, "Sesi aç" akışı, kişi ⋮ menüsü), `run-comment-reactions.mjs` 4/4; bitişik paketler (`run-reactions` 11, `run-comment-extras` 20, `run-space-comments` 10, `run-result-stats` 11, `run-focus-feed` 34/35, `run-insights` 22, `run-search-notifications` 9) yeşil.
- `run-stories` 13 ve `run-chat-popovers` 9 KIRMIZI ve **değişiklikten bağımsız**: aynı iki senaryo değişiklik öncesi sürümde (ayrı derleme) de aynı şekilde kırılıyor. `run-focus-feed` 1 senaryo da aynı kategori (bu turda sınanmadı/ayrıştırılmadı).
- **Denenmedi:** gerçek Supabase, gerçek iPhone/Safari (onay penceresi katmanı ve yanıt kutusu düzeltmesi ekran görüntüsünden çıkarıldı, cihazda doğrulanmadı), profil sayfasının kendisi (sahte ağlı testte sayfa `Intl.RelativeTimeFormat` ile çöküyor — taklit veri eksikliği; menü bileşeni sohbet başlığında test edildi), Realtime ile yorum sayaçlarının canlı güncellenmesi (yok; sayılar sayfa açılışında okunur).
- Bilinçli sınır: yorum tepkilerinde "takip ettiklerimden kim" RPC'si var ama yorum özetinde yalnız ayrıntıda kullanılır.
