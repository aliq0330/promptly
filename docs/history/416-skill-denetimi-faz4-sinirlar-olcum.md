# 416 — Skill denetimi, Faz 4: sınırlar, sertleştirme ve ölçüm

Kaynak: Skill üretim öncesi teknik denetimi (Faz 1 `413-*`, Faz 2 `414-*`, Faz 3 `415-*`). Migration `20261206100000_skill_draft_cap_commit_hardening.sql` (yalnız sıkılaştırıcı/ekleyici).

## Yapılanlar
1. **Taslak nesne birikimi (P2):** Storage INSERT politikası yalnız yol kalıbına/sahipliğe bakıyordu; `skill_files` satırı olmayan yüklemeler (kota ve sınır tetikleyicisine hiç uğramaz) süpürücü gelene kadar sınırsız birikebiliyordu. Artık Skill başına en çok **200 taslak / 10 kapak nesnesi**
   (`skill_object_count` SECURITY DEFINER yardımcısı; çağıranın sahibi olmadığı Skill'de 0 döner, sayı/varlık sızmaz). Not: politika kendi tablosunu (`storage.objects`) alt sorguyla sayamaz — "infinite recursion detected in policy"; ilk deneme bu hatayı verdi ve yardımcı fonksiyona geçildi. Tek ifadede çok satır
   ekleyen bir `INSERT` aynı ifadenin içindeki satırları görmeyebilir; gerçek Storage API'si tek satır yazar, sınır kalan paralel yüklemelerde birkaç nesne aşılabilir (kabul).
2. **`skill_publish_commit`:** paket boyutu karşılaştırması Storage kaydında boyut yoksa atlanmıyor (eskiden `coalesce` bildirilen boyutu kabul ediyordu); günlük 10 yayın sınırı yalnız `begin`'de değil commit'te de (paralel yayınlar sınırı aşamasın).
3. **Edge CPU (ölçüm, Node 22):** en kötü paket (8 × 5 MB sıkıştırılabilir metin) ZIP derlemesi seviye 6'da ≈ **2,7 sn** CPU / 4,8 MB, seviye 4 ≈ 1,1 sn, **seviye 1 ≈ 0,66 sn / 7,3 MB** (sınır 10 MB). Sıkıştırılamayan veri 10 MB'ı aşınca zaten `skill_package_too_large` ile temiz reddedilir (449 ms).
   100 küçük dosya (42 MB) doğrulama 0,4 sn, derleme ≈ 3,2 sn (seviye 6). Edge'in istek başına CPU süresi sınırlı olduğundan, açılmış toplamı 4 MB'ı aşan paketler **seviye 1** ile derlenir (`FAST_COMPRESSION_ABOVE_BYTES`; olağan küçük paketler seviye 6'da kalır). Bellek tepe artışı bu yüklerde ≤ ~50 MB (Node RSS).
   **Edge'in gerçek çalışma zamanında ölçülmedi** (sandbox'ta Deno yok, Edge deploy'u tetikleme izni yok); rakamlar Node'dadır, limitler TASLAK kalır.
4. **`parseSkillMd`:** frontmatter kapanışı tam `---` satırıdır (`----`/`---x` bitirmez); boş frontmatter (`---\n---`) düzgün okunur.
5. **ZIP içe aktarma yorumu doğrulandı:** bildirilenden BÜYÜK çıkan kayıt fflate tarafından bildirilen boyuta kesilir (bellek güvenli), küçük çıkan reddedilir; `zip.ts` açıklaması buna göre düzeltildi.

## Bilinçli kabul edilenler (denetim P3)
- `use_count`/"Çalıştı mı?" oyu çok hesapla şişirilebilir (oy için kullanım kaydı + günde 100 sınırı dışında önlem yok): ürün kararı (hesap yaşı/itibar eşiği) gerektirir.
- PDF/görsel içeriği yalnız imza ile doğrulanır; betik risk taraması bilgilendiricidir ve tüketici tarafında engel değildir (betikler bilerek izinli, `script: true` ile işaretli).
- İndirilen paketin `package_sha256`'sı istemcide doğrulanmıyor.

## Testler
- `supabase/tests/skills-draft-cap.sql` (10), `package-zip.test.ts` (3, seviye seçimi + determinizm), `skill-md.test.ts` (+1). Tüm Skill SQL dosyaları (14) temiz DB'de 0 FAIL; `anon-hardening` 15 yeşil.
- Edge `skill-package`'ın **elle yeniden deploy** edilmesi gerekir (`package-zip.ts` değişti).
