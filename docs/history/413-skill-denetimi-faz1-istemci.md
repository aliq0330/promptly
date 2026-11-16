# 413 — Skill denetimi, Faz 1: istemci ve tarama düzeltmeleri

Kaynak: 2026-11-16 Skill üretim öncesi teknik denetimi (4 fazlı düzeltme planı). Bu fazda **veritabanı değişikliği yok**.

## Bulgular ve düzeltmeler

1. **Markdown başlık regex'i kübik zamanlıydı (P1).** `HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/` ve `FENCE` (`\s*([…]*)\s*$`) uzun tek satırlarda geri izlemeyle büyüyordu:
   `"# a" + 4000 boşluk + "x"` ≈ 25 sn, 8000'de dakikalar (talimat 60 000 karaktere kadar, `MARKDOWN_MAX_CHARS` 200 000). Herkese açık bir Skill'i açan okuyucunun sekmesi donuyordu.
   Şimdi: `HEADING = /^(#{1,6})\s+([\s\S]*)$/`, sondaki `#`/boşluklar `stripClosingHashes` (döngü) ile kırpılır; `FENCE` belirsiz `\s*…\s*` çifti yerine isteğe bağlı dil grubu kullanır.
2. **Betik/gizli anahtar taraması ikinci–üçüncü dereceden büyüyordu (P2).** `scanScriptRisks` 5 MB'a kadar betiği Edge `skill-package` içinde de tarar. `rm -rrr…` (üçüncü derece), `curl x curl x …` tek satırı (`[^\n|]*`, ikinci derece),
   `Remove-Item…-Recurse`, `subprocess.x(…shell=True` ve JWT (`eyJ-eyJ-…`) kalıpları yeniden yazıldı: `|` parçaları, `rm` bayrak grubu + kodla `r` denetimi, satır bazlı `Remove-Item`/`-Recurse`, çağrı başına ilk 300 karakter,
   JWT için ardışık "koşu" taraması (`containsJwt`). Anlam aynıdır (hit/miss testleri), yalnız doğrusal zamanlıdır. 1 MB'lık düşmanca girdiler ms'de biter.
3. **Kurulum komutu çift klasör üretiyordu (P1).** Yayın ZIP'i içinde zaten `<slug>/` kökü var (`createPackageZip`); komut `unzip -d <dizin>/<slug>` dediği için sonuç `<dizin>/<slug>/<slug>/SKILL.md` oluyordu.
   Şimdi komut `mkdir -p <dizin> && unzip -o <zip> -d <dizin>` (Claude Code, Codex, Cursor). ZIP'siz Skill'de `mv SKILL.md <dizin>/<slug>/SKILL.md` aynı kaldı.

## Testler

- `scan-perf.test.ts`: 10 Markdown + 8 betik + 4 gizli anahtar düşmanca girdisi (zaman sınırı) + yeniden yazılan kuralların anlam testleri.
- `adapters/install-layout.test.ts`: komut + GERÇEK yayın ZIP'i birlikte (çift klasör yok); `unzip` kuruluysa komutu geçici `HOME`'da gerçekten çalıştırır.
- Edge kopyası (`supabase/functions/_shared/skills/…/package-validate.ts`) `node scripts/sync-function-shared.mjs` ile eşitlendi.

## Canlıya çıkış

- Site derlemesi merge ile gider. **Edge `skill-package` elle yeniden deploy edilmeli** (`package-validate.ts` değişti): Actions → Deploy Edge Functions → `skill-package`.
- Claude Code / Codex / Cursor'un çıkarılan klasör düzenini nasıl bulduğu gerçek araçlarda DENENMEDİ (yalnız `unzip` çıktısı doğrulandı).
