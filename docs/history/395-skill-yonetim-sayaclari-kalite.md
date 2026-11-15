# 395 — Skill: moderatör sayaçları + kalite göstergeleri

**Durum:** uygulandı (kodlandı, yerel PostgreSQL + ağ taklitli testle sınandı; gerçek Supabase/cihaz DENENMEDİ).

## Moderatör Skill sayıları
`admin_site_stats` (çok sürümlü, büyük jsonb işlevi) DEĞİŞTİRİLMEDİ; yerine yalnızca ekleyici `admin_skill_stats()` (SECURITY DEFINER, `_admin_guard`, anon kapalı):
toplam/yayında/taslak/özel, paketli, sürüm, alıntı, kullanım, açık Skill şikâyeti. Moderasyon → Site istatistikleri'nde "Skill'ler" kutusu; RPC yoksa/yüklenemezse
kutu hiç çizilmez (genel istatistik etkilenmez). Migration `20261201110000_admin_skill_stats.sql`; SQL testi `skills-admin-stats.sql` (3 kontrol); `smoke-test.mjs` ziyaretçiye kapalılığı denetler.

## Kalite göstergeleri
Saf `lib/skills/quality.ts`: 7 açık ölçüt (özet ≥ 40 karakter, talimat ≥ 300, ≥ 2 başlık [kod bloğu içindekiler sayılmaz], uzmanlık alanı, uyumlu araç, lisans [özel hariç], yayınlanmış paket).
Detayda `SkillQualitySection`: "x / 7 ölçüt tamam" + onay listesi. **Bir puan ya da güvenlik onayı DEĞİLDİR** (metin bunu söyler); sunucuya yazılmaz, detayda zaten görünen veriden hesaplanır.

## Yapılmadı
Otomatik güvenlik taraması (betik içeriği taraması `package-validate` çekirdeğine + Edge deploy'a + manifest alanına dokunur; neyin "zararlı" sayılacağı ürün kararı), Skill paketlerini birbirine bağlama,
kullanım değerlendirmesi (araç + sürüm etiketli yorum), İlişki Haritası'nda Skill, mesajla/hikâyeyle paylaşım (sohbet modülünde 8 dokunma noktası), `promptly.skills` dışa/içe aktarma zarfı.
