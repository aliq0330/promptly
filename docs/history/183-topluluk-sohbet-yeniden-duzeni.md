# 9.183 — Topluluk sayfası ile topluluk sohbetinin yeniden düzeni (tek ürün alanı, iki ayrı deneyim)

Durum: **yalnız istemci kodu** (migration YOK; veritabanı/RLS/RPC değişmedi). Gerçek Supabase'e / gerçek oturuma / gerçek Realtime'a / fiziksel cihaza karşı denenmedi; doğrulama `npm test`, ağ ve Realtime taklitli Playwright'tadır. Tam teknik belge: [`docs/community-system.md`](../community-system.md).

## Denetim bulguları (gerçek koddan)

1. **Sohbet bilgi penceresi ikinci bir topluluk sayfasıydı** (`GroupInfoModal`, 5 sekme): Genel · Üyeler · Katılım istekleri · Davet · Ayarlar. İstek/davet/ayar bölümleri topluluk sayfasındaki Yönetim sekmesiyle **aynı bileşenlerdi, iki yerde monte ediliyordu**. Kök neden: 172'de grup sohbeti için yazılan pencere, 175'te topluluk sayfası gelince küçültülmedi.
2. **Topluluk sayfası 7 sekme + 7 alt bölüm**; açılış sekmesi "Genel bakış" (`accessibleTabs()[0]`), Akış 2. sıradaydı; "Sohbet" sekmesi yalnızca tanıtım kartıydı (başlıkta "Sohbeti aç" zaten vardı).
3. **Katılım istekleri topluluk sayfasında VARDI ama 3. seviyedeydi** (Yönetim → Katılım istekleri; rozet yalnız "Yönetim" sekmesinde) ve **yeni istek bildiriminin hedefi sohbet penceresiydi** (`/messages/local?id=…&panel=requests`). Yani iddia kısmen doğruydu: işlev iki yerde vardı, asıl yol sohbetti.
4. **Ayar sınıfları karışıktı**: "Kim mesaj yazabilir" (sohbet ayarı) topluluk ayar formundaydı; `GroupOwnerSettings` tek kayıtta sohbet ayarını (geçmiş, sabitleme) ve topluluk yetkilerini birleştiriyordu; `GroupSettingsSection` hem sohbet penceresinde hem Yönetim'de monte ediliyordu.
5. **Kişisel tercih üç yere dağılmıştı**: topluluk bildirim düzeyi yalnız Hakkında'da; sohbeti sessize alma modal "Genel", Hakkında ve ⋮ menüsünde.
6. **Ayrılma**: üç yerde, iki ayrı onay penceresi (`JoinButton` ve `GroupAboutSection`); başlık menüsündeki "Topluluktan ayrıl" bilgi penceresini açıp kullanıcıyı aşağı kaydırtıyordu. Üyelik tek satır olduğundan sohbetten ayrılma ≠ topluluktan ayrılma ayrımı **veri modelinde yok**, ama arayüz bunu açıklamıyordu.
7. **Canlı eşitleme eksikti**: sohbet görünümü `chat_groups` UPDATE'e abone, topluluk sayfası değildi (yalnız 20 sn gizli kaldıktan sonra yenileniyordu) → bekleyen istek sayacı/rol bayat kalabiliyordu.
8. Doğrulanan **sağlam** noktalar (korundu): tek üyelik satırı, RPC içinde yetki, grup satırı kilidi + `invalid_state` ile çifte işlem koruması, benzersiz bekleyen istek dizini.
9. Bulunan ama **kapsam dışı bırakılan**: rol değişikliği için bildirim yok (yalnız denetim kaydı; migration ister); kabul/ret/davet bildirimlerinin SQL adresleri eski rotalarda (eski rotalar çalışır); paylaşılan `Modal` aşağı çekerek kapatmayı desteklemiyor.

## Karar

Topluluk sayfası = topluluğun merkezi (akış öncelikli); sohbet = iletişim alanı; ikisi aynı veriyi/yetkiyi/bileşeni paylaşır. Her ayarın tek evi vardır: **A topluluk** (Yönetim → Ayarlar), **B sohbet** (sohbet paneli), **C kişisel** (Hakkında + paylaşılan bileşen).

## Ne değişti

- **Topluluk sayfası** (`community-page.tsx`): sekmeler 7 → **5** (Akış · Etkinlikler · Üyeler · Hakkında ve kurallar · Yönetim); Akış açılış ekranı; "Genel bakış" ve "Sohbet" sekmeleri kalktı. Başlıkta açıklama (2 satır), "Sohbeti aç", yetkiliye **"N bekleyen istek"** kısayolu. Sayaç artık **Üyeler** sekmesinde. Eski adresler (`tab=overview|chat`, `tab=manage&section=requests|invites`) `resolveCommunityView` ile yönlenir. Yeni `feed-highlights.tsx`: kural-kabul uyarısı, kapatma notu, son duyurular (salt okunur `highlight`), sıradaki etkinlik — boşsa hiç çizilmez.
- **Üyeler = kişi yönetiminin tek yeri** (`members-tab.tsx`): Üyeler · Katılım istekleri (sayaçlı) · Davet bölümleri, **yeteneğe göre** (`membersSections`).
- **Yönetim = yapılandırma + moderasyon** (`manage-tab.tsx`): Özet · Ayarlar · Duyurular · Moderasyon · İşlem geçmişi (`manageSections`); istek/davet buradan çıktı; boş "Yönetim" sekmesi görünmez (`canSeeManageTab` artık `manageSections` üzerinden).
- **Sohbet bilgi penceresi sekmesiz kompakt panel** (`group-info-modal.tsx`): kimlik + topluluk sayfası bağlantısı · bekleyen istek kısayolu · kişisel sessize alma · sohbette ara · salt-okunur üyeler (`GroupMembersSection manage={false}`) · sohbet ayarları (`ChatSettingsSection`, yetkiliye) · ayrılma. Topluluk işleri topluluk sayfasına yönlendirilir.
- **Ayar ayrımı**: yeni `chat-settings-section.tsx` (kim yazabilir + owner'ın geçmiş/sabitleme ayarı); `GroupOwnerSettings` `scope="chat" | "community"`; `GroupSettingsSection` artık yalnız topluluk ayarları (sohbet ayarlarına bağlantı notu). Yeni `canSeeChatSettings`.
- **Ortak bileşenler**: `personal-prefs.tsx` (`ChatMuteToggle`, `LeaveCommunitySection`), `leave-community-dialog.tsx` (başlık menüsü + Hakkında + sohbet paneli + sohbet ⋮ menüsü tek onay). `group-about-section.tsx` silindi.
- **Sohbet** (`local-conversation-view.tsx`): `?panel=requests|invites` → topluluk sayfasındaki ilgili bölüme yönlenir (eski bildirimler de çalışır); `members|settings|about` paneli açar; ⋮ menüsündeki "Topluluktan ayrıl" doğrudan onay ister (sahip devretmeliyse panel açılır); topluluk simgesinde yetkiliye bekleyen istek rozeti.
- **Canlı eşitleme** (`use-community.ts`): `community:<id>` kanalı — `chat_groups` UPDATE + `conversation_members` olayları → 400 ms birleştirilmiş sessiz yeniden okuma; `GroupRequestsSection` anahtarına `pending_request_count` eklendi.
- `lib/communities.ts`: `CommunityTab` = `feed|events|members|about|manage`; `membersSections`, `manageSections`, `resolveCommunityView`, `communityHref(id, tab, section)`; `resolveTab` kaldırıldı.
- TR + EN çeviriler eklendi (`groups.info.*`, `communities.detail.pendingRequests/pendingShort`, `communities.feed.nextEvent`, `communities.members.section*`, `groups.settings.chatSettings*`, `groups.about.leaveAlsoChat`, `communities.about.chatMuteTitle`); kullanılmayan `communities.chat.*`/`overview.*` anahtarları temizlendi.

## Doğrulama (gerçek sonuçlar)

`npx tsc --noEmit` temiz · `npm run lint` 0 hata (4 uyarı `promptly-extension/*.js`'te, önceden var) · `npm test` 324/324 · `npm run build` temiz · Playwright (ağ+Realtime taklitli): `run-groups` 36/36, `run-communities` 61/61, `run-community-posts` 30/30, `run-chat` 35/35, `run` 24/24. Yeni/uyarlanan senaryolar: sekmesiz panel, istek/davet/ayar/rol işlerinin topluluk sayfasına taşınması, `?panel=` yönlendirmesi, istek sayacı kısayolları, sohbet↔topluluk geçişi, ayrılma (panel ve ⋮ menü), canlı sayaç ve rol eşitleme, İngilizce, mobil/tablet/koyu tema taşma denetimi. Ekran görüntüleri (masaüstü/mobil, açık/koyu) elle incelendi; mobil başlıkta bekleyen istek etiketi kısaltıldı.

## Bilinen boşluklar / dürüst liste

- Gerçek Supabase'e / oturuma / Realtime'a / cihaza karşı DENENMEDİ.
- Rol değişikliği bildirimi yok; kabul/ret/davet bildirim adresleri SQL'de eski rotalarda (istemci yönlendirir) — ikisi de migration ister, yapılmadı.
- Paylaşılan `Modal` aşağı çekerek kapatmayı desteklemiyor; eklenmedi.
- "Yalnız sohbetten ayrıl" veri modelinde yok (tek üyelik satırı); arayüz bunu açıkça yazar, yerine sessize alma / listeden kaldırma sunar.
- `chat_group_join_requests` Realtime yayınında değil; canlılık `pending_request_count` üzerinden.
