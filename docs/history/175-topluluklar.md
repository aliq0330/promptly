# 9.175 — Topluluklar (grup sohbetinden tam kapsamlı topluluk sistemine geçiş)

Durum: kod, 3 migration, testler ve belgeler repoda; **canlıya UYGULANMADI** (migration'lar canlı veritabanında ÇALIŞTIRILMADI, canlı veri değiştirilmedi, deploy yapılmadı). Önce migration, sonra istemci kodu uygulanmalı. Gerçek Supabase'e / gerçek oturuma / Realtime'a / fiziksel cihaza karşı denenmedi. `docs/history/172-*` (grup sohbeti), `173-*` (yetkiler), `174-*` (sohbet geliştirmeleri) üzerine kurulur.

## Karar: ikinci bir sistem yok — topluluk = genişletilmiş grup sohbeti

| Kavram | Nerede |
|---|---|
| Topluluk kimliği | `chat_groups.id` = `conversations.id` (grup sohbeti topluluğun **sohbet modülüdür**) |
| Üyelik + rol (owner/admin/moderator/member) | `conversation_members` — katılan topluluğun sohbetine de katılmış olur; ayrılan/çıkarılan ikisinden birden çıkar (tek satır, çelişemez) |
| Sohbet mesajları | `messages` (okundu, yazıyor, sabitleme, arama, yıldız, tepki, düzenleme/silme AYNEN); mesaj ≠ gönderi (bir mesaj otomatik gönderiye dönüşmez) |
| Katılım isteği / davet / bağlantı / yasak / denetim | 172'deki tablolar ve RPC'ler (yeniden yazılmadı) |
| Rol yetenekleri | `chat_groups.role_permissions` — 9 yeteneğe 6 topluluk yeteneği eklendi: `moderate_posts`, `pin_posts`, `manage_announcements`, `manage_events`, `edit_rules`, `view_stats` |
| Yeni tablolar | `community_posts`, `community_announcements`, `community_events`, `community_event_rsvps`, `community_rule_acceptances`, `community_reports`, `community_bookmarks` |
| Yeni sütunlar | `chat_groups`: `origin`, `category`, `feed_policy`, `rules`, `rules_version`, `rules_required`, `closed_at/closed_by`, `post_count` · `conversation_members`: `notify_level`, `notify_muted_until` · `messages`: `announcement_id` |

**Mesajlar'dan bağımsız grup oluşturma kalktı:** arayüzde "Yeni grup" yok (Yeni sohbet penceresinde yalnız "Topluluklar" kısayolu); sunucuda `create_chat_group` artık yalnızca topluluk çekirdeğidir (`create_community` onu çağırır). Bağımsız grup kavramı kalmadı; her grup bir topluluktur.

## Rol / yetki matrisi (sunucuda: RPC + RLS; `lib/communities.ts` + `lib/chat-groups.ts` aynı tablo)

| İşlem | owner | admin | moderator | member |
|---|---|---|---|---|
| Ayar/kategori/akış politikası (`edit_settings`) | ✔ | ✔ | ✘ | ✘ |
| Kurallar + kabul zorunluluğu (`edit_rules`) | ✔ | ✔ | ✘ | ✘ |
| Duyuru yayınla/düzenle/sil/sabitle (`manage_announcements`) | ✔ | ✔ | ✘ | ✘ |
| Etkinlik oluştur/düzenle/iptal/sil (`manage_events`) | ✔ | ✔ | ✘ | ✘ |
| Gönderi kaldır + rapor kuyruğu (`moderate_posts`; rütbe kuralı) | ✔ | ✔ | ✔ | ✘ |
| Gönderi sabitle (`pin_posts`, ≤ 3) | ✔ | ✔ | ✔ | ✘ |
| Başvurular / üye çıkarma / mesaj silme / mesaj sabitleme | ✔ | ✔ | ✔ | ✘ |
| İstatistik özeti (`view_stats`) | ✔ | ✔ | ✘ | ✘ |
| Davet, yasak, rol atama, görünürlük | ✔ | ✔ | ✘ | ✘ |
| Yönetim işlem geçmişi (denetim kaydı) | ✔ | ✔ | ✘ | ✘ |
| Sahipliği devret, topluluğu kapat/aç/sil, yetkileri ver/al | ✔ | ✘ | ✘ | ✘ |
| İçerik paylaş (`feed_policy='members'`), RSVP, rapor, kendi gönderisini düzenle/sil | ✔ | ✔ | ✔ | ✔ |

Owner admin/moderatöre yetkileri **rol başına** açıp kapatır (`update_chat_group_owner_settings`, beyaz liste `_group_all_capabilities()`); owner kısıtlanamaz; rütbe kuralları yetkiden bağımsız sürer (moderatör admin'in gönderisini kaldıramaz). Son owner ayrılamaz (`owner_must_transfer`), hesap silinirse sıradaki en kıdemli yönetici devralır (172'deki tetikleyici; `delete_account_data` ile sınandı).

## Akış (gönderiler) ve görünürlük kuralı

- Gönderi içeriğin **kopyası değil başvurusudur** (`prompt_id`/`request_id`/`workflow_id`/`preset_id` — tam biri dolu, FK'li). Aynı içerik bir toplulukta bir kez (kısmi benzersiz indeks). Beğeni/yorum/kaydetme içeriğin kendi altyapısı; orijinal sahip içerikte kalır, gönderi yazarı paylaşandır. 24 saatte ≤ 30 paylaşım.
- **Kritik kural:** `share_to_community` yalnızca **yayında ve herkese açık** içeriği kabul eder. Başkasının özel/taslak içeriği için `content_not_found` (varlık sızmaz); sahibinin kendi özel/taslak içeriği için `content_not_public` — topluluk paylaşımı içeriği **otomatik herkese açmaz**; içeriğin görünürlüğü hiç değişmez. Sonradan özel yapılan/silinen içeriğin gönderisi herkese yer tutucu, yalnız yazar ve yetkililere "kaldır" için listelenir. Genel akışa çıkış topluluk üyeliğinden doğmaz (içeriği herkese açık yapmak sahibin ayrı, bilinçli işlemidir).
- Düzenleme: yazar notunu; silme: yazar kendi gönderisini (içerik silinmez); kaldırma: `moderate_posts` + rütbe kuralı (denetim kaydı + yazara bildirim + açık raporlar otomatik kapanır).
- Topluluk bağlamında oluşturma: `/create?community=<id>`, `/requests/new`, `/workflows/create`, `/presets/create` — **yayınlanınca** ve herkese açıksa toplulukta paylaşılır, değilse içerik olduğu gibi kalır ve akışta nedeni görünür (`useCommunityReturn`).

## Üyelik, görünürlük, kurallar

- Açık topluluk: keşifte listelenir, tek adımda atomik katılım (172'deki `join_chat_group`); kapalı: keşifte yok, içerik/sohbet/üye listesi üyelik olmadan okunamaz (`can_read_community` + RLS), `group_not_found`. Kapalı→açık geçişte bekleyen başvurular tek atomik işlemle işlenir; kabul edilemeyenler `pending` kalır ve nedeniyle raporlanır (172, değişmedi).
- **Kuralları kabul zorunluluğu (`rules_required`) üyelik akışına etkisi:** yeni üye olacak kişi — açık katılım, davet kabulü (`_group_add_member` kapısı) ve kapalı topluluğa **başvuru** (`chat_group_join_requests` BEFORE INSERT tetikleyicisi, hangi yoldan gelirse gelsin) — güncel sürümü kabul etmeden devam edemez (`rules_not_accepted`). Yönetici bir başvuruyu kabul ederken yeniden sorulmaz (kabul başvuru anında alınmıştı; kural sonradan zorunlu kılındıysa kişi üye olur ve "kuralları kabul et" uyarısı görür). Kural metni değişince `rules_version` artar, kabul zorunluysa üyeler haberdar edilir; **mevcut üyelik düşmez**, yalnız yeniden kabul istenir (Genel bakışta uyarı).
- Kapatma: owner topluluğu **kapatır** (salt-okunur: yeni üye, gönderi, etkinlik, sohbet mesajı yok; keşiften çıkar; hiçbir veri silinmez; yeniden açılabilir) — silme (`delete_chat_group`) ayrıdır.

## Duyurular, etkinlikler, bildirimler, istatistik

- Duyuru: başlık+gövde, ≤ 3 sabit, düzenleme/silme; "sohbette de göster" seçilirse `messages.announcement_id` ile bağlantılı mesaj oluşur (istemci bu sütunu **yazamaz**: INSERT politikası `announcement_id is null`); duyuru silinince bağlantılı mesaj "herkesten sil" ile temizlenir.
- Etkinlik: ad, açıklama, başlangıç/bitiş, **IANA saat dilimi** (sunucu `pg_timezone_names` ile doğrular; form duvar saatini seçili dilimde yorumlar, `lib/communities.ts`'te DST-doğru dönüşüm testli), yer ve/veya `http(s)` bağlantı, Katılacağım/Belki/Katılmayacağım (sayaçlar korumalı + tetikleyiciyle tutulur), iptal/silme. **Hatırlatma:** zamanlayıcı yok; uygulama açılışında `dispatch_my_event_reminders()` (çağıranın "geliyorum/belki" dediği, 24 saat içinde başlayan etkinlikler; `dedupe_key` ile bir kez). Üyelikten çıkan kişinin RSVP'leri silinir.
- Bildirim tercihi (üye başına, yalnız kendi satırı): **Tümü / Yalnızca önemli / Sessiz** + süreli sessize alma (`notify_muted_until`, zamanlayıcı gerektirmez). Sınıflar: `direct` (davet, başvuru sonucu, çıkarılma, kendi gönderisine karar, rapor sonucu) her zaman gelir; `important` (duyuru, @anma, etkinlik hatırlatma/değişiklik/iptal, kural güncellemesi) Sessiz'de gelmez; `info` (yeni üye, yeni etkinlik) yalnız Tümü'nde. 172'deki bilgi düzeyi bildirimler de bu tercihe uyar (`_group_notify`). Mesaj başına bildirim YOK; sohbette `@kullanıcı` anması yalnız anılan üyeye gider (içerik taşımaz, engelli/üye olmayan/kendine yok, `dedupe_key`).
- Moderasyon sonucu: gönderi kaldırma ve rapor kararı ilgili kişiye bildirilir. Yeni bildirim cümleleri `notification-message.ts` + `notifMsg.community*` (TR/EN). Not: 172-174'te üretilen eski "grup" cümleleri SQL'de Türkçe "grup" kalır (stored text; regex'e bağlı), arayüz metinleri "topluluk" oldu.
- İstatistik (`view_stats`): üye toplamı, yeni üye, ayrılan/çıkarılan (denetim kaydından), net değişim, gönderi, paylaşılan içeriklerin dönemdeki beğeni/yorumu, etkinlik katılımı, sohbet **mesaj sayısı** ve **etkin gönderen sayısı** + günlük seriler. Mesaj içeriği ve kişi bazlı döküm yok; sahte sayı yok (hepsi canlı tablolardan).

## Eski grup sohbetlerinden geçiş (envanter → eşleştirme → doğrulama → geri alma)

**Strateji: kimlik eşlemesi özdeşliktir; veri taşınmaz, silinmez, kopyalanmaz.** Her eski grup zaten bir `chat_groups` + `conversations(kind='group')` satırıdır; topluluk özellikleri aynı satıra *eklenir*. Böylece yeni ve eski sistemin aynı veriyi çelişkili değiştirmesi mümkün değildir (tek kaynak). Migration yalnızca mevcut satırları `chat_groups.origin = 'legacy_group'` ile işaretler (varsayılan: önce `legacy_group`, sütun eklendikten sonra `native` yapılır → bundan sonrakiler `native`), `category='general'`, `feed_policy='members'`, `rules=null`, `rules_required=false`, `closed_at=null`, `post_count=0` varsayılanlarını alır. Mesajlar, üyelikler, roller, davet/başvuru/yasak/denetim kayıtları DOKUNULMAZ.

1. **Envanter:** `community_migration_report()` (yalnız site moderatörü, salt okunur): toplam/eski/yeni/açık/kapalı sayıları, grup sohbeti ve mesaj sayıları + anomali listeleri.
2. **Eşleşmeyen/hatalı kayıtlar** raporlanır (düzeltilmez): grup satırı olmayan `kind='group'` konuşma, grup satırı olan birebir konuşma, sahipsiz grup, `member_count` / `pending_request_count` / `post_count` sapması, üye sınırı aşımı (en çok 50'şer örnek).
3. **Doğrulama:** `supabase/tests/communities.sql` test 92–95 (eski grup aynı kimlikle topluluk olarak çalışır, mesaj/üyelik yerinde; rapor sayıları doğru; üretilen sapma yakalanır). Canlıya uygularken: migration'dan önce ve sonra `select count(*) from chat_groups/conversation_members/messages ...` karşılaştırması + raporun `anomalies` listelerinin boş olması.
4. **Geri alma:** migration yalnızca ekleyicidir. Geri almak için (onayla) yeni tablolar/sütunlar/fonksiyonlar `drop` edilir; eski tablolardaki hiçbir veri değişmediği için geri alma veri kaybettirmez. İstemci kodu geri alınırsa eski `/groups` ekranı artık yok (git geçmişinden dönülür).
5. **Kullanıcı etkisi:** eski gruplar Topluluklar'da (Üyesi olduklarım / Yönettiklerim / keşif) görünür; "Eski grup sohbetinden" rozeti taşır; sahipler kurallar/duyuru/etkinlik/akışı kullanmaya başlayabilir. Eski gruplarda `history_visible`, `role_permissions` (yeni yetenekler varsayılana düşer) ve kapalı/açık görünürlük korunur. Eski gruplar keşifte yalnız `public` ise görünür (172'deki gibi).

## Güvenlik özeti

Yeni tablolara istemci **yazamaz** (politika yok + `revoke`); her yazma `SECURITY DEFINER` RPC (`search_path` sabit, kimlik `auth.uid()`, askıdaki hesap reddedilir, EXECUTE yalnız `authenticated`, iç yardımcılar kimseye açık değil). Yetki rol adına değil yeteneğe bağlı. Her yazan RPC topluluk satırını `for update` kilitler (yarış yok). Okuma: `can_read_community` (açık topluluk ya da üyelik; yasaklı değilse). Engel ilişkisi: engelli kullanıcıyla ilişkili içerik paylaşılamaz, anma bildirimi gitmez, sohbette karşılıklı görünmezlik (172). Rapor kuyruğu yalnız raporlayan + yetkililer. İstemci rol/sahip/yazar bilgisi göndermez.

## Arayüz

`/communities` (Keşfet · Üyesi olduklarım · Yönettiklerim · Davetler · Başvurularım · Kaydedilenler; arama, kategori, sıralama, sayfalama, yükleniyor/hata/boş), `/communities/local?id=&tab=` (Genel bakış · Akış · Sohbet · Üyeler · Etkinlikler · Hakkında ve kurallar · Yönetim [Özet · İstekler · Davet · Ayarlar · Duyurular · Moderasyon · İşlem geçmişi]), `/communities/join#token` (eski `/groups/join#token` çalışır), `/groups` → `/communities` yönlendirmesi. Sohbet, Mesajlar çalışma alanındaki grup sohbetidir (başlıkta topluluğa bağlantı, duyuru mesajı kart olarak çizilir, başkasının mesajı için "topluluk yöneticilerine bildir"). Mevcut yönetim bölümleri (`features/groups/*`) yeniden kullanıldı; `groups.*` arayüz metinleri "topluluk" sözcüğüne çevrildi. Lavender Studio/sand paletleri, token'lar, açık/koyu, mobil-önce; tüm metinler `translations-communities.ts` (TR+EN).

## Testler

- `supabase/tests/communities.sql` — **101 kontrol** (yerel PostgreSQL 16, tüm migration'lar temiz DB'ye baştan oynatılır): `supabase/tests/run-local.sh supabase/tests/communities.sql` → `FAILED=0`. Mutasyon denemesi: `can_read_community`/`_community_content_info`/`_community_notify`/`can_send_message`/rütbe/RSVP temizliği/kural tetikleyicisi bozulunca ilgili kontroller kırmızıya döndü.
- Mevcut SQL testleri yeni migration'larla da geçer: `chat-groups` (113), `chat-group-permissions` (23), `chat-features` (67), `conversation-member-state`, `counter-protection`, `saved-collections`, `version-history` → hepsi `FAILED=0` (her biri ayrı DB'de; aynı DB'ye üst üste çalıştırınca birbirinin verisine takılırlar).
- `src/lib/communities.test.ts` (13) + `chat-groups.test.ts` güncellemesi → `npm test`.
- Arayüz (ağ taklitli Playwright): `tests/messaging-ui/run-communities.mjs`; eski `run.mjs` / `run-groups.mjs` / `run-chat.mjs` topluluk söz dağarcığına göre güncellendi. Son sonuçlar: run-communities 43/43, run-groups 26/26, run-chat 33/33, run 24/24.

## Bilinen boşluklar / kalan işler

- Canlıya uygulanmadı; gerçek Supabase, Realtime, gerçek oturum ve cihaz denenmedi. Yeni migration'lar `20260920040000`, `050000`, `060000`.
- Sohbet sekmesi sohbeti gömmez, Mesajlar çalışma alanına bağlar (`LocalConversationView` tam ekran düzenine bağlı).
- Etkinlik hatırlatması uygulama açılışında üretilir (zamanlayıcı/push yok); davet/başvuru/duyuru sıralaması offset/keyset karması (gönderiler keyset, keşif offset ≤ 2000).
- Topluluk içi rapor kuyruğu sitenin genel `reports` tablosundan ayrıdır; site moderatörü topluluk raporlarını görmez (ayrı karar).
- Kaydedilen topluluk yer imi tek tercihli modeldir (takip/abone ayrımı yok). Topluluk içi yeni içerik oluşturma yalnız 4 oluşturma formundan (`?community=`).
- SQL'de üretilen eski "grup" bildirim cümleleri Türkçe "grup" kalır; yeni cümleler "topluluk".
- Dosya yükleme/medya için topluluk gönderisine ek görsel yok (içerik kendi medyasını taşır).
- Zamanlı süreli sessize alma bildirimi sunucuda `now()` ile değerlendirilir (cihaz saatine bağlı değil); etkinlik saatleri saat dilimi tercihine göre gösterilir, kullanıcıya özel saat dilimi tercihi yok.
