# 9.478 — Akış gönderisi ve yatay satır: mockup'tan kalan farklar

`477-*` A (akış gönderisi) ve D (yatay satır) yönlerini uyguladı; mockup'la farklı kalan dört yer bu iş ile kapatıldı. Veritabanı/Edge/migration değişikliği yok.

- **Kapaklar**: seçici satırlarında ayar paketi (`presets.cover_url`) ve Skill (`skills.cover_path`) artık tür simgesi yerine kapağını gösterir. Skill kapağı `skill-files` imzalı adresiyle (`ContentThumb skillCover` → `SkillCoverImage`); `fetchAttachmentCards` Skill için `skillCoverPath` döndürür; ekip/koleksiyon seçicisi (`ContentPickerDialog`) ve Space panosu seçicisi aynı alanları kullanır.
- **Topluluk rozetleri kicker satırında**: alıntı/başvuru ("Alıntı"), "Sabit" ve yeni `CommunityOnlyBadge` ("Topluluğa özel", `community_id` dolu prompt/istek/workflow/ayar paketi) tür etiketinin yanında çizilir; görselin sağ alt köşesi yalnız Taslak / Açık·Kapandı / Sadece ben rozetlerine kaldı.
- **İçeriklerim sayaçları**: `own` satırda sosyal sayaçların (beğeni · yorum · kaydet) yerine kullanım sayaçları görünür — `ownMetrics` + `RowMetrics` (`data-row-metrics`): prompt kopyalama + kaydedilme, istek yanıt + yorum, workflow / ayar paketi / Skill beğeni + kaydedilme.
- **Keşfet şeritleri**: metin/ses/video, workflow + açık istek ve Skill bölümleri ızgara yerine yatay `ScrollRow` (232 px kart, `data-discover-strip`); `CompactCards` bağlamı altındaki `ContentCardTitle` özeti çizmez, böylece dar kart görsel + başlık boyunda kalır. "Popüler" bölümü haftanın promptu + numaralı sıralı liste olarak kalır (`477-*`).

Yeni çeviri anahtarları: `card.row.communityOnly`, `card.row.copies|saves|likes|comments|replies` (TR + EN). Gerçek Supabase'e / cihaza KARŞI DENENMEDİ.
