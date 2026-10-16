# 9.181 — Topluluk kartlarında İstatistik ve Paylaş

Durum: `20260920110000_community_statistics.sql` repoda, yerel PostgreSQL'de sınandı (`supabase/tests/community-statistics.sql`, 10 kontrol; migration çıkarılınca 6 kontrol düşer), **canlıya UYGULANMADI**. İstemci kodu ağ taklitli Playwright'ta denendi (`run-community-posts.mjs` 30/30, `run-communities.mjs` 61/61). Gerçek Supabase'e / oturuma / cihaza karşı denenmedi.

## Neden

179'da "topluluk içeriği kaydedilemez" kararını uygularken Paylaş düğmesini de gizlemiştim; 180'in başvuru kartı da yalnız beğeni/yorum/bağlantı kopyala sunuyordu. Kullanıcı topluluk kartlarının normal kartlardaki gibi **istatistik ve paylaşım** sunmasını istedi. Kaydet kapalı kalır (karar 3).

## Ne değişti

- **Paylaş geri geldi** (yerel prompt/istek/workflow/hazır ayar kartı, odak görünümü ve dört detay sayfası): `ShareModal` aynıdır. Fark: topluluk içeriği özeldir ve herkese açık `/share/<tür>/<anahtar>/` sayfası yoktur; bu yüzden "Diğer uygulamalarla paylaş" bağlantıyı paylaşım sayfasına ÇEVİRMEZ, içeriğin kendi adresini verir (`shareOrCopyLink(..., { direct: true })`). Bağlantıyı yalnız topluluğu okuyabilenler açabilir; "Mesaj olarak gönder" mevcut davranışla çalışır (alıcı okuyamıyorsa içeriği göremez).
- **Başvuru kartı ve sayfası**: altbilgi artık Beğeni · Yorum · İstatistik · (sağda) Paylaş. Bağlantıyı kopyala düğmesi kalktı (Paylaş penceresi aynı işi yapar). Paylaşılan şey gönderinin kendi sayfasıdır (`/communities/post/local?id=`); mesaja eklenemez (gönderi mesaj türü değil).
- **İstatistik gönderinin KENDİ etkileşimini gösterir**: `StatisticsContentType`'a `community_post` eklendi; sekmeler Beğenenler · Yorum yapanlar (kaydedilemez → Kaydedenler yok).
- **Hata düzeltmesi (SQL)**: `_engager_content_visible` yalnız herkese açık içeriği ya da yazarı görünür sayıyordu; topluluk içeriği `private` saklandığı için topluluktaki DİĞER üyeler yerel kartta İstatistik penceresini açınca listeleri boş görürdü (sayaçlar doğru, kişi listesi boş). Migration: topluluk içeriği `can_read_community(community_id)` ile görünür (herkese açık toplulukta herkes, kapalıda yalnız üye; ziyaretçi kapalıda boş liste alır, varlık sızmaz); yeni hedef `community_post` → `prompt_likes/prompt_comments.community_post_id`. Yalnızca `create or replace` (aynı imzalar), `drop` yok.

## Sıra

Önce migration (yoksa yerel kartın istatistik listesi yalnız yazara dolu görünür, başvuru gönderisinin istatistiği "geçersiz içerik türü" hatası verir ve pencere yeniden dene durumuna düşer), sonra istemci. Bu tur canlıya uygulanmadı; 179'un `20260920100000` migration'ı da hâlâ uygulanmadı — ikisi sırayla uygulanmalı.

## İngilizce

Yeni metin eklenmedi (mevcut `common.share`, `statistics.*` anahtarları kullanıldı); kullanılmayan iki anahtar (`communities.post.engage.copyLink` / `linkCopied`) silindi.
