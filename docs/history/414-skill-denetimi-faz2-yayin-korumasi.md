# 414 — Skill denetimi, Faz 2: yayın koruması (veritabanı)

Kaynak: 2026-11-16 Skill üretim öncesi teknik denetimi (Faz 1: `413-*`). Migration `20261204100000_skill_publish_guard.sql` (yalnız ekleyici).

## Bulgu
`skills` üzerinde sahibe açık UPDATE/INSERT vardı ve `status`/`version` için koruma yoktu. Sahip doğrudan `status='published'` + `version='99.0.0'` yazarak Edge `skill-package` doğrulamasını (gizli anahtar taraması, bütünlük)
atlayabiliyor, yayınlanmış sürümü olan Skill'in sürüm numarasını değiştirebiliyordu (yerelde ve canlı tetikleyici listesinde doğrulandı). `CLAUDE.md`/`389-*` "yayında olmayı yalnız Edge commit'i verir" diyordu; veritabanı bunu zorlamıyordu.
Ayrıca `skill-files` bucket'ında `allowed_mime_types` yoktu (diğer medya bucket'larında var): sahip `text/html` dahil herhangi bir `Content-Type` ile dosya/kapak yükleyebiliyordu.

## Düzeltme
`skills_publish_guard` (BEFORE INSERT/UPDATE, SECURITY INVOKER; yalnız `anon`/`authenticated` — `protect_counter_columns` kalıbı; `skill_publish_commit` DEFINER'dır, moderatör RPC'leri ve service_role etkilenmez):
1. Sürümü OLAN Skill'in `version`'ı istemciden değişmez (`skill_publish_via_edge`); aynı değer no-op.
2. Dosyası olup HİÇ sürümü olmayan Skill taslaktan "yayında"ya istemciden geçemez (`skill_publish_via_edge`). Dosyasız (kolay mod) Skill'in doğrudan yayını ve sürüm etiketi AYNEN çalışır; sürümlü Skill'i kapatıp açmak serbest.
3. Yayında olan Skill'in başlık/özet/talimatı özel anahtar bloğu ya da JWT içeremez (`skill_secret_found`) — Edge'in engelleyen iki kuralıyla aynı; sağlayıcı anahtarları yalnız uyarıdır. Kontrol yalnız yeni/değişen metinde ve "yayında" sonucunda çalışır (taslak anahtar tutabilir).
4. `skill-files` bucket'ı yalnız Skill türlerini kabul eder: `text/markdown, text/plain, text/csv, text/yaml, application/json, application/pdf, image/jpeg|png|webp, application/zip` (betikler istemcide `text/plain`; kapak `image/jpeg`; Edge paketi `application/zip`).

İstemci: `skill_publish_via_edge` / `skill_secret_found` kodları `server-errors.ts` + `SKILL_ERROR_CODES` + `error.skillPublishViaEdge|skillSecretFound` (TR+EN) ile çevrilir.

## Testler
- `supabase/tests/skills-publish-guard.sql` (23 kontrol, hepsi geçer; migration OLMADAN 10'u düşer = test duyarlı).
- Yerel PostgreSQL'de tüm Skill SQL dosyaları (16) etkilenmedi; birim testler yeşil.
- Canlıya karşı yalnız salt-okunur kontrol: 8 Skill, 5 yayında, özel anahtar/JWT içeren yok → tetikleyici mevcut satırı bozmaz.

## Sınırlar
- Bucket MIME listesinin gerçek Supabase Storage'da yükleme akışını bozmadığı DENENMEDİ (kapsam: Skill bayrağı kapalı; geri alma = `allowed_mime_types = null`). Storage'ın `Content-Type` parametrelerini (`; charset`) nasıl karşılaştırdığı doğrulanmadı — istemci parametresiz gönderir.
- Dosyalı ama sürümsüz ve ZATEN yayında olan eski satırlar (varsa) olduğu gibi kalır; tetikleyici yalnız yeni geçişleri engeller.
