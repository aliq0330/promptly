### 9.24 Binlerce aday etiket önerisi — yalnızca öneri, kabul edilince gerçek

Kullanıcının Bölüm 9.23'ün canlı etiket sistemini denedikten sonra sorduğu
"sisteme binlerce etiket önerisi ekleyelim, ama yalnızca öneride gözüksün,
biri gerçekten eklenirse canlı bir etiket olsun" isteği üzerine — Bölüm
9.23'ün kendi §13/§19 ilkesini ("yeni bir etiket adı asla serbest metinden
icat edilmedi, yalnızca AI olmadığı için") hiç bozmadan genişleten bir
katman eklendi: kullanıcının bizzat hazırlayıp verdiği, 27 kategori ve 3.410
ham terimden oluşan gerçek bir taksonomi, **tamamen istemci tarafında**
yaşayan, gerçek `tags` tablosuna asla önceden yazılmayan bir "aday etiket
sözlüğü" hâline getirildi. Bu sözlükten bir eşleşme HER ZAMAN yalnızca
`suggested` katmanında gösteriliyor (asla `automatic`), ve bir aday yalnızca
kullanıcı onu gerçekten kabul ettiği anda (mevcut `get_or_create_tag` RPC'si
üzerinden) gerçek, kalıcı bir veritabanı satırına dönüşüyor — Bölüm 9.23'ün
"sistem asla kendi başına gerçekten yeni bir etiket icat etmez" ilkesi
burada da korundu, yalnızca ADAY OLARAK gösterilebilecek terim havuzu
devasa büyütüldü.

**Yeni dosya — `src/lib/tag-candidates.ts`:** Kullanıcının verdiği ham
taksonomi (bir build-script'iyle, `scratchpad/build-candidates.mjs` — bu
depoya dahil değil, tek seferlik bir üretim aracı), Bölüm 9.23'ün
`normalizeTagLabel()`'iyle BİREBİR AYNI algoritmayla (büyük/küçük harf +
Türkçe transliterasyon duyarsız) tekilleştirilip, ilk-görülen yazımı
görüntü etiketi olarak koruyarak, VE zaten gerçek olan (20 seed + Bölüm
9.23'ün `SYNONYM_RULES`'ının önceden öngördüğü) katalog slug'larını hariç
tutarak **3.277 benzersiz aday etiket etiketine** indirgendi (3.410 ham
terimden — kategoriler içi/arası ağır yinelenme, ör. "3D Render",
"Storytelling", "Supabase" birden fazla kategoride tekrar ediyordu).
`CANDIDATE_TAG_LABELS: string[]` olarak export ediliyor — düz bir statik
dizi, hiçbir network isteği/migration gerektirmiyor.

**Yeni eşleştirme fonksiyonu — `matchCandidateSuggestions()`
(`tag-catalog-matcher.ts`):** `analyzeContent()`'ten (Bölüm 9.23'ün gerçek-
katalog eşleştiricisi) BİLİNÇLİ OLARAK ayrı tutulan ikinci bir fonksiyon —
aynı dosyada yaşıyor (paralel bir modül değil, aynı `normalizeTextForMatching`/
`hasWholeWordMatch` yardımcılarını paylaşıyor) ama farklı bir sözleşmesi var:
yalnızca tam kelime/öbek eşleşmesi (agglutinative-suffix önek eşleşmesi YOK —
~3.000 aday girişle bu çok fazla gürültü üretirdi), gerçek katalogda ZATEN
var olan bir slug'ı asla önermiyor (`realCatalogSlugs` parametresi — katalog
büyüdükçe dinamik olarak güncel kalıyor, üretim script'inin sabit hariç
tutma listesinden farklı olarak çalışma zamanında gerçek), zaten kabul
edilmiş/reddedilmiş bir slug'ı da atlıyor (`excludeSlugs`), ve en uzun/en
özgül öbek eşleşmelerini öne alıp en fazla 6 sonuçla sınırlıyor (rastgele
kısa kelime eşleşmelerinin gürültüsünü azaltmak için). Her sonuç
`isCandidate: true` ile işaretleniyor — bu tek alan, aşağıdaki tüm "henüz
gerçek değil" davranışının anahtarı.

**`useTagPicker` genişletildi, yeniden yazılmadı:** `suggested: Tag[]` artık
`suggested: SuggestedTagEntry[]` (`Tag & { isCandidate?: boolean }`) —
gerçek-katalog önerileriyle aday önerileri AYNI listede, aynı dismiss/kabul
mekanizmasıyla yaşıyor (Bölüm 9.23'ün "aynı slug bir daha asla sessizce geri
gelmesin" `dismissedSlugs` kuralı adaylar için de otomatik olarak geçerli —
ayrı bir mekanizma icat edilmedi). Debounce'lu analiz adımı artık
`matchCandidateSuggestions`'ı da çağırıp sonucu aynı havuza ekliyor.
`acceptSuggested` artık `Promise<void>` döndürüyor: gerçek bir katalog
önerisini kabul etmek hâlâ anlık/senkron (ağ isteği yok); bir ADAYI kabul
etmek önce `getOrCreateTag(tag.label)`'i çağırıp (varsa) gerçek satırı
oluşturuyor/buluyor, ve yalnızca bu GERÇEKTEN başarılı olursa dönen gerçek
`Tag`'i (kendi gerçek slug'ıyla) `accepted`'e `source: "manual"` olarak
ekliyor — asla iyimser/önceden eklenmiyor. Yeni `acceptingSlug`/`acceptError`
alanları, tam olarak manuel "+ … etiketini oluştur" akışının
`isCreating`/`createError` desenini bir kez daha (kopyalamadan, aynı hook
içinde) uyguluyor.

**`TagPicker` UI:** Aday öneri butonunun `title` özniteliği ("Henüz gerçek
bir etiket değil — seçersen gerçek, kalıcı bir etiket olarak oluşturulur.")
dürüstçe açıklıyor; kabul sırasında buton devre dışı kalıp "Oluşturuluyor…"
gösteriyor; başarısızlıkta manuel akışla aynı stil bir hata satırı
görünüyor. Bir aday gerçekten kabul edilince (yalnızca o durumda, gerçek bir
katalog önerisi için gereksiz bir ağ isteğine girmeden) paylaşılan
`useTagCatalog()` önbelleği `refresh()` ile tazeleniyor — Bölüm 9.23'ün
manuel oluşturma akışıyla birebir aynı, var olan mekanizma.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (21 rota, değişmedi) sıfır hatayla geçti. Saf mantık birim testi
(`node --experimental-strip-types`, gerçek kaynak dosyalarına karşı) 12
senaryoyu doğruladı: sözlüğün gerçekten binlerce (3.277) ve yinelenmesiz
olduğu; zaten gerçek olan bir seed etiketin (`Portre`, `3D Render`) sözlükte
HİÇ bulunmadığı; bir aday öbeğin (`Apple Maps`, `Product Photography`) doğru
eşleştiği ve `isCandidate:true` taşıdığı; gerçek katalogdaki bir slug'ın
(`kodlama`) asla aday olarak önerilmediği; `excludeSlugs`'ın uygulandığı;
boş metnin sıfır sonuç ürettiği; ilgisiz bir metnin sonuç sayısının sınırlı
kaldığı; ve `analyzeContent`'in (gerçek-katalog-yalnızca fonksiyonun) bir
aday eşleşmesini KENDİ sonucuna hiç sızdırmadığı. Ağ seviyesinde taklit
edilmiş Supabase REST/RPC yanıtlarıyla Playwright'ta (statik export
`npx serve` ile) uçtan uca doğrulandı: gerçek-katalog otomatik etiketiyle
(AI Sanat/Portre) aday önerisinin (Apple Maps) AYNI ANDA, doğru katmanlarda
göründüğü; adayın kabul edilmesinin gerçek bir `get_or_create_tag` RPC
çağrısı (doğru `p_label` gövdesiyle) tetiklediği; kabul sonrası "Apple
Maps"in gerçek, MANUEL (Otomatik değil) bir kabul edilmiş chip olarak
göründüğü ve öneri satırından kaybolduğu — sıfır JS hatasıyla. Ayrıca Bölüm
9.23'ün kendi 30 senaryolu regresyon paketi (canlı analiz, otomatik/manuel
ayrımı, dismiss kalıcılığı, `/tags` keşif sayfası, arama entegrasyonu, tam
Supabase-erişilemez dayanıklılık taraması) ve gerçek 20-seed-katalog
doğrulama paketi (5 senaryo) sıfır regresyonla yeniden çalıştırıldı.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **Aday sözlüğü herhangi bir migration/DB değişikliği gerektirmedi** —
  tamamen mevcut `get_or_create_tag` RPC'sini (Bölüm 9.23) yeniden
  kullanıyor; yeni bir tablo/sütun/RPC eklenmedi.
- **Agglutinative-suffix (önek) eşleştirmesi adaylar için bilinçli olarak
  eklenmedi** (yukarıda gerekçesiyle açıklandı) — yalnızca tam kelime/öbek
  eşleşmesi, ~3.000 girişlik bir sözlükte gürültüyü kontrol altında tutmak
  için.
- **Sözlük statik/derleme-zamanlı** — kullanıcı yeni bir taksonomi verirse
  `scratchpad/build-candidates.mjs` benzeri bir script yeniden çalıştırılıp
  `tag-candidates.ts` yeniden üretilmeli; canlı, kullanıcı tarafından
  düzenlenebilir bir "aday öner" yönetim ekranı bu görevde istenmedi,
  eklenmedi.

**Bilinen sınırlamalar:**
- **Gerçek bir Supabase projesine karşı canlı doğrulama yapılamadı** (bu
  sandbox'ın `*.supabase.co` erişimini engelleyen ağ politikası, Bölüm
  17'den beri tekrarlanan aynı sınırlama) — bu görev hiçbir yeni migration
  içermediğinden (yalnızca frontend), kullanıcının Dashboard'da yapması
  gereken ekstra bir adım yok; yalnızca canlı sitede bizzat denemesi
  gerekiyor.
- **3.277 girişlik listede tam bir kalite/duplikasyon denetimi elle
  yapılmadı** — yalnızca programatik normalize-tabanlı tekilleştirme
  uygulandı (ör. "AI Video" ve "AI video üretimi" gibi anlamca örtüşen ama
  farklı normalize eden iki ayrı giriş, ikisi de sözlükte ayrı ayrı
  kalabilir) — kullanıcının kendi verdiği ham taksonominin doğal bir
  sonucu, bu görevin kapsamında elle kürasyon yapılmadı.
- **Aday eşleştirme yalnızca prompt/istek OLUŞTURMA formlarında çalışıyor**
  (`TagPicker`'ın kullanıldığı her yer — Bölüm 9.23 zaten hem
  `CreatePromptForm` hem `CreateRequestForm`'u aynı bileşene bağlamıştı,
  bu görev o paylaşımı bozmadı) — ayrı bir yüzey eklenmedi.

---
