### 9.77 Bölüm 9.76'nın kendi diff'inde bulunan 3 gerçek hata — düzeltildi

Bölüm 9.76 `main`'e merge edildikten hemen sonra, kendi diff'i (`code-review`
skill'iyle, `2476808..d3206c7`) tekrar gözden geçirildi — bu dosyanın
başındaki "önce mevcut mimariyi denetle" kuralının bir önceki değişikliğin
KENDİSİNE uygulanmış hâli. Üç gerçek, doğrulanmış hata bulundu ve düzeltildi;
hiçbiri varsayım değil, her biri gerçek kod okunarak (ve ikisi gerçek `git
diff` önce/sonra karşılaştırmasıyla) kanıtlandı.

**1. Ana Sayfa/Keşfet'in karma akış penceresi sessizce 60'tan 24'e
küçülmüştü (gerçek regresyon, dokümantasyonun kendi iddiasıyla çelişiyordu).**
Bölüm 9.76'nın CLAUDE.md notu "Ana Sayfa/Keşfet hâlâ dokümante edilmiş
'~60'lık pencere' sınırlamasını koruyor" diyordu — bu YANLIŞTI. Keyset
sayfalama eklenirken dört provider'ın (`RealPromptsProvider`,
`RealRequestsProvider`, `RealGeneratorsProvider`, `RealWorkflowsProvider`)
hepsinde yeni bir `PAGE_SIZE = 24` sabiti, hem ilk yüklemede hem
`loadMore()`'da kullanılmaya başlandı — ama `fetchRecentPublishedPrompts()`/
`fetchRecentRequests()`/`fetchRecentWorkflows()`'un ESKİ varsayılan değeri
`60`'tı (`git diff` ile doğrulandı: `-export async function
fetchRecentPublishedPrompts(limit = 60)` → `+... (limit = 24, cursor?)`).
`FeedTabs`/`DiscoverFeed` (Ana Sayfa/Keşfet) bu provider'lardan `realPrompts`/
`realRequests`/`realWorkflows`'u DÜZ BİR DİZİ olarak okuyor — kendi "daha
fazla yükle"leri yok (`grep` ile doğrulandı, ikisi de yalnızca `useRealX()`
çağırıp listeyi doğrudan kullanıyor). Sonuç: `/prompts`/`/requests`/
`/workflows`'un kendi "Daha fazla yükle" butonu kazanmasının yan etkisi
olarak, Ana Sayfa/Keşfet'in karma akışı sessizce 60'lık bir havuzdan 24'lük
bir havuza küçülmüştü — "Popüler" sekmesi artık çok daha dar, salt-
kronolojik bir örneklem üzerinden sıralanıyordu. **Düzeltme:** dört
provider'daki `PAGE_SIZE` `24`'ten `60`'a geri alındı — Ana Sayfa/Keşfet'in
havuzu tam olarak eski boyutuna döndü, `/prompts` vb. sayfalardaki "Daha
fazla yükle" de artık 24 yerine 60'lık sayfalar çekiyor (daha az tıklama,
davranışsal bir kayıp yok).

**2. Bir taxonomy/durum filtresi mevcut sayfayı boşa düşürdüğünde "Daha
fazla yükle" hiç gösterilmiyordu — kullanıcı sahte bir "sonuç yok" ekranında
sıkışıp kalabiliyordu.** `ContentListPage`'in `visible.length === 0` dalı,
`hasMore=true` olsa bile her zaman "oluştur" eylemli genel `EmptyState`'e
düşüyordu — oysa aktif bir arama YOKEN (`!active`, yani yalnızca bir medya
türü çipi seçiliyken) yüklenmiş 24-60'lık sayfanın o türden hiç öğesi
olmaması, daha ileride eşleşen bir öğe olmadığı anlamına gelmiyor. **Düzeltme:**
bu dal artık `!active && hasMore` durumunda `EmptyState`'in var olan
`onClick`'li `action` varyantını kullanarak gerçek bir "Daha fazla yükle"
eylemi sunuyor (yeni `search.noMatchingFiltersOnPage` çeviri anahtarı,
TR+EN) — ikinci bir paralel UI icat edilmedi, `EmptyState`'in zaten
desteklediği `{label, onClick}` şekli kullanıldı.

**3. `loadMore()`'un `loadingMore` state'ine dayanan çift-tıklama koruması,
aynı tick içindeki iki tıklamaya karşı etkisizdi.** Dört provider'ın
`loadMore` callback'i `if (loadingMore || !cursorRef.current) return;`
kontrolünü, `useCallback`'in `[loadingMore]` bağımlılık dizisinden gelen
KAPANIŞ (closure) değerine bakarak yapıyordu — React `setLoadingMore(true)`
çağrısını hemen uygulamadığından (batching), aynı render'ın buton
tıklamasından gelen iki senkron çağrı ikisi de `loadingMore === false`
görüp aynı sayfayı iki kez isteyebiliyordu (sonuç yanlış olmuyordu, çünkü
`seen` Set'i dedupe ediyordu, ama gereksiz, önlenebilir bir çift ağ isteği
gerçekleşiyordu). **Düzeltme:** state'in yanına, her render'dan bağımsız
senkron bir `loadingRef = useRef(false)` eklendi; guard artık bu ref'e
bakıyor (`loadingMore` state'i yalnızca UI'ın `disabled`/"Yükleniyor…"
göstergesi için kalmaya devam ediyor), `useCallback`'in bağımlılık dizisi
boşaldı (callback artık yeniden oluşturulmuyor, referans kararlı).

**Nasıl doğrulandı:** Her üç bulgu da önce gerçek `git diff 2476808 d3206c7`
çıktısıyla (1. ve 2./3. için ilgili dosyaların önce/sonra hâli) doğrulandı,
varsayılmadı. Düzeltmelerden sonra `npx tsc --noEmit`, `npm run lint`, ve
placeholder Supabase env ile tam `npm run build` (37 rota, değişmedi) sıfır
hatayla geçti. Gerçek bir tarayıcıda uçtan uca test bu sandbox'ın
`*.supabase.co`'ya hâlâ doğrudan erişemeyen ağ kısıtı yüzünden yine
yapılamadı (Bölüm 17'den beri tekrarlanan aynı sınırlama) — kullanıcının
canlı sitede Ana Sayfa'nın/Keşfet'in artık eskisi kadar dolu göründüğünü ve
bir filtre boş sayfaya düştüğünde "Daha fazla yükle"nin göründüğünü bizzat
doğrulaması gerekiyor.

**Kapsam dışı bırakılan, hata SAYILMAYAN bir gözlem:** `code-review`
skill'inin raporladığı üçüncü bulgunun ciddiyeti (çift ağ isteği) düşüktü —
veri bütünlüğünü bozmuyordu, yalnızca gereksiz bir round-trip'ti; yine de
ucuz ve risksiz bir düzeltme olduğundan uygulandı.

**Bilinen sınırlamalar:** Yok — bu, bir önceki bölümün kendi gerçek
regresyonlarını kapatan, dar kapsamlı bir düzeltme turu; yeni bir mimari
sınırlama getirmedi.
