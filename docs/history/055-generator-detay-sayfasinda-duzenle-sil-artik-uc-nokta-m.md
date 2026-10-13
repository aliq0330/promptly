### 9.55 Generator detay sayfasında Düzenle/Sil artık üç-nokta menüsünde — prompt detay sayfasıyla aynı yerde

Kullanıcının bildirdiği tutarsızlık: `/prompts/local` (prompt detay sayfası)
Düzenle/Sil/Bağlantıyı kopyala'yı Bölüm 9.36'dan beri başlığın yanındaki
`PostMenu` (üç nokta) içinde topluyordu, ama `/generators/local` (generator
detay sayfası) hâlâ Bölüm 9.27'den kalma eski deseni kullanıyordu: kendi
bespoke "Düzenle"/"Sil" butonları yorum bölümünün ALTINDA, sağ kenar
çubuğunda ayrı bir kutuda duruyordu — `PostMenu` hiç kullanılmıyordu.
Kullanıcı bunu `/prompts/local`'daki gibi başlığın yanındaki üç-nokta
menüsüne taşınmasını, "Bağlantıyı kopyala"nın da orada olmasını, ve
generator KARTININ da (feed/keşfet/profil grid'lerinde) aynı yerde bir menü
göstermesini istedi.

**Denetim bulgusu:** `GeneratorCard`'ın (feed/keşfet/profil kartları)
üç-nokta menüsü zaten Bölüm 9.36'dan beri doğruydu — `PostHeader` üzerinden
`PostMenu`'yü generator hedefiyle çağırıyor, `PromptCard` ile birebir aynı
konumda (kart başlığının sağında). `PostMenu`'nün kendisi de zaten
polimorfikti (Bölüm 9.35/9.36) — `generatorId`/`generatorSlug` prop'larıyla
çağrılınca doğru düzenle/sil/kopyala akışını (`deleteGenerator`,
`/generators/create?edit=`) zaten kullanıyordu. Eksik olan TEK yer
`GeneratorDetailView`'ın kendisiydi — gerçek eksik, kartlarda değil, yalnızca
detay sayfasındaydı.

**Düzeltme (`src/features/generators/generator-detail-view.tsx`):**
`PromptDetailView`'ın header düzenini birebir izleyerek, `<PostMenu
generatorId={generator.id} generatorSlug={generator.slug}
authorId={generator.creator.id} onDeleted={handleDeleted} />` başlık
satırının sağına (durum rozetlerinin yanına) eklendi — `PostMenu` her zaman
"Bağlantıyı kopyala"yı gösterdiğinden (sahiplikten bağımsız), bu tek ekleme
kullanıcının istediği hem menü konumunu hem kopyala seçeneğini karşılıyor.
Sağ kenar çubuğundaki eski, bespoke "Düzenle"/"Sil" kutusu (ayrı
`deleteConfirm`/`isDeleting` state'i, `deleteGenerator`'ı doğrudan çağıran
`handleDelete` fonksiyonu, `Pencil`/`Trash2` ikonlu iki buton) TAMAMEN
kaldırıldı; yerine `PostMenu`'nün kendi `onDeleted` callback'ine bağlı, tek
satırlık bir `handleDeleted()` (cache'ten kaldırıp `/generators`'a
yönlendiren) eklendi — silme işleminin GERÇEK backend çağrısı artık
`PostMenu`'nün kendi, zaten test edilmiş `deleteGenerator` yoluna taşındı,
sayfa yalnızca sonucunu (yönlendirme + cache temizliği) dinliyor.
Kullanılmayan hâle gelen importlar (`Pencil`, `Trash2`, `buttonClassName`,
`cn`, `deleteGenerator`) temizlendi.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (28 rota, değişmedi) sıfır hatayla geçti. Ağ seviyesinde taklit
edilmiş Supabase REST yanıtlarıyla Playwright'ta (statik export `npx serve`
ile, bu projenin standart yöntemi) gerçek `/generators/local?slug=…`
sayfasına karşı yeni, 12 senaryolu bir testle doğrulandı: sahibi olarak
girişte sayfanın hiçbir yerinde artık bağımsız (menü dışı) bir "Düzenle"/
"Sil" kontrolü kalmadığı; üç-nokta menüsünün "Bağlantıyı kopyala",
"Düzenle" (gerçek `/generators/create?edit=<id>` linkiyle) ve "Sil"i
gösterdiği, generator için hiçbir zaman "Kopyasını oluştur" göstermediği
(bu akış generatorlar için hiç yok, Bölüm 9.35); "Bağlantıyı kopyala"nın
gerçekten doğru mutlak generator URL'ini panoya kopyaladığı; sahibi
OLMAYAN bir kullanıcı için menünün yalnızca "Bağlantıyı kopyala"yı
gösterip Düzenle/Sil'in hiç görünmediği — hepsi sıfır (gerçek) JS
hatasıyla (yalnızca testin kendi basitleştirilmiş mock'unun tetiklediği,
uygulamanın arka plan generator listeleme provider'larından gelen ilgisiz
konsol gürültüsü ve bu sandbox'ın bilinen WebSocket kısıtı hariç).
`GeneratorCard`'ın kendi menüsü zaten doğru olduğundan (yukarıdaki denetim
bulgusu) bu görev kartlara hiç dokunmadı — yalnızca detay sayfası
değişti.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — bu görev hiçbir migration içermiyor (tamamen
frontend), kullanıcının Dashboard'da yapması gereken ekstra bir adım yok;
yalnızca canlı sitede kendi bir generatorunun detay sayfasında yeni menü
konumunu bizzat denemesi gerekiyor.

**Bilinen sınırlamalar:** Yok — bu, önceki bir modülün (Bölüm 9.27) diğer
kartların/detay sayfalarının çoktan geçtiği bir standarda (Bölüm 9.36'nın
`PostMenu` paritesi) henüz taşınmamış tek kalan köşesini kapatan, dar
kapsamlı bir tutarlılık düzeltmesi; yeni bir mimari sınırlama getirmedi.
