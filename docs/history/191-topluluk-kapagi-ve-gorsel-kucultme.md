# 191 — Topluluk kapağı (fotoğraf / renk / otomatik), görsel yükleme hatası, tüm fotoğraf alanlarında otomatik küçültme

**Durum:** istemci + `20260920150000_community_cover_and_avatar_url.sql` repoda, yerel PostgreSQL'de sınandı; **canlıya UYGULANMADI** — kullanıcı onayı bekliyor. Sıra: ÖNCE migration, SONRA istemci (yeni istemci `chat_groups.cover_url/cover_color` sütunlarını okur; sütunlar yoksa topluluk sayfası üye için açılmaz).

## İstek
1. Topluluk sayfasındaki kapak bölümüne fotoğraf konabilsin; isteyen renk seçebilsin; hiçbir şey seçilmediyse kapak topluluk profil görseline uygun olsun.
2. Topluluk profil görseli yüklenmiyor, hata veriyor → düzelt.
3. Tüm fotoğraf alanlarında bir sınır olsun; kişi çok yüksek MB'lık fotoğraf yükleyse bile sistem otomatik küçülsün.

## 2 — Görsel yükleme hatasının kök nedeni
`_group_valid_avatar` (172) yalnız `…/object/public/avatars/…` adresini kabul ediyordu. 177 topluluk görselini özel `community-avatars` bucket'ına taşıdı ve istemci bu adresi göndermeye başladı, ama doğrulayıcı güncellenmedi: dosya yükleniyordu, sonra `create_community` / `update_chat_group` `invalid_avatar` ile reddediyordu. Canlıda bucket ve Storage politikaları VAR (kontrol edildi), asıl neden doğrulayıcıydı. Düzeltme: doğrulayıcı iki bucket'ı kabul eder (eski `avatars` adresleri geriye uyum için kalır). Yerel testte eski doğrulayıcı geri konunca `invalid_avatar` yeniden üretildi.

## 1 — Kapak
- **Veri:** `chat_groups.cover_url` (fotoğraf; görselle aynı özel `community-avatars` bucket'ı, `<kullanıcı>/cover-<uuid>.jpg`) ve `cover_color` (`#rrggbb`, CHECK'li). Öncelik: **fotoğraf › renk › otomatik** (`coverModeOf`). Otomatik = ikisi de boş: şerit topluluk görselinin büyütülüp bulanıklaştırılmış hâli (görsele uygun renk), görsel de yoksa marka tonu — yeni bir "baskın renk" hesabı/sütunu yok (tuval okuması çapraz kaynakta bozulabilir).
- **Yazma:** yalnız `update_chat_group` (yetenek `edit_settings`, denetim kaydı); gövde canlıdaki sürümle aynı, tek fark `cover_url` / `cover_color` (`_group_valid_cover` yalnız `community-avatars`; renk küçük harfe çevrilir; geçersiz → `invalid_cover`).
- **Okuma:** üye `chat_groups` satırından; üye olmayan/ziyaretçi için `community_cards` dönüş tipi değişmesin (drop gerektirir) diye ayrı, ekleyici `community_card_covers(uuid[])` RPC'si (aynı `can_see_community_card` kuralı; anon EXECUTE bilinçli, `community-privacy.sql` beyaz listesine eklendi). Tamamen kapalı topluluğun kapağı yabancıya dönmez.
- **Depolama:** `can_read_community_avatar` kapak dosyasını da bilir (kart görülebildiği sürece okunur); `orphan_storage_objects` kapak adresini "kullanımda" sayar — aksi hâlde yetim süpürücü kapakları silerdi. İkisi de `create or replace`, aynı imza.
- **Arayüz:** `CommunityCover` (şerit; `features/communities/community-cover.tsx`, `data-community-cover=photo|color|auto`), ayar ekranında `CommunityCoverPicker` (Yönetim → Ayarlar → Temel bilgiler: canlı önizleme, Otomatik | Renk | Fotoğraf, 8 hazır renk + özel renk, fotoğraf seç). Şerit 96 → 128px (fotoğraf kapak gibi okunsun); `run-community-home` 26b başlık yüksekliği eşiği 230 → 262 bilinçle güncellendi. Oluşturma penceresine kapak EKLENMEDİ (`create_community` imzası değişmesin); kapak topluluk kurulduktan sonra ayarlardan seçilir.

## 3 — Tek görsel sınırı + otomatik küçültme (`src/lib/image-processing.ts`)
- **Ağır fotoğraf reddedilmez.** `shrinkImage`: ortadan kırp (kare avatar / 10:3 kapak), en uzun kenarı sınırla, beyaz zeminli tuvale çiz (şeffaf PNG siyah olmasın), JPEG'e kodla; sonuç bayt bütçesini aşarsa önce kalite (0.9 → 0.5), sonra boyut (%80'er) düşer. Bütçeler: avatar 200 KB, kapak 900 KB, gönderi/çıktı/istek/mesaj 2 MB (hepsi bucket sınırlarının altında). Yeniden kodlama özgün dosyanın EXIF/GPS bilgisini de atar.
- **Tek kaynak tavanı:** `IMAGE_SOURCE_MAX_BYTES` = 40 MB. Bunun üstü çözülmeye bile çalışılmaz (60 MB'lık bir RAW telefonu dondurur); kullanıcıya "en fazla 40 MB" denir. Eskiden alan başına dağınık sınırlar vardı (topluluk 8 MB, görsel analizi 20 MB, mesaj 20 MB) — hepsi bu tavana bağlandı; `communities.create.avatarTooLarge` / `groups.create.avatarTooLarge` / `vision.errorFileTooLarge` metinleri kalktı, yerine `image.sourceTooLarge`.
- **Bağlanan alanlar:** `utils.ts`'teki `resizeImageToBlob` / `resizeImageToSquareBlob` artık bu modülün üstünde (prompt/istek/iş akışı görselleri, çıktı + küçük resim, profil ve topluluk görseli, görsel analizi); yeni `resizeImageToCoverBlob`; mesaj fotoğrafı (`prepareMessageImage`, GIF olduğu gibi kalır, ≤ 5 MB); önizleme çözücü `resizeImageToDataUrlFit` yalnız tavan denetimi + beyaz zemin kazandı. Seçici anında kontrol: profil, topluluk görseli/kapağı, sonuç ekleme, çok görselli seçici, değişken seçeneği görseli.
- **Dokunulmayan:** video/ses çıktısı (küçültülemez; `result-media` 50 MB sınırı), GIF mesajı.

## Sınama
- Yerel PostgreSQL: `community-cover.sql` 15 kontrol (hata yeniden üretimi dahil: iki bucket, kötü adres, yetki, CHECK, kart kapağı + Storage RLS yabancı/ziyaretçi/tamamen kapalı, yetim taraması); önceki SQL dosyaları `FAILED=0` (her biri temiz veritabanında; `community-privacy` yalnız yeni anon fonksiyonu için beyaz liste güncellemesi istedi).
- `npm test` (+ `image-geometry.test.ts`, `communities.test.ts` kapak testleri), `tsc`, `lint`, `build` temiz.
- Playwright (ağ taklitli; hidrasyon #418 denetimi dışarıda tutulan geçici kopyayla): `run-communities` 65/65 (yeni 33–33d: renk · 12 MB fotoğrafın ≤ 1,2 MB'a küçülüp yüklenmesi · 12 MB görselin ≤ 300 KB'a küçülmesi + 41 MB reddi · ziyaretçi kapağı), `run-community-home` 38/38, `run-community-posts` 36/36, `run-detail-pages` 44/44, `run-groups` 36/36, `run-chat` 35/35 (mesaj fotoğrafı yolu değişti).
- **Denenmedi:** gerçek Supabase'e / gerçek Storage'a / fiziksel telefonda gerçek kamera fotoğrafıyla (HEIC dönüşümü, EXIF yönü) yükleme; canlıda kapak gösterimi. Yükleme boyutları taklit sunucuda ölçüldü.

## Çeviri
Yeni metinler TR+EN: `groups.cover.*` (14), `groups.error.invalid_cover`, `image.sourceTooLarge`.
