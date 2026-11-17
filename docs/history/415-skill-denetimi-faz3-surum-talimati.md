# 415 — Skill denetimi, Faz 3: yayınlanan talimat değişmez

Kaynak: 2026-11-16 Skill üretim öncesi teknik denetimi (Faz 1 `413-*`, Faz 2 `414-*`). Migration `20261205100000_skill_version_instructions.sql` (yalnız ekleyici).

## Bulgu
"Değişmez sürüm" yalnız ZIP içindi. Detay sayfası, açık API (`GET /v1/skills/{id}`) ve MCP `get_skill` çalışma kopyasını (`skills.instructions`, sahibe her an yazılabilir) ve `skills.version` etiketini sunuyordu. Yerelde doğrulandı: 1.0.0 paketi
commit edildikten sonra sahip talimatı "SESSİZCE DEĞİŞTİRİLDİ" yaptı ve sürümü 7.7.7 yazdı — yeni sürüm, bildirim ya da changelog oluşmadı. Ajanlara giden talimat için "rug-pull" / prompt-injection kanalı (Faz 2 sürüm etiketini zaten kilitledi).

## Düzeltme (Seçenek A: yayın anında anlık görüntü)
- `skill_versions.instructions` (nullable, ≤60 000 karakter): `skill_publish_commit` (aynı imza, yeniden tanımlandı) yayın anında KİLİTLİ Skill satırındaki talimatı sürüme yazar. Sütun `skill_versions_immutable` kapsamındadır (yazıldıktan sonra tablo sahibi bile değiştiremez).
- **Okuyucu yayınlanan metni görür:** detay sayfası, "SKILL.md indir/kopyala", `promptly.skills`/metadata dışa aktarma ve sürüm etiketi yayınlanan sürümden gelir (`skill-detail-view.tsx` `shown`); sahip kendi çalışma kopyasını görür ve fark varsa "yayınlanmamış değişiklik" bandı çıkar (`data-skill-pending-changes`).
- **Açık API/MCP:** `instructions` = son (ya da istenen) sürümün anlık görüntüsü, `instructionsSource` (`published` | `working_copy`), `hasUnpublishedChanges`, `version` = yayınlanan sürüm; yeni `?version=` (MCP `get_skill.version`) sabitlenmiş sürümü okur (`pinned` okuma hiç bekleyen değişiklik iddia etmez).
- Sabitleyenlere bildirim EKLENMEDİ: okuyucu zaten yalnız yayınlanan metni gördüğü için çalışma kopyasındaki değişiklik onlara ulaşmaz.

## Geriye uyum / sınırlar
- Bu migration'dan ÖNCEKİ sürümlerde sütun NULL: okuyucu çalışma kopyasını görür ve `instructionsSource: "working_copy"` yazılır; bir sonraki yayınla anlık görüntü başlar. Eski sürümlerin metni yalnız ZIP'tedir (geriye dönük doldurulmadı: yayın anı bilinmiyor, bugünkü metni "o günkü" diye damgalamak yanlış olurdu).
- Anlık görüntü `commit` anındaki metindir; Edge'in `begin` ile `commit` arasındaki birkaç saniyede sahip metni düzenlerse ZIP'teki SKILL.md ile sürüm metni farklı olabilir (yalnız sahibin kendi eylemi; güvenlik etkisi yok).
- Başlık/özet de çalışma kopyasıdır ve anlık görüntüye alınmadı (talimat metni risk taşıyan alandır).

## Testler
- `supabase/tests/skills-version-snapshot.sql` 12/12 (anlık görüntü yazılır, sonradan değişmez, okuma kuralları, eski NULL satır, uzunluk CHECK'i).
- `public-skills.test.ts` (+3: yayınlanan metin/sürüm, sürüm sabitleme, anlık görüntüsüz geri düşüş), `run-skills-package` senaryo 30 (okuyucu yayınlanan metni görür, sahip bandı görür), `smoke-test` yeni sütunu denetler.
- Edge `api`/`mcp` kopyaları `sync-function-shared` ile eşitlendi; **ikisi (ve `skill-package`) elle yeniden deploy edilmeli**, `promptly-mcp` `get_skill.version` için yeni sürümle yayınlanmalı.
