# Topluluk Sistemi — Teknik Belge

Bu belge Promptly'nin **Topluluklar** ve **Topluluk Sohbeti** sistemini baştan sona anlatır: kullanıcı deneyimi, veri modeli, yetkiler, API'ler, bildirimler, testler ve bileşen kataloğu. Tüm bilgiler repodaki gerçek koddan ve migration'lardan çıkarılmıştır; olmayan bir şey "yok" ya da "doğrulanamadı" diye işaretlenmiştir.

- Tarihçe ve gerekçeler: `docs/history/172-*` … `182-*` (sistemi kuran işler) ve `docs/history/183-*` (bu belgenin konusu olan yeniden düzen).
- Kısaltma: **TR** = `src/features/communities/`, **GR** = `src/features/groups/`, **MS** = `src/features/messages/`.
- Güvenlik notu: arayüzdeki her gizleme yalnızca *ne gösterileceğini* belirler. Gerçek yetki her zaman veritabanındadır (SECURITY DEFINER RPC + RLS).

---

## Kategori 1 — Sistem genel bakışı

### Amaç

Topluluklar, ortak ilgi alanında toplanan kişilerin kendi **akışı**, **sohbeti**, **etkinlikleri**, **duyuruları** ve **kuralları** olan kalıcı alanlarıdır. Promptly'nin genel içerik katmanıyla (prompt, istek, workflow, hazır ayar) aynı kartları ve etkileşimleri kullanır; ikinci bir içerik sistemi yoktur.

### Topluluk sayfası ile sohbet: iki ayrı deneyim, tek kayıt

| | Topluluk sayfası | Topluluk sohbeti |
|---|---|---|
| Rol | Topluluğun **merkezi**: akış, etkinlik, üyeler, kurallar, yönetim | Üyelerin **gerçek zamanlı iletişim** alanı |
| Adres | `/communities/local?id=<id>&tab=…&section=…` | `/messages/local?id=<id>` (Mesajlar çalışma alanı) |
| Ana bileşen | `TR/community-page.tsx` | `MS/local-conversation-view.tsx` + `GR/group-info-modal.tsx` |
| Bilgi/ayar paneli | Sekmeler (Akış · Etkinlikler · Üyeler · Hakkında · Yönet) | Kompakt "sohbet bilgi penceresi" |
| Okuma erişimi | Herkese açık toplulukta ziyaretçi bile | Yalnız üye |

Veri düzeyinde ikisi **aynı kayıttır**: `chat_groups.id = conversations.id = topluluk kimliği` (bkz. Kategori 8). Her topluluğun **tam bir** sohbeti vardır; birden fazla sohbet desteklenmez. Üyelik tek satırdır (`conversation_members`): topluluğa katılan sohbete de katılmış olur, ayrılan/çıkarılan ikisinden de çıkar.

### Temel bileşenler

`community-page.tsx` (sayfa + başlık + sekmeler) · `feed-tab.tsx` + `feed-highlights.tsx` (akış) · `members-tab.tsx` (kişi yönetimi) · `manage-tab.tsx` (yapılandırma/moderasyon) · `about-tab.tsx` (bilgi, kurallar, kişisel tercihler) · `events-tab.tsx` · `GR/group-info-modal.tsx` (sohbet paneli) · `use-community.ts` (veri + canlı eşitleme) · `lib/communities.ts` ve `lib/chat-groups.ts` (saf kurallar, `npm test` ile sınanır).

### Veri akışı (özet)

```
Tarayıcı ──(supabase-js)──► PostgREST/RPC ──► RLS + SECURITY DEFINER fonksiyonlar ──► tablolar
   ▲                                                                                  │
   └────── Realtime (postgres_changes: chat_groups, conversation_members, messages …) ◄┘
```

Sunucu çalışma zamanı yoktur (statik export); Supabase'e yalnızca tarayıcıdan erişilir.

---

## Kategori 2 — Kullanıcı deneyimi ve navigasyon

### Topluluklara erişim

- Sol menü / alt gezinme → **Topluluklar** (`/communities`): Keşfet · Üyesi olduklarım · Yönettiklerim · Davetler · Başvurularım. Keşfet yalnız herkese açık toplulukları listeler; arama kapalıları da bulur.
- Davet bağlantısı: `/communities/join#<token>`.
- Eski `/groups` ve `/groups/join#…` buraya yönlenir.

### Topluluk ana sayfası (hedef bilgi mimarisi)

Üstten alta:

1. **Başlık kartı**: görsel, ad, kategori · görünürlük · üye sayısı · rol rozeti, **açıklama (2 satır)**, eylemler: **Sohbeti aç** (okunmamış sayısıyla), yetkiliye **“N bekleyen istek”** kısayolu, tek **üyelik düğmesi** (`CommunityJoinButton`).
2. **Kompakt gezinme**: *Akış · Etkinlikler · Üyeler · Hakkında ve kurallar · Yönetim*. Üye olmayan ziyaretçi açık toplulukta yalnız *Akış · Etkinlikler · Hakkında* görür.
3. **İçerik**: **Akış ilk açılış ekranıdır**.

Sohbet bir sekme **değildir** (eski "Sohbet" sekmesi yalnızca tanıtım kartıydı; başlıktaki "Sohbeti aç" zaten vardı). "Genel bakış" sekmesi kaldırıldı; içeriği şuraya dağıtıldı: açıklama → başlık, sayılar → başlık meta, duyurular + en yakın etkinlik + kural-kabul uyarısı → akışın üstündeki **özet şeridi** (`FeedHighlights`; boşsa hiç çizilmez).

### İçerik akışı

Akış sekmesi: sabitlenmiş gönderiler, normal gönderiler (keyset sayfalama), "Gönderi oluştur". Ayrıntı Kategori 4.

### Sohbete geçiş ve sohbetten topluluğa geçiş

| Yön | Yol |
|---|---|
| Topluluk → sohbet | Başlıkta **Sohbeti aç** (`a[data-open-chat]`) |
| Sohbet → topluluk | Sohbet başlığındaki **topluluk simgesi** (yetkiliye bekleyen istek rozetiyle), bilgi penceresindeki **“Topluluk sayfasını aç”**, ⋮ menüsü yok (gereksiz) |
| Bildirim → doğru yer | Duyuru/etkinlik/kural bildirimleri topluluk sekmesine; katılım isteği bildirimi (`?panel=requests`) **topluluktaki Üyeler → Katılım istekleri**ne (istemci yönlendirmesi) |

Eski adresler çalışır (`resolveCommunityView`, `lib/communities.ts`): `tab=overview` → Akış; `tab=chat` → sohbete yönlenir; `tab=manage&section=requests|invites` → Üyeler'in ilgili bölümü. Zorlanan izinsiz sekme/bölüm sızdırmaz, ilk izinli sekmeye (Akış) düşer.

### Navigasyon ve işlem yerleşim matrisi (önce → sonra)

| İşlem | Önceki konum | Yeni konum | Yetkili roller | Veri kaynağı / iş mantığı | İlgili diğer ekran |
|---|---|---|---|---|---|
| Akışı açma | Sekme 2 ("Genel bakış" ilkti) | **İlk açılış sekmesi** | üye; açık toplulukta ziyaretçi | `fetchCommunityPosts` / RLS `can_read_community` | Bildirim `tab=feed&post=` |
| İçerik oluşturma | Akış → Gönderi oluştur | aynı (Akış) | üye (akış politikasına göre) | normal oluşturma ekranı `?community=` | — |
| Mevcut içeriği başvuruya ekleme | Akış → Gönderi oluştur → başvur | aynı | üye | `share_to_community` | Başvuru sayfası |
| Topluluk hakkında bilgi | Genel bakış + Hakkında | **Başlık (açıklama) + Hakkında ve kurallar** | herkes (okuma) | `chat_groups` / `community_cards` | Sohbet panelinde açıklama **yok** |
| Üyeleri görüntüleme | Üyeler sekmesi; sohbet modalı "Üyeler" | **Üyeler sekmesi**; sohbet panelinde salt-okunur özet | üye | `community_members` RPC | Sohbet paneli → "Üyeleri topluluk sayfasında yönet" |
| Katılım isteklerini yönetme | Yönetim → Katılım istekleri **ve** sohbet modalı sekmesi; bildirim sohbeti açıyordu | **Üyeler → Katılım istekleri** (başlık kısayolu + sayaç); sohbette yalnız kısa yol | owner, admin (k), moderatör (k) | `decide_chat_group_join_request` | `?panel=requests` → topluluğa yönlenir; sohbet başlığı rozeti |
| Davet gönderme | Yönetim → Davet **ve** sohbet modalı | **Üyeler → Davet** | owner, admin (k) | `invite_to_chat_group`, bağlantılar | — |
| Üye çıkarma / yasaklama | Üyeler **ve** sohbet modalı | **Üyeler** (sohbet panelinde yok) | owner, admin, moderatör (k) | `remove_chat_group_member` | Sohbet "artık üye değilsin" |
| Rol değiştirme / sahiplik devri | Üyeler **ve** sohbet modalı | **Üyeler** | owner (hepsi), admin (k, sınırlı) | `set_chat_group_member_role`, `transfer_chat_group_ownership` | Ayrılma "devret" yolu → Üyeler |
| Topluluk ayarları | Yönetim → Ayarlar **ve** sohbet modalı → Ayarlar | **Yönetim → Ayarlar** (yalnız burada) | owner, admin (k) | `update_chat_group`, `update_community`, `set_chat_group_visibility` | Sohbet paneli → "Topluluk ayarlarını aç" |
| Sohbet ayarları (kim yazar, geçmiş, sabitleme) | Topluluk ayar formunda / modal Ayarlar | **Sohbet paneli → Sohbet ayarları** | `edit_settings` (kim yazar), owner (diğerleri) | `update_chat_group`, `update_chat_group_owner_settings` | Topluluk ayarlarında bağlantı notu; `?panel=settings` |
| Sohbeti açma | "Sohbet" sekmesi (tanıtım) + başlık düğmesi | **Başlıkta "Sohbeti aç"** | üye | `conversations`/`messages` | Mesajlar listesi |
| Sohbet üyelerini görüntüleme | Modal → Üyeler (yönetim menüleriyle) | **Panel → Üyeler (salt-okunur)** | üye | `community_members` | — |
| Bildirimleri sessize alma | Modal Genel + Hakkında + ⋮ menüsü | **Panel + Hakkında (aynı bileşen) + ⋮ kısa yol** | üye (kişisel) | `setChatGroupMuted` → `muted_at` | Topluluk bildirim düzeyi: Hakkında |
| Sohbetten/topluluktan ayrılma | 3 yerde, 2 ayrı onay | **Tek onay penceresi**, 4 giriş (üyelik menüsü, Hakkında, panel, ⋮ menü) | üye (sahip önce devreder) | `leave_chat_group` | "Yalnız sohbet" = sessize al / listemden kaldır |
| Moderasyon | Yönetim → Moderasyon; sohbet mesaj menüsü | aynı | `moderate_posts`, `delete_messages` | RPC'ler + denetim kaydı | Sohbet "yöneticilere bildir" |
| Topluluk ↔ sohbet geçişi | başlık düğmesi / simge | başlık "Sohbeti aç" · sohbet simgesi · panel "Topluluk sayfasını aç" | üye | adres parametreleri | — |
| Duyuru yayınlama | Genel bakış | **Yönetim → Duyurular** (akışta salt-okunur özet) | `manage_announcements` | `publish_community_announcement` | Sohbette duyuru kartı |

### Mobil, tablet, masaüstü

- Mobil (< md): üst header + alt gezinme; başlık eylemleri tek satıra sığar (bekleyen istek kısayolu mobilde kısa etiket: “2 istek”); sekme çubuğu yatay kaydırılır; **bilgi penceresi alt sayfa (bottom sheet)** olarak açılır (paylaşılan `Modal`).
- Tablet (md–lg): ikon rayı + aynı sayfa; bilgi penceresi ortalanmış pencere.
- Masaüstü (lg+): 256 px sidebar; sayfa `max-w-4xl` ortada.
- Uzun ad `break-words`, açıklama `line-clamp-2`; sekme çubuğu ve üye listesi taşmaz (Playwright `run-groups` senaryo 16, `run-communities` senaryo 23).
- **Aşağı çekerek kapatma:** paylaşılan `Modal` (`components/ui/modal.tsx`) bunu **desteklemiyor** (doğrulandı); bu işte eklenmedi. Kapatma: ✕, Escape, arka plan tıklaması.

---

## Kategori 3 — Topluluk yaşam döngüsü

| Aşama | Nasıl | Sunucu |
|---|---|---|
| Oluşturma | `TR/create-community-modal.tsx` | `create_community` |
| Düzenleme | Yönet → Ayarlar (`community-settings-section.tsx`, `GR/group-settings-section.tsx`) | `update_community`, `update_chat_group`, `update_chat_group_owner_settings` |
| Görünürlük | Yönet → Ayarlar (`VisibilityPicker`, onaylı, atomik) | `set_chat_group_visibility` |
| Katılım | `CommunityJoinButton` | `join_community` (açık) · `request_join_community` (kapalı) |
| Davet | Üyeler → Davet (kullanıcı arama, bağlantı) | `invite_to_chat_group`, `create_chat_group_link` |
| İstek | Üyeler → Katılım istekleri | `decide_chat_group_join_request` |
| Ayrılma | Üyelik menüsü / Hakkında / sohbet paneli | `leave_chat_group` |
| Kapatma (salt okunur) | Yönet → Ayarlar (yalnız owner) | `close_community` / `reopen_community` |
| Silme | Yönet → Ayarlar → tehlikeli bölge (yalnız owner, adı yazarak onay) | `delete_chat_group` |

### Görünürlük düzeyleri (`chat_groups.visibility`)

| Düzey | Keşfet | Arama | İçerik | Katılım |
|---|---|---|---|---|
| `public` Herkese açık | ✓ | ✓ | herkes okur | doğrudan |
| `restricted` Kapalı | ✗ | ✓ | yalnız üye | istek + yönetici onayı |
| `private` Tamamen kapalı | ✗ | ✗ | yalnız üye, id ile bile bulunamaz | yalnız davet |

### Üyelik politikaları ve durumlar

- Kural kabulü zorunluysa katılımda kural metni okunur (`rules_required`, `rules_version`).
- Üye sınırı (`member_limit` 2–1000), kapatılmış topluluğa katılım yok.
- İstek durumları: `pending → accepted | rejected | cancelled` (benzersiz *bekleyen* istek dizini). Davet: `pending → accepted | declined | cancelled | expired`.
- **Ayrılma**: sahip, başka üye varken ayrılamaz (önce devreder); tek üyeyse ayrılmak topluluğu siler. Yasaklı kişi tekrar katılamaz/başvuramaz/davet edilemez.
- Silinen/erişimi kaldırılan topluluk: kart yoksa sayfa “bulunamadı” gösterir; sohbet açıkken üyelik biterse “artık üye değilsin” ekranı; Realtime olayı ya da sekme yeniden görününce sayfa sessizce yenilenir. Tamamen kapalı topluluktan ayrılan kişi listeye döner.

### Arşivleme

Topluluk arşivi **yoktur**. Karşılığı: **kapatma** (`closed_at`, topluluk salt-okunur) ve kişisel **sohbet arşivi/listeden kaldırma** (`conversation_members.archived_at/deleted_at`).

---

## Kategori 4 — İçerik sistemi

İki ayrı ihtiyaç, iki ayrı akış (`TR/create-post-modal.tsx` "Gönderi oluştur" iki seçenek sunar):

| | Yeni içerik (yerel / `native`) | Mevcut içeriğe başvuru (`application`) |
|---|---|---|
| Ekran | **Normal oluşturma ekranı** `?community=<id>` (ikinci form yok) | `ShareToCommunityModal`: kendi yayınlanmış içeriğin |
| Kayıt | `prompts/prompt_requests/workflows/presets.community_id` dolu | `community_posts` satırı (+ isteğe bağlı not) |
| Görünürlük | Sunucu `private` zorlar; yalnız topluluğu okuyabilen görür; yazarın profilinde/Keşfet/aramada/etikette yok | İçerik kendi görünürlüğünde kalır; **yalnız yayında + herkese açık** içerik başvurabilir |
| Etkileşim | İçeriğin **kendi** beğeni/yorumu | **Gönderinin** kendi beğeni/yorum/kaydı (`community_post_id`); içeriğinkine karışmaz |
| Sayfa | İçeriğin kendi detay sayfası | `/communities/post/local`: başvurulan içeriğin **normal detay sayfası** (mobil/tablet/masaüstü dahil) + üstte başvuru bandı |
| Paylaşım | Normal `ShareModal` (bağlantı + site içi mesaj) | Aynı `ShareModal`: bağlantı gönderinin sayfası, site içi mesajla paylaşım var (düz metin bloğu, kart olarak çizilir) |
| Kaydet | İçerik normal kaydedilir (`collection_items.prompt_id/…`; yalnız topluluğu okuyabilen) | **Gönderinin kendisi** kaydedilir (`collection_items.community_post_id`, kendi `save_count`); istek başvurusu ve yerel gönderi kaydedilmez |
| Kaldırma | Gönderiyi kaldırmak içeriği siler | Gönderi kaldırılır, içerik silinmez |

`community_posts.kind`: `native` · `application` · `legacy` (178 öncesi, tür tahmin edilmez). Aynı içerik bir toplulukta bir kez başvurabilir (benzersiz dizinler). Mükerrer kayıt oluşmaz: yerel içerik genel akışta *hiç* görünmez; başvuru kopya değil başvurudur.

- **Türler**: Prompt, İstek, Workflow, Hazır Ayar (`content_type`).
- **Düzenleme/silme**: yazar kendi içeriğini/notunu; yetkili `moderate_posts` ile kaldırır (rütbe kuralı: kendinden düşük rütbe; denetim kaydı + yazara bildirim).
- **Yorum/beğeni**: yalnız üye + kapatılmamış topluluk (`enforce_community_post_engagement`, `enforce_community_content_engagement`); yanıt üst yorumla aynı hedefte.
- **Yazar ayrılırsa**: içerik toplulukta kalır; yazar artık okuyamaz/düzenleyemez. Hesap silinirse içerik silinir.
- **Çıkarılan/yasaklanan**: topluluğu okuma yetkisi biter → eski içeriğine de erişemez (RLS `can_read_community`).
- **Yeni liste sorgusu kuralı**: tablo okuyan her yeni içerik listesi `community_id is null` süzmelidir (CLAUDE.md).

### Gönderi eşitliği (docs/history/184-*)

Topluluktaki iki gönderi tipi de sitedeki normal içerikle **birebir aynı** etkileşimleri sunar: beğeni · yorum · kaydet · istatistik (beğenenler/yorum yapanlar/kaydedenler) · paylaş (bağlantı, diğer uygulamalar, **site içi mesaj**). Mekanizma:

- `features/communities/post-scope.tsx` — başvuru sayfasında detay bileşenlerine "şu an bir gönderi olarak gösteriliyorsun" diyen bağlam.
- `features/content/scoped-engagement.tsx` — `EngageLike/CommentCount/Save/Statistics/Share/Comments`: dört detay sayfası (Prompt, İstek, Workflow, Hazır Ayar) etkileşimlerini buradan çizer; bağlam varsa gönderinin bileşenleri (`post-engagement.tsx`), yoksa içeriğin kendileri çalışır.
- `PostMenu` bağlamda içeriğin kendi yönetimini (düzenle/çoğalt/sil/bağlantı kopyala/bildir) gizler; menü yalnız gönderi işlerini taşır (notu düzenle, gönderimi kaldır, bildir, yönetici kaldır). Orijinal içeriği düzenleme/silme orijinalin sayfasındadır.
- Kaydedilenler/koleksiyonlar kaydedilen gönderiyi akıştaki kartın aynısıyla (`SavedPostCard` → `ApplicationCard`) gösterir; topluluğu okuyamayan kullanıcıda gönderi listede yer almaz.
- Kaydedilemeyenler: yerel gönderi (kaydedilen şey içeriktir) ve istek başvurusu (istek normal sitede de kaydedilemez) — sunucu `community_post_not_savable` ile de reddeder.

---

## Kategori 5 — Üyelik, roller ve izinler

### Roller (`conversation_members.role`)

`owner` (tek; veritabanı tekil dizinle zorlar) · `admin` · `moderator` · `member`. Üye olmayan, bekleyen başvuran ve yasaklı kişi rol değil **durum**dur.

### Yetenekler

Admin/moderatör yetkileri rol adına değil **yeteneğe** bağlıdır (`chat_groups.role_permissions`, `can()` / `_group_can`). Owner her zaman her şeyi yapar ve yetkileri yalnız o değiştirir. Yeni yetenek eklerken `_group_all_capabilities()` + `_group_default_permissions()` + `lib/chat-groups.ts` birlikte güncellenir.

### Yetki matrisi (varsayılan yetkilerle)

✓ = yapabilir · ✗ = yapamaz · (k) = yeteneğe bağlı, owner açıp kapatabilir

| İşlem | Owner | Admin | Moderatör | Üye | Üye değil | İstek bekleyen | Yasaklı |
|---|---|---|---|---|---|---|---|
| Akışı görüntüleme | ✓ | ✓ | ✓ | ✓ | açıkta ✓ (salt-okunur), kapalıda ✗ | kapalıda ✗ (yalnız kart/durum) | ✗ (bulunamadı) |
| İçerik oluşturma | ✓ | ✓ | ✓ | ✓ (akış politikası "üyeler" ise) | ✗ | ✗ | ✗ |
| Yorum / beğeni | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Üyeleri görüntüleme | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Katılım isteği gönderme | — | — | — | — | kapalıda ✓ (açıkta doğrudan katılır; tamamen kapalıda davet) | zaten bekliyor; geri çekebilir | ✗ |
| Katılım isteklerini yönetme | ✓ | ✓ (k) | ✓ (k) | ✗ | ✗ | ✗ | ✗ |
| Davet gönderme / bağlantı | ✓ | ✓ (k) | ✗ (k) | ✗ | ✗ | ✗ | ✗ |
| Üye çıkarma | ✓ | ✓ (k) | ✓ yalnız normal üye (k) | ✗ | ✗ | ✗ | ✗ |
| Yasaklama | ✓ | ✓ (k) | ✗ (k) | ✗ | ✗ | ✗ | ✗ |
| Rol verme / alma | ✓ (hepsi) | ✓ yalnız moderatör↔üye (k) | ✗ | ✗ | ✗ | ✗ | ✗ |
| Topluluk ayarları (ad, görsel, sınır) | ✓ | ✓ (k) | ✗ (k) | ✗ | ✗ | ✗ | ✗ |
| Görünürlük | ✓ | ✓ (k) | ✗ (k) | ✗ | ✗ | ✗ | ✗ |
| Kurallar / duyuru / etkinlik / istatistik | ✓ | ✓ (k) | ✗ (k) | ✗ | ✗ | ✗ | ✗ |
| Sohbeti görüntüleme + mesaj | ✓ | ✓ | ✓ | ✓ ("yalnız yöneticiler yazar" ise ✗) | ✗ | ✗ | ✗ |
| Sohbet ayarı: kim yazabilir | ✓ | ✓ (`edit_settings`) | ✗ (k) | ✗ | ✗ | ✗ | ✗ |
| Sohbet ayarı: geçmiş, üye sabitleme | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Topluluk rol yetkileri matrisi | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Moderasyon (gönderi/mesaj kaldırma, rapor) | ✓ | ✓ (k) | ✓ (k) | rapor edebilir | ✗ | ✗ | ✗ |
| Topluluktan/sohbetten ayrılma | yalnız tek üyeyse (siler); aksi hâlde önce devret | ✓ | ✓ | ✓ | — | — | — |
| Silme / sahiplik devri | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### İzin kontrolünün yeri

1. **Gerçek**: RPC içinde `_group_require_cap(...)` / `_group_member_role`, RLS politikaları, tetikleyiciler.
2. **Arayüz aynası**: `lib/chat-groups.ts` (`can`, `canRemoveMember`, `assignableRoles`, `canSeeChatSettings`…) ve `lib/communities.ts` (`membersSections`, `manageSections`, `accessibleTabs`, `canSharePost`, `canModeratePost`). Aynı tablo iki yerde; `src/lib/*.test.ts` arayüz tarafını sınar, `supabase/tests/*.sql` sunucu tarafını.

### Üyelik değişikliklerinin etkisi

Üyelik satırı silinince (ayrılma/çıkarma): sohbete yazma ve geçmişi okuma biter (RLS); topluluk içeriği okuma biter (kapalıda); o topluluğa bağlı eski bildirimler silinir (`purge_member_community_notifications`); açık sohbet “artık üye değilsin”e geçer.

---

## Kategori 6 — Topluluk sohbeti

- **Oluşturma/ilişki**: topluluk oluşturulurken `conversations` (`kind='group'`) + `chat_groups` aynı id ile açılır; ayrı bir sohbet oluşturma adımı yoktur.
- **Mesajlar**: ortak `messages` altyapısı (okundu, "yazıyor", sabitleme, arama, yıldız, tepki, düzenleme/silme aynen). Mesaj ≠ gönderi.
- **Mesaj gönderme**: `can_send_message` — üye + `posting_policy` ('members' | 'admins') + kapatılmamış topluluk + engel yok.
- **Geçmiş**: grupta `created_at >= joined_at`, owner `history_visible` açarsa yeni üyeler önceki mesajları da görür.
- **Moderasyon**: `delete_messages` yeteneği (`moderate_chat_group_message`), rütbe kuralıyla; mesajı topluluk yöneticilerine bildirme (`report_community_content`).

### Grup bilgisi penceresi (kompakt sohbet paneli)

`GR/group-info-modal.tsx` — **sekmesiz**, tek kaydırılabilir panel. Yalnız sohbetle ilgili öğeler; topluluğa ait işler topluluk sayfasına yönlendirilir.

| Sıra | Bölüm | Kim görür | İçerik |
|---|---|---|---|
| 1 | Kimlik | herkes | avatar, ad, üye sayısı, görünürlük, rol rozeti |
| 2 | **Topluluk sayfasını aç** | herkes | bağlantı (Akış'a) |
| 3 | Bekleyen istek kısayolu | istekleri yönetebilen, sayı > 0 | “N bekleyen katılım isteği” → Üyeler → Katılım istekleri |
| 4 | Bildirim tercihleri (kişisel) | herkes | **Topluluğu sessize al** anahtarı (`ChatMuteToggle`); “Topluluk bildirim tercihleri →” (Hakkında) |
| 5 | Sohbet | herkes | **Sohbette ara**; salt-okunur bilgi: kim yazabilir, önceki mesajlar |
| 6 | Üyeler (açılır) | herkes | salt-okunur liste (`manage={false}`); yönetebilene “Üyeleri topluluk sayfasında yönet →” |
| 7 | Sohbet ayarları (açılır) | `canSeeChatSettings` | kim yazabilir (`edit_settings`); owner: yeni üye geçmişi, üyeler sabitleyebilir mi |
| 8 | Topluluk ayarları ipucu | ayar yetkilisi | “Topluluk ayarlarını aç” bağlantısı |
| 9 | **Topluluktan ayrıl** | herkes | sonucu önceden yazar; sahip devretmeli (→ Üyeler); tek üyeyse topluluk silinir |

Sohbet başlığı ⋮ menüsü (kısa yollar): Topluluk bilgisi · Sessize al · Arşivle · Mesajları temizle · **Listemden kaldır** · **Topluluktan ayrıl** (doğrudan onay).

### Sohbetten ayrılma ≠ topluluktan ayrılma

Veri modelinde üyelik **tek satır** olduğundan “yalnızca sohbetten ayrıl” diye bir işlem **yoktur ve eklenmedi** (ayırmak şema değişikliği ister). Arayüz bunu dürüstçe söyler ve ayrı işlemleri ayırır:

| Amaç | İşlem | Etki |
|---|---|---|
| Sohbetin sesini kapat | Sessize al (kişisel) | `muted_at`; üyelik sürer |
| Sohbeti listemden gizle | Listemden kaldır (kişisel) | `deleted_at`; topluluktan ayrılmaz, yeni mesaj gelince geri döner |
| Topluluktan **ve** sohbetten çık | Topluluktan ayrıl | `leave_chat_group`; tek onay penceresi (`LeaveCommunityDialog`) |

---

## Kategori 7 — Ayarlar ve tercihlerin sahipliği

Üç sınıf; her ayarın tek bir evi vardır (aynı bileşen birden fazla yerden gösteriliyorsa tek bileşendir).

### A. Topluluk ayarları (topluluğun tamamını etkiler)

Ev: topluluk sayfası → **Yönetim → Ayarlar**.

| Ayar | Bileşen | Veri/RPC | Yetki |
|---|---|---|---|
| Ad, açıklama, görsel, üye sınırı | `GR/group-settings-section.tsx` | `update_chat_group` | `edit_settings` |
| Görünürlük | aynı + `VisibilityPicker` | `set_chat_group_visibility` | `change_visibility` |
| Kategori, akışta kim paylaşır | `TR/community-settings-section.tsx` | `update_community` | `edit_settings` |
| Kurallar, kabul zorunlu | aynı | `update_community` | `edit_rules` |
| Kapatma/yeniden açma | aynı | `close_community` / `reopen_community` | owner |
| Admin/moderatör yetki matrisi | `GR/group-owner-settings.tsx` (`scope="community"`) | `update_chat_group_owner_settings` | owner |
| Silme | `group-settings-section.tsx` tehlikeli bölge | `delete_chat_group` | owner |
| Duyurular, moderasyon kuyruğu, istatistik, işlem geçmişi | `announcements/moderation/stats/audit-section.tsx` | ilgili RPC'ler | ilgili yetenek |

Kişi yönetimi (üyeler, roller, çıkarma/yasak, istekler, davetler) **Üyeler** sekmesindedir.

### B. Sohbet ayarları (yalnız sohbeti etkiler)

Ev: sohbet bilgi penceresi → **Sohbet ayarları** (`GR/chat-settings-section.tsx`).

| Ayar | Veri/RPC | Yetki |
|---|---|---|
| Kim mesaj yazabilir (`posting_policy`) | `update_chat_group` | `edit_settings` |
| Yeni üyeler önceki mesajları görsün mü (`history_visible`) | `update_chat_group_owner_settings` | owner |
| Üyeler de sabitleyebilsin (`members_can_pin`) | aynı | owner |

Topluluk ayarlarında bu alanlar **yoktur**; yerine sohbet ayarlarına bağlantı notu vardır.

### C. Kullanıcıya özel tercihler (yalnız kendi `conversation_members` satırım)

| Tercih | Ev | Bileşen | Veri |
|---|---|---|---|
| Topluluk bildirim düzeyi (Tümü · Yalnız önemli · Sessiz) + süreli sessize alma | Hakkında sekmesi | `TR/about-tab.tsx` | `notify_level`, `notify_muted_until` |
| Sohbeti sessize al | Hakkında sekmesi **ve** sohbet paneli (aynı bileşen) | `GR/personal-prefs.tsx` → `ChatMuteToggle` | `muted_at` |
| Arşivle / mesajları temizle / listemden kaldır | Sohbet ⋮ menüsü | `MS/chat-actions.tsx` | `archived_at`, `cleared_at`, `deleted_at` |
| Okundu imleci | otomatik | — | `last_read_at` |

Kişiye özel tercih asla topluluk genelinde uygulanmaz: RPC/RLS yalnız `auth.uid()` satırını günceller.

---

## Kategori 8 — Veritabanı ve ilişkiler

Şema `supabase/migrations/` altındadır (tek doğruluk kaynağı). İlgili dosyalar: `20260919970000` (üye durumu), `…980000`/`…990000` (grup şeması/fonksiyonları), `20260920000000` (yetenekler), `…010000`/`…020000`/`…030000` (sohbet özellikleri), `…040000`/`…050000`/`…060000` (topluluklar), `…070000` (görünürlük), `…080000` (gizlilik sertleştirme), `…090000` (gönderi etkileşimi), `…100000` (topluluğa özgü içerik), `…110000` (istatistik/paylaş).

### Çekirdek tablolar

| Tablo | Önemli sütunlar / kısıtlar |
|---|---|
| `conversations` | `kind` ∈ (`direct`,`group`) |
| `conversation_members` | PK (conversation_id, user_id); `role`, `joined_at`, `muted_at`, `notify_level`, `notify_muted_until`, `archived_at`, `deleted_at`, `cleared_at`, `last_read_at`; **owner başına tekil dizin** |
| `chat_groups` | `id` PK **ve** FK → `conversations.id` (cascade) = topluluk kimliği; `name`, `description`, `avatar_url`, `visibility`, `posting_policy`, `member_limit`, sayaçlar `member_count` / `pending_request_count` / `post_count`, `history_visible`, `members_can_pin`, `role_permissions` jsonb, `category`, `feed_policy`, `rules`, `rules_version`, `rules_required`, `closed_at`, `origin` |
| `chat_group_join_requests` | FK group/user (cascade); `status` ∈ pending/accepted/rejected/cancelled; **benzersiz bekleyen istek** (group_id, user_id) |
| `chat_group_invitations` | `status`; benzersiz bekleyen davet; `expires_at` |
| `chat_group_links` | yalnız `token_hash` (SHA-256) saklanır |
| `chat_group_bans`, `chat_group_audit` | yasak ve işlem geçmişi |
| `community_posts` | `kind`, hedef sütunlar (`prompt_id`/`request_id`/`workflow_id`/`preset_id`, tam biri dolu), `note`, `pinned_at`, `like_count`, `comment_count`; (topluluk, içerik) benzersiz |
| `community_announcements`, `community_events`, `community_event_rsvps`, `community_rule_acceptances`, `community_reports` | topluluk modülü tabloları |
| `prompts/prompt_requests/workflows/presets.community_id` | FK → `chat_groups` **ON DELETE CASCADE** |
| `prompt_likes/prompt_comments.community_post_id` | altıncı etkileşim hedefi, FK cascade |
| `collection_items.community_post_id` | başvuru gönderisini kaydetme (FK cascade); "tam bir hedef" CHECK'i dört hedefli; (koleksiyon, gönderi) benzersiz |
| `community_posts.save_count` | gönderinin kendi kaydetme sayacı (kaydeden TEK kullanıcı; istemciden yazılamaz) |
| `pinned_messages`, `message_stars` | sohbet özellikleri |

İlişki türleri: topluluk 1—1 sohbet; topluluk 1—N üyelik / istek / davet / gönderi / duyuru / etkinlik; gönderi N—1 içerik.

### RLS özeti

- `chat_groups`: **yalnız üye** okur; üye olmayan KARTI `community_cards()` RPC'sinden alır (kapalı topluluk kartı herkese, tamamen kapalı yalnız üye/davetli/başvurana).
- `conversation_members`: grupta yalnız **kendi satırım**; üye listesi `community_members` RPC'si.
- `chat_group_join_requests`: başvuran + `manage_requests` yetkilisi okur. Davet/bağlantı/yasak/denetim: yöneticiler.
- `community_posts/announcements/events`: `can_read_community` (açık topluluk ya da üyelik; ziyaretçi dahil).
- Hiçbir grup/topluluk tablosuna istemci **yazamaz**; her yazma SECURITY DEFINER RPC'dir (grup satırı `for update` kilidi, `search_path` sabit, anon/public EXECUTE kapalı).

### Silme ve bütünlük

`delete_chat_group` → `conversations` cascade → `chat_groups`, üyelikler, mesajlar, istekler, davetler, gönderiler; topluluğa özgü içerik de cascade ile gider; bağlı bildirimler silinir. Hesap silinince kullanıcının topluluk içeriği silinir. Sayaçlar tetikleyiciyle tutulur ve istemciden yazılamaz (`protect_counter_columns`); `community_migration_report()` sayaç/anomali raporudur.

---

## Kategori 9 — API ve iş mantığı

İstemci erişimi `src/lib/supabase/chat-groups.ts` (grup/üyelik) ve `src/lib/supabase/communities.ts` (topluluk) içindedir; tablo başına değil işlem başına RPC çağrılır. Hatalar `toGroupError` ile çevrilmiş mesaja dönüşür, ham SQL metni gösterilmez.

### Üyelik ve kişi yönetimi RPC'leri

| RPC | Parametreler | Yetki | Not |
|---|---|---|---|
| `join_community` | `p_group_id`, `p_accept_rules` | oturum | yalnız açık; kapatılmış/dolu/yasaklı reddedilir |
| `request_join_community` | `p_group_id`, `p_message`, `p_accept_rules` | oturum | yönetim kadrosuna bildirim |
| `cancel_chat_group_join_request` | `p_request_id` | başvuran | |
| `decide_chat_group_join_request` | `p_request_id`, `p_accept` | `manage_requests` | grup kilidi; `status<>'pending'` → `invalid_state` (çifte işlem); yasaklı/engelli reddedilir; başvurana bildirim |
| `invite_to_chat_group` | `p_group_id`, `p_user_ids[]` | `manage_invites` | ≤ 50 kişi |
| `respond_community_invitation` | `p_invitation_id`, `p_accept`, `p_accept_rules` | davetli | |
| `create_chat_group_link` / `revoke_chat_group_link` / `join_community_via_link` | | `manage_invites` / oturum | ham token yalnız bir kez gösterilir |
| `remove_chat_group_member` | `p_group_id`, `p_user_id`, `p_ban`, `p_reason` | `remove_members` (+`ban_members`) | rütbe kuralı |
| `set_chat_group_member_role` | `p_group_id`, `p_user_id`, `p_role` | `manage_roles` | |
| `transfer_chat_group_ownership` | | owner | |
| `leave_chat_group` | `p_group_id` | üye | sahip: `owner_must_transfer` |
| `delete_chat_group` | | owner | |

### Ayar RPC'leri

`update_chat_group` (`p_patch`: name, description, avatar_url, member_limit, posting_policy) · `update_chat_group_owner_settings` (`history_visible`, `members_can_pin`, `role_permissions` — yalnız DEĞİŞEN anahtarlar) · `update_community` (category, feed_policy, rules, rules_required) · `set_chat_group_visibility` · `close_community` / `reopen_community` · `accept_community_rules` · bildirim tercihi (`conversation_members` satırı).

### İçerik/duyuru/etkinlik/rapor RPC'leri

`share_to_community`, `update_community_post`, `delete_community_post`, `moderate_community_post`, `set_community_post_pinned`, `publish_community_announcement`, `update_/delete_community_announcement`, `create_/update_/cancel_/delete_community_event`, `set_community_event_rsvp`, `dispatch_my_event_reminders`, `report_community_content`, `resolve_community_report`, `community_stats`, `community_cards`, `community_members`, `discover_communities`, `search_communities`, `suggest_communities`, `list_my_communities`.

### Güncelleme mekanizması: Realtime ve önbellek

- **Topluluk sayfası** (`use-community.ts`): ilk okuma + `reload()` (sessiz, yükleniyor ekranına dönmeden); **Realtime** kanalı `community:<id>` → `chat_groups` UPDATE (sayaç/ayar) ve `conversation_members` olayları (benim rolüm/üyeliğim) → 400 ms birleştirilmiş yeniden okuma; ayrıca sekme yeniden görününce (>20 sn) yenileme. Realtime yalnız üyeye olay getirir (RLS); üye olmayan için zararsızdır. Kabul edilen başvuran, kendi `conversation_members` INSERT olayıyla (RLS izin verir) sayfayı üye görünümüne çevirir.
- **Sohbet görünümü**: `chat_group:<id>` kanalı (`chat_groups` UPDATE) + Mesajlar sağlayıcısı (`conversation_members` kullanıcı satırı).
- İstek listesi (`GroupRequestsSection`) anahtarına `pending_request_count` dahildir: sayaç değişince liste de yeniden okunur. `chat_group_join_requests` Realtime yayınında **değildir**; canlılık sayaç üzerinden sağlanır.
- Optimistic update: bildirim düzeyi seçimi anında görünür, hata olursa geri alınır; diğer işlemler sunucu yanıtını bekler (çift tık tek-uçuş kancasıyla engellenir: `useAsyncAction`).
- Ortak önbellek yok; sayfa kendi durumunu `useCommunity` ile tutar, Mesajlar listesi `useRealMessages().refresh()` ile eşitlenir.

---

## Kategori 10 — Bildirimler ve senkronizasyon

Bildirimler **yalnızca sunucu tetikleyicileri/RPC'leri** tarafından üretilir (`notifications`'a istemci insert politikası yok); sınıflar `_community_notify` içindedir: `direct` her zaman, `important` Sessiz'de gelmez, `info` yalnız Tümü'nde (ve sohbeti sessize almamışta).

| Olay | Alıcı | Hedef adres | Durum |
|---|---|---|---|
| Yeni katılım isteği | isteği yönetebilenler | `/messages/local?id=…&panel=requests` → **istemci topluluk Üyeler → Katılım istekleri'ne yönlendirir** | var |
| İstek kabul | başvuran | `/messages/local?id=…` (sohbet) | var |
| İstek ret | başvuran | `/groups` → `/communities` (eski rota yönlenir) | var |
| Davet | davetli | `/groups?tab=invites` → `/communities` | var |
| Çıkarılma | çıkarılan | — | var |
| Yetki matrisi güncellendi / sahiplik devri / görünürlük | etkilenen | — | var |
| Duyuru, etkinlik, kural güncellemesi, kapatma/açma | üyeler (sınıfa göre) | topluluk sekmesi | var |
| Gönderi kaldırıldı, rapor sonucu | yazar/raporlayan | topluluk | var |
| **Rol değişikliği (admin/moderatör verme-alma)** | etkilenen kişi | — | **YOK** — yalnız denetim kaydı (`role_changed`); bilinen eksik |
| Mesaj başına bildirim | — | — | yok (okunmamış sayacı + liste noktası) |

Not: tetikleyicinin ürettiği metin Türkçe kalır; istemci bilinen kalıpları etkin dile çevirir (`lib/notification-message.ts`). Bu belgenin konusu olan değişiklikte **migration yazılmadı**; bildirim adreslerinin topluluğa çevrilmesi istemcide yapılır (eski bildirimler de çalışır).

### Ekranlar arası güncelleme

İstek kabulü/reddi: işlem sonrası `onChanged → reload` + Mesajlar listesi yenilenir; başka cihazdaki yönetici sayacı Realtime ile görür; sohbet başlığındaki rozet aynı `pending_request_count`'tur (tek veri kaynağı). Çifte işlem: sunucu grup kilidiyle ikinciyi `invalid_state` ile reddeder, arayüz mesajı gösterir ve listeyi gerçek durumla eşitler.

---

## Kategori 11 — Hata senaryoları ve güvenlik

| Senaryo | Davranış |
|---|---|
| Yetkisiz yönetim işlemi | Arayüz öğeyi göstermez; zorlanan adres (`?tab=manage`, `?section=requests`, `?panel=…`) sızdırmaz; RPC `forbidden` döner, çevrilmiş hata gösterilir (test: run-groups 6, run-communities 10) |
| Silinmiş/erişilemeyen topluluk | “Topluluk bulunamadı” (varlık sızmaz); sohbet “Konuşma bulunamadı” |
| Geçersiz üyelik / çıkarılma | Sohbet “artık üye değilsin”; topluluk sayfası Realtime/görünürlükle yenilenir, Katıl döner |
| Çakışan işlem | grup satırı kilidi + `invalid_state`; benzersiz bekleyen istek/davet dizinleri; çift tıklama tek istek |
| Realtime kopması | Sayfa çalışmaya devam eder; sekme yeniden görününce ve her işlemde sunucu durumu okunur (Realtime tek doğruluk kaynağı değil) |
| Eksik/tutarsız veri | `normalize*` fonksiyonları bilinmeyen değeri güvenli değere indirir (örn. bilinmeyen görünürlük → en kapalı) |
| Kötüye kullanım | Rütbe kuralları, yasak, istek sınırı (grup başına ≤ 200 bekleyen), kota (24 saatte ≤ 30 topluluk içeriği), raporlama + moderasyon kuyruğu + denetim kaydı |
| Anahtar/gizli veri | Davet token'ı yalnız SHA-256 özetiyle saklanır; service role istemcide yok |

---

## Kategori 12 — Test ve bakım

### Komutlar

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build        # statik denetimler (npm test: 324 test)
# Arayüz (ağ + Realtime taklitli Playwright; repoya bağımlılık eklenmez):
npm i --no-save playwright
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/messaging-ui/run-groups.mjs        # 36
CHROMIUM_PATH=… node tests/messaging-ui/run-communities.mjs                                                      # 61
CHROMIUM_PATH=… node tests/messaging-ui/run-community-posts.mjs                                                  # 30
CHROMIUM_PATH=… node tests/messaging-ui/run-chat.mjs                                                             # 35
CHROMIUM_PATH=… node tests/messaging-ui/run.mjs                                                                  # 24
# SQL/RLS (yerel PostgreSQL): supabase/tests/run-local.sh  (communities.sql, chat-groups.sql, …)
```

### Test dosyaları

`src/lib/communities.test.ts` (sekme/bölüm erişimi, `resolveCommunityView`, yetkiler, rotalar) · `src/lib/chat-groups.test.ts` (roller, yetenekler, `canSeeChatSettings`) · `tests/messaging-ui/*` (arayüz) · `supabase/tests/*.sql` (sunucu).

### Yeni özellik eklerken değiştirilecek yerler

- Yeni yönetim yeteneği: `_group_all_capabilities()`, `_group_default_permissions()`, `lib/chat-groups.ts` (`GROUP_CAPABILITIES`, `DEFAULT_ROLE_PERMISSIONS`), çeviri anahtarları `groups.cap.*`; hangi bölümü açtığı `manageSections`/`membersSections`.
- Yeni sekme/bölüm: `CommunityTab`/`MembersSection`/`ManageSection` + `accessibleTabs` + `community-page.tsx` etiketleri + TR/EN çeviri.
- Yeni ayar: önce **A/B/C sınıfı** belirlenir (Kategori 7); sohbet ayarı → `ChatSettingsSection`, topluluk ayarı → Yönet → Ayarlar, kişisel → Hakkında + paylaşılan bileşen.
- Yeni bildirim: SQL + `lib/notification-message.ts` + `notifMsg.*` (TR/EN).
- Yeni içerik listesi sorgusu: `community_id is null` süz.

### Bilinen sınırlamalar

Aşağıdaki "Kalan işler" ve `CLAUDE.md` Bölüm 9'daki canlıya-uygulanmadı notları geçerlidir. Özet: gerçek Supabase'e/oturuma/cihaza karşı denenmedi; Realtime yalnız taklitle sınandı; rol değişikliği bildirimi yok; paylaşılan `Modal` aşağı çekerek kapatmayı desteklemiyor; yalnız-sohbetten-ayrılma veri modelinde yok.

---

## Kategori 13 — Görsel ve işlevsel bileşen kataloğu

Ortak: `Button`, `Badge`, `Tabs` (underline / segmented), `Modal` (mobilde alt sayfa), `Collapsible`, `EmptyState`, `Avatar`, `ConfirmDialog`, `useAsyncAction`, `useToast`, tasarım token'ları (`bg-surface`, `border-border-soft`, `text-text-muted`, `bg-primary-soft` …; hex yok).

| Bileşen | Dosya | Sorumluluk | Temel veri → çağrı | Yetki |
|---|---|---|---|---|
| CommunityPage | `TR/community-page.tsx` | Başlık, sekmeler, geçit, yönlendirme | `useCommunity` → `resolveCommunityView`, `accessibleTabs` | sekme başına |
| useCommunity | `TR/use-community.ts` | Tam satır (üye) / kart (üye değil) + canlı eşitleme | `chat_groups`, `community_cards`, Realtime | RLS |
| FeedTab | `TR/feed-tab.tsx` | Gönderi akışı, oluştur/başvur/sabitle/kaldır | `fetchCommunityPosts`… | `canSharePost`, `can(pin_posts)`, `canModerate` |
| FeedHighlights | `TR/feed-highlights.tsx` | Kural uyarısı, kapatma notu, duyuru, sıradaki etkinlik | `fetchCommunityEvents`, `AnnouncementsSection(highlight)` | okuma |
| MembersTab | `TR/members-tab.tsx` | Liste + İstekler + Davetler | `membersSections` | yeteneğe göre |
| GroupMembersSection | `GR/group-members-section.tsx` | Üye listesi; `manage` açıkken rol/çıkar/yasak/devir | `community_members`, RPC'ler | `assignableRoles`, `canRemoveMember` |
| GroupRequestsSection | `GR/group-requests-section.tsx` | Bekleyen istekler, kabul/ret | `fetchGroupJoinRequests`, `decideJoinRequest` | `manage_requests` |
| GroupInvitesSection | `GR/group-invites-section.tsx` | Davet, bağlantı, yasaklar | `inviteToChatGroup`… | `manage_invites` |
| ManageTab | `TR/manage-tab.tsx` | Özet · Ayarlar · Duyurular · Moderasyon · Geçmiş | `manageSections` | yeteneğe göre |
| CommunitySettingsSection | `TR/community-settings-section.tsx` | Kategori, akış politikası, kurallar, kapatma | `updateCommunity` | `edit_settings`/`edit_rules`/owner |
| GroupSettingsSection | `GR/group-settings-section.tsx` | Ad, görsel, sınır, görünürlük, silme | `updateChatGroup`, `setChatGroupVisibility` | `edit_settings`/`change_visibility`/owner |
| GroupOwnerSettings | `GR/group-owner-settings.tsx` | `scope="chat"` geçmiş+sabitleme · `scope="community"` yetki matrisi | `updateChatGroupOwnerSettings` | owner |
| ChatSettingsSection | `GR/chat-settings-section.tsx` | Sohbet ayarları (kim yazar + owner ayarları) | `updateChatGroup` | `edit_settings`/owner |
| AboutTab | `TR/about-tab.tsx` | Bilgi, kurallar, kişisel tercihler, ayrılma | `setCommunityNotifyPrefs`, `acceptCommunityRules` | üye |
| ChatMuteToggle / LeaveCommunitySection | `GR/personal-prefs.tsx` | Kişisel sessize alma; ayrılma bölümü | `setChatGroupMuted`, `leaveChatGroup` | üye |
| LeaveCommunityDialog | `GR/leave-community-dialog.tsx` | Tek ayrılma onayı (başlık menüsü, Hakkında, sohbet) | `leaveChatGroup` | üye |
| GroupInfoModal | `GR/group-info-modal.tsx` | Kompakt sohbet paneli (Kategori 6) | `conversation.group` | bölüme göre |
| CommunityJoinButton | `TR/community-join-button.tsx` | Tek üyelik düğmesi | `joinCommunity`, `requestJoinCommunity` | oturum |
| CommunityGate | `TR/community-gate.tsx` | Üye olmayan: davet/başvuru durumu | `respondToCommunityInvitation` | — |
| Sohbet görünümü | `MS/local-conversation-view.tsx` | Mesajlar, başlık, ⋮ menü, `?panel=` yönlendirmesi | `messages`, Realtime | üye |

---

## Kategori 14 — Uçtan uca kullanıcı senaryoları

**1. Yeni topluluk oluşturma.** *Arayüz*: Topluluklar → “Topluluk oluştur” → ad, kategori, görünürlük, kurallar. *İş mantığı*: `create_community` (kimlik `auth.uid()`). *Veri*: `conversations` + `chat_groups` (aynı id) + sahibin `conversation_members` satırı (`role='owner'`) + denetim kaydı. *Sonuç*: kullanıcı topluluk sayfasına (Akış) düşer; başlıkta Sahip rozeti.

**2. Katılma isteği gönderme.** *Arayüz*: kapalı toplulukta başlıkta “İstek gönder” (kural zorunluysa önce kural metni). *İş mantığı*: `request_join_community`. *Veri*: `chat_group_join_requests` (`pending`), `pending_request_count`+1 (tetikleyici). *Sonuç*: düğme “İstek gönderildi ▼” (geri çekilebilir); yönetime bildirim.

**3. Yöneticinin isteği kabul etmesi.** *Arayüz*: bildirim ya da başlıktaki “N bekleyen istek” → **Üyeler → Katılım istekleri** → Kabul et. *İş mantığı*: `decide_chat_group_join_request` (kilit, `manage_requests`, durum `pending` mi, yasak/engel kontrolü). *Veri*: istek `accepted`, `conversation_members` satırı eklenir (topluluk **ve** sohbet üyeliği), sayaç düşer, denetim kaydı. *Sonuç*: başvurana bildirim; sayfası Realtime ile üye görünümüne geçer; sohbet erişimi açılır; ikinci yönetici aynı isteği işlerse `invalid_state` ve liste yenilenir.

**4. Akışta içerik oluşturma.** *Arayüz*: Akış → “Gönderi oluştur” → “Yeni içerik” → normal oluşturma ekranı (`?community=`). *İş mantığı*: `enforce_community_content` (üye, kapatılmamış, akış politikası, kota) görünürlüğü `private`a zorlar; tetikleyici `community_posts` (`native`) satırı ekler. *Sonuç*: içerik normal kartla akışta, yalnız topluluk üyelerine görünür.

**5. Mevcut içeriği ilişkilendirme/başvuru.** *Arayüz*: “Gönderi oluştur” → “Mevcut içerikle başvur” → kendi yayınlanmış herkese açık içeriğin + isteğe bağlı not. *İş mantığı*: `share_to_community` (yalnız yayında+açık). *Veri*: `community_posts` (`application`), içerik kopyalanmaz. *Sonuç*: akışta başvuru kartı; kendi beğeni/yorumu olan başvuru sayfası.

**6. Sohbete girme.** *Arayüz*: başlıkta “Sohbeti aç” (veya Mesajlar listesi). *İş mantığı*: üyelik + `can_read_message` geçmiş kuralı. *Sonuç*: mesajlar, “yazıyor”, sabitler; `?panel=` yoksa panel açılmaz.

**7. Sohbet başlığından grup bilgilerini açma.** *Arayüz*: başlıktaki ad/avatar → kompakt panel (Kategori 6): topluluk bağlantısı, kişisel sessize alma, arama, üyeler, (yetkiliye) sohbet ayarları, ayrılma. *Veri*: yalnız okuma, hiçbir yönetim formu yok. *Sonuç*: topluluk işleri için “Topluluk sayfasını aç”.

**8. Sohbet ayarlarını değiştirme.** *Arayüz*: panel → “Sohbet ayarları” → “Kim mesaj yazabilir” → Kaydet. *İş mantığı*: `update_chat_group` (`edit_settings`); yalnız `posting_policy` gönderilir. *Veri*: `chat_groups.posting_policy`; Realtime ile açık sohbet ve üyelerin yazma çubuğu güncellenir. Owner ayrıca geçmiş/sabitleme ayarlarını `update_chat_group_owner_settings` ile değiştirir.

**9. Topluluk ayarlarını değiştirme.** *Arayüz*: topluluk → Yönetim → Ayarlar. *İş mantığı*: `update_chat_group` / `update_community` / `set_chat_group_visibility` (kapalı→açık geçişte bekleyen istekler tek atomik işlemde kabul edilir, uymayanlar nedeniyle raporlanır, sessizce “kabul edildi” işaretlenmez). *Sonuç*: sayfa yenilenir; değişiklik denetim kaydına yazılır.

**10. Üye çıkarma / rol değiştirme.** *Arayüz*: Üyeler → satır ⋮ → rol ver / çıkar (+ yasakla) / sahipliği devret → onay penceresi. *İş mantığı*: `set_chat_group_member_role`, `remove_chat_group_member`, `transfer_chat_group_ownership` (rütbe kuralı, yetenek). *Veri*: satır güncellenir/silinir (sohbet erişimi de biter), yasak varsa `chat_group_bans`. *Sonuç*: çıkarılana bildirim; rol değişikliğinde bildirim **yok** (denetim kaydı var).

**11. Topluluktan ayrılma.** *Arayüz*: başlıkta “Katıldın ▼ → Topluluktan ayrıl”, Hakkında sekmesi, sohbet paneli ya da sohbet ⋮ menüsü → **aynı** onay penceresi (“sohbetten de çıkarırsın”). *İş mantığı*: `leave_chat_group` (sahip önce devretmeli; tek üyeyse topluluk silinir). *Veri*: `conversation_members` satırı silinir; mesajlar/içerik kalır; bağlı bildirimler silinir. *Sonuç*: sohbet listeden kalkar; tamamen kapalıysa Topluluklar'a dönülür.

**12. Yetkisiz kullanıcının yönetim işlemine erişmeye çalışması.** *Arayüz*: normal üye `?tab=manage`, `?tab=members&section=requests`, `/messages/local?id=…&panel=requests` adreslerini zorlarsa Yönet sekmesi/istek bölümü yoktur, ilk izinli sekmeye (Akış/Üyeler listesi) düşer, panel parametresi istek listesi açamaz. *İş mantığı*: RPC doğrudan çağrılsa bile `_group_require_cap` `forbidden` döner. *Veri*: değişmez. *Sonuç*: erişim güvenle reddedilir.

---

## Kalan işler ve riskler

- **Canlıya uygulanmadı / denenmedi**: bu değişiklik yalnızca istemci kodudur (migration yok); ama önceki topluluk migration'larının bir kısmı canlıya uygulanmamıştır (`CLAUDE.md` Bölüm 9). Gerçek Supabase'e, gerçek oturuma, gerçek Realtime'a ve fiziksel cihaza karşı denenmedi.
- **Rol değişikliği bildirimi yok** (sunucu tarafı; migration gerektirir).
- **Kabul/ret/davet bildirim adresleri** hâlâ eski rotalara (`/messages/local?id=…`, `/groups…`) işaret eder; eski rotalar çalışır, ancak SQL'deki adresler topluluğa çevrilmedi (yeni migration gerektirirdi).
- Paylaşılan `Modal` aşağı çekerek kapatmayı desteklemez.
- Sohbetten ayrı topluluktan ayrılma veri modelinde yok (tek üyelik satırı); arayüz bunu açıkça belirtir.
- `chat_group_join_requests` Realtime yayınında değil; istek listesi yalnız sayaç değişimiyle ve işlemlerle tazelenir.
