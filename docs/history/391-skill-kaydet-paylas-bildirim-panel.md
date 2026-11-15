# 391 — Skill: Kaydet/koleksiyon, Paylaş, bildirimler, Yaratıcı paneli, İçeriklerim (Aşama 3'ün kalanı)

Kullanıcı "kalan aşamaların hepsini tamamla ve merge et" dedi; iş üç PR'a bölündü (A: bu not, B: keşif/arama, C: dağıtım + açılış + Aşama 6).
Bu PR `390-*`'daki sosyal katmanı tamamlar. Plan: `docs/skill-plani.md`, liste: `docs/yapilacaklar.md`.

## Veritabanı (iki ekleyici migration)
- **`20261129100000_skill_save_collections.sql`** (`-- ci:allow-destructive` yalnız `collection_items_exactly_one_target` CHECK'inin beşinci sütunu kapsayacak
  biçimde yeniden kurulması için; veri silinmez): `collection_items.skill_id` (FK CASCADE, koleksiyon başına tekil dizin). Kayıt modeli DEĞİŞMEDİ (336/386):
  kaydedildi = sahibin sistem koleksiyonunda satır, ortak koleksiyona eklenen içerik hem ekleyenin hem sahibin sistem koleksiyonuna yazılır
  (`collection_items_saved_all_before_insert` Skill sütununu da taşır). `skills.save_count` sahip başına BİR sayılır (preset kalıbı: üç SECURITY DEFINER
  tetikleyici, EXECUTE kapalı). `unsave_content('skill', …)`, `_quote_content_info('skill')` (yayında + herkese açık = ortak koleksiyona girebilir),
  `collection_unshareable_items`/`set_collection_shared` Skill'i bilir, `content_engagers(…,'saves')` Skill için artık dolu.
  **Yeni koruma** `enforce_skill_save` (BEFORE INSERT, SECURITY INVOKER): okuyamadığın (taslak/özel/engelli) Skill kaydedilemez (`skill_not_found`) —
  FK kontrolü RLS'i atladığı için aksi hâlde başkasının taslağının kayıt sayacı şişirilebilirdi.
- **`20261129110000_skill_notifications_insights.sql`**: `notify_skill_published` (yayın → takipçilere; tek `insert … select`, ≤20 000, engelli çift atlanır,
  `dedupe_key` ile yeniden yayında tekrar etmez) ve `notify_skill_version` (yeni sürüm → o Skill'i sabitleyenlere). Tür mevcut `system`, yeni tür açılmadı.
  `creator_insights_skills(p_days)` (yalnız `authenticated`; kapsam `author_id = auth.uid()`; Skill başına kullanım/tepki/yorum/kaydedilme + önceki dönem;
  kendi etkileşimin sayılmaz).
- **SQL testi** `supabase/tests/skills-save.sql` (28 kontrol): kaydet/sayaç/koleksiyon/çıkarma/`unsave_content`, okunamayan Skill'in kaydedilememesi,
  ortak koleksiyon kuralı, silme, CHECK, bildirimler (taslak yayınlamaz, tekrar etmez, sabitleyen alır), panel sayıları ve sahiplik.

## İstemci
- `SaveableContentType` + `saveTargetColumn` "skill"; `CollectionEntry` `{ type: "skill" }`; koleksiyon/Kaydedilenler listeleri `skills ( … )` gömmesini okur;
  `SaveButton`/`useSaveState`/`SaveToCollectionModal` `skillId`; `SkillCard` altbilgisinde Beğeni · Yorum · Kaydet, koleksiyon sayfasında ⋮ "Koleksiyondan kaldır";
  detayda Kaydet + Paylaş; İstatistik'te "Kaydedenler" sekmesi.
- **Paylaş**: `ShareModalTarget` `{ contentType: "skill" }` (rozet "Skill · vX", bağlantı Skill'in kendi sayfası, "Kendin için" = koleksiyona kaydet).
  Mesajla paylaşım, hikâye ve alıntı bu dilimde YOK (`messages`'ta Skill kolonu yok; bağlantıyı mesaja yapıştırmak çalışır).
- **Yaratıcı paneli** (`/insights`): "Skill'ler" bölümü (`InsightSkillsSection`), yalnız yayınlanmış Skill'i olan yazarda; prompt etkinliği olmasa da çizilir.
- **İçeriklerim**: "Skill'ler" türü (bayrak arkasında); taslak ve özel Skill'ler de burada listelenir (süzgeç/sıralama/arama sunucuda).
- Bildirim kalıpları (`notifMsg.skillPublished`, `notifMsg.skillVersion`) TR+EN.

## Test
`skills-save` + etkilenen SQL testleri yerel PostgreSQL'de; birim 1165; ağ taklitli `run-skills-social` 14/14 (yeni: Kaydet, kart düğmesi, panel bölümü).
**Gerçek Supabase / Realtime / cihaz DENENMEDİ.**

## Bilinçli sınırlar
`profile_content_stats` Skill sayısını taşımaz (profil menüsü ve İçeriklerim sayıyı `skills` üzerindeki `head` sayımından alır — dönüş imzasını değiştirmek yıkıcı olurdu);
`admin_*` sayaçları Skill'i bilmez (moderatör Skill'i şikâyet kuyruğundan görür); mesajla paylaşım, hikâye ve alıntılama yok; Skill kaydedilince Odak/Sana özel sinyali yok.
