# 349 — Ekip alanı: "tamamen kapalı" topluluk = ekip; Space'ler, sohbet ve onay akışı (2026-11-07)

Kullanıcı ekip çalışması için neyin eksik olduğunu sordu; topluluk, topluluk sohbeti ve Space'in birbirine nasıl bağlanacağını tartıştık ve
şu tasarıma karar verdi: **Ekip = "Tamamen kapalı" (`private`) topluluk.** "Topluluk oluştur"da üçüncü seçenek "Tamamen kapalı (ekip alanı)"dır; yöneticiler
(yetenekle) ekibe bağlı Space açar; Space ↔ topluluk ↔ sohbet birbirine bağlıdır. "3 aşamayı da tek seferde yap, önce plan çıkar" denildi; plan
sunuldu, "Başla" ile varsayılan kararlar onaylandı (aşağıda). Bu kayıt üç aşamayı da anlatır.

## Karar: ayrı bir "ekip" tablosu YOK
Ekip, mevcut topluluktur (`chat_groups` = `conversations` kind `group`, aynı id). **Kaynak doğruluk ekip üyeliğidir** (`conversation_members`);
ekibe bağlı Space'in `space_members` satırları o üyeliğin **tetikleyiciyle eşitlenen yansımasıdır**. Böylece Space yetkisinin tamamı (`can_read_space`,
`can_edit_space`, 80'den fazla çağıran, RLS) HİÇ DEĞİŞMEDİ; yalnız `space_role()` yükseltildi. Türetilmiş (üyelikten anlık hesaplanan) erişim
denendi ve elendi: RLS performansı ve 84 çağrı noktasına dokunma riski.

## Aşama 1 — ekibe bağlı Space (`20261107100000_team_spaces.sql`)
- `spaces.community_id` (`on delete set null`). Yalnız `private` ve kapatılmamış toplulukta, yalnız `create_team_space` ile.
- **İki yeni yetenek** (`create_spaces`, `approve_library`): üçlü güncelleme kuralı uygulandı — `_group_all_capabilities()`, `_group_default_permissions()`,
  `lib/chat-groups.ts` `GROUP_CAPABILITIES`. Varsayılan: sahip her zaman; yönetici ikisi de EVET; moderatör HAYIR; yetkiler yalnız yönetici/moderatöre verilebilir.
  `_group_can` üye olmayan için NULL döner — çağıran `coalesce(…, false)` yazmak ZORUNDADIR (ilk sürümde yabancılar Space açabiliyordu; test yakaladı).
- **Eşitleme**: üye katılınca/çıkınca/banlanınca/rolü değişince bağlı Space'lerin satırı eklenir/silinir (`team_spaces_member_insert/delete/role`);
  herkes Space'te `editor`, Space sahibi (`owner_id`) **her zaman topluluk sahibi**. Ekip yöneticisi `space_role()` ile "sahip gibi" çalışır
  (kendi satırı `editor` kalsa da). Değişmez fonksiyonu `_inv()` testte her adımdan sonra denetlenir.
- **Elle yönetim kapalı**: ekibe bağlı Space'te üye/davet/görünürlük/`community_id`/`owner_id` değişiklikleri `space_team_managed` ile reddedilir
  (işlem-yerel işaret `promptly.team_sync` yalnız eşitleme fonksiyonlarında; iç içe tetikleyici derinliği >1 de geçer). Arayüzde Üyeler sekmesi
  "ekipten gelir" notu gösterir; davet, paylaşım ayarları, ayrılma yok.
- Topluluk `private`tan çıkamaz (Space varken `community_has_team_spaces`); silinince Space'ler **silinmez**, sahibinin kişisel Space'i olur
  (`_team_spaces_detach`, BEFORE DELETE); sahiplik devrinde Space sahibi de değişir (`_team_spaces_owner_changed`).
- Aynı topluluğun içeriği (topluluğa özgü prompt vb.) o ekibin Space'ine eklenebilir (`space_items_before_write`); başka topluluk/kişisel kural aynı.
- Sınırlar: ekip başına **50 Space** (`team_space_limit`); kişisel 200 Space sınırına ekip Space'leri **sayılmaz**.
- Ekip kütüphanesinde onay yetkisi ekibe bağlıysa **`approve_library`**dir (kişisel kütüphanede hâlâ yalnız sahip).
- Arayüz: topluluk sayfasında yalnız tamamen kapalıda "Space'ler" sekmesi (`spaces-tab.tsx`: liste, "N/50", yetkiliye "Yeni Space" → `CreateTeamSpaceModal`),
  Space sayfasında **ekip şeridi** (`team-space-strip.tsx`: ekip adı, Ekip sayfası, Ekip sohbeti), Yönetim → Ayarlar'da iki yeni yetenek satırı, topluluk
  oluşturmada üçüncü görünürlük metni.

## Aşama 2 — sohbet ve bildirim bağı (`20261107110000_team_spaces_notifications.sql`)
- **Sohbete gönder**: Space şeridinde ve ekip kütüphanesindeki her prompt taslağında "Sohbete gönder" → ekip sohbetine var olan mesaj biçimiyle
  (başlık + Space bağlantısı, `composeSpaceShareBody`) mesaj yazar. Yeni mesaj şeması yok; yazma yetkisi sohbetin kendi kuralıdır (`posting_policy`).
- **Sohbet bilgi panelinde "Ortak Space'ler"** (`group-info-modal.tsx` → `TeamSpacesInfo`): kısa liste + "Tüm Space'ler". Yönetim oraya EKLENMEDİ
  (183'teki sorumluluk ayrımı: kişi/Space yönetimi topluluk sayfasındadır). Ekip değilse ya da Space yoksa kart çizilmez.
- **Bildirimler** (yalnız bildirim; sohbete otomatik mesaj YAZILMAZ — plan kararı): yeni ekip Space'i → ekibe `info` sınıfı tek `insert … select`
  (`_community_notify_members`, üst sınır 20 000; üyenin topluluk bildirim düzeyi "Tümü" ise gelir); ekip kütüphanesinde onay verme/kaldırma → prompt
  yazarına `direct`. Bildirim metni Türkçe SQL cümlesidir; `notification-message.ts` üç kalıbı + `notifMsg.team*` çevirileri eklendi (birim testli).
  Dedupe anahtarı yönü ve milisaniyeyi içerir (onay → geri alma → onay aynı saniyede ayrı bildirim üretsin).

## Aşama 3 — sürüm geçmişi ve "Onaya gönder" (`20261107120000_team_spaces_review.sql`)
- **Sürüm geçmişi** `space_item_versions`: ekip kütüphanesindeki prompt taslağının başlığı/metni değişince ESKİ hâl tetikleyiciyle saklanır
  (öğe başına son 50; konum/renk değişikliği sürüm üretmez; aynı içerikle kayıt üretmez). İstemci yazamaz (anon/authenticated'dan INSERT/UPDATE/DELETE
  yetkisi alındı), okuma = Space'i okuyabilen. `list_space_item_versions` yazar adıyla döner. **Geri yükleme `space_restore_item_version` YENİ bir
  düzenlemedir** (şimdiki hâl de sürüm olur, onay kendiliğinden düşer); düzenleyici gerekir, kilitli öğede `space_item_locked`.
- **Onaya gönder** `space_request_review`: düzenleyici, onaylanmamış prompt taslağı için ister; zaten bekleyen istek tekrar bildirim üretmez; onaylı
  prompt için istenemez; onay verme/geri alma isteği temizler; herkes (düzenleyici) isteği geri çekebilir. Bildirim **`approve_library` yeteneği olanlara**
  (sahip + yetkili yönetici/moderatör), en çok 200 kişi, `_community_notify` (üye tercihlerine uyar). Kişisel (ekibe bağlı olmayan) kütüphanede
  bildirim yok, sahip rozeti görür. İnceleme sütunları yalnız RPC'lerle yazılır (`space_review_forbidden`); kilit bu sütunları "değişiklik" saymaz.
- **`space_can_approve`**: arayüzün "Onayla" düğmesini doğru göstermesi için (kararın kuralı onay RPC'siyle aynı). Ekip Space'inde onay yetkisi
  "sahip gibi çalışmak" (`create_spaces`) DEĞİL `approve_library`dir; istemci önce yalnız `role === owner`a bakıyordu (moderatöre `approve_library` verilince
  düğme çıkmazdı) — düzeltildi: `space-provider.tsx` karar sunucudan gelir, bilinene kadar düğme kapalı kalır.
- Arayüz (Promptlar sekmesi): "Onaya gönder"/"İsteği geri çek" (yalnız onay yetkisi OLMAYAN düzenleyiciye; yetkili doğrudan onaylar), "Onay istendi" rozeti,
  "Onay istenen" süzgeci, "Sürümler" penceresi (`ItemVersionsModal`: yazar, "Onaylıydı", tamamını göster, Geri yükle). Saf kurallar
  `lib/space-library.ts` (`reviewStateOf`, `reviewActionOf`, `versionPreview`).
- Etkinlik günlüğüne YENİ eylem eklenmedi (CHECK'e dokunmamak için); onay isteği/geri yükleme etkinlikte görünmez.

## Plan kararları (kullanıcı "Başla" dedi, varsayılanlar geçerli)
Bağlı Space'i ekibin tüm üyeleri düzenler · ekip başına 50 Space · topluluk silinirse Space sahibinin kişisel Space'i olarak kalır · Space olayları
yalnız bildirim üretir, sohbete mesaj yazılmaz.

## Test
- Yerel PostgreSQL: `supabase/tests/team-spaces.sql` **70/70** (Aşama 1+2), `team-spaces-review.sql` **34/34** (Aşama 3); önceki `space-team-library` 46/46,
  `spaces`, `space-item-lock` vb. yeşil kaldı. Tüm migration'lar temiz veritabanına baştan oynatıldı.
- Ağ taklitli Playwright `tests/messaging-ui/run-team-spaces.mjs` **25/25** (sekme görünürlüğü, yetkiye bağlı "Yeni Space", 50 sınırı, şerit, üyeler notu,
  yetenekler, topluluk oluştur metni, sohbete gönder, bilgi paneli kartı, Onaya gönder/geri çek, süzgeç, `approve_library` kararları, sürümler/geri yükle,
  kilitli öğe, İngilizce + telefon). Birim testleri: `chat-groups`, `communities`, `spaces`, `space-library`, `notification-message`.
- Duman testi (`scripts/smoke-test.mjs`): `spaces.community_id`, inceleme sütunları, ziyaretçiye kapalı yeni RPC'ler ve sürüm tablosu eklendi.

## Dürüst sınırlar
- Gerçek Supabase'e, Realtime'a, gerçek cihaza/telefona KARŞI DENENMEDİ (sandbox `*.supabase.co`'ya erişemez). Migration'lar deploy hattıyla uygulanır;
  `schema_migrations`'a bak. **Edge Function'lar değişmedi** (kişisel API/MCP okuması 348'deki gibi).
- Mevcut canlı 15 toplulukta `private` olanlar artık "Space'ler" sekmesi görür; boş görünür (eski veri etkilenmez).
- Onay isteği 200 yetkiliye kadar bildirim yazar (sınırlı döngü). Pano kartlarında/öğe ayrıntısında onay ve istek rozeti yok; yalnız Promptlar sekmesi.
- Ekip kütüphanesinden "Onaylayan" ayrı bir rol değildir, yetenektir (`approve_library`); hukuki danışmandan geçmedi.
