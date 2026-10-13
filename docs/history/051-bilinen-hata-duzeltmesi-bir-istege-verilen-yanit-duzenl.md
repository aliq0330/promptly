### 9.51 Bilinen hata düzeltmesi: bir isteğe verilen yanıt DÜZENLENİRKEN profil görünürlüğü seçici hiç görünmüyordu

Kullanıcının ekran görüntüsüyle bildirdiği gerçek hata: bir isteğe İLK yanıt
verilirken (`?answerRequest=<id>`) "Bu yanıt profilimde görünsün mü?"
seçicisi (Bölüm 9.16'nın remix'e de genişlettiği, Bölüm 9.2'nin `prompts.
show_on_profile` alanına yazan seçici) doğru görünüyordu, ama aynı yanıtı
SONRADAN DÜZENLERKEN (`?edit=<promptId>`, Bölüm 9.25'in kurduğu düzenleme
akışı) bu seçici hiç render edilmiyordu — kullanıcı bir yanıtını profilinde
gizlemeyi/göstermeyi sonradan değiştiremiyordu.

**Kök neden:** `showsVisibilityChoice`'ın (o zaman adı yoktu, doğrudan
`isAnswerMode`) tek koşulu `isAnswerMode` idi — `isAnswerMode`/`isEditMode`
ise `create-prompt-form.tsx`'in en başında birbirini KARŞILIKLI DIŞLAYACAK
şekilde tanımlı (`answerRequestId`/`duplicateId`/`generatorRunId` hepsi
`!isEditMode` şartına bağlı okunuyor — bkz. dosyanın kendi yorumu: "Modes,
chosen by the query string"). Yani `isEditMode` true iken `isAnswerMode`
YAPISAL OLARAK asla true olamıyordu; seçici düzenleme modunda hiçbir zaman
görünemezdi. Ayrıca `updateRealPrompt`/`UpdateRealPromptInput`
(`src/lib/supabase/prompts.ts`) hiç `show_on_profile` yazmıyordu — seçici
görünse bile kaydetme yolu eksikti.

**Düzeltme (yalnızca bu iki dosya, migration gerekmedi — `prompts.show_on_
profile` zaten Bölüm 9.2'den beri var):**
- `UpdateRealPromptInput`'a opsiyonel `showOnProfile?: boolean` eklendi;
  `updateRealPrompt`'un `UPDATE`'i yalnızca `showOnProfile !== undefined`
  ise `show_on_profile`'ı yazıyor (bir `original` prompt düzenlenirken bu
  alan hiç gönderilmediğinden hiç dokunulmuyor).
- `create-prompt-form.tsx`'e yeni `isEditingResponse = isEditMode &&
  editingPrompt?.origin.type === "request-response"` ve `showsVisibilityChoice
  = isAnswerMode || isEditingResponse` eklendi; seçicinin görünürlük koşulu
  ve `previewPrompt.showOnProfile`'ın hesaplanışı bu yeni bayrağa geçirildi.
  Düzenleme formunun kaynak-doldurma efekti artık `editingPrompt.origin.
  type === "request-response"` iken `showOnProfile` state'ini gerçek
  promptun kendi `showOnProfile` değerinden dolduruyor (async kaynak → senkron
  initializer'la doldurulamayan aynı desen, Bölüm 9.5'in `/profile/edit`
  senkronizasyonuyla birebir aynı). `handleSubmit`'in edit dalı artık
  `updatePrompt(...)`'a yalnızca `isEditingResponse` iken gerçek
  `showOnProfile` değerini gönderiyor (bir `original` promptu düzenlerken
  `undefined` gönderiliyor, kolon hiç etkilenmiyor). **Gerçek bir ESLint
  hatası önceden düzeltildi:** `showOnProfile`/`setShowOnProfile`'ın
  `useState` bildirimi, onu okuyan seed-efektinden SONRA duruyordu —
  `react-hooks/immutability` kuralı ("accessed before it is declared")
  bunu gerçekten yakaladı; state bildirimi efektten önceye taşınarak
  düzeltildi (davranış değişmedi, yalnızca bildirim sırası).

**Metin hiç değişmedi** — aynı "Bu yanıt profilimde görünsün mü?" başlığı
ve aynı iki radyo açıklaması hem yeni yanıt verirken hem var olan bir
yanıtı düzenlerken kullanılıyor (Bölüm 9.18'in zaten genellediği metin,
"görünsün mü" ifadesi bir düzenleme bağlamında da doğru okunuyor).

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (26 rota, değişmedi) sıfır hatayla geçti. Gerçek bir Supabase
projesine karşı canlı doğrulama bu sandbox'ın ağ kısıtı yüzünden yine
yapılamadı (Bölüm 17'den beri tekrarlanan aynı sınırlama) — bu görev
hiçbir migration içermediğinden (`prompts.show_on_profile` zaten var olan
bir kolon), kullanıcının Dashboard'da yapması gereken ekstra bir adım yok;
yalnızca canlı sitede kendi yanıtlarından birini düzenleyip görünürlük
seçiciyi ve gerçek kalıcılığını bizzat denemesi gerekiyor.

**Bilinen sınırlamalar:**
- Gerçek Supabase projesine karşı canlı doğrulama yapılamadı (yukarıda
  açıklandı).
- Bu, önceki bir modülün eksik bıraktığı, dar kapsamlı bir davranış
  düzeltmesi; yeni bir mimari sınırlama getirmedi.

---
