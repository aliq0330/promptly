# 221 — Ana Sayfa / Keşfet süzgeç düzeni (eksen ayrımı)

**Durum:** uygulandı (istemci + bir ekleyici migration). `20260922100000_feed_filters.sql` **canlıya UYGULANMADI** (kullanıcı onayı bekler). Gerçek Supabase'e / gerçek oturuma / cihaza KARŞI DENENMEDİ — SQL yerel PostgreSQL'de, arayüz ağ taklitli Playwright'ta sınandı.

## Sorun
Ana Sayfa (Sana özel · En yeni · Popüler · Takip · Etiketlerim + tür çipleri + kategori/tür süzgeci) ile Keşfet (tür bölümleri + sıralama + aynı kategori/tür süzgeci) aynı üç şeyi iki yerde yapıyordu: gönderi türü (Ana Sayfa'da çip, Keşfet'te bölüm), sıralama (Ana Sayfa'da balon, Keşfet'te menü), kategori süzgeci (ikisinde de). "Takip ettiklerim" ise iki ayrı sekmeye bölünmüştü (kişiler / etiketler); araç takibi hiçbir sekmede yoktu.

## Karar: iki eksen
- **Ana Sayfa = benim akışım.** "Kimi / neyi takip ediyorum, bana ne uygun?" Sekmeler: **Sana özel** (varsayılan) ve **Takip Ettiklerim**. Süzgeç: gönderi türü çipleri (Hepsi · Promptlar · İstekler · Workflow'lar · Hazır ayarlar) ve "takip ettiklerim" süzgeçleri.
- **Keşfet = yeni şey bulma.** İçerik kategorileri + sıralama + gelişmiş süzgeçler + takip edilecek şeyler (AI Araçları, Etiketler, Yaratıcılar, Topluluklar).
- **Takip kalıcı tercihtir, süzgeç geçici görünümdür.** Süzgeçte bir şey seçmek takip etmez / bırakmaz; "Temizle" yalnız görünümü sıfırlar. Takipten çıkılan etiket/araç seçimi süzgeçten kendiliğinden düşer (`useEffectiveFollowedFilter`).

## Ana Sayfa
- Sekmeler **Sana özel** + **Takip Ettiklerim**; **En yeni / Popüler / Etiketlerim kalktı** (Popüler zaten Keşfet'in açılışı, Etiketlerim yerine etiket süzgeci var). Kategori / içerik türü süzgeci Ana Sayfa'dan **kalktı** (yalnız Keşfet'te).
- **Takip Ettiklerim** = takip edilen kişilerin gönderileri, **kronolojik** (`feed_page` kapsam `following`, sıra `newest`; Space ve alıntıları da dahil). Yeniden sıralama yok.
- **Sana özel**: sıralaması **DEĞİŞMEDİ** (`for_you_page`, gerçek sinyaller: takip edilen kişi/etiket/araç, ilgi alanı, beğenilen etiketler; her kartta gerçek neden). Kullanıcı "Benim akışım" yeniden tasarımını sonra yapacak; bu iş ona dokunmaz. Bu görünümde takip edilenler süzgeci **yoktur** (yalnız tür çipleri) — ona da süzgeç eklemek `for_you_page` imzasını değiştirir, yeniden tasarımla birlikte yapılacak.
- **Takip edilenler süzgeci** (yalnız Takip Ettiklerim'de, Filtre penceresinde): Kişiler (≥12 kişide arama kutusu), Etiketler, AI araçları — hepsi takip edilenlerin çipleri. Seçilenler sekmenin altında kaldırılabilir hap olarak görünür + "Filtreleri temizle". Boş sonuçta "Bu filtrelere uyan paylaşım yok" + temizle düğmesi.
- **Birleşim kuralı** (arama çipleriyle AYNI, `tokensToQuery`): farklı süzgeç türleri **VE**; kişiler ve araçlar kendi içinde **VEYA**; seçilen etiketlerin **hepsi** gönderide olmalı. Kural sunucuda uygulanır.
- Süzgeç/sekme/tür değişince sorgu anahtarı değişir (`useFeedPages` anahtarı kümeleri değerle ve sırasız taşır): imleç sıfırlanır, eski sayfalar karışmaz, geç gelen eski yanıt yok sayılır.
- Misafir: iki görünüm de giriş ister, akış isteği yapılmaz (üstte canlı vitrin aynı).

## Keşfet
- Bölümler: **Tümü · Promptlar · İstekler · Workflow'lar · Hazır Ayarlar · Spaces · Alıntılar · AI Araçları · Etiketler · Yaratıcılar · Topluluklar** (Spaces ve Alıntılar kaldırılmadı; normal gönderi gibi akıyorlar).
- **Sıralama: Önerilen (varsayılan) · En yeni · Popüler · En çok kullanılan** (yalnız Promptlar'da — gerçek bir kullanım sayacı olan tek tür: `copy_count`). "En eski" Keşfet'ten kalktı (profil/liste sayfalarında duruyor).
  - **Önerilen** = kişiselleştirilmemiş, zamandan bağımsız etkileşim puanı: beğeni×3 + kaydetme×2 + yorum×2 (+ prompt'ta kopyalama×2, istekte yanıt×2). Zamandan bağımsız olduğu için keyset sayfalama kaymaz. **Gerçek kişisel öneri DEĞİLDİR**; adı kullanıcı isteğiyle "Önerilen". **Popüler** = yalnız beğeni sayısı.
  - Hazır ayarların `use_count` sütunu var ama istemci `preset_uses`'a hiç satır yazmıyor (sayaç hep 0), iş akışında kullanım sayacı yok, istekte "kullanım" anlamsız → "En çok kullanılan" bu türlerde sunulmaz (sıralama listesi bölüme göre).
- **Gelişmiş süzgeç seçili bölüme uyar**: tür/kategori/alt kategori + **AI aracı** (yeni, mevcut `p_tool`) içerik bölümlerinde; istek durumu (açık) yalnız İstekler'de; **Spaces/Alıntılar'da çizilmez ve sorguya karışmaz** (eskiden başka bölümden kalan kategori seçimi Space sorgusuna taşınıp listeyi sessizce boşaltıyordu — düzeltildi). Seçimler bölümler arasında korunur; seçili araç, seçili içerik türüne uymuyorsa sorguya girmez. Boş sonuçta "Filtreleri temizle".
- **AI Araçları** bölümü: katalog araçları, **gerçek gönderi sayısına** göre (`discover_tool_counts`), araç sayfasına bağlantı + Takip Et. Sayılar yüklenemezse sayısız listelenir (uydurma sayı yok).
- **Etiketler** bölümü: gerçek kullanım sayısıyla, en çok kullanılan önce, yükselen etiketler (yalnız gerçek veri varsa), her satırda Takip Et. `/tags` tam dizin sayfası olarak durur.
- **Topluluklar** bölümü: `/communities/all` gözat listesi gömülü (`EmbeddedCommunitiesBrowse`); ikinci arama kutusu çizilmez.
- **Arama seçili bölüme göre** (`SearchView` `scope`): Promptlar/İstekler/Workflow'lar/Hazır ayarlar'da yalnız o tür aranır ve sekme satırı çizilmez; Yaratıcılar kişi, Topluluklar topluluk, Etiketler etiket, AI Araçları katalog (ağ yok) arar; Tümü/Spaces/Alıntılar eskisi gibi tüm siteyi arar. Kutunun yer tutucusu bölümü söyler ("Promptlar içinde ara"). Arama sürerken bölüm balonları gizlidir (aramayı temizleyip bölüm değiştirilir) — bölümü değiştirip aynı metni yeniden yazmak gerekir.

## Sunucu (migration `20260922100000_feed_filters.sql`, yalnızca ekleyici)
- `feed_page` 16 argümanlı biçim: mevcut 13 argüman + `p_authors uuid[]`, `p_tags text[]`, `p_tools text[]` (null/boş = süzgeç yok). Süzgeçler yalnız **daraltır**: görünürlük koşulları (yayında, herkese açık, topluluğa ait değil, RLS) aynen durur. Etiket/araç süzgeci verilince Space ve alıntı girmez (tek etiket/araç süzgecindeki mevcut kural); kişi süzgeci Space/alıntıyı sahibine göre süzer.
- `p_order = 'recommended'`. Bilinmeyen sıra eskisi gibi "en yeni".
- 13 argümanlı eski imza ince sarmalayıcı oldu (10/11 argümanlılar onu çağırmaya devam eder). `drop` yok.
- `discover_tool_counts()` (INVOKER, anon + authenticated EXECUTE): araç başına herkese açık gönderi sayısı.
- `for_you_page` DEĞİŞMEDİ.

### Önce migration, sonra istemci — ama kısmen geriye uyumlu
Yeni istemci süzgeçsiz çağrıda eski 10/11/13 argümanlı biçimleri kullanır, yalnız gerçekten bir Ana Sayfa süzgeci seçilince 16 argümanlı biçime geçer. Migration uygulanmadan: Takip Ettiklerim ve Keşfet çalışır; **Ana Sayfa süzgeci seçilirse "yüklenemedi" + tekrar dene** çıkar; **Keşfet "Önerilen" sırası sessizce "en yeni" gibi davranır** (bilinmeyen sıra); AI Araçları sayısız listelenir.

## Doğrulama
- `supabase/tests/feed-filters.sql` **19 kontrol**, `FAILED=0` (temiz veritabanında tüm migration'lar + test): boş dizi = süzgeç yok; kişi / etiket (VE) / araç (VEYA, `midjourneyx` eşleşmez) / üçünün VE'si; dört içerik türü; Space/alıntı kuralı; eski tek etiket/araç parametreleri; `recommended` sırası ve formül; `popular`/`used`/bilinmeyen sıra; keyset sayfalama (süzgeç + sıra altında sayfa boyutu 1 → aynı sıra); `discover_tool_counts`; takip kapsamı + süzgeç; gizli/taslak hiçbir süzgeçle sızmaz. Mutasyon denemesi (etiket VE→VEYA) testi kırdı.
- `feed_page` kullanan eski SQL testleri `FAILED=0`: `topic-pages` (14), `quotes` (47), `space-posts` (39), `community-home`.
- `src/lib/feed-cursor.test.ts`: `recommended` sırası + puan formülü (SQL testiyle aynı sayılar); `npm test` 407/407.
- `tests/messaging-ui/run-feed-filters.mjs` **16 senaryo**, art arda koşularda 16/16: Ana Sayfa sekmeleri/çipleri/Filtre penceresi, kronolojik Takip, süzgeç → `p_authors/p_tags/p_tools`, hap kaldırma/temizleme, takip yazımı yok, sayfalama + süzgeç değişince imleç sıfırlanması, boş durum, Sana özel'de süzgeç yok, misafir, İngilizce + telefon; Keşfet bölümleri, sıralama seçenekleri/`p_order`, bölüme göre süzgeç (Spaces'e taşınmaz), AI Araçları sayıları + Takip Et, Etiketler, Topluluklar (ikinci arama yok), bölüme göre arama, İngilizce + telefon.
- Güncellenen eski testler: `run-quotes` ve `run-space-posts` alıntı/Space'i artık Keşfet'te (Tümü) açar (Ana Sayfa "En yeni" balonu kalktı); 12/12 ve 7/7.

## Bilinçli sınırlar / açık
- **Sana özel'e takip edilenler süzgeci yok** ve sıralaması aynı — "Benim akışım" yeniden tasarımıyla (kullanıcı kararı) birlikte.
- Önerilen kişiselleştirilmemiş ve zamandan bağımsız (yeni içeriği öne almaz; "En yeni" bunun için). Zamanı katmak sıralamayı oturum boyunca sabitleyen bir `p_as_of` ister (Sana özel'deki gibi).
- Süzgeçte takip edilen kişi listesi en çok 200 kişi (arama kutusu bu 200 içinde süzer); "takip ettiğim her etiketteki TÜM gönderiler" artık tek sekme değil — etiket sayfası (`/tags/local`) var.
- Hazır ayar kullanım sayacı istemciden hiç yazılmıyor (kayıt `preset_uses`); düzeltilirse Hazır ayarlar'a "En çok kullanılan" eklenebilir.
- Keşfet'te arama sürerken bölüm değiştirilemez.
- Gerçek Supabase'e / gerçek ağ gecikmesine / iOS Safari'ye karşı denenmedi.

İngilizce karşılıklar EKLENDİ (`translations-filters.ts`: `feed.filter*`, `feed.activeFiltersAria`, `feed.removeFilter`, `feed.clearFilters`, `feed.filteredEmpty*`, `discover.sort*`, `discover.section*`, `discover.searchIn`, `discover.tool*`). Artık hiçbir yerde kullanılmayan `home.tabTags`, `feed.emptyTags*`, `feed.goToTags` anahtarları kaldırıldı.
