# 352 — Topluluk sohbet odaları

**Durum: uygulandı (2026-11-09).** Kullanıcının mockup'ı (`Topluluk Sohbet Odaları`, 7 ekran) birebir kuruldu: Mesajlar çipleri, topluluk satırı, sohbet merkezi, oda sohbeti, oda değiştirici, oda ekle/düzenle, oda yönetimi, masaüstü düzeni.

## Karar: mesajlar aynı sohbette, `messages.room_id` ile odalara ayrılır

Mockup'ın ilk taslağı "her oda ayrı `conversations` satırı" diyordu; **koddan vazgeçildi**. Sebep: sabitleme, yıldız, tepki, arama, yazıyor, rapor, `can_read_message`, topluluk yetenek denetimleri (`chat_group_can(conversation_id)`) hep `conversation_id` = topluluk kimliği varsayar; her oda ayrı sohbet olsaydı hepsi yeniden yazılırdı.

| Konu | Karar |
|---|---|
| Varsayılan oda ("Genel") | Mevcut sohbet. Mesajlarında `room_id` **NULL** kalır; eski mesajlar/eski istemci aynen çalışır, geri doldurma YOK. Her `chat_groups` satırının tetikleyiciyle bir varsayılan odası olur. |
| Diğer odalar | `community_rooms` satırı + mesajlarda `room_id`. Aynı sohbet, aynı Realtime, aynı sabit/yıldız/tepki. |
| Üyelik | Topluluktan türer; oda başına üyelik satırı YOK (bir olay bütün üyelere yazmaz, `258-*`). |
| Kişisel durum | `community_room_state` (okundu imleci + sessize alma), yalnız kendi satırım. Genel'in okundu imleci eskisi gibi `conversation_members.last_read_at`'tedir. |
| Okunmamış | Okuma anında hesaplanır: `community_rooms_overview` (oda başına) ve genişletilen `group_unread_counts` (toplam; sessize alınan/arşivli/okunamayan oda hariç). |
| Yetki | Yeni yetenek `manage_rooms` (üçlü güncelleme: `_group_all_capabilities` + `_group_default_permissions` + `lib/chat-groups.ts`); sahip her zaman, yönetici varsayılan evet, moderatör hayır. Silme yalnız sahip. Yetki matrisine satır otomatik eklenir (`groups.cap.manage_rooms`). |
| Yazma/okuma | `messages` RLS: okuma `can_read_message` + `can_read_room`; yazma Genel için `can_send_message`, diğer odalar için `can_post_room` (üye, topluluk açık, oda arşivsiz, oda politikası). Özel oda (`read_policy='staff'`) üyeye mesajıyla birlikte görünmez. |
| Genel'in "kim yazar"ı | `chat_groups.posting_policy` (mevcut sohbet ayarı) kaynak kalır; `update_community_room` Genel için onu yazar. |
| Sınırlar | Topluluk başına 20 etkin oda, ad ≤40, açıklama ≤120, bölüm ≤24; aynı ad (büyük/küçük harf, boşluk farksız) yok; arşivli oda salt okunur. |

Migration `20261109100000_community_rooms.sql` yalnız ekleyicidir (`drop` yok). `-- ci:allow-destructive` gerekmedi.

## Ekranlar (mockup → kod)

| Mockup | Kod |
|---|---|
| 1 Mesajlar | `conversations-pane.tsx` çipler (`data-kind-chips`; Ekip = tamamen kapalı topluluk) · `conversation-row.tsx` (`# oda` etiketi, Ekip rozeti, iğne, ok) · sabitleme: `conversation_members.pinned_at` + seçim çubuğunda "Sabitle" |
| 2 Sohbet merkezi | `/messages/local?id=&view=rooms` → `rooms/rooms-hub.tsx` |
| 3 Oda sohbeti | `local-conversation-view.tsx` + `rooms/room-chip-row.tsx`, `?room=` adres parametresi |
| 4 Oda değiştirici | `rooms/room-switcher.tsx` (alttan açılan kart) |
| 5 Oda ekle | `rooms/room-form-modal.tsx` (aynı form düzenleme + "Bölüme taşı") |
| 6 Oda yönetimi | Yönetim → "Sohbet odaları": `rooms/rooms-manage-section.tsx` |
| 7 Masaüstü | sol panelde oda ağacı `rooms/room-tree.tsx`; sağda `rooms/room-side-panel.tsx` ("Bu oda"; ≥2xl'de açık, üye düğmesiyle aç/kapa) |

Çeviriler `translations-rooms.ts` (TR+EN). Saf kurallar `lib/community-rooms.ts` (+ birim testi). Veri katmanı `lib/supabase/community-rooms.ts`.

## Bilinçli sapmalar ve sınırlar

- **Çip satırı:** `Mesajlar` liste sayfası için proje rehberi tek menü der; mockup'taki dört çip eklendi, **"Sohbetler ▾" menüsü KALDI** (istekler, arşiv, yıldızlı mockup'ta yoktu; özellik kaybı olmasın).
- **Renk:** mockup görseli mor idi; Promptly'nin tek paleti (mavi/turuncu) kullanıldı.
- **Kullanıcı avatarı** Mesajlar başlığında çizilmedi (mobil üst çubukta zaten avatar menüsü var).
- **Dock (sağ alttaki Mesajlar paneli):** oda çipi/değiştirici çalışır; sohbet merkezi (oda listesi) ve oda ağacı yalnız sayfada vardır.
- **Özel oda** yalnız "yönetim görür" düzeyindedir (kişi seçmeli yok).
- Oda olayları işlem geçmişine (`chat_group_audit`) yazılmaz (CHECK genişletmemek için).
- Oda mesajı bildirim üretmez; okunmamış rozeti vardır. Başka odada gelen mesaj açık sohbetin listesine girmez (sayı güncellenir).
- Gerçek Supabase/Realtime'a, gerçek cihaza KARŞI DENENMEDİ: SQL testi yerel PostgreSQL'de, arayüz testi ağ taklitli (`run-rooms.mjs`).
- `run-chat.mjs` 9 numaralı senaryo "Koşullar güncellendi" bandı alt köşede "Güncel mesajlara dön" düğmesini örttüğü için bu ortamda düşüyor (ekran görüntüsünde görüldü; odalarla ilgisiz birebir sohbet senaryosu, temel sürümle karşılaştırılmadı).

## Testler

- `supabase/tests/community-rooms.sql` (37 kontrol) — varsayılan oda, yetenek, doğrulamalar, yazma/okuma kuralları, özel oda gizliliği, okunmamış, okundu imleci, sessize alma, arşiv/silme, sıralama, sınır, doğrudan yazma kapalı, sabitleme.
- `tests/messaging-ui/run-rooms.mjs` (29 senaryo) — mockup'ın yedi ekranı + İngilizce + mobil taşma + eski veritabanı geri dönüşü.
- `src/lib/community-rooms.test.ts` (11).
- Regresyon: SQL `chat-groups`, `group-unread`, `chat-features`, `chat-group-permissions`, `communities`, `team-spaces` (hepsi `FAILED=0`); arayüz `run-groups` 36/36, `run-chat-select` 10/10, `run-message-dock` 17/17, `run-community-home` 38/38, `run-team-spaces` 25/25, `run-teams` 16/16.
