# 9.484 — Bildirim standardı: Topluluk ve Ekip'te aynı kademe, aynı sözcük, aynı ekran

Kullanıcı, topluluk ve ekipte bildirim ayarlarının dağınık olduğunu söyledi (merkez · tüm sohbetler · oda/kanal); mockup tuvalde onaylandı ("burdaki gibi uygula"). Sorun: aynı iş için altı ayrı kontrol — topluluk merkezde 3 düzey + süre, ekipte yalnız anahtar; "Yalnızca önemli" ↔ "Yalnızca bahsetmeler"; oda yalnız anahtar, kanal 3 düzey + miras bandı; dört ayrı giriş.

## Standart (kural)

- Üç kademe, iki sistemde aynı sırayla: **Merkez** (Topluluk | Ekip) → **Tüm sohbetler** → **Oda | Kanal** (ekipte araya Proje girer).
- **Tek sözlük** (`lib/i18n/translations-notify.ts`, `notify.*`): merkez = Tümü · Yalnız önemli · Sessiz; sohbet düzeyi = Tüm mesajlar · Bahsetmeler · Sessiz; kanalda ayrıca **Varsayılan**. "Sessize al" anahtarı yerine her yerde "Sessiz" SEÇENEĞİ.
- **Miras**: Sessiz üstten aşağı iner (ekip → proje → kanal; mevcut davranış korundu); üst kademe sessizken alt kademede `NotifyInheritBanner` ("Ekibin sesini aç"). **Varsayılan** = kanalın kendi seçimini silmek (`team_set_channel_notify(null)`; sunucuda zaten `coalesce(team_notify_level, notify_default)`); etkin düzey kanal varsayılanına eşitse "Varsayılan" seçili görünür (`lib/notify-standard.ts` `channelPick`, birim testli) — SQL değişmedi.
- **Her zaman gelenler** notu iki ayar sayfasında aynı etiketle (`notify.always.label`): ekipte sahiplik/rol/erişim süresi, toplulukta sahiplik/rol.

## Ortak parçalar

- `features/notify/notify-section.tsx`: `NotifySection` (oda bilgisi ve kanal bilgisi AYNI "Bildirimler" bölümü: seçenek kartları + açıklama; `data-notify-section="room|channel"`), `NotifyInheritBanner`, `NOTIFY_PICK_LABEL`/`NOTIFY_CHANNEL_HINT` (tek sözlük). Odanın açıklamaları kendine özgüdür (`notify.room.*`): topluluk odası bildirim üretmez, yalnız okunmamış sayısını etkiler — kanal cümlesi ("okuyana kadar bir kez bildirim") odaya yazılmaz.
- Ayar sayfaları (`SxPage` dili): topluluk "Senin tercihlerin" ve ekip "Bildirimler" aynı bölüm sırası — merkez (`ChoiceGroup sx-seg`) → [topluluk: süreli sessiz] → sohbet → odalar/projeler/kanallar satırları (`SxRow` + `SxBtn tone="sel"` → `SxPicker`) → "Her zaman gelenler". Kanal ayarlarındaki bildirim seçimi de aynı dört seçenek.
- `ChatMuteToggle` (anahtar) topluluk ayar sayfasında "Tüm topluluk sohbetleri: Tüm mesajlar | Sessiz" segmenti oldu (aynı `useChatMute`, aynı `muted_at`).

## Bilerek bu dilimde YAPILMAYANLAR (Faz 2, yeni SQL ister)

Mockup'ın şu parçaları yeni veri/tetikleyici gerektirdiği için gösterilmedi (uydurma kontrol çizilmez):
1. **Oda düzeyi** Tüm mesajlar · Bahsetmeler · Sessiz + Varsayılan (bugün oda iki düzeyli: `community_room_state.muted_at`); "Bahsetmeler" okunmamış sayısında mention süzgeci ister (`group_unread_counts`, `community_rooms_overview`).
2. **Tüm sohbetler düzeyi** (topluluk: yalnız Tüm mesajlar/Sessiz; ekip: bu satır hiç yok) ve odaların/kanalların bunu "Varsayılan" olarak izlemesi.
3. **Ekip merkez düzeyi** "Yalnız önemli" (bugün ekip merkezi Tümü/Sessiz).
4. **Süreli sessize alma** ekip · proje · oda · kanal kademelerinde (yalnız topluluk merkezinde var; `muted_at` tüketicilerinin hepsi süre bitişini bilmeli).
5. Telefonda `MuteCard` anahtarları (ekip/proje sayfaları) ve kanal listesindeki seçim modu hâlâ anahtar/"Sessize al" der — Faz 2'de aynı `NotifySection`'a bağlanır.

## Testler

`notify-standard.test.ts` (6) · `run-rooms` oda seçici, `run-team-chat-hub` miras bandı + açıklama, `run-team-hub` kanal düzeyi, `run-communities` 16b (düzey, süre, sohbet segmenti `muted_at`). `run-rooms` (2) ve `run-communities` (11) paketlerindeki kırmızılar değişiklikten ÖNCE de aynıdır (bu ortamda baştan kırmızı; aynı senaryo adları). İngilizce karşılıklar eklendi. Migration YOK, canlıya etkisi yok.
