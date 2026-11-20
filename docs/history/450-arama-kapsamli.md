# 450 — Arama: küçült / taşı / yer değiştir, geçmiş, ayarlar, Mesajlar ray düzeni

449'daki 1-1 sesli/görüntülü aramanın (native WebRTC, ek altyapı 0 TL) ilk kullanıcı testinden çıkan eksikler ve istenen eklemeler tek dalda kapatıldı.
**Yeni bağımlılık, yeni medya/sinyal servisi, TURN, Edge Function YOK**; medya hâlâ tarayıcıdan tarayıcıya akar, hiçbir şey kaydedilmez.

## Kullanıcının istediği
Ekranın ortasında çıkan, küçültülemeyen görüşme; mesaj akışına düşmeyen arama kayıtları; arama geçmişi bölümü; kendi görüntüsünü büyük / konuşanı küçük
yapabilme; küçük pencereyi fareyle taşıma; Mesajlar sayfasının "84 px ikon rayı + tam genişlik çalışma alanı" düzeni.

## Görüşme ekranı (`features/calls/`)
- **Küçült**: sol üstteki düğme görüşmeyi her sayfanın üstünde duran **mini pencereye** çevirir (`MiniCall`: görüntülüde karşı görüntü, sesli görüşmede
  avatar + süre; mikrofon · bitir · "Görüşmeye dön"). Mini pencere sürüklenir ve köşelere yapışır. Küçültülmüşken görüşme normal biterse sessizce
  kapanır (kısa bildirim); reddedildi/cevapsız/başarısız ise ekran geri gelir ki neden okunsun.
- **Uzak ses** artık görüntü öğesinden değil, görüşme boyunca yaşayan tek `RemoteAudio`'dan çalar → küçültme, görüntü yer değiştirme veya sayfa değiştirme
  sesi kesmez. `<video>` öğeleri hep `muted`'tır.
- **Küçük pencere (PiP)**: fare/parmak/kalemle sürüklenir (Pointer Events), bırakınca en yakın köşeye yapışır (180 ms; hareketi azalt = anında); ok tuşları köşe
  değiştirir; **dokununca iki görüntü yer değiştirir** (kendin büyük, konuşan küçük). Geometri saf `lib/webrtc/call-window.ts` (birim testli), kanca `useCornerDrag`.
- **⋯ menüsü** (`CallMenu`): mikrofon / hoparlör (`setSinkId`, Safari'de gizli) / kamera seçimi (görüşmeyi koparmadan `replaceTrack`), kamerayı çevir (telefon),
  görüntüleri değiştir. Seçilen cihaz cihaz tercihi olarak saklanır.
- **Bağlantı kalitesi** çipi (4 çubuk + kelime): `getStats` ile RTT + paket kaybı, 3 sn'de bir (`qualityFrom`: iyi < 150 ms ve < %2, orta < 350 ms ve < %8).
- **Yeniden bağlanma**: bağlantı koptuğunda arayan ICE'i yeniden başlatır (3 sn sonra, 5 sn arayla, en çok 3 kez); aranan yeni teklifi yanıtlar; 20 sn toparlanamazsa biter.
  Ekran uyumasın diye Screen Wake Lock istenir (desteklenmiyorsa sessizce geçilir).
- **Hazırlık ekranı** (`CallLobby`, yalnız görüntülü): "Görüntülü ara"ya basılınca izin ALINIR (kullanıcı hareketi), kamera önizlemesi + mikrofon seviyesi + aç/kapat +
  cihaz seçimi; **Vazgeç çağrı OLUŞTURMAZ ve kamera ışığı söner**; kamera/mikrofon kapalı başlatılırsa karşı taraf bağlanır bağlanmaz öğrenir (`call_media`).
- Gelen arama: zil sesi, tarayıcı bildirimi ve sekme başlığı uyarısı (`incomingAlert`, saf): cihaz tercihi + rahatsız etme saatleri + "Görünmez" durumu susturur
  (kart HER ZAMAN görünür). Karar gelene dek zil çalmaz (sessiz tercihte kısa çınlama olmasın); rahatsız etme saati okuması 1,5 sn'de gelmezse "sessiz saat yok" sayılır.

## Arama kayıtları ve geçmiş
- **Sohbet akışı**: birebir sohbette bitmiş çağrılar mesajlarla zaman sırasıyla `CallLogRow` olarak serpiştirilir (`interleaveCalls`, saf): yön oku + tür simgesi +
  cümle + (görüşüldüyse) süre + saat; cevapsız gelen **kırmızı**; "Geri ara" / "Tekrar ara". Arama iki mesajın arasındaysa mesaj öbeği bölünür. Çağrılar yalnız
  yüklü mesaj penceresinin içinde görünür (eski sayfa varsa daha eski çağrılar gizli). Canlı arama bitince kayıt kendiliğinden eklenir (`call-events` yayını).
- **Mesajlar → "Sohbetler ▾" → Aramalar** (`CallHistoryList`): benim bitmiş çağrılarım, en yeni üstte, imleçli sayfalı (`LoadMore`), süzgeç çipleri (Tümü · Cevapsız ·
  Sesli · Görüntülü), satırdan tekrar arama, menüde cevapsız sayısı rozeti. **Hata "boş" sayılmaz** (Tekrar dene).
- **Mesaj listesi önizlemesi**: son arama son mesajdan yeniyse satır aramayı gösterir ("Cevapsız sesli arama", kırmızı) — modül düzeyi depo (`call-log-store`, satır başına istek yok).
- **Kişi bilgisi**: "Arama geçmişi" kartı (bu kişiyle son 5 arama).
- Tek canlı kaynak: `CallProvider` her Realtime çağrı satırını `call-events` ile yayınlar; sohbet akışı, liste, önizleme ve rozet aynı akıştan beslenir (ek Realtime kanalı YOK).

## Ayarlar → Aramalar (`/settings/calls`)
- **Hesap düzeyi (veritabanı, sunucu zorlar)**: *Seni kimler arayabilir?* Herkes · Takip ettiklerim (aranan arayanı takip ediyorsa; yön aranandan arayana) · Hiç kimse;
  cevapsız arama bildirimi. `call_settings` tablosu istemciye KAPALI; yalnız `get_my_call_settings` / `set_my_call_settings`. Reddedilen arama `call_privacy` koduyla
  gelir, çağrı satırı oluşmaz.
- **Bu cihaz (localStorage)**: zil sesi, rahatsız etme saatlerine uy, arka planda uyar (+ bildirim izni isteme), varsayılan mikrofon/kamera/hoparlör.
- Sayfanın altında dürüst not: ses/görüntü doğrudan iki cihaz arasında akar, Promptly'de saklanmaz; bağlanırken karşı tarafın cihazı IP adresini görebilir.

## Mesajlar çalışma alanı (kullanıcının referans mockup'ı)
`/messages*` rotalarında **masaüstünde de 84 px ince ray** (`NavRail desktop`) çizilir, 248 px kenar çubuğu çizilmez ve çalışma alanı tam genişlik çalışır
(`messages/layout.tsx`: `lg:max-w-none`). Diğer sayfalarda üç kompozisyon aynen (387-*): kenar çubuğu `lg+`.

## Veritabanı
- `20261213100000_call_settings.sql` (yalnız ekleyici): `call_settings`, `get_my_call_settings`, `set_my_call_settings`, geçmiş indeksleri
  (`calls_caller_history_idx`, `calls_callee_history_idx`), `call_start` (gizlilik denetimi eklendi) ve `_call_mark_missed` (bildirim tercihi) yeniden yazıldı.
  Anon EXECUTE kapalı. SQL testi `supabase/tests/call-settings.sql` (14 kontrol); `calls.sql` (37) değişmeden geçer.
- `scripts/smoke-test.mjs` iki yeni kontrol (ayar RPC'leri ziyaretçiye kapalı).

## Testler
Birim `src/lib/webrtc/*.test.ts` (66: denetleyici yeniden bağlanma/kalite/cihaz, kurallar, geçmiş serpiştirme, tercihler, pencere geometrisi) + SQL 37 + 14 +
`tests/messaging-ui/run-calls.mjs` (iki tarayıcı bağlamı, Chromium sahte kamera/mikrofon ile GERÇEK WebRTC; küçült/sayfa değiştir, fareyle sürükle + yer değiştir, ⋯ menüsü,
hazırlık ekranı, kayıtlar, geçmiş, ayarlar, zil tercihi, ray düzeni, mobil, İngilizce). **Gerçek Supabase'e, gerçek cihaza/Safari'ye KARŞI DENENMEDİ.**

## Elle test (gerçek cihaz)
iPhone Safari'de mini pencere + sayfa değiştirme (autoplay/arka plan), kamera çevirme, Bluetooth kulaklık seçimi, ağ değişiminde yeniden bağlanma,
farklı ağlarda bağlantı kurma (TURN yok), `setSinkId` hoparlör seçimi, tarayıcı bildirim izni, rahatsız etme saatinde zilin susması.

## Bilinçli sınırlar / karar bekleyenler
- TURN yok (449'daki sınır aynen); servis worker/push yok → arama yalnız site açıkken çalar.
- **Gizlilik metni** (`legal-content.ts`) IP görünürlüğü cümlesiyle HÂLÂ güncellenmedi (ürün/hukuk kararı); Ayarlar → Aramalar'daki not bilgilendiricidir.
- Canlıda elle doğrula: Realtime "Allow public access" KAPALI (449), `20261213100000` migration'ı deploy hattıyla uygulanır (`schema_migrations`).
- Kamera çevirme yalnız `facingMode` destekleyen cihazlarda anlamlıdır; masaüstünde birden çok kamera varsa menüde seçilir.
