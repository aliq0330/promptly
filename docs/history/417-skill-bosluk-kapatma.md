# 417 — Skill boşluk kapatma (5. içerik türü taraması)

Tarih: 2026-11-17. Kaynak: Skill'in "5. içerik türü olarak olması gereken ama olmayan" yerlerinin canlı veritabanı + kod taramasıyla çıkarılması
(Ayar paketi / Workflow'da geçip Skill'de geçmeyen fonksiyon ve yüzeyler). Hiçbir kritik güvenlik açığı çıkmadı; bulunanlar bütünlük ve tutarlılık eksikleriydi.
Üç ekleyici migration + küçük istemci değişiklikleri. Hepsi tek PR'da.

## Bulgular ve çözümler

| # | Bulgu | Çözüm |
|---|---|---|
| 1 | `collection_items_a_shared_guard` Skill dalı yoktu: `set_collection_shared` Skill'i denetliyor ama koleksiyon zaten ortakken eklenen özel/taslak Skill korumadan geçiyordu | Guard'a `quote_target_ok('skill', …)` dalı (`20261207100000`); `SHAREABLE_ENTRY_TYPES`'a `skill` + birim test (migration metniyle aynı küme) |
| 2 | Skill silinince bildirimleri kalıyordu (preset/workflow'da `cleanup_notifications_for_deleted_*` var) | `cleanup_notifications_for_deleted_skill` + `skills` AFTER DELETE tetikleyicisi (`20261207100000`) |
| 3 | `admin_users` Skill'i saymıyor; `admin_user_activity` Skill'i listelemiyor, yorum/beğeni "sonuç", kayıt "preset" diye YANLIŞ etiketliyordu | `20261207110000`. `admin_users` dönüş tablosu AYNI (yeni sütun `drop` ister): Skill sayısı `posts_total` ve `likes_received_n` içine katıldı, istemci Skill sayısını `posts_total − diğerleri` ile türetir (`AdminUser.skills`). Tür süzgeci (görsel/metin/ses/video) varken Skill sayılmaz. `admin_user_activity` posts/comments/likes/saves kollarına Skill dalı |
| 4 | `suggest_creators` Skill gönderisini ve Skill beğenisini saymıyordu (yalnız Skill paylaşan kişi hiç önerilmezdi) | `20261207120000`: 90 gün içindeki yayında+herkese açık Skill'ler aday sinyali, `my_likes` Skill beğenisi "liked" sinyali |
| 5 | `chat_shared_items/stats` desenlerinde `/skills/` yoktu: paylaşılan Skill "Bağlantılar"a düşüyordu | Desen `(workflows\|presets\|spaces\|skills)` (`20261207120000`) |
| 6 | `profile_content_stats` Skill sayısı yoktu | jsonb'a `skills` anahtarı (mevcut anahtarlar aynı; arayüz kendi sayımını kullanır) |
| 7 | Yanıt çubuğunda (`describeReplied`) Skill ve Space paylaşım mesajı ham "başlık + URL" bloğu gösteriyordu | `reply-quote.tsx`: beş paylaşım bloğu ayrıştırıcısı tek zincirde; UI senaryosu `run-shared-cards` 4d |
| 8 | Telegram `EN_PREFIXES`: Skill yorumu İngilizce kullanıcıya Türkçe gidiyordu | "Skill'ine yorum yaptı" → "commented on your Skill". NOT: Telegram yalnız `comment/comment_reply/request_response/quote/edit_suggestion_received/prompt_result_shared` türlerini iletir (`_telegram_pending`); Skill yayın/sürüm bildirimleri `system` olduğu için gitmez, bu yüzden yalnız yorum cümlesi eklendi. Edge `telegram` işlevi için vendored kopya yenilendi |
| 9 | `sitemap.ts`'te `skills` listesi yoktu | `SKILLS_MENU_ENABLED` açıkken `skills` yolu eklenir (menüde olmayan sayfa haritaya girmez) |

## Testler
- Yeni SQL: `skills-integrity-followups` (11 kontrol), `skill-social-signals` (12), `admin-skill-visibility` (13 + "hepsi çalıştı" koruması). Her biri düzeltme olmadan KIRMIZI, düzeltmeyle yeşil görüldü.
- Birim: `collection-permissions` (+1), `telegram` (+1 iddia); `npm test` 1237/1237.
- Ağ taklitli UI: `run-shared-cards` 12/12 (yeni 4d), `run-skills-social` 41/41, `run-collab-collections` 20/20, `run-skills-package` 33/33.
- `tsc` temiz, `lint` 0 hata, `build` temiz.

## Bilerek yapılmayan / not
- `admin_users`'a ayrı "Skill" sütunu eklenmedi (yıkıcı `drop` gerekirdi); türetilen sayı kullanıldı. Kullanıcı kararı: toplamlara kat.
- `admin_user_activity` yorum/beğeni kollarında topluluk gönderisi, Space ve alıntı hedefleri hâlâ "result" etiketlenir (Skill kapsamı dışı, eskiden beri).
- Skill etiketleri `trending_tags` / etiket dizinine girmez ve haftalık özet (`dispatch_my_weekly_digest`) Skill'i içermez: doğrulanmadı, ürün kararı.
- Telegram `telegram` Edge Function'ının yeniden deploy'u ELLE yapılır (CI deploy etmez).
- Gerçek Supabase / cihaz DENENMEDİ; canlıya migration'lar birleştirme sonrası deploy hattıyla uygulanır.
