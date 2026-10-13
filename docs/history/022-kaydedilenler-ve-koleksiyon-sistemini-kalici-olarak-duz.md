### 9.22 Kaydedilenler ve Koleksiyon Sistemini Kalıcı Olarak Düzeltme ve Tamamlama

Kullanıcının çok kapsamlı 26 bölümlük şartnamesi üzerine — Bölüm 9.19-9.21'in
kurduğu koleksiyon sistemi, "genel kaydetme = `prompt_saves`, koleksiyon
üyeliği = ayrı `collection_items`, ikisi tek yönlü bağlı" mimarisinden,
şartnamenin istediği tek-kaynaklı mimariye geçirildi: **her kullanıcının
isimden bağımsız kalıcı bir kimliğe sahip TEK bir varsayılan ("Genel")
koleksiyonu var, genel "kaydedildi" durumu artık SADECE bu koleksiyona
üyelik, ve genel kaydı kaldırmak kullanıcının TÜM koleksiyonlarından atomik
olarak temizliyor.**

**AŞAMA 0 denetimi:** Önce mevcut mimari uçtan uca okundu —
`collections`/`collection_items` (Bölüm 9.19), `prompt_saves` (Bölüm 18),
`use-save-state.ts`/`save-button.tsx` (Bölüm 9.21), `SaveToCollectionModal`,
`CollectionDetailView`, `CollectionMoreMenu`, `ProfileView`'ın "Tümü/
Koleksiyonlar" alt-sekmesi, `handle_new_user()` trigger'ı (Bölüm 18). Gerçek
eksik netti: `collections`'ta varsayılan olduğunu işaretleyen hiçbir alan
yoktu, genel kayıt hâlâ ayrı `prompt_saves`'e yazıyordu (koleksiyon
üyeliğiyle "tek yönlü" — Bölüm 9.19'un kendi kararı), ve "bir koleksiyondan
kaldır" ile "genel kaydı kaldır" hiç ayrı işlemler değildi (`removeItemFromCollection`
her ikisi için de aynı şekilde tek koleksiyonu etkiliyordu, kaskad hiç yoktu).

**Yeni migration: `supabase/migrations/20260919270000_default_collections.sql`**
(tam senaryo listesi aşağıda "Nasıl doğrulandı"da):
- `collections.is_default boolean` (yeni sütun) — **isimden tamamen
  bağımsız, kalıcı kimlik** (şartnamenin açıkça yasakladığı `name ===
  "Genel"` karşılaştırması hiçbir yerde kullanılmadı).
- `collections_one_default_per_owner` — `(owner_id)` üzerinde, `where
  is_default` kısmi UNIQUE index'i: bir kullanıcının asla ikinci bir
  varsayılan koleksiyonu olamaz, veritabanı seviyesinde garanti (eşzamanlı
  iki "ensure" çağrısı bile ikinci bir satır oluşturamıyor).
- `collections_before_delete` (BEFORE DELETE trigger) — `is_default` olan
  bir satırı silme denemesini şartnamenin istediği TAM Türkçe mesajla
  reddediyor: *"Varsayılan koleksiyon silinemez. İstersen koleksiyonun
  adını veya gizlilik ayarını değiştirebilirsin."* Frontend'in kendi
  engeli (aşağıya bakınız) bunu tekrarlamayan bir savunma katmanı, tek
  gerçek garanti bu trigger.
- `collections_before_update` (BEFORE UPDATE trigger) — `is_default` veya
  `owner_id`'yi değiştirmeye çalışan HERHANGİ bir UPDATE'i reddediyor
  (savunma derinliği — uygulama zaten bu alanları hiç göndermiyor, ama bir
  gelecekteki hata/kötü niyetli bir istemci bile bunu değiştiremez).
- `ensure_default_collection(p_owner_id)` — idempotent "bul ya da oluştur"
  (`SECURITY DEFINER`, `ON CONFLICT (owner_id) WHERE is_default DO
  NOTHING` + geri-okuma) — hem `handle_new_user()`'ın yeni gövdesi hem
  backfill hem client-safe RPC tarafından paylaşılan TEK gerçek kaynak.
- `get_or_create_own_default_collection()` — `ensure_default_collection`'ın
  **yalnızca `auth.uid()`'ye sabitlenmiş** ince sarmalayıcısı, `authenticated`'e
  açık. **Gerçek bir güvenlik açığı test sırasında önlendi:**
  `ensure_default_collection`'ın kendisini doğrudan `authenticated`'e açmak,
  keyfi bir `p_owner_id` ile çağrılıp BAŞKA bir kullanıcı adına koleksiyon
  oluşturmaya izin verirdi (parametre istemciden geliyor, `auth.uid()`'ye
  bağlı değil) — bu yüzden yalnızca parametre almayan, dahili olarak
  `auth.uid()` kullanan sarmalayıcı client'a açıldı, iç fonksiyonun kendisi
  hiç `authenticated`'e grant edilmedi (yalnızca `SECURITY DEFINER`
  fonksiyonların birbirini çağırabilmesiyle erişilebilir).
- `handle_new_user()` (`create or replace` — Bölüm 18'in var olan trigger'ı,
  fonksiyonu DEĞİŞTİRİLDİ, `on_auth_user_created` trigger'ının kendisi
  DOKUNULMADI) — artık `profiles` satırının hemen ardından
  `ensure_default_collection(new.id)` da çağırıyor: yeni bir kullanıcı artık
  gerçek bir profil VE gerçek bir "Genel" koleksiyonla aynı anda doğuyor.
- **Mevcut kullanıcılar için idempotent backfill** (aynı migration'ın
  içinde, iki `INSERT ... SELECT ... WHERE NOT EXISTS ... ON CONFLICT DO
  NOTHING` adımı): (1) varsayılan koleksiyonu olmayan her `profiles`
  satırına bir tane oluşturur, (2) var olan `prompt_saves` ilişkilerini bu
  yeni varsayılan koleksiyonlara `collection_items` olarak taşır — hiçbir
  satır kaybolmadan, hiçbir yinelenen satır oluşmadan (yeniden çalıştırmak
  güvenli, gerçekten test edildi — aşağıya bakınız). `prompt_saves`
  tablosunun KENDİSİ silinmedi (geriye dönük veri kaybı riski almamak
  için) — yalnızca bu migration'dan sonra hiçbir yeni kod onu okumuyor/
  yazmıyor, tamamen atıl, tek kaynak artık `collections.is_default` +
  `collection_items`.
- `remove_prompt_from_saved_everywhere(p_prompt_id)` — **genel kaydı
  kaldırma, tek, atomik bir DELETE ile** (`security invoker`, yalnızca
  `auth.uid()`'nin KENDİ koleksiyonlarını hedefliyor — `DELETE ... USING
  collections c WHERE ci.collection_id = c.id AND c.owner_id =
  auth.uid()`): kullanıcının varsayılan koleksiyonu VE bu promptu içeren
  HER ÖZEL koleksiyonu tek bir sorguda temizliyor (şartnamenin §7/§18
  "atomik olmalı, yarım kalmış bir durum imkansız olmalı" kuralı) —
  istemcinin "önce oku, sonra tek tek sil" döngüsüne hiç gerek yok.

**Frontend — tek kaynak, `src/lib/supabase/collections.ts` merkezi:**
- `Collection.isDefault: boolean` eklendi (`src/types/index.ts`) —
  kodun HİÇBİR yerinde `name === "Genel"` karşılaştırması yok.
- `fetchOwnCollections` artık varsayılanı her zaman EN BAŞA sıralıyor
  (`sortWithDefaultFirst`) VE **kendi kendini iyileştiriyor**: dönen
  listede `isDefault` olan hiçbir satır yoksa (eski, backfill'den önceki
  bir hesap gibi bir kenar durum), `get_or_create_own_default_collection`
  RPC'sini çağırıp bir kez yeniden sorguluyor — normal bir sayfa
  yüklemesinde (varsayılan zaten varken) bu hiç tetiklenmiyor, ve unique
  index sayesinde asla ikinci bir tane oluşturamıyor (şartnamenin §3
  "sayfa yüklemesi asla yeni bir Genel oluşturmamalı" kuralı hem "normal
  durumda hiç çağrılmayarak" hem "çağrılsa bile index'in izin vermeyeceği"
  şekilde iki kat sağlanıyor).
- `isPromptSaved(promptId, userId)` (YENİ, `fetchIsSaved`'in yerini aldı) —
  `collection_items` içinde bu prompt'un, bu kullanıcının is_default=true
  koleksiyonunda olup olmadığına bakıyor. **`useSaveState`'in TEK okuma
  kaynağı bu artık** — `prompt_saves` hiç sorgulanmıyor.
- `addItemToCollection(collectionId, promptId)` — **artık `prompt_saves`'e
  dual-write YAPMIYOR** (eski `savePrompt()` çağrısı kaldırıldı, `userId`
  parametresi de artık gereksiz olduğundan imzadan çıktı). Bir koleksiyona
  eklemek SADECE o koleksiyona üyelik — varsayılan koleksiyona eklemek
  zaten genel kaydetmenin ta kendisi (çünkü okuma da aynı yere bakıyor),
  başka bir koleksiyona eklemek genel kaydı hiç etkilemiyor (şartnamenin
  §4/§23 Operation C'sinin gerektirdiği ayrım).
- `removeFromCollection(collectionId, promptId)` (`removeItemFromCollection`'ın
  yeniden adlandırılmış hâli, şartnamenin §19 isimlendirme talebine göre)
  — SADECE o tek koleksiyondan kaldırıyor, genel kayda hiç dokunmuyor.
  **Varsayılan koleksiyon için asla çağrılmamalı** — onun için ayrı,
  aşağıdaki fonksiyon var.
- `removeFromSavedEverywhere(promptId)` (YENİ) — `remove_prompt_from_saved_everywhere`
  RPC'sini çağıran ince sarmalayıcı; genel "kaydedilenlerden kaldır" eylemi.

**`useSaveState`** (`src/features/prompts/use-save-state.ts`, tamamen
yeniden yazıldı) — `unsave()`/`fetchIsSaved` yerine `removeEverywhere()`/
`isPromptSaved` + yeni `markUnsaved()` (modalın kendi içinde varsayılan
satırı tekrar işaretinden kaldırmasını yansıtmak için, `markSaved`'in
aynadaki karşılığı). **`SaveButton`** (`save-button.tsx`) davranışı
kullanıcının şartnamesiyle birebir örtüşüyor: boş (outline) ikon → modal
açar; dolu ikon → **modalı hiç açmadan doğrudan** `removeEverywhere()`'i
çağırır, başarılı olursa "Kaydedilenlerden kaldırıldı." toast'ı gösterir
(Bölüm 9.21'in zaten kurduğu `Portal` tabanlı toast, mesaj metni
şartnamenin istediğiyle birebir aynı).

**`SaveToCollectionModal`** — `handleToggle` artık üç farklı durumu ayırt
ediyor: (1) varsayılan koleksiyonu EKLEME → `addItemToCollection` + genel
kaydı dolduran `onAdded()`; (2) varsayılan koleksiyonu (modal açıkken aynı
oturumda) tekrar KALDIRMA → tam kaskad (`removeFromSavedEverywhere` +
TÜM üyelik/sayıların yerel state'te sıfırlanması) + `onRemovedFromDefault()`;
(3) herhangi bir ÖZEL koleksiyonu ekleme/kaldırma → yalnızca o satırın
`removeFromCollection`/`addItemToCollection`'ı, genel kayda hiç dokunmadan.
Varsayılan satır artık listede her zaman görünür bir **"Varsayılan"**
rozetiyle (`Badge variant="accent"`) işaretleniyor — şartnamenin "ayırt
edilebilir olmalı" kuralı.

**Kritik hata düzeltmesi — "kaldırılan gönderi ekranda kalıyor" (şartnamenin
"EN KRİTİK" diye işaretlediği hata, §13):** `CollectionDetailView`
(hem Profil > Kaydedilenler > bir koleksiyona tıklanınca hem `/saved`
bottom-nav kısayolunun artık yönlendirdiği TEK gerçek ekran) daha önce
promptları göstermek için paylaşılan, "kaldır" kavramı hiç olmayan düz
`PromptGrid`'i kullanıyordu — koleksiyondan bir öğeyi kaldıracak HİÇBİR
arayüz yoktu. Şimdi:
- **`PostMenu`'ye yeni, isteğe bağlı bir `collectionRemoval` prop'u
  eklendi** (`{ isDefault, onRemove }` — `PromptCard` →
  `ImagePromptCard`/`TextPromptCard` → `PostHeader` → `PostMenu` zincirinde
  taşınıyor, `onDeleted`'in zaten kullandığı AYNI, var olan threading
  deseni). Yalnızca `CollectionDetailView`'da, ve yalnızca görüntüleyici
  o koleksiyonun GERÇEK sahibiyse geçiriliyor — **gönderinin yazarı değil,
  koleksiyonun sahibi** kontrolü (başkasının gönderisini kendi
  koleksiyonuna kaydedip sonra kaldırabilmen gerekiyor, `PostMenu`'nün var
  olan `isOwn` — yazar — kontrolünden BİLİNÇLİ OLARAK ayrı tutuldu).
  Menü öğesi varsayılan koleksiyonda **"Kaydedilenlerden kaldır"**, özel
  bir koleksiyonda **"Koleksiyondan kaldır"** gösteriyor (aynı iki-
  tıklamalı onay deseni, `Sil`'inkiyle birebir aynı).
- **`CollectionDetailView.handleRemoveItem`** — gerçek backend çağrısını
  ÖNCE yapıyor (`collection.isDefault` ise `removeFromSavedEverywhere`,
  değilse `removeFromCollection`), yalnızca GERÇEK başarıda yerel `items`
  state'inden `filter` ile çıkarıyor ve `itemCount`'u güncelliyor —
  asla optimistik/önce-göster-sonra-doğrula değil, şartnamenin §14'ün
  "optimistik olmuyorsa gerçek başarıdan sonra hemen güncelle" ikinci
  seçeneği. Başarısızlıkta liste hiç değişmiyor, sahte bir "kaldırıldı"
  mesajı asla gösterilmiyor. Doğru mesaj (`"Kaydedilenlerden kaldırıldı."`
  / `"Koleksiyondan kaldırıldı."`) `collection.isDefault`'a göre seçilip
  aynı `Portal` tabanlı toast'la gösteriliyor.
- Sayfa yenilemeye hiç gerek yok (gerçek Playwright testinde `page.reload()`
  sonrası öğenin hâlâ gitmiş olduğu ayrıca doğrulandı — aşağıya bakınız) —
  gerçek bir DELETE zaten olmuş, yerel state yalnızca onu yansıtıyor.

**`CollectionMoreMenu`** — varsayılan koleksiyonda "Koleksiyonu sil"e
tıklamak artık backend'e hiç istek atmadan, doğrudan şartnamenin tam
istediği Türkçe mesajı satır içinde gösteriyor (`collection.isDefault`
kontrolü) — gereksiz bir round-trip yok, ama backend'in kendi trigger'ı da
(yukarıya bakınız) aynı korumayı zaten sağlıyor, ikisi asla birbirine
güvenmiyor.

**`ProfileView`'ın "Tümü" sekmesi YAPISAL olarak kaldırıldı** (şartnamenin
§1'in özellikle vurguladığı ayrım — "yalnızca CSS ile gizleme değil"):
`savedSubTab` state'i, `role="tablist"` bloğu, `fetchSavedPrompts`/
`savedPrompts` state'i ve fetch'i, `activeSource`'un `"saved"` dalı, ve
`TabEmptyState`'in artık hiç ulaşılamayan `"saved"` dalı TAMAMEN silindi.
`activeTab === "saved"` artık doğrudan `<CollectionsPanel .../>` render
ediyor — "Genel" her zaman ilk sırada, ardından kullanıcının kendi
koleksiyonları, ardından "+ Koleksiyon oluştur" (şartnamenin §1'in
istediği tam yapı). `fetchSavedPrompts` (`prompt_saves`-backed, eski)
`src/lib/supabase/prompts.ts`'ten tamamen silindi — artık hiçbir çağıran
kalmadığından.

**`/saved` (alt navigasyon kısayolu) artık kendi ayrı listesini TUTMUYOR** —
kullanıcının varsayılan koleksiyon id'sini (`fetchDefaultCollectionId`,
kendi kendini iyileştiren aynı desenle) bulup doğrudan
`/collections/local?id=<genel>`'e yönlendiriyor. Bu, hem "tek kaynak"
ilkesini (aynı VERİ, aynı BİLEŞEN, iki ayrı "kaldırma" kod yolu değil) hem
şartnamenin §13 "en kritik hata"sının bu girişte de tekrarlanmamasını aynı
anda sağlıyor — `CollectionDetailView`'daki tek düzeltme her iki giriş
noktasını da (Profil > Kaydedilenler > Genel VE alt navigasyon
kısayolu) kapsıyor.

**`src/lib/supabase/saves.ts` tamamen silindi** — `fetchIsSaved`/
`savePrompt`/`unsavePrompt` hiçbir yerden çağrılmıyordu (hepsi
`isPromptSaved`/`addItemToCollection`/`removeFromSavedEverywhere`'e
taşındı); `prompt_saves` tablosunun kendisi (ve Bölüm 19'un RLS'i)
migration/veri kaybı riski almamak için DOKUNULMADAN duruyor, yalnızca
artık hiçbir kod yolundan erişilmiyor.

**Nasıl doğrulandı — SQL/veritabanı katmanı (gerçekten çalıştırıldı, taklit
değil):** Yeni migration, bu sandbox'ta önceden kurulu PostgreSQL 16 ile
sıfırdan açılan, önceki TÜM migration'ların (storage hariç) gerçekten
uygulandığı temiz bir veritabanına uygulandı. **Test sırasında gerçek bir
metodoloji hatası yakalanıp düzeltildi:** ilk yazılan test script'i
`SET LOCAL role`/`SET LOCAL request.jwt.claim.sub`'ı açık bir transaction
DIŞINDA kullanıyordu — Postgres'te bu, dokümante edilmiş bir no-op (yalnızca
o tek örtük ifadenin kendi işlemine kadar sürüyor, bir SONRAKİ ifade zaten
eski değere dönmüş oluyor) — bu yüzden ilk çalıştırma, farkında olmadan
TÜM "kullanıcı olarak" adımları superuser/postgres rolüyle (RLS'i tamamen
atlayarak) çalıştırmış, ve bir çapraz-kullanıcı görünürlük kontrolünü
yanlışlıkla superuser'dan sorgulayarak "silinmiş gibi" gösteren yanlış bir
negatif üretmişti. İkisi de düzeltilip (rol/claim değişimleri artık `SET
ROLE`/`SET <guc>` — LOCAL'siz, oturum boyunca kalıcı — kullanıyor;
çapraz-kullanıcı veri kontrolleri özellikle `RESET ROLE` ile superuser'a
dönerek yapılıyor, "görebiliyor muyum" ile "veritabanında var mı"
birbirine karıştırılmadan) TÜM senaryolar GERÇEKTEN doğru sonuçla yeniden
çalıştırıldı — bu, "gerçek RLS testi" iddiasının kendi kendini
doğrulaması: metodoloji hatası RLS'i yanlışlıkla atladığında test hâlâ
"geçiyor" gibi görünebiliyordu, düzeltildikten sonra GERÇEKTEN RLS'e karşı
çalıştığı kanıtlandı. 14 test grubu, dördü gerçek kullanıcı (Ali, Ayşe,
Baran, Zeynep) ile: yeni kullanıcı signup'ında tam olarak bir "Genel"
koleksiyon oluşması; unique index'in ikinci bir varsayılanı reddetmesi;
`ensure_default_collection`'ın idempotent olması (aynı id'yi döndürmesi,
ikinci bir satır oluşturmaması); Ali'nin kendi varsayılanını yeniden
adlandırabilmesi (`Favorilerim`) VE `is_default`'un hiç değişmemesi; Baran'ın
(başka bir kullanıcı) Ali'nin koleksiyonunu YENİDEN ADLANDIRAMAMASI (RLS,
0 satır); `is_default`'u doğrudan bir UPDATE ile değiştirme denemesinin
trigger tarafından reddedilmesi; **varsayılanı silme denemesinin
şartnamenin TAM istediği Türkçe mesajla reddedilmesi**; Ali'nin Genel +
Portreler + Kodlar'a P1'i eklemesi; **kritik test — Ali'nin genel kaydı
kaldırma çağrısının P1'i ÜÇÜNÜN DE'sinden temizlemesi, Ayşe'nin kendi
ayrı kaydının HİÇ etkilenmemesi, ve promptun kendisinin hayatta kalması**
(şartnamenin §23 Operation A'sının birebir kendisi); tek-koleksiyon
kaldırmanın SADECE o koleksiyonu etkileyip Genel + diğerini koruması;
Ayşe'nin cascade RPC'sinin Ali'nin verilerine hiç dokunamaması;
`anon`'un RPC'yi hiç çağıramaması (execute grant yok); backfill
ifadelerinin yeniden çalıştırılabilir olması (hiçbir kullanıcı birden
fazla varsayılana sahip olmuyor); ve backfill'den önceki bir kullanıcıyı
simüle edip (yalnızca test kurulumu için trigger geçici olarak devre dışı
bırakılıp) güvenli RPC'nin onu bir kez, idempotent şekilde iyileştirmesi
— hepsi gerçekten çalıştırılıp doğrulandı. Test veritabanı işlem bitince
silindi.

**Nasıl doğrulandı — istemci/tarayıcı (ağ seviyesinde taklit edilmiş
Supabase REST/RPC yanıtlarıyla, gerçek, mutasyona uğrayan bir sunucu-taraf
durum nesnesiyle — bu projenin standart yöntemi, Playwright, statik export
`npx serve` ile GitHub Pages basePath'ini taklit eden bir symlink
düzeniyle yerel sunularak):** 33 senaryo, hepsi sıfır JS hatasıyla geçti.
Birinci paket (19 senaryo, koleksiyon detay sayfası): Genel koleksiyonun
"Varsayılan" rozetini gösterdiği; menünün doğru "Kaydedilenlerden kaldır"
etiketini gösterdiği; kaldırma sonrası öğenin ANINDA (sayfa yenilenmeden)
listeden kaybolduğu VE sunucu tarafı state'in gerçekten güncellenmiş
olduğu; **kaskadın gerçekten P1'i hem Genel'den hem Portreler'den
sildiği**; `page.reload()` sonrasında öğenin hâlâ gitmiş olduğu (gerçek
kalıcı silme, yalnızca yerel state değil); Portreler'de (varsayılan
olmayan) menünün "Koleksiyondan kaldır" gösterdiği ve kaldırmanın SADECE
o koleksiyonu etkileyip Genel'i koruduğu; varsayılanı silme denemesinin
TAM istenen mesajı gösterdiği; yeniden adlandırma sonrası "Varsayılan"
rozetinin hâlâ göründüğü (kimlik isimden bağımsız hayatta kaldı). İkinci
paket (14 senaryo, kaydet butonu + profil): boş bookmark'ın modalı açtığı
ve Genel satırının rozetini gösterdiği; Genel'e eklemenin bookmark'ı
doldurduğu; **dolu bookmark'a tıklamanın modalı ASLA açmadığı**, doğrudan
kaskad kaldırmayı tetiklediği, doğru toast'ı gösterdiği ve bookmark'ın
tekrar boşaldığı; Profil > Kaydedilenler'de "Tümü" metninin hiçbir yerde
kalmadığı, Genel'in doğrudan (ekstra bir sekmeye tıklamadan) göründüğü.
Ayrıca 14 rota × giriş-durumu kombinasyonunun (`/`, `/saved`,
`/collections/local` [id'li ve id'siz], `/profile/real`, `/prompts/local`,
`/discover`, hem çıkışlı hem girişli) Supabase'e HİÇ erişilemezken (gerçek
ağ isteklerinin bu sandbox'ın kendi politikasıyla birebir aynı şekilde
başarısız olmasına izin verilerek, hiç taklit edilmeden) sıfır JS
hatasıyla zarifçe davrandığı ayrı bir dayanıklılık taramasıyla doğrulandı
— `/saved`'in kendi kendini iyileştirme denemesi bile ağ tamamen kesikken
çökmüyor. `npx tsc --noEmit`, `npm run lint`, tam `npm run build` (21
rota, değişmedi) sıfır hatayla geçti.

**Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı** (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — kullanıcının
`20260919270000_default_collections.sql`'i Dashboard → SQL Editor'de
uygulayıp bizzat denemesi gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN kararlar:**
- `prompt_saves` tablosu silinmedi (yukarıda gerekçesiyle açıklandı) —
  geriye dönük veri kaybı riski almamak için atıl bırakıldı, ileride ayrı
  bir temizlik görevinde (kullanıcı onayıyla) tamamen kaldırılabilir.
- Koleksiyona eklerken/kaldırırken toplu (birden fazla gönderiyi aynı anda)
  işlem arayüzü eklenmedi — şartname de zaten tek tek işlem istiyordu.
- Varsayılan koleksiyonun kapak görseli/sırası için özel bir davranış
  eklenmedi — `fetchCovers`'ın var olan "en son eklenen öğe" mantığı
  değişmeden, tutarlı şekilde uygulanıyor.

**Bilinen sınırlamalar:**
- **Gerçek Supabase projesine karşı canlı doğrulama yapılamadı** (yukarıda
  açıklandı) — kullanıcının kendi ortamında denemesi gerekiyor.
- Aynı promptun aynı ekranda birden fazla kartla gösterildiği (bu
  uygulamanın routing'inde neredeyse hiç olmayan) bir durumda, iki kart
  örneği arasında anlık senkronizasyon yok — her biri kendi mount'unda
  taze veri çekiyor (Bölüm 21'den beri bilinen "N+1, anlık senkron değil"
  kategorisinden, bu görev bunu değiştirmedi).
- Koleksiyon rozeti/sayaçları Realtime ile canlı güncellenmiyor (Bölüm 21
  Faz 6'dan beri bilinen, mesajlaşma dışında hâlâ genişletilmemiş
  sınırlama) — sayfa yeniden ziyaret edildiğinde doğru.
