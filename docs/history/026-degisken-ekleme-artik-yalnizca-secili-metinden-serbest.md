### 9.26 Değişken ekleme artık yalnızca seçili metinden — serbest yazım tamamen kaldırıldı

Kullanıcının Bölüm 9.25'in "Değişken Ekle" akışını denedikten sonra gelen
açık talebi üzerine: bir değişkenin adı artık HİÇBİR ZAMAN serbestçe
yazılamıyor. Kullanıcı önce prompt metninden gerçek bir kelime/ifade seçmek
(highlight) ZORUNDA; "Değişken Ekle"ye bastığında açılan ekranda değişken
adı alanı o seçili metinle ÖNCEDEN DOLU ve DEĞİŞTİRİLEMEZ geliyor — çünkü
aynı kelime prompt içinde birden fazla kez geçebiliyor ve burada farklı bir
isim yazmak, değişkeni işaret ettiği metinden sessizce koparırdı. Seçilen
kelime metinde birden fazla kez geçiyorsa gerçek bir "Tümünü değiştir"
onay kutusu beliriyor (işaretlenirse TÜM eşleşen geçişler aynı değişkene
bağlanıyor, işaretlenmezse yalnızca seçilen tek geçiş). Hiç seçim
yapılmadan "Değişken Ekle"ye basılırsa ekran hiç açılmıyor, yerine "Önce
prompt metninden kelime seçip daha sonra tıklayın." uyarısı gösteriliyor.

**Mimari karar — iki ayrı modal, iki ayrı sorumluluk:** Bölüm 9.25'in tek,
hem-oluştur-hem-düzenle `VariableEditorModal`'ı ikiye ayrıldı:
- **`VariableEditorModal`** artık YALNIZCA var olan bir değişkeni düzenlemek
  (yeniden adlandırma — metindeki tüm `{eskiİsim}` referanslarını
  `renameVariableTokenInText` ile güncelleyerek — veya varsayılan değer/
  açıklama değiştirme) için var; `editing` prop'u artık zorunlu (opsiyonel
  değil), "oluştur modu" tamamen kaldırıldı, başlık/buton metni her zaman
  "Değişkeni Düzenle"/"Kaydet".
- **Yeni `add-variable-from-selection-modal.tsx` → `AddVariableFromSelectionModal`**
  — YALNIZCA seçili metinden yeni bir değişken oluşturma/bağlama akışı.
  Değişken adı alanı `readOnly disabled` — kullanıcı hiçbir şekilde
  değiştiremiyor, yalnızca seçilen kelimenin normalize edilmiş hâlini
  (`normalizeVariableName`) gösteriyor. İki alt durumu var:
  - **Yeni değişken:** seçilen kelimeyle aynı isimde henüz bir değişken
    yoksa, varsayılan değer (seçilen metnin kendisiyle önceden dolu —
    kullanıcı değiştirmezse şablon eskisiyle aynı şekilde çözümlenir) ve
    açıklama serbestçe düzenlenebiliyor.
  - **Var olan değişkene bağlama:** seçilen kelime (büyük/küçük harf
    duyarsız) zaten eklenmiş bir değişkenle aynıysa, form yerine "Bu
    isimde bir değişken zaten var — yeni bir değişken oluşturulmayacak,
    seçtiğin metin mevcut değişkene bağlanacak" bilgi kutusu gösteriliyor
    (varsayılan değer/açıklama alanları hiç render edilmiyor — onları
    burada düzenlemek, bu modalın "yeni bir şey oluşturuyor" görünümüyle
    çelişip metnin başka her yerindeki aynı değişkeni de sessizce
    değiştirirdi, bu yüzden bilinçli olarak salt-bilgi tutuldu).
  - Her iki durumda da, seçilen metin dokümanda birden fazla kez geçiyorsa
    (`countRawOccurrences`, yeni saf fonksiyon — `RegExp` değil, düz
    `String.split` tabanlı literal sayım, dosyanın diğer yardımcılarıyla
    aynı stil) gerçek geçiş sayısını gösteren bir "Tümünü değiştir"
    onay kutusu ekleniyor.

**`prompt-text-editor.tsx`'teki yeni akış:** "Değişken Ekle" butonunun
`onClick`'i artık doğrudan bir modal açmıyor — önce `selectionRef.current`
(textarea'nın `onSelect`/`onKeyUp`/`onClick`/`onBlur` olaylarıyla sürekli
güncellenen gerçek seçim aralığı) okunuyor, seçili metin `trim()`leniyor:
- Seçim boşsa (`trim()` sonucu boş string — imleç yalnızca bir noktada,
  hiçbir şey seçilmemiş) → `showSelectionWarning()` ile uyarı gösteriliyor,
  `pendingSelection` state'i hiç set edilmiyor, modal AÇILMIYOR.
- Seçili metin geçerli bir değişken adı olamayacak kadar uzun/geçersizse
  (`isValidVariableName`) → ayrı, açıklayıcı bir uyarı gösteriliyor.
- Geçerliyse → `pendingSelection` (başlangıç/bitiş offset'leri + ham
  seçili metin) set ediliyor, bu da `AddVariableFromSelectionModal`'ın
  render edilmesini tetikliyor. Baştaki/sondaki boşluklar seçime dahil
  edilmişse (`leadingTrim`/`trailingTrim` hesabıyla) yalnızca gerçek
  kelimenin kapsadığı aralık değiştiriliyor — seçimin kenarındaki
  boşluklar metinde olduğu gibi kalıyor.
- Onaylandığında (`handleConfirmAddFromSelection`): "Tümünü değiştir"
  işaretliyse yeni `replaceAllOccurrencesWithToken` (yine saf, `split`+
  `join` tabanlı) ile metindeki TÜM literal geçişler tek seferde
  `{isim}`e çevriliyor; işaretli değilse yalnızca `insertTextAtRange` ile
  o TEK seçili aralık değiştiriliyor ve imleç doğru konuma geri
  konumlanıyor. Seçilen kelime YENİ bir değişkense draft listesine
  ekleniyor; var olan bir değişkene bağlanıyorsa listeye hiçbir şey
  eklenmiyor (mükerrer önlendi).

**Gerçek bir React-portal event-bubbling hatasına karşı önlem alındı
(Bölüm 9.25'te keşfedilen aynı sınıf hata, tekrarlanmasın diye baştan
eklendi):** `AddVariableFromSelectionModal`'ın kendi `<form onSubmit>`'i
de (tıpkı `VariableEditorModal` gibi) dışarıdaki prompt-yayınlama
formunun İÇİNE mantıksal olarak yerleşiyor (React'ın portal'lı bir modalde
bile senkron olayları DOM ağacına değil REACT ağacına göre balonlaması
yüzünden) — bu yüzden `handleSubmit` içine baştan `event.stopPropagation()`
eklendi, aynı hatanın bu yeni modalde de yeniden ortaya çıkması
beklenmeden.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (22 rota, değişmedi — bu görev hiçbir yeni route/migration
içermiyor, tamamen `src/lib/prompt-variables.ts` + üç `src/features/
prompts/*.tsx` dosyasında) sıfır hatayla geçti. Saf mantık birim testi
(`node --experimental-strip-types`, gerçek `prompt-variables.ts`'e karşı)
yeni `countRawOccurrences`/`replaceAllOccurrencesWithToken` için 5 ek
assertion'la (toplam 23) doğrulandı — tekrarlanan/hiç geçmeyen/boş needle
durumları dahil. Ağ seviyesinde taklit edilmiş Supabase REST yanıtlarıyla
Playwright'ta (Bölüm 9.25'in kendi 48 senaryolu paketi güncellenerek —
eski "değişken adını serbestçe yaz" adımları artık var olmayan bir
`#variable-name` inputuna yazmaya çalıştığından kaldırıldı, yerine bu
bölümün 4 kuralını doğrulayan 12 yeni senaryo eklendi) hepsi sıfır JS
hatasıyla doğrulandı: hiç seçim yokken tıklamanın uyarı gösterip modalı
HİÇ açmadığı; gerçek bir seçimin modalı açtığı VE değişken adı alanının
seçili kelimeyle önceden dolu + `disabled` olduğu; tek geçişte "Tümünü
değiştir" kutusunun HİÇ görünmediği; seçilen kelime metinde ikinci kez
geçtiğinde kutunun gerçek geçiş sayısıyla (`toplam 2 yerde geçiyor`)
göründüğü ve başlangıçta işaretsiz olduğu; kutu işaretlenmeden onaylanınca
yalnızca seçilen TEK geçişin tokenize olup diğerinin literal kaldığı; kutu
işaretlenince checkbox'ın gerçekten işaretli hâle geldiği VE onaylanınca
metindeki HER iki geçişin de aynı değişkene dönüştüğü, VE bunun için tek
bir değişken taslağı oluştuğu (iki değil — "Değişkenler (1)" başlığıyla
doğrulandı); seçilen kelime zaten eklenmiş bir değişkenin adıyla eşleşince
"Bu isimde bir değişken zaten var" bilgi kutusunun göründüğü, düzenlenebilir
varsayılan değer/açıklama alanlarının HİÇ render edilmediği, "Bağla"ya
basınca o geçişin de aynı değişkene bağlandığı ve yine tek bir değişken
taslağı kaldığı — hepsi sıfır JS hatasıyla. Bölüm 9.25'in kendi diğer 36
senaryosu (düzenleme modu, sahiplik reddi, kopyalama, kişiselleştirme,
düzenleme geçmişi, istek düzenleme) hiç bozulmadan yeniden çalıştırıldı.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- **Birden fazla kelimelik bir ifadeyi (örn. iki kelime) seçip değişken
  yapmak hâlâ destekleniyor** — `handleAddVariableClick` seçimi yalnızca
  `trim()`leyip `isValidVariableName`'e (boşluk YASAK) karşı doğruluyor;
  yani aslında yalnızca TEK KELİMELİK seçimler geçerli bir değişken adı
  olabiliyor (boşluk içeren bir seçim `isValidVariableName` tarafından
  reddedilip "geçersiz karakter" uyarısı gösteriyor) — bu, Bölüm 9.25'in
  şemadaki `prompt_variables.name` CHECK kısıtının (boşluk yasak) doğal,
  DEĞİŞTİRİLMEMİŞ bir sonucu; kullanıcının talebi yalnızca "serbest yazım
  yerine seçim" istedi, isim kuralının kendisini gevşetmedi.
- **"Tümünü değiştir" yalnızca TAM, literal (case-sensitive) eşleşmeleri
  değiştiriyor** (`String.split`/`.join`, `RegExp` değil) — "Ortam" ve
  "ortam" ayrı sayılıyor; büyük/küçük harf duyarsız bir toplu değiştirme
  şartnamede istenmedi, eklenmedi.

**Bilinen sınırlamalar:**
- Bu görev hiçbir yeni migration/DB değişikliği içermiyor (tamamen
  frontend) — kullanıcının Dashboard'da yapması gereken ekstra bir adım
  yok; yalnızca canlı sitede bizzat deneyip denemesi gerekiyor (Bölüm
  17'den beri tekrarlanan, bu sandbox'ın ağ kısıtı yüzünden dürüstçe
  belirtilen aynı sınırlama).
- Seçim, `<textarea>`'nın kendi native `selectionStart`/`selectionEnd`'ine
  dayanıyor — mobil/dokunmatik bir cihazda metin seçmenin (uzun basma +
  sürükleme) gerçek bir parmakla ne kadar rahat olduğu bu sandbox'ta hiç
  test edilemedi (Bölüm 9.11/9.13'ün de belirttiği aynı donanım-erişimi
  sınırı) — yalnızca Playwright'ın programatik `setSelectionRange` +
  dispatch edilen `select` olayıyla doğrulandı.

---
