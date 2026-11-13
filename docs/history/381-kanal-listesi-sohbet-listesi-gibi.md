# 381 — Ekip, proje ve topluluk kanal listesi: sohbet listesinin yerine açılır ve onun gibi çalışır

**Karar (kullanıcı, iki mockup turu):** Mesajlar'da bir ekibe/topluluğa girince açılan kanal listesi artık ayrı bir sayfa olarak sağ bölmeyi kaplamaz. **Bilgisayarda sol sütun (sohbet listesinin yeri) kanal listesine dönüşür, sağ bölme hep sohbettir; telefonda aynı liste sayfasıdır.** Ayrıca kanal listesi sohbet listesiyle aynı davranır: aynı satır dili, kontrol satırı (süzgeç menüsü · arama · ⋮ · +), ⋮ menüsü (Kanal seç · Tümü okundu) ve **seçim modu** (üstte "N kanal seçildi", satırlarda daire, altta Sabitle · Okundu · Sessize al · Sil). 369'daki "kanal sayfası sağda" düzeninin yerini alır.

## Sol sütun kuralı — `src/lib/messages-hub.ts` (saf, birim testli)
- `resolveHubTarget`: adreste açık `hub=team|community` varsa o kazanır; yoksa açık sohbetin kendi ekibi/projesi/topluluğu (kanal bağlantısı `?id=` ile açılınca da kanal listesi solda kalır); hiçbiri yoksa sohbet listesi.
- `MessagesSidebar` (`features/messages/messages-sidebar.tsx`, `messages/layout.tsx` aside'ı): hedefe göre `ConversationsPane` / `TeamHubView` / `CommunityHubView`. Telefonda sütun gizli olduğundan kanal listesi orada **bağlanmaz** (yinelenen satır/istek olmasın); açık sohbet henüz bilinmiyorsa sütun boş kalır (liste → kanal listesi sıçraması olmasın).
- Sağ bölme (`ConversationRoute`, `hubRouteView`): telefonda `?hub=` liste sayfasıdır, kanal seçilince (`?id=`, topluluk için `?room=`) sohbet gelir. Bilgisayarda ekip için kanal seçili değilse `OpenDefaultChannel` varsayılan kanalı (projede ana kanalı) adrese yazar (`router.replace`), sohbet açılır; topluluk sohbeti odayı kendisi seçer.
- `teamHubHref(takım, proje?, openId?)`: ekip ↔ proje listesi arasında gezerken sağdaki sohbet `&id=` ile korunur. "‹ Mesajlar" `/messages`'a, proje listesinde "‹ Ekip adı" ekip listesine döner. Sohbet başlığındaki geri düğmesi md+'da gizlidir (liste zaten solda); telefonda eskisi gibi kanal listesi sayfasına döner.

## Ortak parçalar
- `hub-parts.tsx`: `HubFrame` · `HubHeader` (geri + kimlik bandı + sessize alma) · `HubBody` · `HubSection` · `HubRow` (`ConversationRow` ile aynı dil; seçim halkası; sabit raptiyesi; açık kanal vurgusu `aria-current`) · `HubAddButton` ("+"). Eski `HubShell` ve sabit alt "Kanal ekle" düğmesi kalktı.
- `hub-selection.tsx` `useHubSelection(actions, …)`: seçim durumu + sohbet listesindeki kuralların aynısı (6'şar paralel uygulama, hata olursa başarısızlar seçili kalır, toast, tek onay penceresi). Başlık/alt çubuk/⋮ menüsü `conversation-selection.tsx` bileşenlerinin genişletilmiş hâlidir (`SelectionActionBar` her düğmeyi isteğe bağlı alır: Arşivle yoktur; `onMute`, `deleteDisabled`; `ConversationsMoreMenu` `selectLabel`; `SelectionHeader` `title`).
- `MuteCard compact` ve `scope="community"`: sütunda tek satırlık sessize alma kartı (açıklama cümlesi yok; "ekip de sessiz" uyarısı ve hata satırı altında kalır).
- Süzgeç menüsü Tümü (Kanallar/Sohbetler/Odalar) · Okunmamış · Sessize alınanlar (`matchesHubFilter`); arama ad ve önizleme metninde (`matchesHubQuery`, Türkçe küçültme).

## İşlemlerin anlamı (yetkiye göre)
| İşlem | Ekip/proje kanalı | Proje satırı (ekip listesinde) | Topluluk odası |
|---|---|---|---|
| Sabitle | `conversation_members.pinned_at` (`pinConversation`, kişisel) | projenin tüm kanalları | **YENİ** `community_room_state.pinned_at` (`set_room_pinned`, kişisel) |
| Okundu | okundu imleci (`markConversationReadUpTo`) | projenin tüm kanalları | Genel: üyelik imleci; diğerleri `mark_room_read_up_to` |
| Sessize al | `team_set_channel_notify(kanal, 'none' \| null)` | `team_set_mute(ekip, proje)` | `set_room_muted` |
| Sil | `team_delete_channel` — yalnız yetkili (ekipte `manage_channels`, projede lider); varsayılan/ana kanal kilitli | hiçbir zaman (soluk) | `delete_community_room` — yalnız sahip; Genel kilitli |
Yetkisiz görüntüleyicide Sil düğmesi hiç çizilmez; seçimde silinemeyen satır varsa soluk ve basılamaz. Sabitlenenler satır grubunun başına çıkar (`pinnedFirst`). Topluluğun kendisi için sessize alma kartı konuşma düzeyindedir (`setChatGroupMuted`).

## Veritabanı (yalnız ekleyici) — `20261123100000_room_pins.sql`
`community_room_state.pinned_at` + `set_room_pinned(room, pinned)` + `my_room_pins(community)`. `community_rooms_overview` dönüş şekli DEĞİŞMEZ (OUT sütunu eklemek fonksiyonu silip kurmayı gerektirir): sabitler ayrı okumadan gelir; eski veritabanında `my_room_pins` yoksa istemci boş sabit listesiyle çalışır. Her iki fonksiyon anon'a kapalı; `smoke-test.mjs` anon reddini denetler. SQL testi: `supabase/tests/room-pins.sql` (10/10: kişisel sabit, özel odanın sızmaması, yetki yitirince okumada gizlenme, anon reddi).

## Metinler
`translations-team-chat.ts` (`th.filter.*`, `th.search.*`, `th.sel.*`, `th.mute.community.*`, `th.noChannels`, `th.back.team`) + `translations-hub.ts` (`hub.backTo`). **İngilizce karşılıkları eklendi.**

## Testler / sınırlar
- Birim: `messages-hub.test.ts` (hedef çözümü, sağ bölme kararı, varsayılan kanal, sabit sırası, toplu sabitle/sessize, süzgeç/arama).
- Ağ taklitli Playwright: `run-team-chat-hub.mjs` (13–20: masaüstü sol sütun, proje listesi, `?id=` ile açılış, seçim modu, Sabitle/Okundu/Sessize al/Sil, yetkisiz üye), `run-rooms.mjs`, `run-team-hub.mjs`, `run-chat-select.mjs`.
- Bu ortamda `main` derlemesinde de düşen (ortam kaynaklı) senaryolar: `run-chat` 18/18b, `run-groups` 4/20/24/26/27, `run-presence` 18, `run-notifications` 18; `run-team-projects` 9 aralıklı düşer (3 denemede 2 geçti, ana dalda geçti — ekip onay kuyruğu, kanal listesiyle ilgisiz).
- Gerçek Supabase/Realtime/cihaz DENENMEDİ. Migration canlıya deploy hattıyla uygulanır (`schema_migrations`'a bak).
- Bilinçli sınırlar: Mesajlar dock'u (lg+) çip satırlı eski düzeninde kalır; ekip bilgi sayfasındaki kanal sessizliği değişmedi; toplu sessize alma ekip/proje sessizken kanalın kendi ayarını saklar ama etkisizdir (miras kuralı 369 gibi); "Arşivle" kanal listesinde yoktur (kanal arşivi yönetici işidir, ekip/topluluk yönetiminde kalır).
