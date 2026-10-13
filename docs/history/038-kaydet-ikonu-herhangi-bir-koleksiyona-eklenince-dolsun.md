### 9.38 Kaydet ikonu — herhangi bir koleksiyona eklenince dolsun (sadece Genel değil)

Kullanıcının bildirdiği hata: "hem promptta hem generatorda ikisinde de
kaydete bastığımda varsayılan olan genel koleksiyonuna eklersem kayıt
ikonu filled oluyor ancak başka oluşturduğuma eklersem olmuyor." Kod
okunarak doğrulandı: bu bir yeni regresyon değildi — Bölüm 9.22'nin
BİLİNÇLİ, dokümante edilmiş bir kararının doğal sonucuydu ("kaydedildi"
durumu SADECE `is_default` koleksiyona üyelikten türer, isimden bağımsız
ama diğer koleksiyonlardan tamamen kör). O karar, o zamanki tek-koleksiyon
dünyasında mantıklıydı; ama Bölüm 9.36'nın gerçekten çoklu-koleksiyonlu
kaydetme akışını (hem prompt hem generator için) hayata geçirmesinden
sonra kullanıcı deneyimi olarak yanlış/şaşırtıcı hâle geldi — kullanıcı
bir çalışmayı yalnızca özel bir koleksiyona ekleyip "kaydedilmedi" gibi
görüyordu. Bu, sessizce "düzeltilmedi" — önceki, kullanıcı tarafından
istenmiş bir kararı tersine çevirdiğinden, `AskUserQuestion` ile
netleştirildi ("Kaydet ikonu hangi durumda dolu görünmeli?"); kullanıcı
**"Herhangi bir koleksiyona eklenince dolsun"** seçeneğini seçti — dolu
ikona tıklamanın hâlâ TÜM koleksiyonlardan kaldırdığı (`removeEverywhere`/
kaskad) değişmeden kalacak şekilde.

**Hiçbir migration gerekmedi** — `isPromptSaved`'in sorgusu zaten
`collection_items` üzerinden gerçek üyeliği okuyordu, yalnızca
`.eq("collections.is_default", true)` filtresi kaldırıldı ve `.maybeSingle()`
(birden fazla eşleşen koleksiyon artık mümkün olduğundan hata fırlatırdı)
`.limit(1)` + uzunluk kontrolüne çevrildi (`src/lib/supabase/collections.ts`).

**`SaveToCollectionModal`'ın `handleToggle`'ı artık her satırda
(varsayılan VEYA özel) simetrik davranıyor** — önceden yalnızca varsayılan
satırın işareti kaldırılınca özel bir kaskad dalı (`removeFromSavedEverywhere`)
tetikleniyordu; bu özel dal tamamen kaldırıldı, her satır artık düz bir
tek-koleksiyon `addItemToCollection`/`removeFromCollection` çağrısı yapıyor.
Dış "kaydedildi" durumu artık `collection.isDefault` kontrolüne değil,
`memberIds.size`'ın 0↔1+ geçişine bakarak güncelleniyor: ilk eklemede
(0→1) `onAdded`, son üyeliğin kaldırılmasında (1→0) yeni adlandırılmış
`onRemoved` (eski `onRemovedFromDefault`) tetikleniyor — `save-button.tsx`'in
iki `SaveToCollectionModal` çağrısı da bu yeni prop adına güncellendi.

**Kaskad kaldırma (`removeFromSavedEverywhere`) BİLİNÇLİ OLARAK bu modalin
kendi per-row toggle'ından tamamen çıkarıldı, başka iki yerde aynı, gerçek
davranışıyla duruyor:** (1) `SaveButton`'ın `handleClick`'i — dolu bookmark
ikonuna DOĞRUDAN tıklamak hâlâ tüm koleksiyonlardan kaldırıyor (kullanıcının
"mevcut removeEverywhere davranışı aynen kalsın" onayı), ve (2)
`CollectionDetailView.handleRemoveItem` — "Kaydedilenler" (Genel) sayfasının
KENDİ içinden bir öğeyi kaldırmak da hâlâ, bu ekranın kendi anlamı gereği,
genel kaskad kaldırma (Bölüm 9.22 §13'ün "en kritik hata" düzeltmesiyle
aynı, hiç dokunulmadı — bu görevin raporladığı hatanın parçası değildi).

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (25 rota, değişmedi — bu görev hiçbir yeni route/migration
içermiyor) sıfır hatayla geçti. Ağ seviyesinde taklit edilmiş Supabase
REST yanıtlarıyla Playwright'ta (statik export `npx serve` ile, bu
projenin standart yöntemi) iki yeni, hedefli test dosyasıyla doğrulandı:
- Prompt tarafı (16 senaryo, tek bir sürekli modal oturumu içinde —
  bookmark dolu olduğunda modal bir daha AÇILAMADIĞINDAN, gerçek
  UI'da erişilebilir TEK yol budur): yalnızca özel bir koleksiyona
  ("Portreler") eklemenin bookmark'ı doldurduğu (raporlanan hatanın
  doğrudan kanıtı); aynı, TEK koleksiyondan kaldırmanın bookmark'ı
  tekrar boşalttığı; iki özel koleksiyona kaydedip dolu ikona doğrudan
  dokunmanın modalı hiç açmadan İKİSİNDEN BİRDEN kaskad kaldırdığı
  (`removeEverywhere` davranışı değişmedi); hem Genel hem özel bir
  koleksiyona kaydedip yalnızca özel olanı modal içinden kaldırmanın
  bookmark'ı DOLU bıraktığı (Genel'de hâlâ kayıtlı olduğundan) — hepsi
  sıfır JS hatasıyla.
- Generator tarafı (7 senaryo, `/generators/local?slug=…` üzerinde,
  aynı senaryo): yalnızca özel bir koleksiyona eklemenin generator
  bookmark'ını da doldurduğu, dolu ikona doğrudan tıklamanın modalı
  açmadan kaskad kaldırdığı — prompt ile generator'ın AYNI kod yolunu
  (yalnızca `contentType` parametresi farklı) paylaştığının kanıtı.

Ayrıca ilgili regresyon paketleri sıfır regresyonla yeniden çalıştırıldı:
`save-flow-e2e-test.mjs` (14/14 — dolu bookmark'a doğrudan tıklamanın hâlâ
modalı açmadığı ve kaskad çalıştığı), `collections-e2e-test.mjs` (19/19 —
`CollectionDetailView`'ın kendi kaldırma akışı, bu görevde hiç
dokunulmadı), `generator-social-test.mjs` (25/25), `collection-generator-
card-fix-test.mjs` (13/13), `prompt-social-regression-test.mjs` (9/9).

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — bu görev hiçbir yeni migration içermediğinden
(tamamen frontend'de, `collections.ts`'in var olan sorgusunun genişletilmesi),
kullanıcının Dashboard'da yapması gereken ekstra bir adım yok; yalnızca
canlı sitede bir çalışmayı yalnızca özel bir koleksiyona kaydedip
bookmark'ın gerçekten dolduğunu bizzat denemesi gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **`CollectionDetailView.handleRemoveItem`'ın Genel sayfasından kaldırmayı
  hâlâ kaskad olarak ele alması DEĞİŞTİRİLMEDİ** — bu, bu görevin
  raporladığı hatanın bir parçası değildi (o zaten "Genel'e eklersem
  dolar" diyordu, sorun oradaki DAVRANIŞ değil, ÖZEL koleksiyona eklerken
  bookmark'ın hiç dolmamasıydı); bu ekranı da değiştirmek, sorulmamış bir
  ikinci davranışı sessizce genişletmek olurdu.
- **Modalin kendi per-row toggle'ından kaskadı çıkarmak, "Genel satırının
  işaretini kaldırmak artık yalnızca Genel'den çıkarır, diğer
  koleksiyonlara dokunmaz" anlamına geliyor** — bu, yeni simetrik
  davranışın DOĞRUDAN, kasıtlı bir sonucu (her satır artık aynı kurala
  tabi), ayrıca bir karar olarak sorulmadı çünkü "herhangi bir koleksiyona
  eklenince dolsun" seçeneğinin mantıksal gerekliliği.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- Bu değişiklik `useSaveState`/`isPromptSaved`'in JSDoc'larını da
  güncelledi (eski "yalnızca Genel" ifadesi kod tabanında artık hiçbir
  yerde kalmadı) — davranışsal bir sınırlama değil, yalnızca dokümantasyon
  tutarlılığı notu.

---
