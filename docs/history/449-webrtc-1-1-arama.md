# 449 — 1-1 sesli / görüntülü arama (native WebRTC, ek altyapı maliyeti 0 TL)

Mevcut birebir sohbetin (`conversations.kind = 'direct'`) başlığına 🎙 sesli ve 📹 görüntülü arama düğmesi eklendi. Medya tarayıcıdan tarayıcıya
**WebRTC (P2P)** ile akar, **Supabase'ten geçmez**. Supabase yalnız (1) çağrı durumunu ve (2) sinyalleşmeyi (offer/answer/ICE) taşır.

**Kullanılmayanlar (bilinçli):** LiveKit/Daily/Agora/Twilio/Vonage/Jitsi/Cloudflare Calls/Firebase/Pusher/Ably, ücretli TURN, SFU/medya sunucusu, VPS,
harici ses-görüntü SDK'sı. Yeni bağımlılık YOK (`package.json` yalnız test listesine bir desen aldı). Kapsam dışı: grup araması, ekran paylaşımı, kayıt.

## Mimari

```
Tarayıcı A ──── RTCPeerConnection (P2P, ses/görüntü) ──── Tarayıcı B
     │                                                         │
     └── Supabase Realtime ── Broadcast `call:<id>` (offer/answer/ICE/durum, KALICI DEĞİL) ──┘
     └── `calls` satırı (ringing→accepted→ended|rejected|missed) + postgres_changes (gelen arama)
```

### Veritabanı (`supabase/migrations/20261212100000_calls.sql`)
- `calls` (id, conversation_id, caller_id, callee_id, type `audio|video`, status `ringing|accepted|rejected|ended|missed`, `end_reason`, started/answered/ended/created_at).
  Durum ↔ zaman damgası tutarlılığı CHECK'tedir (`calls_state_shape`). RLS: yalnız arayan + aranan okur; **istemci insert/update/delete yapamaz**.
  Realtime yayınına eklendi (`postgres_changes` → gelen arama, kabul/ret/bitiş).
- Yazma YALNIZ RPC'ler (SECURITY DEFINER, anon EXECUTE kapalı):
  - `call_start(conversation_id, type)`: arayan `auth.uid()`; konuşma `direct`, **iki üye de `accepted`** (bekleyen mesaj isteğinde arama yok), engel yok
    (`interaction_blocked`), `_assert_can_act`, hız sınırı (10 dk'da 20), kullanıcı başına tek çağrı (`call_busy`; iki kullanıcı için sıralı advisory kilit).
    **Aranan istemciden ALINMAZ**: konuşmanın öbür üyesidir.
  - `call_respond(call_id, accept|reject|cancel|timeout|end, reason)`: rol denetimi (kabul/ret yalnız aranan; vazgeç yalnız arayan), idempotent
    (sonlanmış çağrıda sessizce satırı döner), süresi dolmuş çalan çağrı kabul edilemez → `missed` (**hata fırlatılmaz**: fırlatmak aynı işlemdeki
    `missed` güncellemesini de geri alırdı — SQL testi bunu yakaladı; istemci dönen satırın `status`'üne bakar).
  - `calls_my_open()`: sayfa açılışında bana ait çalan/yarım kalan çağrılar (süresi dolanlar önce kapatılır). 4 saatten eski `accepted` çağrı `stale` ile kapanır.
  - Cevapsız çağrıda aranana tek `system` bildirimi (`seni sesli/görüntülü aradı, cevapsız kaldı.`, dedupe `call-missed:<id>`).
- Sinyal kanalı yetkisi: `can_use_call_topic('call:<uuid>')` + `realtime.messages` politikaları (yalnız çağrının iki tarafı okur/yazar; `typing:` ile aynı kalıp).
  **Dashboard'da Realtime "Allow public access" KAPALI olmalı.**

### Sinyalleşme (veritabanına yazılmaz)
Private Broadcast `call:<çağrı id>`; olaylar `call_offer, call_answer, ice_candidate, call_accepted, call_rejected, call_ended, call_media`
(sonuncusu mikrofon/kamera durumu için, ek). Her gelen yük `parseSignalPayload` ile doğrulanır (tip, SDP ≤ 64 000 karakter, aday ≤ 2000).
**El sıkışma ARANAN tarafından sürülür** (Broadcast kalıcı değil; aranan kanala girmeden gönderilen teklif kaybolurdu):
1. Arayan `call_start` → kanala girer → `ringing`.
2. Aranan kabul eder (mikrofon izni kullanıcı tıklamasında alınır) → kanala girer → `call_accepted` ("hazırım"; teklif gelene dek 2 sn'de bir, en çok 8 kez).
3. Arayan `call_accepted`'i görünce teklifi üretir ve gönderir (yinelenen "hazırım"da AYNI teklifi yeniden gönderir, ikinci teklif üretmez).
4. Aranan yanıtı gönderir; ICE adayları iki yönde akar. Uzak açıklama ayarlanmadan gelen adaylar sıraya alınır.

### İstemci
- `src/lib/webrtc/`: `types.ts`, `call-rules.ts` (saf kurallar, süreler, hata sınıflaması, yük doğrulama, sekme sahipliği), `call-controller.ts`
  (**React dışında** yaşayan yaşam döngüsü; bağımlılıklar enjekte → sahte eşle birim testli; Strict Mode çağrıyı bitirmesin diye), `peer.ts`
  (`RTCPeerConnection` + `getUserMedia`), `signaling.ts` (Broadcast), `ice.ts` (**ICE sunucuları tek yerde**), `ringtone.ts` (Web Audio, dosya yok).
- `src/lib/supabase/calls.ts` (RPC'ler), `src/features/calls/`: `call-provider.tsx` (AppShell'de; gelen arama her sayfada, Odak dahil),
  `use-webrtc-call.ts`, `incoming-call.tsx`, `call-screen.tsx`, `call-controls.tsx`, `call-buttons.tsx` (başlık düğmeleri).
- Aşamalar: `idle · calling · ringing · connecting · connected · ended · rejected · missed · failed`. Süreler: çalma 45 sn (sunucu 60), bağlanma 30 sn,
  `disconnected` toparlanma 10 sn.
- Temizlik (`finish`, idempotent): zamanlayıcılar, `getTracks().stop()` (mikrofon/kamera ışığı söner), `pc.close()`, kanaldan çıkış, `<video>/<audio>.srcObject = null`,
  sekme sahipliği kaydı bırakılır. `pagehide`'da karşıya `call_ended` gider.
- Mikrofon/kamera YALNIZ kullanıcı eyleminde (arama düğmesi / Kabul et) istenir; izin reddedilirse arama hiç oluşmaz (gelen aramada reddedilir).
- Çoklu sekme: etkin arama sekmesi `localStorage` `promptly-active-call` kaydını 5 sn'de yeniler; yenilenen/başka sekme canlı kaydı görürse çağrıya dokunmaz,
  görmezse yarım kalan `accepted` çağrıyı `interrupted` ile bitirir. Gelen arama iki sekmede de çalar, birinde kabul edilince diğeri kapanır.
- Arayüz: masaüstünde ortalanmış kart, telefonda tam ekran (güvenli alan), uzak video + yüzen kendi görüntü, mikrofon/kamera/bitir (≥48 px, `aria-pressed`, ipucu),
  iOS için `playsInline` + oynatma engellenirse "Sesi başlatmak için dokun". Yeni token: `--color-call-stage`. Yeni ikonlar: `Phone`, `PhoneOff`, `MicOff`, `VideoOff`.
- i18n: `translations-calls.ts` (TR+EN, teknik hata adı kullanıcıya gösterilmez). `notification-message.ts`'e iki cevapsız arama cümlesi.

## Testler
- `supabase/tests/calls.sql` — 37 kontrol (RLS, RPC rolleri, meşgul, engel, bekleyen istek, grup, süre aşımı, stale, anon yetkisi, CHECK'ler).
- `src/lib/webrtc/*.test.ts` — 40 birim test (kurallar + sahte eşle denetleyici yaşam döngüsü, zaman aşımları, temizlik).
- `tests/messaging-ui/run-calls.mjs` — 22 senaryo, **iki ayrı tarayıcı bağlamı + Chromium sahte kamera/mikrofon ile GERÇEK WebRTC bağlantısı** (ses akışı, video karesi,
  süre, mikrofon/kamera durumu, reddet/vazgeç/cevapsız, izin reddi, meşgul, desteklenmeyen tarayıcı, yenileme, çoklu sekme, masaüstü/mobil/İngilizce/koyu, sinyalleşme güvenliği).
  Ağ ve Realtime taklitlidir (`realtime-hub.mjs`); **gerçek Supabase'e KARŞI DENENMEDİ**.

## Elle test listesi (gerçek cihaz/ağ — otomatikleştirilemeyen)
1. Chrome (masaüstü) ↔ Chrome (Android): sesli, görüntülü, iki yönde.
2. Safari (masaüstü) ↔ Safari (iPhone): izin penceresi, ses duyuluyor mu (autoplay), `playsInline` video, kilit ekranı/arka plana geçince davranış.
3. Edge ↔ Chrome. 4. Farklı ağlar (ev Wi-Fi ↔ mobil veri) — STUN yeterli mi? 5. Aynı Wi-Fi.
6. Çağrı sırasında Wi-Fi → mobil veri geçişi (toparlanma / 10 sn sonra "bağlantı kurulamadı").
7. Çağrı sırasında sekme kapat (diğer taraf ~10–30 sn içinde `failed`/`ended` görür). 8. Aranan hiç cevap vermez (45 sn → cevapsız + bildirim).
9. Mikrofon/kamera izni tarayıcıdan sonradan geri verilince tekrar dene. 10. Bluetooth kulaklık takılı/çıkarılı. 11. Kurumsal/okul ağı (TURN yokluğu).
12. Canlı Supabase'de: Realtime "Allow public access" kapalıyken `call:` kanalına üçüncü bir kullanıcının girememesi.

## Bilinen sınırlar
- **TURN yok**: iki taraf da simetrik NAT / katı kurumsal güvenlik duvarı / bazı mobil operatör CGNAT'ı arkasındaysa ya da UDP kısıtlıysa P2P kurulamaz →
  arama "Görüşme bağlantısı kurulamadı" ile biter (30 sn). Çözüm ileride `ice.ts`'e TURN eklemektir (maliyetli; bu sürümde yok).
- **IP görünürlüğü**: ICE adayları karşı tarafın tarayıcısına IP adresini gösterir (P2P'nin doğası; Gizlilik metni bu cümleyle güncellenmedi — ürün/hukuk kararı).
- **Servis worker/push yok** (projenin kararı): arama yalnız site AÇIKKEN çalar; kapalı sekmeye bildirim gitmez, kaçırılan arama sonradan bildirim olarak görünür.
- Sohbet akışında "🎙 Sesli görüşme — 04:32" sistem mesajı EKLENMEDİ (mesaj şemasına dokunmamak için); geçmiş `calls` tablosundadır, cevapsızlar bildirimdir.
  Bildirim kategorisi, `/messages/local` adresli `system` bildirimlerin mevcut kuralı gereği "Topluluklar" altında görünür (`_notification_category`).
- Kamera "kapat" `track.enabled=false`'tur (görüntü siyah gider); bazı tarayıcılarda donanım ışığı yanık kalabilir. Arama bitince izler tamamen durdurulur.
- Yalnız tek çağrı: kullanıcı aynı anda tek görüşmede olabilir; "beklemeye al"/çağrı bekletme yok.
- Edge Function/CI gerektirmez; yalnız migration canlıya uygulanmalıdır (bkz. canlı durum).
