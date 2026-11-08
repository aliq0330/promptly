# 353 — Ekipler: topluluktan bağımsız, eksiksiz ekip sistemi (plan + uygulama kaydı)

**Durum: uygulanıyor (2026-11-09).** Kullanıcı 349–351'deki "ekip = tamamen kapalı topluluk" yapısının karışık olduğunu söyledi; konuşma sonunda şu karar verildi:
ekip, topluluktan **bağımsız bir varlık** olur; mockup'taki (`Promptly Ekipler Mockup`, 15 masaüstü + 16 telefon ekranı) HER ekran eksiksiz kurulur; topluluktaki
"Tamamen kapalı" seviyesi ve ekip = topluluk bağı HER ŞEYİYLE kaldırılır. Bu dosya planı ve (iş ilerledikçe) uygulama notlarını tutar.

## Kesinleşen kararlar

| Konu | Karar |
|---|---|
| Mimari | Ayrı `teams` varlığı (B). Yeni tablolar; `chat_groups`'a bağ YOK. 349–351 yerini bu yapıya bıraktı. |
| Sohbet/kanal | **Her kanal kendi konuşmasıdır** (`conversations.kind = 'team_channel'`, kimlik = kanal kimliği). Topluluk odaları (`messages.room_id`, 352) topluluk için kalır, DOKUNULMAZ. Gerekçe: gizlilik sınırı = konuşma üyeliği (sistemin her yerindeki tek kapı); oda modelinde her yeni mesaj okuyan yolun oda iznini hatırlaması gerekir ve konuklu/gizli kanallarda sızıntı bedeli yüksektir. |
| Davet | Kullanıcı adıyla davet + **davet bağlantısı** (yalnız SHA-256 özeti saklanır). **Alan adıyla otomatik katılma YOK.** |
| Kitle | Rol: sahip · yönetici · düzenleyici · üye · konuk. Yetki role değil **yeteneğe** bağlıdır (matris SQL'de, TS aynası + karşılaştırma testi). |
| Sınırlar | Ekip başına 500 üye, 50 Space, 50 kanal, 50 grup, 50 konuk; kişi başına en çok 10 ekip sahipliği; 200 bekleyen davet. |
| Dil | Ekipte "kanal", toplulukta "oda". `TeamLanguageScope` kalkar; ekip metinleri gerçek çeviri anahtarlarıdır. |
| Sekmeler | Masaüstünde açık sekme satırı (mockup gibi), telefonda bölüm menüsü — "4+ bölüm = menü" kuralına ekip sayfası için BİLİNÇLİ istisna. |
| Ekip silinince | Space'ler silinmez, sahibinin kişisel Space'i olarak kalır. |
| Yıkıcı migration | Aynı PR'da AYRI dosya (`-- ci:allow-destructive`). Gerekçe: canlıda ekip kullanan gerçek kullanıcı yok (yalnız iki test topluluğu). |
| Silinecek canlı veri | "Tasarımcılar" (legacy grup, 18 üye, 8 gönderi) ve "Deneme" topluluk/ekipleri — kullanıcı onayladı (2026-11-09). |

## Veri modeli (özet)

- **Çekirdek:** `teams` (ad, kısa ad, açıklama, politikalar, korumalı sayaçlar), `team_members` (rol, katılma, konukta kurum + bitiş), `team_groups` + `team_group_members` (lider işareti).
- **Erişim:** `team_access` — Space ve kanal için TEK tablo: kapsam (space/kanal), özne (üye/grup), seviye (düzenler/görüntüler). Kapsamın modu: tüm ekip · seçili · yalnız yönetici.
  Mevcut `space_members` ve kanal `conversation_members` satırları bu tablodan **eşitlenen yansımadır** (349'daki `team_sync` kalıbının genellemesi); `can_read_space`/`can_edit_space`/RLS değişmez. Her adımdan sonra `_inv()` değişmezi testte denetlenir.
- **Sohbet:** `team_channels` (mod: açık · özel · Space'e bağlı; yazma politikası; arşiv; varsayılan bildirim). Her ekip `genel` (silinemez) ve `duyurular` (yalnız yöneticiler yazar) ile doğar.
- **Kütüphane:** Space'e `team_id`, `deprecated_at`; `space_item_approvals`, `space_item_review_comments`, `space_item_uses`, `space_item_works_votes`; `space_groups.team_group_id` (grup klasörü). Ekip başına otomatik bir `team_library` Space'i.
- **Üyelik:** `team_invitations`, `team_invite_links`.
- **Yönetim:** `team_audit` (yalnız ekleme), `team_api_usage`, `team_api_blocks`.

## Yetenek matrisi (taslak; kod = tek doğruluk kaynağı)

`manage_members · manage_team (politika, ad, avatar) · create_spaces · manage_channels · approve_library · write_variables · publish_external · view_audit · manage_groups · invite_guests · export`
Sahip hepsi; yönetici hepsi (sahipliği devretme/ekibi silme hariç); düzenleyici `create_spaces`, `write_variables`; üye ve konuk yalnız kullanır. Grup lideri `approve_library` yeteneğini yalnız kendi grup klasöründe (politika açıksa) kullanır.

## Gizlilik (özel kanal / konuk) — zorunlu denetim listesi

Kanal ayrı konuşma olduğu için mesaj okuyan her yol üyelikle kapanır. Yine de tek bir SQL testi şunları özel kanal üyesi OLMAYAN ekip üyesi ve konuk için dener:
okuma, yazma, arama, yıldız, paylaşılan medya, sabit, okundu bilgisi, "yazıyor" konusu, depolama (`message-images`), son mesaj önizlemesi, okunmamış sayacı, bildirim; hem `authenticated` hem `anon` ile.

## Kaldırılanlar (WP9; `private` düzeyi hariç, aşağıdaki not)

`chat_groups.visibility='private'` seviyesi (CHECK, `can_read_community` dalları, keşif/arama dışlamaları) · `spaces.community_id` ve ekip tetikleyicileri · `create_team_space` · `list_my_teams` · `community_has_team_spaces` · topluluk yeteneklerinden `create_spaces`/`approve_library` (üçlü güncelleme geri) · `isTeamVisibility` · `excludeTeams` · `TeamLanguageScope` + `team-wording.ts` (+test) · "Ekibe çevir / Topluluğa çevir" · `CreateCommunityModal mode="team"` · `team-spaces-info.tsx` · davet `kind` ayrımı · Mesajlar'daki "Ekip = tamamen kapalı topluluk" çipleri · eski çeviriler ve testler.

## Migration planı

`20261110100000_teams_core` · `…110000_team_library_governance` · `…120000_team_channels` · `…130000_team_membership` · `…140000_team_admin_insights` · `20261111100000_remove_team_as_community` (yıkıcı).

## Elle yapılacaklar / dürüst sınırlar

- Edge Function `api` ve `mcp` (ekip MCP yolu, kitle denetimi, kullanım sayacı) elle deploy edilir; yeni Edge Function YOK.
- Sandbox Supabase'e erişemez: tümü yerel PostgreSQL + ağ taklitli Playwright ile sınanır; Realtime, cihaz ve gerçek MCP istemcisi DENENMEZ.
- Gizlilik Politikası / Kullanım Koşulları (denetim günlüğü, API kullanım kaydı, konuk verisi) güncellenir; hukuki danışmandan geçmez.
- Topluluk "yönetim görür" odalarında (352) aynı sızıntı sınıfı bugün de var (yazıyor, fotoğraf yolu, okundu bilgisi, `last_message_at`): bu işin kapsamı DIŞINDA, ayrı küçük bir düzeltme önerilir.

## Uygulama kaydı

**Kullanıcı kararı (uygulama başında):** alan adı/e-posta ile katılma YOK; katılım yalnız kullanıcı adıyla davet ve davet bağlantısı (bağlantıyla yalnız Üye/Düzenleyici; Konuk ve Yönetici kullanıcı adıyla).

| WP | Ne | Doğrulama |
|---|---|---|
| 2 | `teams_core`: tablolar, roller, politika, erişim/eşitleme motoru, denetim | `teams-core.sql` 61 |
| 3 | Kütüphane yönetişimi (durumlar, n onay, inceleme, kullanım, Çalıştı mı, kullanımdan kaldırma) | `team-library-governance.sql` 59 |
| 4 | Kanallar: her kanal ayrı `team_channel` konuşması, sızıntı testleri | `team-channels.sql` 60 |
| 5 | Davet (kullanıcı adı + bağlantı), gruplar, konuklar, çıkarma/devir, sahiplik | `team-membership.sql` 69 |
| 6 | Panel, denetim listesi, entegrasyon/API kullanım günlüğü, dışa aktarma, bildirim kategorisi | `team-admin.sql` 37 |
| 7–8 | İstemci: Ekipler, ekip sayfası (Space'ler/Kütüphane/Sohbet/Üyeler/Panel/Yönetim), `/team-join`, Mesajlar "Ekip sohbetleri", bildirim "Ekipler" | `run-team-hub` 16/16, birim 991 |
| 9 | Eski yapı kaldırıldı: `20261111100000_remove_team_as_community.sql` (yıkıcı), istemci kalıntıları, eski testler | topluluk/sohbet/api-me SQL regresyonları temiz |

**Düzeltilen hatalar (testlerin yakaladığı):** `conversation_members.notify_level` zaten topluluğun sütunuydu (`all/important/none`) → kanal düzeyi `team_notify_level`e taşındı; `_team_role` NULL döndüğü için `not in` karşılaştırmaları ownership devrini bypass ediyordu → `coalesce`; `api_me_library_prompts` kişisel kütüphanede görüntüleyicinin onaysızları görmesini bozmuştu → ekip dışı için eski davranış.

**Bilerek yapılmayanlar:** `chat_groups_visibility_check` hâlâ `private` kabul eder (arayüzde yok; daraltmak onlarca topluluk SQL fixture'ını yeniden yazmayı ister); ekip kanalı sohbeti kompakt görünüm (Mesajlar'daki tam sohbet ekranı `team_channel` için bağlanmadı); `/mcp/team/<ad>` ve MCP `team` argümanı; telefon için ayrı tasarım yerine duyarlı bileşenler; Space sayfasında ekip şeridi; kanal mesajı şikâyeti; Gizlilik/Koşullar metni.


## İkinci tur — eksiklerin kapatılması (2026-11-08)

Kullanıcı listeyi verip "eksikleri yap" dedi. Mockup (`Promptly Ekipler Mockup`, 54 dosya) okunup karşılaştırıldı: kenar çubuğunda **Ekiplerim**, ekip başlığında **Ekip rozeti + "N üye · N Space · Yalnızca davetle" + Davet et**, alt çizgili sekme satırı, sohbette kanal listesi + **çevrimiçi listesi**, paylaşılan içerik kartları — bunlar yapıldı.

| Eksik | Çözüm |
|---|---|
| Tam sohbet ekranı ekip kanalına bağlı değildi | `messages.ts` `team_channel`ı grup gibi eşler (`groupFromTeamChannel`; `group.team` dolu); `LocalConversationView` `dock.embedded` ile ekip sayfasına gömülür; topluluk işleri `teamChannel` ile kapatılır; Mesajlar listesi "Ekip" çipi + etiket. Tepki/yanıt/sabitleme/yıldız/fotoğraf/GIF/düzenleme/"yazıyor" hazır sohbetten gelir (üyelik tabanlı RLS zaten kapsıyordu). |
| Kanal mesajı şikâyeti | `team_report_message` (+ `submit_report` yönlendirmesi): ekip sahip + yöneticilerine bildirim, denetim günlüğü `message_reported`; site moderatörüne gitmez. |
| Gizlilik/Koşullar | "Ekipler" bölümleri (denetim günlüğü, API kullanım kaydı, konuk verisi); `TERMS_VERSION` 2026-11-08. |
| Ekip MCP adresi | `/mcp/team/<ad>` (kişisel adres + o ekibe daraltma), `list_my_libraries` `team` argümanı, Yönetim → Entegrasyonlar'da adres. |
| Space sayfası | `TeamSpaceStrip`: ekip sayfası, ekip sohbeti, "Sohbete gönder" (Space başlık+bağlantı bloğu). |
| Ekip bildirimleri tek dilli | `notification-message.ts` ekip kalıpları + `notifMsg.team*` çevirileri. |
| Görsel uyum / telefon | Ekran görüntüsüyle gözden geçirildi; başlık telefonda yığılır, "Davet et" tam genişlik, tek bölmeli sohbet. Mockup'taki 16 telefon ekranı BİREBİR yeniden çizilmedi. |

Yapılmayan: `private` CHECK daraltma (fixture maliyeti), gömülü sohbette kütüphane/içe aktarma, mockup piksel eşleşmesi.
