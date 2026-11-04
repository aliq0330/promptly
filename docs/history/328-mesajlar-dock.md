# 328 — Mesajlar dock'u: büyük ekranda sağ altta sabit "Mesajlar" hapı + sayfadan çıkmadan açılan sohbet paneli

Tarih: 2026-11-04 · Durum: **kodda uygulandı** (migration YOK, yalnız istemci). Kaynak: kullanıcının isteği ("twitter'daki gibi": telefonda mesajlar sayfasına gider, büyük ekranda sağ altta sabit duran Mesajlar, tıklayınca modal gibi açılır, oradan kişileri görüp hızlı yazılır) + X'in sağ alttaki mesaj paneli ekran görüntüleri; önce tıklanabilir bir taslak onaylandı.

## Davranış

| Ekran | Mesaj simgesi / dock |
|---|---|
| Telefon, tablet (< `lg`, 1024px) | Hiçbir şey değişmedi: üst menüdeki simge `/messages` bağlantısı. (Tablette 72px ikon rayı var, panele yer yok.) |
| Masaüstü (≥ `lg`), oturumlu | Sağ altta SABİT "Mesajlar" hapı (en yeni üç sohbetin avatarı + okunmamış SOHBET sayısı). Basınca sağ altta panel açılır: arkası loşlanmaz, sayfa/adres değişmez, sayfa değişse de panel ve açık sohbet kalır. Üst menüdeki mesaj simgesi de aynı paneli açar/kapatır (`aria-expanded`). |
| `/messages*`, `/focus`, ziyaretçi | Dock yok (orada zaten tam arayüz / tam ekran sahne / oturum yok); simge bağlantı olarak kalır. |
| Yazma ekranı, hikâye açık | Dock `data-app-chrome` taşır → mevcut CSS kuralı onu gizler. |

Panelin dört görünümü (`DockView`): **liste** (arama, sohbetler, "N mesaj isteği" şeridi, "Yeni sohbet") · **istekler** (geri okla gelen kutusu) · **sohbet** · **taslak** ("Yeni sohbet" ile seçilen yeni kişi; sohbet ilk gerçek mesajla oluşur, taslakta hiçbir şey yazılmaz — `NewChatDraftView`'ın kuralı aynen). Üst şerit her görünümde `DockHeader`: [geri] başlık … [ek eylemler] [tam sayfada aç] [küçült]. "Tam sayfada aç" paneli küçültüp `/messages` ya da `/messages/local?id=` sayfasına gider. Küçültünce görünüm hatırlanır (hap'a basınca kaldığı sohbetten devam); odak hap'a döner.

## Mimari (yeni arayüz YOK, mevcut parçalar kullanıldı)

- `features/messages/message-dock-provider.tsx`: durum (`open`, `view`) `AppShell` seviyesinde (`MessageDockProvider`) — rota değişince korunur. `useMessageDockEnabled()` = `≥ lg` + oturumlu + `/^\/(messages|focus)(\/|$)/` dışı; üst menüdeki simge buna bakar (`header.tsx`).
- `message-dock.tsx`: hap + panel. `dock-list-view.tsx`: liste/istekler; mevcut `ConversationList`/`ConversationRow` (yeni `onOpen` → satır bağlantı yerine düğme) ve `NewChatModal`. `dock-header.tsx`: ortak üst şerit.
- **Sohbet = `LocalConversationView`'ın dock kipi** (`dock` prop'u: `conversationId`, `onBack`, `onExpand`, `onMinimize`): `id` adres çubuğundan değil prop'tan gelir; sayfanın `?share…=`/`?hl=`/`?panel=` parametreleri DOCK sohbetine ait DEĞİLDİR (yok sayılır); kökü `fixed` değil `relative`; kompakt üst şerit (geri · avatar+ad+yazıyor · ara · tam sayfa · küçült; üç noktalı menü/bilgi sayfaları tam sayfadadır); "+" menüsünde yalnız fotoğraf ve GIF (kütüphaneden paylaş/içe aktar adres parametresiyle çalıştığı için yalnız tam sayfada); ekran klavyesi etkisi kapalı; "Mesajlara dön" düğme olur. Panel `key={conversationId}` ile sohbet değişince durumu sıfırlar. Aynı yöntemle `NewChatDraftView` (`dock`: `onOpenConversation` → panelde sohbeti açar).
- Saf kurallar `lib/conversation-lists.ts`: `unreadConversationCount` (rozet; başlıktaki nokta ile aynı kapsam — sessize alınan/arşivlenen/silinen sayılmaz; SOHBET sayısı, mesaj sayısı değil) ve `filterConversationsByQuery` (Mesajlar sayfasının aramasından çıkarıldı, iki yerde ortak). Birim testleri `conversation-lists.test.ts`.
- Çeviriler: `translations-message-dock.ts` (TR+EN, 5 anahtar); geri kalan metinler mevcut `messages.*`/`chat.*` anahtarları.
- Sohbet açıkken okundu/Realtime/yazıyor hepsi `LocalConversationView`'dan gelir (ikinci bir mesaj yolu yok); panel küçülünce sohbet unmount olur, gelen mesajlar rozete yansır ve sohbet "okundu" sayılmaz.

## Testler

`tests/messaging-ui/run-message-dock.mjs` (**17 senaryo**, ağ taklitli): hap + rozet + sağ alt konum, panel açma (modal değil), sohbette mesaj gönderme (tek yazma, adres değişmez, okundu), sayfa değişince kalma, küçült/odak/geri, tam sayfada aç, üst simge aç/kapa, `/messages`'ta yok, tablet 900px + telefon 390px, eşik 1023↔1024 (canlı yeniden boyutlama), ziyaretçi, mesaj istekleri, arama, yeni sohbet (var olan kişi / taslak / ilk mesajla oluşma), İngilizce, yazma ekranında gizlenme, koyu tema + taşma. Gerçek Supabase/Realtime/cihaza karşı DENENMEDİ.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/messaging-ui/run-message-dock.mjs   # 17/17 beklenir
```

## Bilinen sınırlar

- Dock'ta "Önerilen kişiler" bölümü yok (yeni sohbet için `NewChatModal` kullanılır); sohbet menüsü (sessize al, engelle, arşivle…) ve kişi/topluluk bilgi sayfaları yalnız tam sayfada.
- Panel durumu (açık/kapalı, hangi sohbet) yalnız bellektedir: tam sayfa yüklemesinde (ör. Odak girişi) sıfırlanır.
- Profilde "Mesaj Gönder" gibi başka yerlerden açılan sohbetler hâlâ `/messages/local` sayfasına gider (dock'a yönlendirilmedi).
- Dock `lg` altında yok: tablette (`md`) eskisi gibi tam sayfa.
- Panel ile sayfanın sağ altındaki sabit öğeler (ör. Space panosu araçları) çakışabilir; ayrıca denenmedi.
