### 9.35 Prompt/Generator ortak sosyal mimari — Faz 1: gerçek beğeni, yorum, kaydetme, bildirim

Bölüm 9.34'ün onaylanan planının ilk fazı: Generator artık Prompt'un zaten
olgun sosyal altyapısını (beğeni, yorum, koleksiyona kaydetme, gerçek
bildirim) gerçekten paylaşıyor — sahte/yalnızca-görsel bir taklit değil,
aynı tablolara yazan, aynı RLS'e tabi, aynı `SECURITY DEFINER` sayaç/
bildirim desenini kullanan gerçek entegrasyon.

**Yeni migration:** `supabase/migrations/20260919310000_generator_social_
integration.sql` — audit'in Option 1 kararını uyguluyor, `prompt_comments`
zaten kullandığı "nullable hedef sütunu" desenini `prompt_likes` ve
`collection_items`'a da genişletiyor:
- `generators`'a `like_count`/`comment_count` (yeni, `prompts`'unkiyle
  aynı denormalize sayaç deseni) eklendi.
- `prompt_likes`: `generator_id` (nullable FK) eklendi, tablo daha önce
  `(prompt_id, user_id)` bileşik PK kullandığından (nullable bir sütun
  PK'nın parçası olamaz) yeni bir `id uuid` surrogate PK'ya geçildi,
  `prompt_likes_exactly_one_target` CHECK'i (`prompt_comments`'ın zaten
  kullandığı desenle aynı) eklendi, iki ayrı kısmi UNIQUE index
  (`(prompt_id, user_id) where prompt_id is not null` /
  `(generator_id, user_id) where generator_id is not null`) aynı
  kullanıcının aynı hedefi iki kez beğenmesini veritabanı seviyesinde
  hâlâ imkânsız kılıyor.
- `prompt_comments`: zaten nullable `prompt_id`/`request_id` deseni
  kullandığından yalnızca üçüncü bir nullable `generator_id` eklenip
  `prompt_comments_exactly_one_target` CHECK'i üç-yollu hâle getirildi
  (`(prompt_id is not null)::int + (request_id is not null)::int +
  (generator_id is not null)::int = 1`); RLS SELECT/INSERT politikaları
  üçüncü bir `or (generator_id is not null and exists (... generators
  RLS'iyle aynı görünürlük kontrolü ...))` koluyla genişletildi.
- `collection_items`: `prompt_likes` ile birebir aynı gerekçeyle
  (`(collection_id, prompt_id)` bileşik PK → nullable ekleyip surrogate
  `id` PK'ya geçiş) `generator_id` + `collection_items_exactly_one_target`
  CHECK'i + iki kısmi UNIQUE index eklendi.
- Beş yeni `SECURITY DEFINER` bildirim/sayaç fonksiyonu:
  `notify_generator_like`/`cleanup_generator_like_notification` (Bölüm
  9.6'nın `notify_prompt_like`'ıyla birebir aynı desen, `dedupe_key` ile),
  `notify_generator_comment` (Bölüm 9.6'nın `notify_comment_reply`'ının
  generator dalı — doğrudan yorum → generator sahibine, yanıt → üst
  yorumun sahibine), `notify_generator_remix` (yeni bir generator
  `origin_type='remix'` ile oluşunca kaynağın sahibine — `notify_new_
  remix`'in generator karşılığı, `generators_after_insert_notify_remix`
  adıyla, Bölüm 9.27'nin sayaç trigger'ı `generators_after_insert_remix`
  ile isim çakışması yaratmadan).

**Kritik, gerçekten yakalanmış hata — `SECURITY DEFINER` regresyonu:**
`handle_prompt_like_change()`/`handle_prompt_comment_change()`'i
`create or replace function` ile generator dalı eklemek için yeniden
yazarken, Bölüm 19'un bu iki fonksiyona ÖZELLİKLE eklediği `security
definer` + `set search_path = public` yan tümceleri (cross-user sayaç
güncellemesi RLS'in `using (creator_id = auth.uid())` politikasına
takılıp sessizce 0 satır etkilemesin diye, Bölüm 19/9.0'da defalarca
belgelenen hata sınıfı) kazayla DÜŞÜRÜLDÜ — bu yalnızca yeni generator
beğeni/yorum sayaçlarını değil, AYNI FONKSİYON olduğundan sıradan PROMPT
beğeni/yorum sayaçlarını da bozardı. Yerel PostgreSQL 16'da gerçekten
çalıştırılan test paketinde (aşağıya bakınız) Test 2 `like_count = 0`
döndürerek (INSERT'in kendisi başarılı olup bildirim de doğru üretilirken)
bunu somut olarak yakaladı; kök neden Bölüm 19'un orijinal fonksiyon
tanımına `grep` ile karşılaştırılarak bulundu, her iki fonksiyona da
`security definer set search_path = public` geri eklendi, ve regresyonun
GERÇEKTEN düzeldiğini kanıtlamak için Test 10 (sıradan bir prompt
beğenisinin sayaç davranışı) ayrıca eklenip doğrulandı — bu, projenin
"gerçekten test edilmeden 'düzeltildi' denmez" ilkesinin somut bir örneği.

**RLS politika adı hatası (kod yazılırken, çalıştırılmadan önce
yakalandı):** İlk taslak `drop policy "Comments are readable when their
target is"` yazmıştı — gerçek ad (Bölüm 19'un `20260919130000_rls_
policies.sql`'inde `grep` ile doğrulanarak) `"Comments are readable
wherever their target is readable"` olduğu görülüp düzeltildi.

**Nasıl doğrulandı — SQL/RLS (yerel PostgreSQL 16'da gerçekten
çalıştırıldı, taklit değil):** Migration, bu sandbox'ta önceden kurulu
PostgreSQL 16 ile sıfırdan açılan, önceki 22 migration'ın (storage hariç)
gerçekten uygulandığı temiz bir `promptly_test` veritabanına uygulandı ve
iki gerçek kullanıcıyla (Ali = generator sahibi, Ayşe = beğenen/
yorumlayan/kaydeden) 11 senaryo gerçekten çalıştırılıp doğrulandı: başlangıç
sayaçlarının 0 olduğu; beğenmenin sayaç=1 + gerçek bildirim ürettiği;
beğenmekten vazgeçmenin sayaç=0 yapıp bildirimi temizlediği; yorum
eklemenin sayaç=1 + bildirim ürettiği; kendi yorumuna kendi yanıtının
EKSTRA bir bildirim üretmediği; `anon`'un okuyabilip yazamadığı;
koleksiyon-tabanlı kaydetmenin çapraz kullanıcı gizliliğiyle çalıştığı
(bir kullanıcının varsayılan koleksiyonuna eklenen generator başkasına
görünmüyor); aynı anda hem `prompt_id` hem `generator_id` dolu bir
beğeninin CHECK kısıtıyla reddedildiği; **sıradan prompt beğenilerinin
hâlâ doğru çalıştığı** (yukarıdaki regresyon testinin kanıtı); ve bir
generator remixlenince kaynağın `remix_count`'unun artıp gerçek bir
bildirim ürettiği. Test veritabanı işlem bitince silindi.

**Frontend — veri katmanı (polimorfik, ama var olan her prompt çağrı
yerini bozmadan; hepsi `contentType`/`generatorId` parametresi varsayılan
olarak `"prompt"`/`undefined` alıyor):**
- `src/lib/supabase/likes.ts` — `likePrompt`/`unlikePrompt`,
  `likeContent`/`unlikeContent` olarak yeniden adlandırıldı, üçüncü,
  opsiyonel bir `contentType: "prompt" | "generator" = "prompt"`
  parametresi aldı; `fetchIsLiked` de aynı şekilde genişledi. Tablo adı
  (`prompt_likes`) hiç değişmedi — `prompt_comments`'ın zaten kabul
  ettiği "adı prompt ama başka içerik türlerini de tutuyor" gerekçesiyle
  aynı (yeniden adlandırmak daha büyük, daha riskli bir migration olurdu).
- `src/features/prompts/use-like-state.ts`/`like-button.tsx` — aynı
  opsiyonel `contentType` parametresini/prop'unu alacak şekilde
  genişletildi; hiçbir mevcut prompt çağrısı değişmedi (hepsi varsayılan
  `"prompt"`'u kullanmaya devam ediyor).
- `src/lib/supabase/comments.ts` — yeni `fetchCommentsForGenerator`/
  `postCommentOnGenerator` (var olan `fetchCommentsForPrompt`/
  `postCommentOnPrompt`'un birebir aynı deseni); `mapCommentRow`'un hedef
  tipi üçüncü bir `{ generatorId: string }` koluna genişledi.
- `src/features/prompts/comment-section.tsx` — `CommentTarget` üçüncü bir
  `{ generatorId: string }` koluna genişledi; iki-yollu `isPromptTarget`
  ayrımı üç-yollu `targetKind` ayrımına dönüştürüldü, fetch/post
  mantığının her ikisi de generatoru destekliyor. Yorum ağacının kendisi
  (sınırsız yanıt, bağımsız beğeni, düzenleme/silme — Bölüm 9.4/9.5)
  HİÇ değişmedi, yalnızca hedefin nereye yazıldığı değişti.
- `src/lib/supabase/collections.ts` — yeni `isGeneratorSaved`/
  `saveGeneratorToDefault`/`unsaveGeneratorFromDefault`. **Bilinçli
  kapsam kararı:** bir generator, bir promptun aksine, bu fazda yalnızca
  TEK bir yere (çağıranın kendi varsayılan "Genel" koleksiyonu)
  kaydedilebiliyor — tam çok-koleksiyonlu `SaveToCollectionModal` akışı
  (Bölüm 9.19/9.22) generatora genişletilmedi, çünkü bu ayrı, daha büyük
  bir UI genellemesi gerektiriyor; şimdilik eski `generator_saves`'in
  (Bölüm 9.27, atıl bırakıldı — aynı "veri kaybı riski alma" kararı
  Bölüm 9.22'nin `prompt_saves`'i atıl bırakmasıyla aynı) basit boolean
  davranışını BİREBİR koruyor, yalnızca artık gerçek koleksiyon sistemine
  (dolayısıyla gerçek `item_count` sayaçlarına) bağlı.
- `src/lib/supabase/generators.ts` — `fetchIsGeneratorSaved`/
  `saveGenerator`/`unsaveGenerator` (eski `generator_saves`'e yazan üç
  fonksiyon) tamamen silindi; `GeneratorRow`/`GENERATOR_SELECT`/
  `mapGeneratorRow`'a `like_count`/`comment_count` eklendi (3 farklı
  `Generator` inşa noktasının hepsinde — `createDraftGenerator`,
  `remixGenerator`, `mapGeneratorRow` — tutarlı).

**Frontend — UI: `PostMenu` artık polimorfik, `GeneratorCard`'ın gerçek
bir sosyal footer'ı var, `GeneratorDetailView` gerçek beğeni/yorum
gösteriyor:**
- `src/features/prompts/post-menu.tsx` — `promptId`/`generatorId`+
  `generatorSlug` prop çiftinden TAM OLARAK biri geçiriliyor;
  `isGenerator` bayrağına göre "Bağlantıyı kopyala" doğru URL'e,
  "Düzenle" doğru rotaya (`/generators/create?edit=` vs `/create?edit=`),
  "Sil" doğru fonksiyona (`deleteGenerator` vs `deleteRealPrompt`)
  yönleniyor; "Kopyasını oluştur" (generatorun duplicate akışı yok) ve
  "Mesajla gönder" (mesaj paylaşımı yalnızca prompt/istek destekliyor,
  Bölüm 9.8) generator hedefinde HİÇ render edilmiyor — sahte/çalışmayan
  bir eylem göstermek yerine.
- `src/features/generators/generator-card.tsx` — tamamen yeniden
  yazıldı: artık tek, tüm kartı saran bir `<Link>` DEĞİL —
  `TextPromptCard`'ın "stretched link" deseni (gerçek başlık/footer
  kontrolleri `z-10`, tam kart genişliğinde ayrı bir `<Link>` arkada
  `z-0`) birebir uygulanıyor, çünkü artık kartın içinde gerçek `<button>`
  elemanları var (bir `<a>` içine `<button>` yuvalamak geçersiz/riskli
  olurdu). Yeni bir başlık satırı (avatar+isim+zaman, `PostHeader`'ın
  generator karşılığı, ayrı bir bileşen olarak değil doğrudan inline —
  tek kullanım yeri olduğundan) + gerçek footer
  (`LikeButton(contentType="generator")`, `CommentCountLink
  (generatorSlug=...)`, yeni `GeneratorSaveButton`) eklendi.
- Yeni `src/features/generators/generator-save-button.tsx`
  (`GeneratorSaveButton`) — prompt'un `SaveButton`'ından BİLİNÇLİ OLARAK
  ayrı, daha basit bir bileşen: modal AÇMIYOR, doğrudan toggle ediyor
  (yukarıdaki "tek koleksiyon" kapsam kararının doğal sonucu — seçilecek
  ikinci bir koleksiyon olmadığından bir modale hiç gerek yok).
- `src/features/generators/generator-detail-view.tsx` — mevcut
  use/save/remix istatistik satırının hemen altına gerçek `LikeButton`/
  `CommentCountLink` satırı, sayfanın en altına gerçek `CommentSection`
  eklendi. **Bilinçli olarak DEĞİŞMEYEN kısım:** sahibin "Düzenle"/"Sil"
  ve ziyaretçinin "Remixle"/"Kaydet" eylem satırı — bunlar zaten kendi
  bespoke, tam etiketli `Button`'larıyla (sayfanın "hero" eylem satırı,
  bir kart footer'ının küçük ikonları değil) doğru çalışıyordu, `PostMenu`
  ile DEĞİŞTİRİLMEDİ (kendi planımda da "keep the bespoke owner edit/
  delete/remix actions" diye baştan kararlaştırılmıştı).
- `src/features/profile/profile-view.tsx` — `authorGenerators` artık
  (`authorPrompts` ile birebir aynı desen) `initialAuthorGenerators`
  prop'undan türeyen gerçek, yerel bir state; yeni `handleGeneratorDeleted`
  + `GeneratorCard`'a geçirilen `onDeleted` sayesinde kendi profilinde
  bir generatoru silmek, `PromptCard`'daki gibi sayfa yenilemeden listeden
  kayboluyor.

**Nasıl doğrulandı — istemci/tarayıcı (ağ seviyesinde taklit edilmiş
Supabase REST yanıtlarıyla Playwright, bu projenin standart yöntemi,
statik export `npx serve` ile GitHub Pages basePath'ini taklit eden bir
symlink düzeniyle yerel sunularak):** Yeni, 24 senaryolu bir pakette
hepsi sıfır JS hatasıyla doğrulandı: generator detay sayfasında beğenmenin
gerçek bir POST (`generator_id` dolu, `prompt_id` boş) tetikleyip sayacı
1'e çıkardığı, vazgeçmenin gerçek bir DELETE tetikleyip 0'a döndürdüğü;
yorum yazmanın gerçek bir POST (`generator_id` dolu) tetikleyip yeni
yorumun sayfa yenilenmeden göründüğü ve `CommentSection`'ın kendi canlı
"Yorumlar (N)" başlığının doğru saydığı; `/generators` keşif sayfasındaki
kartın gerçek Beğen/Kaydet kontrollerini gösterdiği, bunlara tıklamanın
GERÇEK istekler tetikleyip kartın kendi stretched-link navigasyonunu HİÇ
tetiklemediği; kartın üç-nokta menüsünün "Düzenle"yi doğru
`/generators/create?edit=` rotasına yönlendirdiği, "Kopyasını oluştur"/
"Mesajla gönder"i HİÇ göstermediği, "Sil"i gösterdiği; profildeki
"Generatorlar" sekmesinde gerçek bir silme akışının (iki tıklamalı onay)
kartı sayfa yenilenmeden kaldırdığı. Ayrıca **regresyon için ayrı, yeni
bir 9 senaryolu prompt-tarafı test** (`contentType`/`generatorId`
parametresi hiç geçirilmeden, yani her var olan prompt çağrı yerinin
yaptığı gibi) yazılıp çalıştırıldı: sıradan bir promptu beğenmenin hâlâ
`prompt_id` dolu/`generator_id` boş bir POST gönderdiği, yorum eklemenin
hâlâ `prompt_id` dolu bir POST gönderdiği, ve `PostMenu`'nün bir promptta
hâlâ "Kopyasını oluştur"/"Mesajla gönder"i gösterip "Düzenle"yi hâlâ
`/create?edit=`'e (generator rotasına değil) yönlendirdiği — hepsi sıfır
JS hatasıyla. Son olarak bu oturumun mevcut generator regresyon paketleri
(`generators-e2e-test.mjs` 45/45, generator detay/JSON compose testi
13/13, hazır alan kütüphanesi testi 26/26) ve genel platform regresyon
paketleri (19 rotalık Supabase-tamamen-erişilemez dayanıklılık taraması,
`prompt-variables-e2e-test.mjs` 48/48, `collections-e2e-test.mjs` 19/19,
`save-flow-e2e-test.mjs` 14/14) sıfır regresyonla yeniden çalıştırıldı.
`npx tsc --noEmit`, `npm run lint`, tam `npm run build` (25 rota,
değişmedi) sıfır hatayla geçti.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — kullanıcının
`20260919310000_generator_social_integration.sql`'i Dashboard → SQL
Editor'de uygulayıp bizzat denemesi gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar (Bölüm 9.34'ün H planının
sonraki fazlarına bırakıldı):**
- **`RemixBranchMap`/`fetch_remix_graph` hâlâ yalnızca prompt'a özel** —
  bir generatorun kendi remix zincirini (Bölüm 9.14'ün haritasına benzer
  bir görsel) gösteren, içerik-türünden-bağımsız bir harita bu fazda
  yapılmadı; generatorun remix ilişkisi (`source_generator_id`/`root_
  generator_id`) zaten var ve doğru (Bölüm 9.27), yalnızca GÖRSELLEŞTİRME
  paylaşılmıyor.
- **Generator'a çok-koleksiyonlu kaydetme** (yukarıda "bilinçli kapsam
  kararı" olarak açıklandı) — ayrı bir faz.
- **Bir generator çalıştırıldığında (`generator_runs`) hiçbir bildirim
  yok** — yalnızca beğeni/yorum/remix bildirimleri eklendi (audit'in
  belirttiği somut eksiklerdi); bir "generatorun kullanıldı" bildirimi
  şartname/audit'te hiç istenmedi, icat edilmedi.
- **Mesajla paylaşım (Bölüm 9.8) generatora genişletilmedi** — yukarıda
  `PostMenu` notunda açıklandı, ayrı bir faz.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- **N+1 sorgu deseni burada da geçerli** (Bölüm 21 Faz 3'ten beri bilinen
  sınırlama) — `GeneratorCard`'ın her örneği kendi ayrı beğeni/kaydetme
  sorgusunu tetikliyor.
- **Generator beğenisi/yorumu/kaydetmesi Realtime ile canlı güncellenmiyor**
  (Bölüm 21 Faz 6'dan beri bilinen, bu projenin genelinde geçerli
  sınırlama).
