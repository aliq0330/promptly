# 382 — Mesajlar dock'unda kanal listesi panelin içinde açılır

**Karar (kullanıcı, mockup + "dock burdaki gibi sade olsun"):** 381'deki "kanal listesi sohbet listesinin yerine açılır" sistemi sağ alttaki Mesajlar dock'una da gelir. Dock olduğu gibi sade kalır (başlık, arama kutusu, düz satırlar); ekip, proje ve topluluk kanal/oda listesi de **aynı sadelikte** panelin içinde açılır. Kontrol satırı, çipler, seçim modu, ⋮ menüsü ve sessize alma kartı dock'ta YOKTUR (sayfadaki liste onları taşımaya devam eder).

## Davranış
- Mesajlar listesinde ekip (kanalları toplanmış satır) ya da topluluk satırı → panelin içinde `team` / `community` görünümü; diğer sohbetler eskisi gibi sohbeti açar (`DockListView` `onOpen`, `ConversationRow`'un `opensHub` kuralıyla aynı).
- Kanal listesi (`features/messages/dock-hub-view.tsx`): üstte `DockHeader` (‹ · ad + alt bilgi · yetkiliye "+" · tam sayfada aç · küçült), altında arama kutusu ("Kanallarda / Sohbetlerde / Odalarda ara"), altında `HubRow` satırları (sayfadakiyle AYNI satır bileşeni; `onOpen` ile düğme olur). Ekip listesinde Kanallarınız + Projeler; projeye dokununca proje listesi; toplulukta Odalarınız.
- **‹ her zaman bir üst seviye:** sohbet → kanal/oda listesi (proje kanalı → proje listesi), proje listesi → ekip listesi, kanal listesi → Mesajlar. Karar `DockPanel`'dedir (açık sohbetin ekibi/projesi/topluluğu sohbet listesinden + `useTeamChannelList`ten).
- **Sohbetin üstündeki kanal/oda çipleri (`ChannelChipsRow`) KALKTI** (dosya silindi): kanal değiştirmek = ‹ ile listeye dönüp başka satıra dokunmak. Oda satırı `dock.openChat(topluluk, oda)` ile o odayı açar (`DockView.chat.roomId` → `useActiveRoom` başlangıç odası).
- "+": ekipte `manage_channels` olana ekip sayfasındaki yeni kanal ekranına (panel küçülür, sayfaya gidilir); projede lidere `NewProjectChannelDialog`; toplulukta `manage_rooms` olana `RoomFormModal`. Tam sayfada aç: ilgili `?hub=` adresi (381'in sol sütun düzeni).
- Panelin boyutu değişmez (24 rem × en çok 36 rem); sayfa/adres değişmez.

## Metinler / testler / sınırlar
- Yeni metin yok (381'in `th.search.*`, `th.filter.empty`, `th.default`… anahtarları yeniden kullanıldı). **İngilizce karşılıklar zaten var.**
- Ağ taklitli Playwright: `run-team-chat-hub.mjs` 21–23 (sade liste, arama, sohbet, ‹ seviyeleri, proje listesi, yetkisiz üyede "+" yok, İngilizce), `run-rooms.mjs` 12f (topluluk oda listesi → oda sohbeti → ‹).
- Gerçek Supabase/cihaz DENENMEDİ. Sınır: dock'ta sabitleme/okundu/sessize alma toplu eylemi yok (sayfada var); dock'taki Mesajlar listesine çip/⋮ eklenmedi (kullanıcı kararı: "olduğu gibi sade").
