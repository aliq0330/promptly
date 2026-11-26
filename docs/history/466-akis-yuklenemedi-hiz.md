# 466 — "Akış yüklenemedi" ve donmalar: sunucuya daha az, daha hafif iş

## Sorun (canlı ölçüm, 26 Kas 2026)

Ana Sayfa ara sıra "Akış şu anda yüklenemedi" ve "Hikâyeler yüklenemedi" diyordu.
- Hatalar Postgres'in `canceling statement due to statement timeout` iptalleriydi (`authenticated` 8 sn, `anon` 3 sn). Son 24 saatte `feed_page` 44, `search_content` 9, `for_you_page` 2 kez 500 döndü.
- Hatalar 1–3 dakikalık **donma anlarında** toplanıyordu (24→25 Kas: 9 dakika, 25→26 Kas: 8 dakika). Donma sırasında `is_moderator` gibi en basit sorgu bile 10+ sn sürdü; başarısız isteklerin ortalaması 27 sn, en uzunu 80 sn. Diğer zamanlarda API ortalaması 0,1–0,4 sn.
- Sunucu **Nano** (Free plan, ~0,5 GB RAM, paylaşımlı CPU). Bellek sürekli dolu, swap kalıcı (~500 MB), "Memory commitment" panelde SEVERE. CPU, disk ve bağlantı sınırı dolmuyordu.
- Asıl çarpan **soğuk bağlantı**: PostgREST boşta kalan bağlantılarını kapatıyor, dalga gelince yenilerini açıyor. Yeni bağlantının ilk sorguları katalog/RLS yüklemesi yüzünden çok yavaş: RLS'li bir sayım soğukta 406 ms, sıcakta 3,5 ms; `for_you_page` soğukta 898 ms, sıcakta 134 ms. Veritabanı küçük (72 MB, 3 478 prompt) ama 877 işlev / 253 politika / 497 index var.
- Uygulama açılışında aynı anda 20+ istek gidiyordu; aynı isteğin 4–7 kopyası da vardı (07:43:02'de 4× bildirim sayacı, 7× `conversation_members`, 6× `team_my_mutes`). Sebebi: supabase-js her oturum olayında yeni bir `user` nesnesi veriyor ve `[user]`'a bağlı her efekt aynı kişi için baştan çalışıyordu.
- `realtime.list_changes` toplam süresi en yüksek sorguydu ama 68 günlük pencerede ortalama CPU'nun ~%0,4'ü; asıl suçlu değil.

Kullanıcı kararı: Pro plan alınmayacak, prosuz yapılabilecek her şey yapılacak.

## Yapılanlar

1. **Son liste cihazda** (`lib/feed-snapshot.ts`): Sana özel, Takip Ettiklerin, Keşfet/konu/misafir/Odak listeleri (`useFeedPages`), Keşfet editoryali ve hikâye şeridi önce bu cihazdaki son kopyayla açılır, gerçeği arkadan gelir. Gerçeği gelmezse liste kalır, üstünde tek satırlık `StaleFeedNotice` ("Bağlantı yavaş — son kaydedilen akış gösteriliyor · Tekrar dene"). Kopya kişiye göre anahtarlıdır, 24 saat (hikâye 30 dk) geçerlidir, en çok 24 kopya / ~350 KB tutulur, çıkışta hepsi silinir. Saklanan kopya gösterilirken sayfalama kapalıdır.
2. **Geçici hatada yeniden deneme** (`lib/supabase/read-requests.ts` → `retryTransientReads`): salt-okunur istek zaman aşımı (`57014`), bağlantı/havuz hatası (`08xxx`, `53300`, `57P0x`, `PGRST000–003`) ya da 502/503/504/52x alırsa 2 / 5 / 15 sn sonra (±%25) yeniden denenir. Ağ hatası (bağlantı yok) yalnız bir kez, 1,5 sn sonra denenir; hata ekranı geç kalmasın. Gerçek hatalar (ör. `42883`) ve yazmalar tekrarlanmaz. Birleştirme yalnız 1,5 sn içinde başlamış aynı isteğe katılır; asılı kalan isteğe "Tekrar dene" bağlanmaz. Eşzamanlılık sırasında cevap vermeyen istek yerini en çok 15 sn tutar (`run-chat-load` 2/2b bunu yakaladı).
3. **Keşfet açılışı**: editoryalin 6 ayrı akış çağrısı tek RPC'de (`discover_editorial_feed`: aynı `feed_page`/`feed_page_proven` çağrıları, aynı argümanlar, tek bağlantıda sırayla; sonuç birebir aynı). Şeritlerin satırları ve konu kapakları tek doldurma turunda okunur. Yaratıcılar, araçlar ve Skill'ler (2. dalga) ile "Tüm paylaşımlar" listesi yalnız görünür alana yaklaşınca yüklenir (`useNearViewportOnce`). "Popüler" önce son 7 günü ister, ancak zayıfsa 30 günü (sonuç aynı, genelde bir istek az). Haftalık sayılar 3 dk önbellekli.
4. **Açılıştaki arka plan istekleri**:
   - `AuthProvider` kimlik ve görünen alanlar değişmedikçe aynı `user` nesnesini verir (`lib/user-identity.ts` `userSignature`), böylece efektler gereksiz yere yeniden çalışmaz.
   - Aynı anda giden aynı okuma tek ağ isteğinde birleşir (`coalesceReads`; yalnız uçuştaki istek, saklanan yanıt yok).
   - Aynı anda en çok 6 okuma ağa çıkar, arka plan okumaları sıranın sonuna geçer (`limitReadConcurrency`); böylece PostgREST sayfa başına daha az soğuk bağlantı açar.
   - `is_moderator` ve sessiz saatler kişiye özel 10 dk cihazda saklanır.
   - Kenar çubuğu ekip listesi telefonda hiç istenmez ve kart önizlemesi (`my_teams_preview`) olmadan okunur.
5. **`for_you_page` hafifledi** (`20261221100000_for_you_page_fast.sql`): imza ve sonuç aynı.
   - Kişinin RLS'e bağlı küçük sinyal kümeleri (beğendiği/ilgilendiği içeriklerin etiketleri, "çekmiyor" yazarları) çağıranın yetkisiyle, eskisiyle birebir aynı sorgularla hesaplanır.
   - Ağır aday taraması SECURITY DEFINER `_for_you_rank`'e taşındı. Bu adaylar için beş içerik tablosunun RLS'i tek koşula indirgenir: "yazar engellenmemiş" (`*_hide_blocked`). O koşul açıkça yazıldı.
   - Etiket sinyalleri aday başına 5 alt sorgu yerine etiket index'inden tek birleştirmeyle sayılır.
   - `_for_you_rank` misafire kapalıdır, kimlik hep `auth.uid()`'dir. Ona verilen sinyal dizileri yalnız çağıranın kendi sıralamasını etkiler; dönen satırlar hep herkese açık içeriktir.

## Kurallar (CLAUDE.md'ye işlendi)

- Salt-okunur `/rest/v1` istekleri üç halkadan geçer: birleştirme, yeniden deneme, eşzamanlılık sınırı.
  - RPC'nin bu halkalara girmesi için `READ_ONLY_RPCS`'te olması gerekir.
  - Listedeki her işlev STABLE/IMMUTABLE olmalı; `read-requests.test.ts` bunu migration'lardan denetler.
  - Yazan bir RPC listeye ASLA eklenmez.
- Yeni bir "liste açılışı" yüzeyi aynı `feed-snapshot` modülünü kullanır, ikinci bir yerel önbellek yazmaz.
- `useAuth().user` kimlik sabitken aynı nesnedir; efekt bağımlılığında `user` yerine `user?.id` tercih etmek yine iyidir.

## Doğrulama

- **Eşdeğerlik:** eski `for_you_page` birebir kopyasıyla yenisi yerel Postgres'te karşılaştırıldı.
  - Rastgele veri: 40 kullanıcı, 1 500 prompt, 4 085 etiket, 1 872 beğeni, 540 ilgi cevabı, 49 engel; sonradan gizlenen/taslağa dönen içerik dahil.
  - Kapsam: 5 süzgeç × 3 sayfa = 600 sayfa, 14 996 satır, **fark 0**.
  - Kasıtlı hata (engel süzgeci kaldırıldı) 120 sayfanın 89'unda yakalandı.
- **Yerel süre** (1 500 prompt): eski 92–127 ms, yeni 38–58 ms.
  - ⚠ Canlıda tersi çıktı: ılık çağrı 105 → 430 ms, çok beğenili hesapta 6 sn (sonuç aynıydı). Sebep SQL dilindeki işlevin genel planı; 467'de düzeltildi (34 ms).
- **SQL testleri:**
  - `supabase/tests/for-you-fast.sql` (10 madde): misafir kapalı, engel iki yönlü, gizli/taslak/silinmiş yok, sahte sinyal sızdırmaz, sayfalama.
  - `supabase/tests/discover-editorial-feed.sql` (5 madde): her bölüm aynı argümanlı `feed_page` ile birebir aynı.
  - Tüm SQL paketi temiz.
- **Birim testleri:** `read-requests.test.ts` (14), `feed-snapshot.test.ts` (6), `user-identity.test.ts` (3).
- **İstek ölçümü** (`tests/perf/measure-requests.mjs`, taklit ağ; ilk ziyaret → aynı tarayıcıda 2. yükleme):

  | Sayfa | Önce | Sonra | 2. yükleme önce | 2. yükleme sonra |
  |---|---|---|---|---|
  | Ana Sayfa (oturumlu) | 25 | 22 | 17 | 14 |
  | Keşfet | 29 | 22 | 23 | 15 |
  | Bildirimler | 17 | 15 | 11 | 8 |
  | Topluluklar | 21 | 17 | 13 | 10 |
  | Mesajlar | 17 | 14 | 11 | 8 |
  | Prompt detay | 15 | 15 | 10 | 7 |
  | Profil | 24 | 24 | 19 | 16 |

  - Aynı isteğin tekrarı ilk yüklemelerde 18'den 3'e indi.
  - Keşfet'te 7 `feed_page` yerine 1 `feed_page` + 1 `discover_editorial_feed` gidiyor.
  - Düzen kayması (CLS) değişmedi: Keşfet 0,081 → 0,084, Ana Sayfa 0,012 → 0,012.
  - İlk ziyaretteki Ana Sayfa tekrarlarının sebebi `OwnProfileProvider`'ın oturum gelince bir an "yüklendi, profil yok" demesiydi: ilk giriş kapısı sayfayı çizip kaldırıyordu. Profilin hangi kullanıcı için yüklendiği artık izleniyor.
- **Arayüz paketleri** (ağ taklitli Playwright):
  - CI kesitindeki 20 paketin hepsi geçti; bunlardan `run-chat-load` önce 4/6'ydı, yukarıdaki düzeltmeyle 6/6 oldu.
  - Ek olarak `run-discover` 8/8 (test, tembel bölümlere kaydırılacak biçimde güncellendi), `run-feed-scroll`, `run-topic-pages`, `run-creator-suggestions`, `run-interest`, `run-auth-storage` temiz.
  - `run-stories` 21, `run-focus-feed` 15/27/28 ve `run-community-home` 4 aynı derleme bayraklarıyla `main`'de de aynı biçimde düşüyor; bu değişiklikle ilgisiz.
- **Skill sayfası (CI'da yakalandı):** `run-skills-package` 14 sıra sınırıyla kırıldı.
  - Sayfa, sürümler gelmeden çiziliyordu: indirme düğmesi bir an "SKILL.md indir" diyordu (o anda basılırsa ZIP yerine onu indirirdi).
  - Aynı anda başka okuyucu, yayınlanan anlık görüntü yerine sahibin çalışma kopyasını görüyordu (415-*).
  - Bu eski bir boşluktu; okumalar sıraya girince uzadı. `skill-detail-view.tsx` artık sürümler gelene kadar iskelet gösterir.
  - Aynı CI turunda `run-skills-package` 3 (çift yükleme) bir kez düştü; yerelde, yük altında 11 denemede tekrarlanmadı. Depolama yüklemesi bu halkalardan geçmez.
- **İngilizce:** yeni metin `feed.staleNotice` TR + EN eklendi.
