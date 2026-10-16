# Promptly — Yapılacaklar (özellik yol haritası)

Bu liste kalıcıdır; her madde bitince durumu burada güncellenir. Tamamlanan her özelliğin
anlatısı `docs/history/NNN-*.md` dosyasındadır (CLAUDE.md Bölüm 8). Boyut: **K** = birkaç
saat, **O** = 1–2 gün, **B** = birkaç gün.

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
| 10 | Yan yana model karşılaştırma (Studio) | B | bekliyor |
| 11 | Haftalık özet bildirimi (e-posta / web push) | B | **engelli**: dış servis + gizli anahtar kararı gerekir |
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
