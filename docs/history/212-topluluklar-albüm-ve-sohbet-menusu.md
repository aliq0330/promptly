# 212 — Topluluklar ana sayfası Albüm düzeni + sohbet mesaj menüsünün konumu

**Durum:**
- İstemci kodu uygulandı.
- `20260921120000_community_unseen_counts.sql` yerel PostgreSQL'de sınandı ve **canlıya UYGULANDI** (kullanıcı onayıyla, MCP `execute_sql`, tek işlem; `schema_migrations`'a dosya sürümüyle kayıt; canlıda yetkiler doğrulandı: anon EXECUTE yok, authenticated var). Yalnızca ekleyici: tek fonksiyon, `drop` yok.
- İstemci, migration olmadan da çalışır: sayaç çağrısı hata verirse raf rozetsiz çizilir. Bu yüzden sıralama zorunlu değil, ama rozetler migration'dan sonra görünür.

## 1. Topluluklar ana sayfası (kullanıcı A + D karışımını seçti)

Tasarım tuvalindeki dört yönden (A Albüm rafı · B Öne çıkan bant · C Kütüphane ızgarası · D Akış önce) öneri olarak A + D karışımı seçildi.

**Üst satır**
- Görünür başlık yok; `<h1>` yalnız ekran okuyucuda.
- Üstte arama kutusu ve "+" (Topluluk oluştur) tek satırda.
- Arama, `/communities/all?q=` adresine gider; o sayfa `q`'yu kutuya hazır koyar.
- Mesajlar düğmesi kaldırıldı: üst menüde zaten var.

**"Topluluklarım" rafı** (`MyCommunitiesShelf`, `features/communities/home-shelf.tsx`)
- Üye olunan topluluklar kare kapaklar olarak dizilir: topluluk görseli (özel bucket, signed URL; yoksa baş harf), ad ve üye sayısı.
- Görülmemiş gönderisi olan toplulukta "N yeni" rozeti çıkar (99+ kesilir).
- Sıra: yenisi çok olan önce, sonra son etkinlik.
- "Tümünü gör" eski `?tab=mine` listesini açar.

**Sayaç** (`my_community_unseen_counts`)
- Sayılan gönderi: üye olunan herkese açık + kapalı topluluklarda (tamamen kapalı hiç girmez, `member_feed_page` ile aynı kural), katıldıktan sonra ve son 30 günde gelen, kendi gönderin olmayan, yazarı engelli olmayan ve `community_post_views`'ta satırı olmayan gönderi.
- SECURITY INVOKER; anon çağıramaz.

**Rozetin düşmesi**
- Görülen gönderiler ana sayfa akışında zaten işaretleniyordu.
- Artık topluluğun kendi akışı (`FeedTab`) da aynı izleyiciyle (`useSeenTracker`) işaretliyor. Yani kapağa dokunup topluluğa giren kişinin rozeti düşer. Izgara görünümünde işaretleme yok.

**Bölüm balonları**
- Hap sekmeler yerine Ana Sayfa ve Keşfet'teki `SectionNav` kullanılıyor (yalnız balonlar, `hideControls`).
- `SectionNavItem.count` eklendi: Davet ve başvurular sayacı balonun köşesinde gösterilir.
- Rozet DOM'da etiketten sonra gelir, böylece sekmenin okunan adı "Davet ve başvurular 3" olur.
- Renk çifti `bg-primary` / `text-primary-foreground`: 12 palet kombinasyonunda AA.

**Davet kartı** (`HomeInviteNotice`)
- Gönderiler'de bekleyen davet tek satırlık bir kart olarak çıkar: topluluk adı ve "Gör".
- "Gör" Davetler bölümünü açar. Kabul orada, mevcut akışla yapılır (kural onayı dahil); kart davet kabul etmez.

**Kaldırılanlar**
- Gönderiler sekmesindeki görünür başlık, "Topluluklarım" düğmesi ve yardım satırı.
- Sağ sütundaki "Topluluklarım" listesi (artık rafta).
- Kullanılmayan `CommunityPageHeader` ile `communities.page.description`, `communities.page.toMessages` ve `communities.home.posts.help` anahtarları.

**Ziyaretçi**
- Arama, raf ve balon görmez; sayfa doğrudan Keşfet olarak açılır.
- "Topluluk oluştur" giriş penceresini açar.

## 2. Sohbet: mesaj düğmeleri ve ⋮ / emoji menüsünün konumu

**Önceki sorun**
- Emoji ve ⋮ düğmeleri mesajın yanında dikey ortalıydı. Ekrandan uzun bir mesajda ortası ekran dışında kaldığı için düğmeler görünmüyordu.
- Menü ve emoji paneli `absolute top-full` ile her zaman düğmenin altına açılıyordu. Kaydırma alanı bunları kırpıyordu; en alttaki mesajda menü yazma alanının arkasında kalıyordu.

**Düğmeler**
- Düğme sütunu mesaj kadar uzun; içindeki ikili `sticky top-2 bottom-2`.
- Uzun mesajda düğmeler mesajın görünen kısmında kalır.
- Liste kendi içinde kaydığı için düğmeler başlık ya da yazma alanının altına girmez.

**Menü ve emoji paneli**
- Portal ile `document.body`'ye çizilir ve `position: fixed` ile konumlanır (`useAnchoredPopover`).
- Konumu saf fonksiyon `computePopoverPlacement` (`src/lib/popover-position.ts`, birim testli) hesaplar.
- Görünür alan = mesaj listesi (`[data-chat-scroll]`) ∩ `visualViewport`. Bu sayede sabit sohbet başlığı, yazma alanı, iOS klavyesi ve adres çubuğu hesaba girer.
- Altta yer varsa aşağı, yoksa yukarı açılır. İkisine de sığmazsa geniş olan tarafta `maxHeight` ile kendi içinde kayar. Yatayda ekrana sıkıştırılır.

**Yeniden yerleştirme**
- Her kaydırmada (yakalama aşamasında), `resize`'da, `visualViewport` `resize`/`scroll`'unda ve panelin kendi boyutu değişince (emoji "+") konum yeniden hesaplanır.
- İlk yerleşim boyamadan önce yapılır; panel ölçülene kadar gizli kalır.
- Mesaj görünür alandan tamamen çıkınca menü kapanır.

**İşlevler aynı**
- Portal React ağacında satırın çocuğu kaldığı için tıklamalar hâlâ satırın `stopPropagation`'ında durur.
- Dışarı tıklama, Esc, onaylı silme ve süre kontrolü değişmedi.

**Diğer**
- Emoji düğmesinin sabit Türkçe etiketi `messages.addEmojiReaction` anahtarına (TR + EN) taşındı.
- `use-popover-align.ts` kaldırıldı.

## Sınama

- **Birim:** `popover-position.test.ts` 9/9; `npm test` 378/378.
- **Yerel PostgreSQL:** `community-unseen.sql` 8/8.
- **Playwright (ağ taklitli):**
  - Yeni `run-chat-popovers` 8/8: uzun mesajda üst ya da alt görünürken düğmeler görünür alanda; en alttaki mesajın menüsü yukarı, en üsttekinin menüsü aşağı açılıyor; emoji paneli büyüyünce yeniden yerleşiyor; görünüm küçülünce menü yerleşiyor; kayınca kapanıyor; masaüstü.
  - Yeni `run-community-shelf` 7/7.
  - `run-communities` 65/65 (ziyaretçi testi yeni düzene göre güncellendi), `run-community-home` 38/38, `run-community-posts` 36/36, `run-chat` 38/38, `run` 24/24, `run-groups` 36/36, `run-discover` 6/6, `run-topic-pages` 9/9, `run-home-motion` 9/9.
- **Kararsız testler:** `run-communities` ve `run-community-home` arada bir rastgele senaryoda düşüyor (27, 22, 33b). Ana dal da aynı biçimde düşüyor (3 çalıştırmada bir kez 33b); bu değişiklikten kaynaklanmıyor.
- **Denenmeyenler:** gerçek iOS Safari klavyesi ve adres çubuğu bu ortamda açılamadığı için **denenmedi**; klavye etkisi görünüm yüksekliği küçültülerek taklit edildi. Gerçek Supabase'e ve cihaza karşı denenmedi.
