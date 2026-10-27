# 254 — Sayfalama: profil "1000" sorunu, Odak'ın "Yükleniyor"da kalması ve diğer sınırsız listeler

**Durum: uygulandı (repoda). Migration `20260928110000_feed_page_has_media.sql` (yalnızca ekleyici/değiştirici, `drop` yok) — `main`'e birleşince `deploy.yml` uygular (önce migration, sonra istemci). Gerçek Supabase'e / oturuma / cihaza karşı DENENMEDİ (aşağıdaki "Doğrulama").**

## Neden (canlı veriyle bulundu, salt-okunur sorgular)
Kullanıcı: "profilde 3000'den fazla gönderi olmasına rağmen 1000 diyor", "Odak hepsini çekmeye çalışıyor, 'Yükleniyor'da kalıyor". Kök neden ortak:
**PostgREST bir istekte en çok 1000 satır döner** (canlıda `anon` 3 sn, `authenticated` 8 sn sorgu zaman aşımı da var); sayfalamayan her liste sessizce 1000'de
kesiliyor, ekranda ise hepsi birden çiziliyordu. Canlı sayılar: `aliq` 3016 yayında prompt; 3154 herkese açık promptun 3051'i **görselsiz**; en yeni sırada ilk
görselli prompt **3013.** sırada; 1516 etiket.

- **Profil:** `fetchPromptsByAuthor` limitsiz + ağır birleşimli sorguyla tüm promptları çekiyordu (1000'de kesilir); sayaç `liste.length`'ten hesaplanıyordu → "1000".
- **Odak:** "Medya" süzgeci (varsayılan AÇIK) istemcideydi; 18'lik sayfalar sırayla çekilip görselsizler eleniyordu → ilk slayt için ~168 ardışık istek → "Yükleniyor".

## Ne yapıldı
- **Odak (`feed_page` 17 argümanlı biçim, `p_has_media`):** süzgeç sunucuda — prompt: görseli var ya da video/ses türünde; workflow: görseli var; istek ve hazır ayar HEP girer (görselsizse kendi
  metni/parametre özeti); Space/alıntı girmez. 16 argümanlı eski imza ince sarmalayıcı oldu. İstemci (`fetchFeedPage` `hasMedia`) yalnız Medya açıkken 17 argümanlı biçimi çağırır;
  veritabanında yoksa (`PGRST202`) süzgeçsiz yineler ve eskisi gibi istemcide süzer. Medya açıp kapatmak artık listeyi yeniden okur. `profile_content_stats(uuid)` (INVOKER): profil sayıları + kullanım toplamı.
- **Profil / Kütüphanem / Beğeniler / Kaydedilenler / koleksiyon:** 24'erli sayfa (`usePagedList`, `fetchAuthorPromptsPage` / `fetchLikedPromptsPage` / `fetchSavedItemsPage` /
  `fetchCollectionItemsPage`; toplam yalnız ilk sayfada `count: exact` ile), "Daha fazla" + görünür alana girince kendiliğinden (`LoadMore auto`). Süzgeç/sıralama/arama sorguda
  (tek `or` grubu: görünürlük kuralı VE başlık/açıklama eşleşmesi). Profil sayıları `profile_content_stats`'tan. Filtre simgesi liste yenilenirken kaybolmaz (açık filtre penceresini kapatıyordu).
- **Tümünü okuyan listeler (`fetchAllRows`, `src/lib/supabase/paged.ts`):** etiket kataloğu (1516 etiket, 1000'de kesiliyordu), Dışa aktar (3016 promptluk kütüphane yalnız ilk 1000'i veriyordu, uyarı yoktu), isteklerim/workflow/hazır ayar
  listeleri, yorumlar, taslaklar, engellenenler (kesilirse 1001. kişinin içeriği yeniden görünürdü), mesaj tepkileri, değişken tanımları. Hata olursa fırlatır — yarım liste bütün gibi görünmez; tavan 20 000 (`truncated`).
- **Taslaklar:** hepsi okunur (hafif satır) ama 50'şer çizilir (toplu yüklemeden binlerce taslak kalır).
- **Bildirimler:** 60'arlı sayfa + "Daha fazla"; zilin/“Tümünü okundu say”ın sayısı veritabanından (`head` sayımı), gerçek zamanlı olay yüklenen aralığı yeniden okur.
- **Koruma testi:** `src/lib/supabase/unbounded-queries.test.ts` — `.range/.limit/.single/head/fetchAllRows` olmayan her liste sorgusu, küçük kalma gerekçesiyle `BOUNDED_BY_DESIGN`'a yazılmadıkça testi kırar (eski/gereksiz giriş de kırar).

## Kararlar / bilinçli sınırlar
- Profilde arama yalnız başlık + açıklama (eskiden etiket de aranıyordu — tek `or` grubu kuralı gereği; etiketle bulmak için etiket sayfası var). Tür süzgeci her zaman 4 türü sunar (artık "listede hangi türler var" bilinemez).
- Beğeniler, Kaydedilenler ve koleksiyonda arama/tür süzgeci YÜKLENEN sayfaları süzer (kaydırdıkça artar); bildirim kategori sayıları da yüklenen kadardır (zil sayısı değil).
- Yorumlar, sürüm geçmişleri vb. küçük listeler tam okunur (sayfalı arayüz yok); tek bir içerikte binlerce yorum olursa çizim yine ağırdır.
- Toplu yüklenen 3016 prompt yayında ve en yeni sırada: Ana Sayfa/Keşfet "En yeni" ve takipçilerin akışı bunlarla doluyor (ayrı ürün kararı; moderasyondaki "damla damla yayınlama" ile yönetilir).

## Doğrulama
- `supabase/tests/feed-page-media.sql` 13/13 (süzgeçsiz çağrılar ve 16/13/11/10 argümanlı sarmalayıcılar aynı satırlar; medya kuralı; Space/alıntı girmez; yalnız daraltır; keyset sayfalar eksiksiz/tekrarsız;
  **300 yeni metin promptu öndeyken ilk medya sayfası dolu**; ziyaretçi; yetkiler; `profile_content_stats` ziyaretçi/sahip). Mutasyonla (medya koşulu kaldırılınca 3/6/8/9 yakalandı). Diğer SQL test dosyaları `FAILED=0`.
- `npm test`: `paged.test.ts` (3016 satır → 4 istek, tam katları, hata, tavan) + `unbounded-queries.test.ts`.
- Arayüz (ağ taklitli): `run-pagination` 10/10 (3016 promptlu profil: sayı sunucudan, 24 kart, offset 24, süzgeç/sıralama/arama sorguda, Beğeniler, Kütüphanem, Kaydedilenler + koleksiyon, 130 taslak, 1516 etiket, İngilizce/390 px),
  `run-focus-feed` 34/34 (33–34 yeni: tek istekte dolu ilk sayfa, kapat/aç, migration yokken geri dönüş), `run-search-notifications` 11/11 (9 yeni: 130 bildirim, sayı veritabanından).
- Denenmedi: gerçek Supabase (3016 gerçek kayıtla süre/zaman aşımı), gerçek oturum, telefon. `count: exact` büyük tablolarda gerçek maliyeti ölçülmedi.
