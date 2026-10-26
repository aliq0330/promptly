# 241 — Space'in tek etkileşim hattı = alıntı

**Durum:** uygulandı (migration + istemci). Migration `20260925100000_space_single_thread.sql` repoda, yerel PostgreSQL'de sınandı; **canlıya uygulanmadı** (`main`'e birleşince `deploy.yml` uygular). Arayüz ağ taklitli Playwright'ta sınandı; gerçek Supabase'e / oturuma / cihaza karşı denenmedi. İngilizce karşılıklar eklendi (`translations*.ts`, `{tr,en}` çiftleri).

## Neden
Space'in kendi beğeni/yorum/gönderisi vardı (215); başkası alıntılayınca ayrı bir alıntı sayfası açılıyordu, sahibi paylaşınca kart doğrudan Space sayfasına gidiyordu. Aynı içerik için iki etkileşim hattı ve iki sayfa. Kullanıcı "C"yi seçti: Space de diğer dört tür gibi olsun, etkileşim alıntıda toplansın, içerikte Space'in önizlemesi görünsün.

## Davranış
- Space'in kendi beğeni/yorum/istatistiği yok; `space_id`'li yeni beğeni/yorum reddedilir (`space_engagement_closed`).
- Akışa girmek = alıntı. Sahibin "Akışta paylaş" anahtarı onun KENDİ alıntısıdır (Space başına bir; kapatınca silinir; kart/sayfa "paylaştı" der). Başkası normal alıntılar (24 saatte bir).
- Eşik her alıntıda: ≥3 öğe ve ≥1 görsel (`space_too_empty`). Okuma kuralı (`quote_target_ok`) değişmedi → eşik yüzünden eski alıntı kaybolmaz.
- Alıntı sayfası ve başvuru gönderisi sayfası Space'i `SpacePreview` ile gösterir: diğer dört türün detay sayfasıyla AYNI iskelet (`DetailShell`: Albüm bandı, tek eylem satırı [Panoyu gez · Space'i aç · alıntının beğeni/yorum/istatistik/paylaş], "Space hakkında" sütunu, palet/görseller, yorumlar). Beğeni/yorum `Engage*` ailesiyle alıntının; ilk sürümdeki ayrı dar etkileşim bölümü kaldırıldı.
- Space sayfası: eylem satırında beğeni/yorum yok; altta "N kez alıntılandı" + Şikâyet.
- Keşfet → Spaces artık gönderi akışı değil, herkese açık Space listesi (`list_spaces('public')`, ofsetle sayfalanır, `SpaceDiscoverCard`).
- Odak / Sana özel / Izgara alıntı almaz (değişmedi).

## Veri geçişi (tekrar çalıştırılabilir)
Akışta paylaşılmış her Space için sahibin alıntısı paylaşım anıyla yaratılır; Space'in beğeni ve yorumları o alıntıya taşınır, sayaçlar yeniden hesaplanır; sonra `shared_at/like_count/comment_count` boşaltılır (`feed_page` değiştirilmeden Space döndürmez).

## Contract (onay bekliyor — ayrı migration)
`spaces.shared_at/like_count/comment_count`, `prompt_likes.space_id`, `prompt_comments.space_id` (+ CHECK kolları), Space bildirim/istatistik tetikleyicileri, `feed_page`'in Space kolu, `space_feed_cards`'ın eski sütunları, `spaces_guard_shared`; istemcide ölü Space yorum dalları.

## Bilinçli sınırlar
Keşfet → Spaces sıralama/süzgeç sunmaz (son güncellenen); sahibin akış alıntısına not eklenemez (anahtar notsuz yaratır; Alıntıla satırı sahipte yalnız toplulukları sunar); bir Space'in alıntıları listelenmez (yalnız sayı).
