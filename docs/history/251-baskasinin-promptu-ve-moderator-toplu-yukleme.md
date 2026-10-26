# 251 — Başkasının promptunu indirme + moderatör toplu prompt yükleme

**Durum:** uygulandı, **canlıya UYGULANMADI**. Migration `20260927110000_admin_import_prompts.sql` repoda (`250`'nin `20260927100000_import_prompts.sql`'inden SONRA); `main`'e birleşince `deploy.yml` uygular. Yerel PostgreSQL'de sınandı (`supabase/tests/admin-import-prompts.sql` 19 kontrol, iki koruma sökülünce kırmızıya döndü; `import-prompts.sql` 29/29 ve `safety-hardening.sql` 29/29 bozulmadı), arayüz ağ taklitli Playwright'ta (`run-exchange` 18/18; menüyü kullanan 8 eski paket bozulmadı), çekirdek birim testle (`exchange` 21 + `bulk` 5). **Gerçek veriyle yerel doğrulama:** gerçek `PROMPTS.md` (8,8 MB) → gerçek ayrıştırıcı → gerçek RPC → 3019 kayıttan 3012'si eklendi (7'si birebir yinelenen), 61 parça 2,2 sn, en yavaş parça 74 ms; ikinci çalıştırmada 0 yeni kayıt. **Gerçek Supabase'e / oturuma / telefona karşı DENENMEDİ.**

## 1. Başkasının promptu da indirilir
`PostMenu`'deki "Dışa aktar" artık okuyabildiğin HER prompt için (kart ⋮ + detay bandı ⋮); yalnız topluluğa özgü içerik, istek/sonuç/workflow/hazır ayar hariç. Erişimi RLS belirler: başkasının özel/taslak promptuna ulaşılamaz. Başkasınınkinde dosyaya `source` girer: `credit` = `@kullanici · Promptly`, `url` = paylaşım adresi (`/share/prompt/<id>/`); yazarın kimliği (uuid) dosyada yoktur. Pencerede uyarı notu görünür.
- **Atıf biçimde yaşar:** JSON `source: {credit, url}`, Markdown `sourceCredit`/`sourceUrl`, CSV `source_credit`/`source_url`. Yalnız bilgidir; http(s) olmayan adres ve kontrol karakteri atılır.
- **İçe aktarırken** `withSourceNote`: kaynak varsa açıklamanın sonuna tek `Kaynak: <atıf> <adres>` satırı yazılır (mevcut `source-notes.ts` bunu detay sayfasında kaynak notu + bağlantı olarak gösterir). Açıklamada zaten `Kaynak:/Source:` satırı varsa tekrarlanmaz (idempotent); 5000 karakter sınırı aşılırsa açıklama kısaltılır. RPC'ye ayrı `source` alanı gitmez.
- Kullanım Koşulları'nda yeniden kullanım/indirme ifadesi YOK (yalnız "paylaşma hakkın olan içeriği yükle"); bu bir hukuki karar: `docs/yapilacaklar.md` Ö4.

## 2. Moderatör toplu yükleme
Moderasyon sayfasında "Toplu prompt yükleme" kartı (`features/moderation/bulk-import-card.tsx`).
- **Kaynak:** dosya (`.md/.json/.csv`) ya da yalnız `https://raw.githubusercontent.com/` adresi (varsayılan: prompts.chat `PROMPTS.md`; tarayıcıdan getirilir). Dosya en çok 25 MB. Tür otomatik: prompts.chat biçimi algılanır, yoksa dosya uzantısı.
- **Adet sınırı yok.** İstemci listeyi 50'şerli parçalarla `admin_import_prompts`'a gönderir (`lib/exchange/bulk.ts` `runBatches`, saf + testli); sunucu çağrı başına en çok 100 alır. "Kontrol et" hiçbir şey yazmaz; "Yükle" yazar; "Durdur" parçalar arasında durdurur. Yarıda kalan yükleme (ağ/yetki/durdurma) aynı dosyayla tekrar çalıştırılınca yinelenenleri atlayıp devam eder; arayüz "kaldığı yer"i söyler.
- **Varsayılan: moderatörün kendi ÖZEL TASLAĞI.** "Yayınla (herkese açık)" ayrı, uyarılı bir kutudur (düğme "yayınla ve yükle", tehlike renginde). Yazar her zaman `auth.uid()` (moderatörün kendisi): başkası adına içerik oluşturulamaz.
- **Ortak etiket** (varsayılan `prompts.chat`, boş bırakılabilir): sonradan toplu bulmayı kolaylaştırır.
- **SQL (`admin_import_prompts(p_items, p_dry_run, p_publish, p_source)`):** SECURITY DEFINER yalnız `_admin_guard`/`_admin_log` için; doğrulama/yazma kuralları YENİDEN YAZILMADI — mevcut `import_prompts`'u 30'luk parçalarla çağırır (yinelenme, kategori, araç/etiket/değişken kuralları, alan beyaz listesi orada ve testte). Önce HEPSİ kuru çalıştırılır, tek geçersiz kayıt varsa hiçbir şey yazılmaz; sonra tek işlemde yazılır; `p_publish` ise yalnız bu çağrıda oluşan kendi taslakları yayınlanır. Denetim kaydı: `admin_audit_log` `bulk_import_prompts` (istenen/oluşan/yayınlanan sayı, kaynak etiketi).
- **Hız sınırı muafiyeti** (`_rate_limit` aynı imzayla `create or replace`): yalnız `'prompt'` eylemi, yalnız işlem-yerel `promptly.bulk_import` işaretiyle VE çağıran gerçekten moderatörse atlanır. İşaret istemciden kurulsa bile moderatör olmayana işlemez, işlem bitince sıfırlanır (SQL testi: 11, 12, 31). Askı (`enforce_can_post`) ve diğer korumalar aynen geçerlidir.
- Yeni indeks `prompts_author_title_idx (author_id, title)`: yinelenme denetimi büyük kütüphanede hızlı kalsın.

## 3. prompts.chat dosyasının analizi ("sistem uygun mu?")
Evet, küçük bir ayrıştırıcıyla uygun (`lib/exchange/prompts-chat.ts`). Gerçek dosya (8,8 MB, 203 878 satır, **CC0 1.0** — `LICENSE` + `README`'de doğrulandı):
- 3026 kayıt, hepsi `<details><summary><strong>Başlık</strong>` + `## Başlık` + `Contributed by …` + ` ```md … ``` `; 123 kayıtta metnin içinde başka kod blokları var (metin = İLK ` ```md` ile SON ` ``` ` arası).
- 3019 geçerli, 7'si 50 000 karakter sınırını aşıyor (kesilmez, raporlanır); başlık ≤191, hiçbir kayıt boş değil.
- **Kişisel veri:** ~700 kayıtta "katkıcı" alanı gerçek **e-posta adresi**, 621'i anonim → yalnız GitHub kullanıcı adı kuralına uyan adlar yazılır (`@ad`); e-posta benzeri değerler ASLA kopyalanmaz (testli). 1692 kayıt geçerli katkıcı alır, kalanı genel "prompts.chat (CC0)" atfı.
- 163 kayıt SKILL.md biçiminde (`---\nname:`), 806'sı `{…}` içeriyor. Değişken tanımı olmayan prompt detay sayfasında metni harfi harfine gösterdiğinden kod/JSON bozulmaz; yine de `${var}` şablonları (~682) Promptly değişkenine ÇEVRİLMEZ. Tür her zaman `text`, kategori boş.

## Bilinçli sınırlar / açık
`docs/yapilacaklar.md` → "Öncelikli yapılacaklar" (Ö1–Ö11 + eksikler listesi; kullanıcı "hatırlat" dedi). Başlıcaları: toplu yayınla/sil aracı yok; yalnız Prompt; hesap kararı (moderatörün kendi hesabı); Kullanım Koşulları metni; canlıda hiçbir şey denenmedi; düzenlenmiş dosya mevcut promptu güncellemez.
