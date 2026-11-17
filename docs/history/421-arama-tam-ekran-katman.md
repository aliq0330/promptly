# 421 — Arama: tam ekran katman (telefon) + komut paleti (masaüstü)

Tarih: 2026-11-17. **Durum: uygulandı (repoda). Yalnız istemci kodu, migration YOK.** Kullanıcı telefonda arama kutusuna dokununca açılan öneri panelinin çok yer
kapladığını ve Filtre'yi açamadığını bildirdi. Kök neden: panel kutunun altına `absolute` yüzen bir katmandı (`max-h` ekranın %55'i) ve Filtre düğmesi
kutunun hemen altındaki satırdaydı; ekran klavyesi de açılınca düğme panelin arkasında kalıyor/ekranın dışına itiliyordu. Dört yön mockup olarak çizildi
(A kompakt açılır · B tam ekran · C alt sayfa · D filtre çipleri), kullanıcı **B**'yi seçti.

## Kullanıcı gözüyle
- **Arama kutusu artık bir kapıdır:** tek satır, mevcut sorguyu gösterir (salt okunur), altında seçili çipler tek satırlık şeritte. Dokununca (ya da odaktayken
  Enter / boşluk / ↓) katman açılır; kutu odaktayken harfe basmak katmanı o harfle açar.
- **Telefon (< md):** tam ekran. Üstte sabit: ← · yazı alanı · Filtre (etkin sayı rozetli). Altında çipler, sonra öneriler (boşken Son aramalar + Popüler etiketler,
  yazınca kişi / etiket / Biçim / Tür / araç), klavyenin hemen üstünde tek büyük eylem **“…” için sonuçları göster** (yazı ya da çip varken). Katman görünür
  alana oturur (`useKeyboardViewport`): klavye açıkken alt eylem klavyenin üstünde kalır, Filtre düğmesi hiç örtülmez.
- **Filtre modu:** aynı ekran filtreye döner: ← · "Filtrele" · Temizle, altında sekmeler (Biçim · Tür · Kullanıcılar · Etiketler · Araçlar · Sıralama; seçili sayısı
  rozetli), altta **Uygula** (katmanı kapatır; çipler zaten canlı uygulandı).
- **Masaüstü (md+):** ortada komut paleti (en çok 768 px, `78dvh`). Solda ray: **Ara** + Filtre grupları (sayı rozetli), sağda öneriler ya da seçili grup,
  altta tuş ipuçları (↑ ↓ gez · Enter seç · Esc geri) ve “Sonuçları göster”. Esc önce aramaya döner, ikincisi kapatır.
- Enter: açık satır / `@`-`#` ile ilk öneri çip olur (katman açık kalır, sorgu büyür); aksi hâlde sonuçları gösterir (metin son aramalara yazılır). Geçmiş satırı
  seçmek metni yazıp sonuçları gösterir. Boş kutuda Backspace çipi önce işaretler, ikincide siler (eskisi gibi).
- Sayfa arkada canlı aramaya devam eder; katman kapanınca sonuçlar hazırdır.

## Kodda
- `features/search/search-overlay.tsx` (yeni; `SearchOverlay`): öneri mantığı eski `AdvancedSearchBox`'tan buraya taşındı (aynı sunucu çağrıları, `entries`, son
  aramalar). `Portal` + `lockBodyScroll`, `z-(--z-picker)` (içerik seçici `Modal`'ının da üstünde), `useKeyboardViewport`, Escape belgede **yakalama
  aşamasında** (odak hiçbir yerde olmasa da çalışır, alttaki `Modal`'ı kapatmaz), Tab katman içinde döner (`tabTarget`).
- `features/search/advanced-search-box.tsx`: yalnız kapı + çip şeridi + katmanı açma. Yeni isteğe bağlı `filters` (`SearchOverlayFilters`: `render(section)`,
  `count`, `onClear`, `hideKinds`); verilmezse katmanda Filtre yoktur (içerik seçici gibi filtresi başka yerde olan sayfalar).
- `features/search/search-chip-strip.tsx` (yeni): çip şeridi kapıda ve katmanda ortak.
- `search-filter-sections.tsx`: `SearchFilterSections` yeni `section` prop'u (tek grup, başlıksız) + `SEARCH_FILTER_SECTIONS` / `SearchFilterSectionKey`;
  paylaşılan Filtre penceresi aynı kalır (hepsi, başlıklı).
- `search-view.tsx`: katmana `filters` verir (yalnız gönderi sonuçlarında).
- i18n (TR+EN): `search.showResults`, `search.showResultsFor`, `search.railSearch`, `search.filterSectionsAria`, `search.hintKeys`.
- Test: `tests/messaging-ui/search-helpers.mjs` (`openSearch`, `searchFor`, `searchOverlay`); `run-search-notifications` 7b uyarlandı, yeni 7d (telefon tam ekran, Filtre
  sekmeleri, Sonuçları göster), 7e (palet, ray, Esc), 7f (İngilizce); `run-feed-filters` ve senaryo 2/7 yazmayı yardımcıyla yapar.

## Bilinçli sınırlar / açık
- **Canlı sonuç sayısı yok** (“128 sonuç”): arama toplam sayı döndürmüyor; düğmeler sayısız.
- Geri tuşu/hareketi katmanı kapatmaz (diğer katmanlar gibi sayfadan çıkarır); katman tarihçe kaydı açmaz.
- iOS'ta katman açılırken `autoFocus` jest zincirinden çıkarsa klavye ikinci dokunuşta gelebilir; gerçek cihazda **denenmedi**. Ağ taklitli Playwright'ta sınandı.
- Masaüstü rayında kapsam daraltma (yalnız Kişiler / yalnız Etiketler) yok; öneriler gruplu tek listedir.
- `ContentListPage` ve ekip içerik seçici de aynı kapıyı kullanır (seçicide Filtre modu yok; kendi satır içi Filtre bölümü durur).

## Düzeltme (aynı gün): iOS'ta katman klavyeye göre kısa kalıyordu
Gerçek iPhone ekran görüntüsünde katman klavyenin üstündeki alandan kısa açılıp altında sayfayı gösteriyordu (kendiliğinden bazen düzeliyordu). Neden: katmanın
kendisi `visualViewport` ölçümüyle (`--kb-top`/`--kb-h`) boyutlanıyordu; iOS klavye kayarken görünür alanı adım adım bildirir ve açılışta odaklanan giriş ilk
olayları kaçırır, eksik ölçüm kalıyordu.
- Katmanın **kendisi** artık telefonda her zaman tüm ekranı opak zeminle örter; yalnız içindeki panel ölçülen görünür alana oturur (`max-md:absolute`, `--kb-top`/`--kb-h`).
  Ölçüm yanlış olsa da altta sayfa görünmez.
- `useKeyboardViewport` ölçümü sağlamlaştırıldı (tüm tüketiciler — `Modal`, sohbet paneli — yararlanır): açılışta ve `focusin/focusout/orientationchange/window resize`
  sonrasında 120/350/800 ms'de yeniden ölçer.
- Test: `run-search-notifications` 7g (kısa ölçüm taklidi: katman tam ekran + opak, panel ölçüye oturur). Gerçek iPhone'da yeniden **denenmedi**.
