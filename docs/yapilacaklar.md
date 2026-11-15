# Promptly — Yapılacaklar (özellik yol haritası)

Bu liste kalıcıdır; her madde bitince durumu burada güncellenir. Tamamlanan her özelliğin
anlatısı `docs/history/NNN-*.md` dosyasındadır (CLAUDE.md Bölüm 8). Boyut: **K** = birkaç
saat, **O** = 1–2 gün, **B** = birkaç gün.

> **Skill (5. içerik türü):** çekirdek yapıldı, geri kalanı bu dosyanın sonundaki "Skill için yapılacaklar" bölümündedir; tam plan
> `docs/skill-plani.md`'dedir.

## Çalışma kuralları (her madde için)

1. **Mevcut mimariyi genişlet**, paralel sistem kurma (`feed_page`, i18n, token'lar, feature klasörleri).
2. **Başka bir şeyi bozma:** SQL'de imza değiştirme (`create or replace` aynı imzayla; `drop` yok);
   `feed_page` / `search_content` gibi paylaşılan RPC'leri değiştirince **bütün tüketicileri** tara
   (Ana sayfa, Keşfet, liste sayfaları, arama, profil, uzantı).
3. **Aynı davranış başka yerde de gerekiyorsa orada da uygula** (kart, detay, Odak görünümü, liste
   sayfaları, Keşfet, profil, koleksiyon, arama sonuçları, bildirim metni, mesajda paylaşım, uzantı).
   Her maddenin "Etki alanı" satırı bu taramanın sonucudur.
4. **TR + EN** (CLAUDE.md 4.5): metinler yalnızca `translations.ts`, bildirim cümleleri
   `notification-message.ts` ile birlikte.
5. **Test:** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`; SQL değişince
   temiz yerel PostgreSQL'de **bütün migration'lar baştan oynatılır** + yeni davranış sınanır;
   canlıya uygulanırsa canlı şema yerelle karşılaştırılır (bkz. `docs/history/158-*`).
6. **Canlıya uygulama sırası:** önce migration (yalnızca ekleyici), sonra kod. Yıkıcı SQL için onay.
7. Migration kaydı **dosya sürümüyle** düşülür (MCP `apply_migration` ayrı zaman damgası yazar).

## ⭐ Öncelikli yapılacaklar — kullanıcı "sorduğumda hatırlat" dedi

> **Yeni oturumdaki asistana:** kullanıcı "sıradaki ne", "ne yapacaktık", "hatırlat" ya da benzerini sorarsa BU bölümü oku, özetle ve
> hangi maddenin kullanıcı kararı beklediğini söyle. Madde bitince burada işaretle (silme), anlatısını `docs/history/NNN-*`'e yaz.
> Kaynak: `docs/history/250-*` (dışa/içe aktarma), `251-*` (başkasının promptu + moderatör toplu yükleme), 2026-10-26 analizi.

**A. Önce yapılacak (kullanıcı/yönetici adımı)**

| # | Madde | Not |
|---|---|---|
| Ö1 | `claude/exchange-export-import` dalını PR ile `main`'e birleştir | Migration'lar `20260927100000_import_prompts.sql` + `20260927110000_admin_import_prompts.sql` canlıya UYGULANMADI; birleşince `deploy.yml` uygular (önce migration, sonra istemci; duman testi iki RPC'nin varlığını denetler). |
| Ö2 | Canlıda ilk toplu yükleme: Moderasyon → "Toplu prompt yükleme" → **Kontrol et** → **taslak olarak yükle** | Yayın kutusunu AÇMADAN başla. Dosya: `https://raw.githubusercontent.com/f/prompts.chat/main/PROMPTS.md` (CC0; 3026 kayıt → ~3012 yüklenir). |
| Ö3 | ~~KARAR: hesap~~ **verildi (2026-10-26):** yüklenen içerik moderatörün KENDİ hesabı altında kalır | Her promptta "Kaynak: prompts.chat (CC0) — @katkıcı" + ortak etiket `prompts.chat`. Akışı doldurmamak için önerilen yöntem: taslak yükle → Moderasyon → "Toplu prompt yönetimi"nde etiketle listele → "İlk N'i seç" ile küçük gruplar hâlinde yayınla (**yapıldı**, `docs/history/251-*`). |
| Ö4 | **[YAZILDI — `docs/history/298-*`, hukuki danışmandan geçmedi; kapsam bir ürün kararı, gözden geçir]** KARAR + hukuki metin: başkasının promptunu indirme/yeniden kullanma | Artık herkes okuyabildiği her promptu indirebilir (dosyada yazar adı + bağlantı). Kullanım Koşulları (`features/legal/legal-content.ts`, TR+EN) yalnız "paylaşma hakkın olan içeriği yükle" diyor; yeniden kullanım/indirme izni ve atıf kuralı yazılmalı. |
| Ö5 | Gerçek ortamda dene | Gerçek Supabase'e, gerçek oturuma, Excel'e (CSV/BOM), telefona karşı hiçbir şey denenmedi; deyim zaman aşımı (Supabase ~8 sn) yerelde 74 ms/parça ile sınandı, canlıda ölçülmedi. |

**B. Geliştirme sırası (API / otomasyon yol haritası — her adım öncekinin üstüne kurulur)**

| # | Madde | Karar/Not |
|---|---|---|
| Ö6 | **[salt-okunur kısmı YAPILDI — `docs/history/297-*`: `/v1` Edge Function, token'sız, yalnız anon; CANLIDA 2026-11-01] API token'ları + salt-okunur `/v1`** (Edge Function `api`, OpenAPI belgesi) | `api_tokens` (SHA-256 özet, kapsam, son kullanım, `kind` = user/agent/bot). EN BÜYÜK RİSK: service role ile yazan API `auth.uid()` boş olduğu için hız sınırı/askı/RLS'i atlar → token'ı doğrulayıp işlem içinde kullanıcı kimliğini kuran RPC'ler, SQL testiyle. Edge Function'lar CI ile deploy EDİLMİYOR (CLAUDE.md §2). |
| Ö7 | **CLI** (`cli/`, kök `package.json`'a dokunmadan) | Yalnız public API'yi kullanır; `login/pull/push/export/import`. Dışa/içe aktarma çekirdeği `src/lib/exchange` — yeniden yazılmaz. |
| Ö8 | **Skill paketleri** (çok dosyalı, sürümlü) | KARAR: sosyal içerik türü mü (beğeni/yorum/alıntı zinciri ister) yoksa sosyalsiz kütüphane kaynağı mı (önerilen). `workflow_versions`/`save_workflow_content` kalıbı. NOT: prompts.chat'te **163 SKILL.md kaydı** var; şimdi metin prompt olarak yükleniyor, paket gelince taşınmalı. |
| Ö9 | **[Faz 1 YAPILDI — `docs/history/297-*`: `promptly-mcp`, 4 salt-okunur araç + MCP prompt'ları; npm'de yayında (0.1.0, 2026-11-01); Trusted Publisher'a geçildi (`311-*`, 2026-11-01); İNTERNET ÜZERİNDEN uzak MCP adresi canlıda — `docs/history/299-*`] MCP sunucusu** | Aynı API işleyicilerinin üstünde; varsayılan salt-okunur; herkese açık prompt metni ajan bağlamına girdiği için yanıtlar "güvenilmeyen içerik" işaretli. |
| Ö10 | **GitHub senkronizasyonu** | KARAR: GitHub App (önerilen) mi OAuth mu. Markdown biçimi hazır (`schemaVersion`'lu). Webhook HMAC, döngü önleme, `last_synced_sha` çakışma çözümü, kullanıcının reposuna yazmak açık onay ister. |
| Ö11 | **Bot/Agent kimliği** | KARAR: ilk fazda "sahibi adına yazan kapsamlı token" (önerilen) mi, ayrı herkese açık bot profili mi (auth.users satırı ister). |

**C. Bilinen eksikler (bu işlerin)**

- ~~Toplu yönetim aracı~~ **yapıldı** (`docs/history/251-*`): etiketle listele, seçerek yayınla / gizle ("Sadece ben") / sil. Yayından GERİ ÇEKME bilerek yok (etiket kullanım sayacı geri azalmıyor → sayaç şişer); yerine "gizle". Silme yalnız kimsenin dokunmadığı promptları siler.
- Yalnız **Prompt** dışa/içe aktarılır; Workflow / Hazır Ayar / İstek yok. Markdown ve CSV **değişken tanımı** taşımaz.
- ~~prompts.chat içeriği hep `text`, kategorisiz, şablonlar çevrilmez~~ **giderildi** (`docs/history/253-*` şablon değişkenleri, `260-*` toplu tür/kategori; canlıda 3388 prompt kategorili, 718'inde değişken var — `293-*`). 7 kayıt 50 000 karakter sınırını aşıyor → atlanır (kesilmez); 7 kayıt birebir yinelenen. ~700 kaydın katkıcı alanı **e-posta adresi**, 621'i anonim → bunlar bilerek yalnız genel "prompts.chat (CC0)" atfı alır (kişisel veri kopyalanmaz).
- prompts.chat'te 7 kayıt 50 000 karakter sınırını aşıyor → atlanır (kesilmez); 7 kayıt birebir yinelenen. ~700 kaydın katkıcı alanı **e-posta adresi**, 621'i anonim → bunlar bilerek yalnız genel "prompts.chat (CC0)" atfı alır (kişisel veri kopyalanmaz).
- Düzenlenmiş dosyayı yeniden içe aktarmak mevcut promptu **güncellemez** (yinelenme = aynı başlık + metin); güncelleme/senkronizasyon GitHub aşamasının işi.
- Kullanıcı içe aktarması tek seferde en çok 30 prompt (saatlik hız sınırıyla uyumlu); moderatörde sınır yok (50'şerli parça).

## Sıra ve gerekçe

Önce küçük, bağımsız, büyümeyi/etkileşimi doğrudan etkileyenler; paylaşılan RPC'yi
genişletenler (kullanım, etiket takibi) birbirinin üstüne binmesin diye ayrı ayrı ve sırayla;
dış servis/karar gerektirenler en sona.

| # | Madde | Boyut | Durum |
|---|---|---|---|
| 1 | Paylaşılan linklerde önizleme (OG) | O | **yapıldı** (statik paylaşım sayfaları; `docs/history/159-*`) |
| 2 | "Kullanım" sinyali: kopyalama sayacı + görünürlük + sıralama | K–O | **yapıldı** (`docs/history/160-*`; "En çok kullanılan" yalnız Keşfet → Promptlar, `Popüler` değişmedi) |
| 3 | Etiket takibi + ana sayfada "Etiketlerim" | O | **yapıldı** (`docs/history/161-*`) |
| 4 | Haftalık tema / "Haftanın isteği" | O | **yapıldı** (`docs/history/162-*`) |
| 5 | PWA (ana ekrana ekleme) | K | **yapıldı** (`docs/history/163-*`; service worker yok) |
| 6 | Workflow adım adım çalıştırma modu | O–B | **yapıldı** (`docs/history/164-*`) |
| 7 | @bahsetme (yorum + istek) | K–O | **yapıldı** (`docs/history/165-*`; yorum + isteğin yaratıcı yönü) |
| 8 | Herkese açık koleksiyonları takip etme | O | **yapıldı** (`docs/history/166-*`) |
| 9 | Sürüm geçmişi + fark görünümü + geri dönme: Prompt, Prompt İsteği, Workflow, Hazır Ayar | O | **yapıldı** (kod + migration repoda; **canlıya uygulanmadı**, `docs/history/170-*`) |
| 10 | Yan yana model karşılaştırma (Studio) | B | **yapıldı** (`docs/history/123-*` 9.123b: ana modele ek en çok 2 model; liste eskimişti, `306-*`) |
| 11 | Haftalık özet bildirimi | B | **site içi YAPILDI** (`307-*`, `dispatch_my_weekly_digest`); **e-posta / web push engelli**: dış servis + gizli anahtar kararı gerekir |
| 12 | Sayaç sütunlarını istemciden koruma (`like_count`, `save_count`, `comment_count`, `response_count`) | K–O | **bulgu**, bekliyor (aşağıda) |
| 13 | Grup sohbeti ve topluluk (roller, davet/başvuru, keşif, görünürlük + toplu kabul, bildirimler) | B | **yapıldı** (kod + 2 migration repoda; **canlıya uygulanmadı**, `docs/history/172-*`) |
| 15 | Topluluklar: grup sohbetinin tam kapsamlı topluluk sistemine genişletilmesi (akış, duyuru, etkinlik, kurallar, bildirim tercihi, moderasyon kuyruğu, istatistik, kapatma, eski grupların korunması) | B | **yapıldı** (kod + 3 migration repoda; **canlıya uygulanmadı**, `docs/history/175-*`) |

## Madde ayrıntıları

### 1. Paylaşılan linklerde önizleme
- Sorun: detay sayfaları `/x/local?id=` ve istemci tarafında oluşuyor; sosyal ağlar başlık/görsel görmez.
- ~~Plan: Edge Function ile OG meta~~ — **çalışmaz**: Supabase, özel alan adı olmadıkça Edge Function
  `text/html` yanıtlarını `text/plain`'e çevirir. Yerine: derleme zamanı statik paylaşım sayfaları
  (`/share/<tür>/<anahtar>/`) + 404 yönlendirici + 6 saatlik zamanlanmış derleme. Sınır: `og:image`
  site kartı (medya private), yeni içeriğin önizlemesi bir sonraki derlemeyi bekler.
- Etki alanı (tarandı): kart/detay/Odak "Paylaş" (`shareOrCopyLink`), menüde "Linki kopyala", profil paylaş —
  hepsi bağlandı; mesajdaki paylaşım satırları ayrıştırıldığı için DEĞİŞMEDİ; uzantıda paylaşım noktası yok.

### 2. Kullanım sinyali
- Plan: `copy_count` sayacı (SECURITY DEFINER RPC, kullanıcı başına gün başına tek sayım),
  kopyalama eylemi RPC'yi çağırır; kartta/detayda/istatistikte gösterilir; isteğe bağlı sıralama.
- Etki alanı (tarandı): kopyalama yalnızca prompt detayında var (kopyala + çalıştır); istek/workflow/hazır ayarda
  kopyala düğmesi yok; kartlarda yok (`PromptPreviewBox` ölü bileşen); İstatistikler penceresi bağlandı; sıralama:
  ayrı "En çok kullanılan" seçeneği (yalnız Keşfet → Promptlar); `Popüler`/arama/liste sayfaları değişmedi.

### 3. Etiket takibi
- Plan: `tag_follows` tablosu (RLS: yalnızca sahibi), etiket sayfasında Takip et, ana sayfada "Etiketlerim"
  (`feed_page` aynı imzayla genişler).
- Etki alanı (tarandı): etiket sayfası ✔, etiket dizini ✔ ("Takip ettiğin etiketler"), ana sayfa sekmesi ✔, misafir akışı ✔ (giriş istemi, istek yok); karttaki etiket rozetinde takip düğmesi bilerek yok; Keşfet/arama etkilenmez.

### 4. Haftalık tema
- Plan: moderatör yönetimli `weekly_challenges` (etiket tabanlı; katılım = o etiketli içerik); ana sayfa/Keşfet bandı.
- Etki alanı (tarandı): moderasyon sekmesi ✔, Ana sayfa ✔, Keşfet ✔, "Katıl" dört oluşturma formunda (prompt/istek/workflow/hazır ayar) ✔; etiket sayfası değişmedi; tema bildirimi bilerek yok.

### 5. PWA
- Plan: `manifest.webmanifest`, ikonlar, meta etiketleri. Service worker YOK (eski sürümde takılma riski).
- Etki alanı: `basePath /promptly`, tema rengi (palet/mod), iOS meta.

### 5. PWA — yapıldı
Manifest + simgeler + apple meta + `theme-color` senkronu. Service worker yok. Gerçek cihazda denenmedi; kurulu uygulamada Google girişi denenmedi.

### 6. Workflow adım adım çalıştırma — yapıldı
Model çalıştırmaz: sonucu yapıştır → sonraki adımın girdisi. Yalnız detay sayfası; kartlardan doğrudan düğme yok (`?run=1` hazır).

### 7. @bahsetme — yapıldı
Yorum + isteğin yaratıcı yönü; anma kuralı SQL ve istemcide aynı; bildirim türü 'comment' (kısıtı genişletmek yıkıcı SQL gerektirirdi). Kartlarda/açıklamada/biyografide/DM'de anma yok (bilinçli).

### 8. Koleksiyon takibi — yapıldı
Takip + sayaç (korumalı) + bildirim + profil sekmeleri. Takip edilen koleksiyona yeni içerik bildirimi yapılmadı.

### 9. Sürüm geçmişi — yapıldı (canlıya uygulanmadı)
Prompt'ta `prompt_versions` + panel + fark zaten vardı; eksik olan: İstek/Workflow/Hazır Ayar sürümleri, kopyalama, geri dönme, ortak liste, iki sürüm seçici, `prompt_versions` erişim açığı (private prompt sürümleri). Ayrıntı: `docs/history/170-*`. Canlıya alma sırası: önce 3 migration (`20260919940000`–`960000`), sonra istemci kodu.

### 10. Yan yana model karşılaştırma (Studio)
Ayrıntılar madde sırası geldiğinde bu dosyaya eklenir.

### 11. Haftalık özet (engelli)
E-posta sağlayıcısı veya web push (VAPID) anahtarı gerekir; anahtar repoya girmez. Karar bekliyor.

### 12. Sayaç sütunlarını istemciden koruma — yapıldı (iki migration canlıda)
- Bulgu doğrulandı: yerelde (tüm migration'lar temiz DB'ye oynatılarak) sahibi olarak `authenticated` rolüyle
  `prompts`, `prompt_requests`, `workflows`, `presets`, `prompt_results`, `prompt_comments`, `profiles` ve
  `collections` sayaçlarına 9999 yazılabildi; INSERT sırasında da sayaç verilebildi. Canlı şema salt okunur
  sorguyla karşılaştırıldı: aynı UPDATE politikaları ve `authenticated` UPDATE yetkisi var, yalnız
  `prompts.copy_count` ve `collections.follower_count` korunuyor (yazma denemesi canlıda yapılmadı).
- Çözüm: `20260919920000_protect_counter_columns.sql` — `protect_counter_columns()` (SECURITY INVOKER,
  `current_user in ('anon','authenticated')` ise UPDATE'te eski değer, INSERT'te 0) 8 tabloya bağlandı.
  Sayaçları güncelleyen trigger'lar SECURITY DEFINER olduğundan etkilenmez; `handle_collection_item_change`
  invoker'dı, `collections.item_count` korunduğu için DEFINER yapıldı (aksi hâlde sessizce sayamazdı).
  `20260919930000_protect_remaining_counters.sql`: `conversation_members.unread_count` (okundu işareti artık
  SECURITY DEFINER `mark_conversation_read()` RPC'sinden; istemci `markConversationRead` güncellendi) ve
  `tags.*_usage_count` (RLS zaten yazdırmıyordu; trigger savunma derinliği). Artık korunmayan sayaç kalmadı.
- Canlı: iki migration uygulandı; sahibi hesapla geri alınan işlemde `like_count`/`save_count`/`comment_count` yazma denemesi eski değeri bıraktı (6 → 6).
- Test: `supabase/tests/counter-protection.sql` (düzeltme öncesi 16 FAIL → sonrası 0) + `saved-collections.sql` yeniden: 0 FAIL.

### 13. Grup sohbeti ve topluluk — yapıldı (canlıya uygulanmadı)
Mevcut `conversations`/`conversation_members`/`messages` genişletildi (`kind`, `role`, `joined_at`, `muted_at`) + `chat_groups`, istek, davet, bağlantı, yasak, denetim tabloları; yazma yolu SECURITY DEFINER RPC'ler. Kapalı → açık görünürlük geçişi bekleyen başvuruları tek atomik işlemde kabul eder (kabul edilemeyenler `pending` kalır ve nedeniyle raporlanır). Ayrıntı, rol matrisi ve bilinen boşluklar: `docs/history/172-*`. Canlıya alma sırası: önce `20260919980000` + `20260919990000` (yalnızca ekleyici / yerinde politika daraltma; `drop` yok), sonra istemci kodu. Test: `supabase/tests/run-local.sh supabase/tests/chat-groups.sql` (113 kontrol), `npm test`, `tests/messaging-ui/run-groups.mjs`.

### 13a. Grup yetkileri ve geçmiş görünürlüğü — yapıldı (canlıya uygulanmadı)
Owner admin/moderatör yetkilerini rol başına açıp kapatır (varsayılanlar 172'deki matrisle aynı) ve yeni üyelerin önceki mesajları görüp görmeyeceğini seçer; ikisi de yalnız owner. Migration `20260920000000_chat_group_permissions.sql` (önce migration, sonra istemci kodu). Ayrıntı: `docs/history/173-*`. Test: `supabase/tests/run-local.sh supabase/tests/chat-group-permissions.sql`.

### 14. Sohbet geliştirmeleri — yapıldı (canlıya uygulanmadı)
Okundu bilgisi (üye başına imleç; birebirde tik, grupta "Mesaj bilgisi"), "yazıyor" (Realtime Broadcast, private kanal), sabit mesajlar (birebir iki taraf; grupta `pin_messages` yeteneği / owner ayarı `members_can_pin`), sohbet içi arama + mesaja atlama, yıldızlı mesajlar (`/messages/starred`). Migration'lar: `20260920010000`, `20260920020000`, `20260920030000` (önce migration, sonra istemci kodu; Realtime Dashboard'unda "Allow public access" KAPALI olmalı). Ayrıntı ve bilinen boşluklar: `docs/history/174-*`. Test: `supabase/tests/run-local.sh supabase/tests/chat-features.sql` (67 kontrol), `npm test`, `tests/messaging-ui/run-chat.mjs` (33 senaryo).

### 15. Topluluklar — yapıldı (canlıya uygulanmadı)
Grup sohbeti (172–174) **topluluğun sohbet modülü** oldu: tek üyelik/rol/mesaj altyapısı, üzerine `community_posts` (mevcut içeriğe başvuru; özel içerik otomatik açılmaz), duyurular (sohbette bağlantılı), kurallar + kabul zorunluluğu, etkinlikler (IANA saat dilimi, RSVP, 24 saat hatırlatma), üye başına bildirim tercihi (tümü/önemli/sessiz + süreli), topluluk içi rapor kuyruğu, kapatma, toplulaştırılmış istatistik özeti, yer imi. Mesajlar'dan bağımsız grup oluşturma kalktı. Eski gruplar **kimlik eşlemesiyle** (aynı satırlar, `origin='legacy_group'`) korunur; `community_migration_report()` envanter/anomali raporu verir. Ayrıntı, rol matrisi, geçiş/geri alma planı ve bilinen boşluklar: `docs/history/175-*`. Canlıya alma sırası: `20260920040000` → `050000` → `060000` (yalnızca ekleyici), sonra istemci kodu. Test: `supabase/tests/run-local.sh supabase/tests/communities.sql` (101 kontrol), `npm test`, `tests/messaging-ui/run-communities.mjs`.
**Kalan (bu sürümde yok):** Sohbet sekmesinin sohbeti gömmesi (şimdilik Mesajlar'a bağlar), zamanlayıcıyla/push ile etkinlik hatırlatma, kullanıcıya özel saat dilimi tercihi, site moderatörünün topluluk raporlarını görmesi, gerçek Supabase/Realtime/cihaz denemesi.

### 16. Topluluk görünürlüğü, tek üyelik düğmesi, arama ve öneriler — yapıldı (canlıya uygulanmadı)
Üç düzey (`public` · `restricted` "Kapalı" · `private` "Tamamen kapalı"), kapalı toplulukların aramada/önerilerde görünüp başvuruyla katılımı, karttaki/başlıktaki **Katıl · İstek gönder · Katıldın ▼ → ayrıl** düğmesi, Keşfet'te "Senin için önerilenler"; topluluk "Kaydet"i (yer imi) kaldırıldı. Migration: `20260920070000_community_visibility.sql` (175'ten sonra; iki `drop`: `community_bookmarks`, `set_community_bookmark`/`list_my_communities` yeniden yazımı — canlıya hiç girmemiş nesneler). Ayrıntı: `docs/history/176-*`. **Kalan:** canlıya uygulama (önce migration, sonra istemci), gerçek Supabase/oturum/cihaz denemesi, kapalı topluluğa isteğe bağlı kısa mesaj alanı, arama performansının büyük veriyle ölçülmesi.

### 17. Topluluk gizliliği — yapıldı (canlıya uygulanmadı)
`chat_groups` satırı yalnız üyeye (kart `community_cards` RPC'sinden), oturumsuz ziyaretçi herkese açık topluluğu okur, görseller özel bucket'ta, eski bildirimler temizlenir, görünürlük seçici (tablo/kompakt kart + etki açıklaması). Migration: `20260920080000_community_privacy_hardening.sql` (176'dan sonra). Ayrıntı ve denetim bulguları: `docs/history/177-*`. **Kalan:** canlıya uygulama (önce migration, sonra istemci), gerçek Supabase/oturum/cihaz denemesi, eski ortak-bucket görsellerinin sahiplerince yeniden yüklenmesi (`community_legacy_avatar_report()`), etkinlik konum/bağlantısının üyelere özel olup olmayacağı kararı, kapak görseli eklenirse aynı kural.

### 18. Topluluk gönderisi etkileşimi — yapıldı (migration canlıda)
Gönderi artık kendi kimliği, beğenisi ve yorumları olan bağımsız bir varlık (`prompt_likes` / `prompt_comments` altıncı hedef `community_post_id`; `community_posts.kind` native · application · legacy; korumalı gönderi sayaçları); "Gönderi oluştur" = yeni içerik (mevcut oluşturma ekranı + `?community=`, `publish_native_community_post`) ya da mevcut içeriğe başvur; "yalnızca topluluk" yeni görünürlük değeri olmadan `private` + yerel gönderi; orijinal içeriğin sayaçları/yorumları etkilenmez. Migration: `20260920090000_community_post_engagement.sql` (177'den sonra). Ayrıntı ve bilinen boşluklar: `docs/history/178-*`. **Kalan:** canlıya uygulama (önce migration, sonra istemci), gerçek Supabase/oturum/cihaz denemesi, topluluk yerel özel içeriğinin üyeler için de genel listelerden/aramadan gizlenmesi (`search_content` prompt/istek/workflow kolları ve doğrudan tablo okuyan liste sorguları yalnız RLS'e güveniyor), gönderi beğenenleri listesi, ayrı gönderi detay sayfası.

### 19. Topluluğa özgü içerik — yapıldı (canlıya uygulanmadı)
Toplulukta oluşturulan içerik topluluğa aittir (`community_id`): normal içerik kartı + kendi beğeni/yorumu, yalnız topluluğu okuyabilenlere görünür, profilde/Keşfet'te/aramada/koleksiyonda yok, kaydet/paylaş yok, kaldırma içeriği siler, taslak ve topluluk değişimi yok. 178'in "private + yerel gönderi" yaklaşımının yerini aldı. Migration: `20260920100000_community_content.sql` (178'den sonra; önce migration, sonra istemci). Ayrıntı: `docs/history/179-*`. **Kalan:** canlıya uygulama, gerçek Supabase/oturum/cihaz denemesi, topluluk isteklerine yanıt akışının kapatılması, @bahsetme bildirimi, içeriğin topluluk silinmeden dışa aktarılması.

### 20. Topluluk kartlarında İstatistik ve Paylaş — yapıldı (canlıya uygulanmadı)
Yerel içerik kartı ve başvuru kartı/sayfası normal kartlardaki gibi İstatistik + Paylaş sunar (Kaydet kapalı kalır). Paylaşım özel içerikte paylaşım sayfasına çevrilmez. `content_engagers` topluluk içeriğini ve `community_post` hedefini kabul eder (`20260920110000`, `docs/history/181-*`). Uygulama sırası: 179'un migration'ı → bu migration → istemci.

---

## Skill için yapılacaklar (5. içerik türü)

Tam plan: [`docs/skill-plani.md`](skill-plani.md) (ürün, mimari, güvenlik, 17 dilimlik teslim sırası). Çekirdek dilimin anlatısı:
`docs/history/388-skill-cekirdegi.md`. Boyutlar K/O/B (yukarıdaki anlam). Her madde bitince `[x]` yapılır, anlatısı `docs/history/NNN-*`'e yazılır.
Her madde için çalışma kuralları (yukarıda) geçerlidir: önce mevcut deseni genişlet, migration yalnız ekler, TR+EN, testler.

### Yapıldı — çekirdek (388)
- [x] `skills` tablosu + RLS + engelleme + sayaç koruması + hız sınırı (`20261126100000_skills_core.sql`, SQL testi `skills-core.sql`)
- [x] `SKILL.md` üretimi ve ad/slug/sürüm yardımcıları (`lib/skills/skill-md.ts`, birim testli); uzmanlık alanı/araç/lisans listeleri (`categories.ts`, migration CHECK'iyle aynası test edilir)
- [x] Oluşturma/düzenleme: kolay mod (`/skills/create`, `?edit=`), taslak + yayın + "Kim görsün?"
- [x] Liste (`/skills`, keyset + basit arama), kart (`SkillCard`, `ContentCardPost`), detay (`/skills/local?id=`, talimat + `SKILL.md` kopyala/indir, sahibe Düzenle/Sil)
- [x] Oluştur menüsünde Skill girişi (**`NEXT_PUBLIC_SKILLS_ENABLED=true` arkasında**), TR+EN metinler

### Aşama 1 — veri modeli ve paket (büyük kısmı yapıldı, `389-*`; kalan: `skill_categories`, limit ölçümü, Edge deploy)
- [x] **O** `skill_versions`: değişmez sürüm (`version`, `changelog`, `package_path`, `package_sha256`, `manifest`), yazma yalnız RPC/tetikleyici, SELECT üst Skill'den — **yapıldı** (`20261127100000`, `389-*`)
- [x] **O** `skill_files` + özel `skill-files` bucket + Storage politikaları; `orphan_storage_objects` bucket listesi ve `delete_account_data` güncellenir — **yapıldı**; hesap silmede dosyalar CASCADE + `orphan_storage_objects` süpürür (`delete_account_data` değişmedi)
- [x] **O** `skill_tags`, `skill_relations` (kimlik başvurusu, `quote_target_ok`), `skill_uses` (kişi-Skill-gün, istemciye kapalı), `skill_pins` — **yapıldı** (tablolar + SQL testi; `skill_uses` yazan `record_skill_use`, indirmede çağrılır)
- [x] **K** `skill_categories` tablosu YAPILDI (`399-*`: sekiz alan tohumlu, `skills.category` yabancı anahtar)
- [x] **O** `lib/skills/package-validate.ts` (zip slip, bomba, magic byte, gizli anahtar) + `zip.ts` (`fflate`, dinamik yükleme — **bağımlılık kararı bekliyor**) + `semver.ts` + kötü ZIP fixture'ları — **yapıldı** (`fflate` 0.8.2, dinamik yükleme; kötü ZIP fixture'ları `package-build.test.ts`'te)
- [x] **B** Edge Function `skill-package` + `skill_publish_begin/commit` (idempotent) + `smoke-test.mjs` girişleri; **Edge'de ZIP açma süre/bellek sınırını ilk iş olarak ölç** — **yazıldı, DEPLOY EDİLMEDİ** (elle: Deploy Edge Functions → `skill-package`); çekirdek Node'da testli, `Deno.serve` bağlayıcısı çalıştırılmadı; ZIP süre/bellek ÖLÇÜLMEDİ
- [x] **K** Paket limitleri ölçüldü (`scripts/measure-skill-package.mjs`, `398-*`): çekirdek maliyeti düşük, limitler KORUNDU; Edge'in duvar süresi/bellek tavanı deploy sonrası denenecek

### Aşama 2 — oluşturma editörü (gelişmiş) — yapıldı (`389-*`); etiket arayüzü ve slug `398-*` ile yapıldı
- [x] **B** Gelişmiş mod: dosya yükleme (ilerleme/iptal/yeniden dene, dosya başına doğrulama durumu), dosya ağacı (`role="tree"`), kurallar / iş akışı / araç tanımı / referans / örnek bileşenleri (`FormDisclosure`) — **yapıldı** (`389-*`)
- [x] **O** Masaüstünde üç bölme (dosya ağacı · düzenleyici · canlı önizleme); telefonda "Dosya düzenle" tam ekran sayfası (`Modal` kuralları) — **yapıldı**
- [x] **O** Bağlı içerik seçimi: mevcut **Oluştur / Seç** kalıbı (`content-add`, `content-picker`) ile Prompt/Workflow/Ayar paketi bağla — **yapıldı** (`ContentPickerDialog` + `CompactContentCard`)
- [x] **O** Yayın akışı: sürüm önerisi (düzeltme/yeni özellik/kalıp değişikliği), değişiklik notu zorunluluğu (`1.0.0` sonrası), `client_token` ile tekrar deneme — **yapıldı**
- [x] **O** ZIP/klasör **içe aktarma** (frontmatter forma dolar; yazar/durum/görünürlük/sayaç dosyadan alınmaz; atıf `metadata.source`) — **ZIP yapıldı** (klasör seçimi `398-*` ile eklendi)
- [x] **O** Güvenli Markdown görüntüleyici (HTML üretmez, `dangerouslySetInnerHTML` yok) — detayda talimat şimdi düz metin — **yapıldı** (detay + düzenleyici önizlemesi)
- [x] **K** Slug yeniden adlandırma YAPILDI (`398-*`): düzenleyicide "Klasör adı (slug)"; değişince yeni sürümler yeni adla paketlenir
- Etki alanı: `my-content-view.tsx` (`createLinks`), `kind-drafts-button`, taslaklar listesi

### Aşama 3 — sosyal entegrasyon (dilim 1 yapıldı, `390-*`: beğeni/tepki, yorum + sabitleme, bildirim cümleleri, İstatistik, şikâyet/moderasyon, profil bölümü; kalanlar aşağıda)
- [x] **B** (beğeni/tepki + yorum + istatistik + şikâyet yapıldı; `collection_items`/`content_relations` dalları KALDI) Ortak tablolara `skill_id` dalları: `prompt_likes`, `prompt_comments`, `collection_items`, `reaction_stats`, `content_relations`, `reports`; `target_id` birleşimi ve `handle_prompt_like_change` / `handle_prompt_comment_change` / `handle_comment_delete` / `notify_comment_*` / `content_engagers` zincirlerinde AÇIK dal (**"tam biri dolu" CHECK yeniden kurulumu yıkıcıdır: `-- ci:allow-destructive` + kullanıcı onayı**)
- [x] **B** (beğeni/tepki + yorum `390-*`; kaydet + koleksiyon + ortak koleksiyon `391-*` YAPILDI) Beğeni/tepki, yorum, kaydet + koleksiyon + ortak koleksiyon arayüzü: kartta `PromptCardFooter` benzeri altbilgi, detayda `DetailActionBar` çubuğu (`Engage*` ailesi, `LikeableContentType`, `CommentScopeKind`, `SaveableContentType`, `StatisticsContentType` genişler)
- [x] **O** (profil bölümü `390-*`, İçeriklerim `391-*` YAPILDI; `profile_content_stats` imzasına DOKUNULMADI, sayı `head` sayımından) Profilde "Skill'ler" bölümü + `profile_content_stats` + İçeriklerim (**taslaklar şimdi listede görünmüyor, yalnız detay adresinden**)
- [x] **O** (YAPILDI `391-*`) Bildirimler (yayın → takipçilere, yeni sürüm → sabitleyenlere): SQL Türkçe cümle + `notification-message.ts` + `nc.pref.*` + `_notification_pref_key` / `_notification_category` / `cardKindKey`
- [x] **O** (şikâyet + moderatör kuyruğu + kaldırma YAPILDI `390-*`; Skill sayıları `admin_skill_stats` ile YAPILDI `395-*`) Şikâyet (`submit_report('skill', …)`) + moderatör kuyruğu + içeriği/paketi kaldırma + `admin_*` sayaçları
- [x] **O** (YAPILDI `391-*`: `creator_insights_skills` + panel bölümü) Yaratıcı paneli / İstatistik: indirme, kaydedilme, tepki, yorum (`creator_insights_*`), `skill_uses` kaynaklı kullanım
- [x] **K** (Paylaş modalı `391-*` + mesajla paylaşım `396-*` YAPILDI; hikâye YAPILMADI — hikâye bağlantı modeli dört türe özgü) Paylaş modalı ve mesajla paylaşım (`ShareModal`'a hedef ekle, bağlantı + kısa özet)

### Aşama 4 — keşif ve arama
- [x] **B** (YAPILDI `392-*`; karma akışa katılım YAPILMADI) `skill_feed_page` (keyset, uzmanlık alanı/paket içeriği/araç/sıralama) — `feed_page` imzasına DOKUNMA; karma "Tümü" akışına katılım ayrı karar
- [x] **O** (KARAR: `search_content`'e DOKUNULMADI, arama `skill_feed_page`'dedir `392-*`) `search_content` `p_kind='skill'` (+ `SearchKind`, `ContentKind`/`search-tokens`); şimdiki `searchSkillsPage` `ilike` + `created_at` imlecidir (talimat dahil, dizin maliyeti **ölçülmeli**, `EXPLAIN` 5–7 tekrar medyan)
- [x] **O** (bölüm + süzgeçler YAPILDI `392-*`; Ana Sayfa tür çipi YAPILDI `396-*`) Keşfet "Skill'ler" bölümü (`SectionMenu`), `ListFilterSheet` Skill süzgeçleri (uzmanlık alanı, paket içeriği, uyumlu araç, sıralama), Ana Sayfa tür çipi
- [x] **O** (YAPILDI `392-*`: `match_source`) Arama sonucunda eşleşme kaynağı (başlık/talimat/kural/araç/etiket)
- [x] **O** (RPC + ters yön YAPILDI `392-*`; İlişki Haritası: düğüm DEĞİL, haritanın altında "şu Skill'lerde" bölümü `396-*`) `related_skills` RPC'si (benzer Skill) + İlişki Haritası (`/relations`) + ters yön "Bu prompt şu Skill'lerde"
- [x] **K** ("Önerilen" puanı YAPILDI `392-*`; kapak görseli YAPILMADI) Kart/detay için kapak görseli (isteğe bağlı), "Önerilen" sıralama puanı (`use_count`, `save_count`, tepki, tazelik)

### Aşama 5 — dağıtım ve entegrasyon
- [x] **O** (YAPILDI `393-*`) Detayda indirme menüsü (ZIP, SKILL.md, Markdown kopyala, JSON, önceki sürümler), Sürümler sekmesi, sürüm sabitleme (`skill_pins`) + bildirim, `record_skill_use`
- [x] **O** (YAPILDI `393-*`) `/share/skill/<anahtar>/` statik paylaşım sayfası (`ShareKind`, `share-link.ts`, `og:*`)
- [x] **O** (YAPILDI `397-*`: `import_skills` RPC + `promptly.skills` zarfı + İçeriklerim'de İçe/Dışa aktar) Dışa/içe aktarma zarfı `promptly.skills` (`lib/exchange`)
- [x] **B** (Claude Code `verified` YAPILDI `393-*`; Codex/Cursor da `verified` (YAPILDI `396-*`, resmî belgeden)) Adaptörler: Claude Code kurulum adımları (doğrula), Codex ve Cursor (`lib/skills/adapters/*`, `verified`/`draft`, golden test; **resmî belgeyle doğrulanmadan kullanıcıya sunulmaz**)
- [x] **B** (YAPILDI `393-*`; Edge `api`/`mcp` elle deploy + `promptly-mcp` 0.3.0 elle yayın) Açık API `public-skills.ts` (+ `openapi.ts`) ve MCP `search_skills` / `get_skill` / `list_skill_files`; `sync-function-shared.mjs`; Edge `api`/`mcp`/`skill-package` elle deploy; `promptly-mcp` yeni sürüm; `/developers` metni
- [x] **K** (YAPILDI `394-*`) Alıntılama (`create_quote`) Skill'e açıldı; topluluğa duyurulmaz, yalnız akış

### Açılış (dilim 5.4)
- [x] **O** (YAZILDI `393-*`, `TERMS_VERSION` 2026-11-15; **hukuki danışman onayı YOK**) Gizlilik Politikası (`skill_uses`, Skill dosyaları) + Kullanım Koşulları (Skill = kod/betik/lisans) güncellemesi, `TERMS_VERSION` artırılır; **hukuki danışman onayı**
- [x] **K** (CLAUDE.md + history notları YAPILDI; çeviri taraması betikle YAPILDI `396-*`, insan gözden geçirmesi YOK) Çeviri gözden geçirme, CLAUDE.md'ye Skill'in kalıcı kuralları (rota, tablolar, bayrak), `docs/history` notları
- [x] **K** (`deploy.yml` `vars.NEXT_PUBLIC_SKILLS_ENABLED`'e BAĞLANDI `393-*`; DEĞER YAZILMADI, bayrak KAPALI — GitHub → Settings → Variables'tan açılır) `NEXT_PUBLIC_SKILLS_ENABLED=true` değişkenini deploy ortamına ekle (`.github/workflows/deploy.yml`); bayrak açılınca menü girişi görünür
- [ ] **K** Gerçek Supabase/cihaz elle kontrol listesi: gerçek yükleme ve imzalı indirme, Claude Code'a kurulum, iOS Safari dosya seçici, TR/EN görünüm

### Aşama 6 — gelişmiş
- [x] (oy `393-*`; araç etiketli değerlendirme `397-*` YAPILDI [sürüm etiketi yok]) "Çalıştı mı?" oyu (`prompt_works_votes` kalıbı; kopyalama şartı yerine indirme kaydı), kullanım değerlendirmesi (araç + sürüm etiketli yorum)
- [x] (kalite göstergeleri `395-*`; sürüm güncelleme bildirimi `391-*`; betik risk taraması [bilgilendirici] ve Skill ↔ Skill bağları `397-*` YAPILDI)

### Çekirdeğin bilinen sınırları (bilerek yapılmadı)
- Gerçek Supabase'e, Storage'a ve cihaza karşı **denenmedi**; SQL testi yerel PostgreSQL'de, arayüz yalnız tip/lint/derleme ile doğrulandı (Skill için ağ taklitli Playwright paketi henüz yok → `tests/messaging-ui/run-skills.mjs`).
- Kart ve detayda beğeni/yorum/kaydet/İstatistik/Paylaş yok; sayaç sütunları var ama yazılmıyor (hep 0).
- Skill menü girişi bayrak arkasında; `/skills` adresleri bayraksız da açılır (yalnız menü satırı gizlenir).
- Sürüm elle verilir, geçmişi tutulmaz; `SKILL.md` her indirmede o anki alanlardan derlenir (değişmez paket yok).
- Arama `created_at` imleciyle çalışır (aynı anda eklenen satırlar nadiren atlanabilir) ve talimatı `ilike` ile tarar.
- Moderatör kuyruğu/sayaçları, hesap silme dışındaki silme yan etkileri (`orphan_storage_objects`) henüz Skill'i bilmiyor.

