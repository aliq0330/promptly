# 185 — Topluluklar ana sayfası, içerik akışı ve Keşfet deneyimi

**Durum:** uygulandı (repoda). Migration `20260920130000_community_home_feed.sql` **canlıya UYGULANMADI** (aşağıya bak).
Önceki: [183](183-topluluk-sohbet-yeniden-duzeni.md) (sayfa ↔ sohbet düzeni), [184](184-topluluk-gonderi-esitligi.md) (gönderi eşitliği). Teknik özet: `docs/community-system.md` → "Ana sayfa sıralama kuralları".

## Ne değişti

`/communities` artık "topluluk listesi" değil, bir **ana sayfa**:

| Sekme | İçerik |
|---|---|
| **Gönderiler** (varsayılan) | Üyesi olduğun herkese açık + kapalı toplulukların gönderileri, yeniden eskiye (keyset). Tamamen kapalı topluluk gönderisi girmez. Üst köşede **Topluluklarım** bağlantısı (eski "Üyesi olduklarım" listesi). |
| **Keşfet** | **Sana uygun topluluklar** şeridi (≤10, mobilde yatay kaydırma) → hemen altında **Tüm topluluklar** düğmesi → **Keşfet akışı** (görmediğin gönderiler önce, ilgi + çeşitlilik sıralı, kopyasız). |
| **Yönettiklerim** | Yalnız yönettiği topluluğu olana görünür (eskisi gibi `list_my_communities('managed')`). |
| **Davet ve başvurular** | Davetler · Başvurularım · **Gelen başvurular** (yöneticiye; topluluk başına sayaç + "İncele" → Üyeler → Katılım istekleri). "Davet bağlantın var mı?" kutusu buraya taşındı. |

Yeni sayfa **`/communities/all`** (Tüm topluluklar): üstte arama, kategori süzgeci, sıralama (varsayılan *Sana uygun*), sonsuz kaydırma. Başka yeni sayfa yok.

Eski adresler çalışır: `?tab=invites`, `?tab=requests` (→ Davet ve başvurular / Başvurularım), `?tab=mine` (Topluluklarım listesi), `?tab=managed` (yönetilen yoksa Gönderiler'e düşer), `?tab=discover`. Oturumsuz ziyaretçi eskisi gibi yalnız herkese açık topluluk listesini + aramayı görür (kişisel RPC'ler anon'a kapalı).

## Mevcut mimariyle ilişki (yeniden yazım yok)

- Gönderi kartları **mevcut** `PromptCard/RequestCard/WorkflowCard/PresetCard` (yerel gönderi) ve `ApplicationCard` (başvuru) — gönderinin kendi beğeni/yorum/kaydet/istatistik/paylaş'ı. Topluluk yönetimi (sabitle/kaldır/bildir) bu birleşik akışta **yok**, topluluğun kendi Akış sekmesinde.
- Öneri kartındaki üyelik eylemi mevcut `CommunityJoinButton` (Katıl · İstek gönder · …); kapalı topluluk kartı `community_cards`/RPC satırından gelir, `chat_groups` doğrudan sorgulanmaz.
- Eski RPC'ler (`discover_communities`, `search_communities`, `suggest_communities`) **silinmedi/değişmedi**: ziyaretçi görünümü hâlâ `discover_communities` kullanır; `suggest_communities` artık istemcide çağrılmıyor ama DB'de duruyor (`drop` için onay gerekir).

## Karar: Keşfet'te kapalı (restricted) topluluklar

Eski kural "Keşfet yalnız herkese açık; kapalı yalnız aramada/öneride" idi. Yeni brief kapalı toplulukları **öneri ve Tüm topluluklar**'a alıyor; bunu mevcut gizlilik modeliyle şöyle uzlaştırdım: kapalı topluluğun *kartı* zaten herkese okunur (`community_cards`), içeriği değil. Bu yüzden kapalı topluluk **kart düzeyinde** listelenir/önerilir (içerik istatistiği üye olmayana `null`, "içerik yalnız üyelere" notu, eylem = "İstek gönder"); **gönderisi** yalnız üyesinin akışına girer. Tamamen kapalı hiçbir yerde yoktur. Ziyaretçi için `discover_communities` (yalnız herkese açık) aynen kaldı.

## Yeni veri ve neden

Tek yeni tablo: **`community_post_views(user_id, post_id, seen_at)`**. Neden: sitede gönderi "görüldü" bilgisi yoktu (beğeni/yorum/kaydetme dışında hiçbir izleme; `feed_page` da kullanmıyor). "Görmediğin yeni gönderiler önce gelsin, görülen tekrar yeni gibi çıkmasın" bu veri olmadan dürüstçe uygulanamaz; tahmin ya da yerel depolama (cihazlar arası tutarsız) yerine en küçük sunucu verisi seçildi. Yalnız kendi satırların okunur; yazma yalnız `mark_community_posts_seen`; gönderi/profil silinince cascade. Başka kullanıcıya hiçbir yolla gösterilmez.

Yeni fonksiyonlar (hepsi SECURITY DEFINER, `search_path` sabit, anon/public EXECUTE kapalı):
`mark_community_posts_seen`, `member_feed_page`, `discover_feed_page`, `recommend_communities`, `browse_communities`; iç yardımcılar `_community_relevance`, `_community_post_tags` (istemci rollerine de kapalı).

Migration yalnızca ekleyicidir (`create table/function`, `drop` yok), mevcut veriye dokunmaz.

## Görüldü mantığı

İstemci bir gönderinin ≥%60'ı (uzun gönderide ekranın ≥%60'ını dolduranı) **1.2 sn** görünür kalınca kimliği kuyruğa alır; 1.5 sn'lik gecikmeyle ≤50'lik toplu RPC (`pagehide`/gizlenmede de boşaltır); aynı kimlik oturumda ikinci kez gönderilmez. Hata sessizce günlüğe yazılır (akışı bozmaz). Keşfet akışı **`p_as_of`** (sayfa yükleme anı) ile çağrılır: görülme ve yenilik bu ana göre kesilir → aynı oturumda sıra/küme sabit, offset sayfalama kaymaz, kopya çıkmaz; yenilemede yeni an alınır ve görülenler düşer. Gönderiler akışında görünen gönderiler de işaretlenir (Keşfet'te "yeni" diye tekrar çıkmaz).

## Doğrulama (gerçek sonuçlar)

- `supabase/tests/community-home.sql` (yerel PostgreSQL 16): **39 kontrol, FAILED=0**. Kapsam: akış kapsamı (açık+kapalı üye, tamamen kapalı yok, üyelik kalkınca düşer), keyset, anon/yardımcı EXECUTE kapalı, Keşfet kapsamı + kopyasızlık + çeşitlilik + takip edilen yazar + etiket sinyali, görüldü (okunamayan yazılmaz, ilk zaman korunur, kişiye özel, as_of sabitliği, doğrudan yazma yok), engel/yasak, öneri (≤N, tamamen kapalı asla, kapalıda içerik istatistiği null, neden gerçek sinyalden, kapalıda sinyal sızmaz, kapatılmış/sahibi engelleyen yok), gözat (joker karakter, kategori, etiket araması, sayfalama, sıralama). **Mutasyon denemesi:** 10 bozma (tamamen kapalıyı akışa almak, `can_read_community` kaldırmak, görüldü süzgecini kaldırmak, çeşitlilik cezasını kaldırmak, kapalıda sinyal sızdırmak, anon yetkisi vermek…) — 9'u testlerce yakalandı; 1'i (gözatta görünürlük süzgeci) bilerek **savunma katmanı** olduğundan (`_community_relevance` zaten süzer) eşdeğer kaldı.
- Önceki SQL dosyaları (`communities`, `community-privacy` 79, `community-content`, `community-post-engagement`, `community-post-save`, `community-statistics`) yeni migration ile **FAILED=0**.
- `src/lib/community-home.test.ts` (node): 12 test (sekme çözümleme/eski adresler, tekrar azaltma, görüldü kuyruğu, kopyasız birleştirme).
- Playwright (ağ taklitli): `run-community-home.mjs` (yeni) + `run-communities.mjs` (eski sekme/liste varsayımları yeni düzene uyarlandı). Sayılar README'de. Sunucu kuralları taklitle sınanır; gerçek kuralların doğrulaması SQL testindedir.
- **Denenmedi:** gerçek Supabase'e, gerçek oturumla, fiziksel cihazda; canlı veriyle sıralama kalitesi; `IntersectionObserver` tabanlı görüldü gerçek kaydırmayla (testte ekranda kalma sınanır, parmakla kaydırma değil).

## Bilinen sınırlar / riskler

- **Canlıya uygulanmadı:** önce migration, sonra istemci (yeni istemci `recommend_communities`/`browse_communities`/`member_feed_page`/`discover_feed_page` çağırır; migration yokken sayfa hata kutusu gösterir, ziyaretçi görünümü etkilenmez).
- Toplulukların kendi "takip"i yok; "takip edilen" = takip edilen **kişi**. Ayrı bir topluluk takibi eklemek ayrı bir üründür.
- Keşfet akışı adayı son 45 gün ve en çok 400 gönderidir; çok büyük ölçekte önceden hesaplanmış bir yapı gerekebilir.
- Öneri tekrar azaltma tarayıcıya özgüdür (cihazlar arası senkron değil, bilerek: sunucuda kişisel iz tutulmadı).
- İçerik türü / Prompt DNA sinyali kullanılmadı (anlamlı bir kullanıcı sinyali yok).
- Sıralama kefeleri (3, 2, 1.5, 0.75…) elle seçilmiş sabitlerdir; gerçek kullanım verisiyle ayarlanmadı.
- Gönderiler akışında bir gönderinin içeriği silinmişse (yönetici kaydı) çizilmez; yönetim için topluluk sayfası.
