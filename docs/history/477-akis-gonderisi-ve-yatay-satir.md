# 9.477 — Akış gönderisi ("A") ve yatay satır ("D")

Kullanıcı, `Promptly Kart Yönleri` mockup'ındaki A (Akış gönderisi) ve D (Yatay satır) yönlerinin sitede uygulanmasını istedi; plan ve yüzey haritası bir mockup sayfasında onaylandı (kart yönleri → "A ve D Planı"). Bu iş **266-\*** (görsel kart), **277-\*** (başlık görselin üstünde, açıklama yok) ve **337-\*** / 196-\* ("her liste `ContentGrid`, ikinci liste görünümü yok") kararlarını, onaylanan yüzeyler için geri alır. Veritabanı, Edge Function ve migration değişikliği YOKTUR.

## A — akış gönderisi (`ContentCardPost`)

Akıştaki tüm kartlar zaten `FeedItemCard` → tür kartı → `ContentCardPost` zincirinden geçtiği için A tek bileşende uygulanır; Ana Sayfa (Sana özel, Takip Ettiklerin paylaşımları), Keşfet (editoryal şeritler + Tüm paylaşımlar), topluluk akışı, alıntı ve başvuru kartları birlikte değişir.

- Görsel: 12 px köşe (`rounded-md`), tür yuvarlak simgesi ve koyu degrade (`art-scrim`) yok, görselin üstünde hiçbir yazı yok. Çıktı kendi kırpılmış oranını korur (`clampedAspectRatio`); `< sm`'de görsel en çok kare (`max-sm:max-h-[calc(100vw-1.5rem)]`, ortadan kırpılır). Durum rozetleri sağ altta kalır; "+N" çipi sol üstte.
- Altında gerçek metin: kicker (`ContentTypePill` = tür · araç, sağ ucunda `time`), başlık (`ContentCardTitle`, `text-h3` 17/700), iki satırlık Spectral özet (`description`; `{değişken}` jetonları küçük mono çip), avatar + ad + sayaçlar.
- Özet kaynağı: prompt açıklaması; açıklaması olmayan görsel/video/ses promptunda prompt metni; metin promptunda yalnız açıklama (metin zaten sanatta). İstek: görsel varsa açıklama (görselsizde açıklama sanatta). Workflow/ayar paketi: açıklama. Skill: özet. Alıntı/başvuru: not özetin yerine geçer (`data-quote-note`, `data-post-note`).
- Yazı yüzeyleri (`TextArt`): başlık artık sanatın içinde değil (`TextArtTitle` kaldırıldı, `titleInArt` kalktı); `pr-14` (tür dairesi payı) `p-4` oldu. İstek durum rozeti "Açık · 4 yanıt" olur (sanattaki yanıt sayısı satırı kalktı).
- `ContentTypePill` artık görsel üstü değil görsel altı kickeridir (marka rengi + sönük araç). `PromptCardSkeleton` yeni düzeni yansıtır.

## D — yatay satır

- **Tam satır = aynı kart bileşenleri**: `ContentGrid layout="rows"` ya da bir bölgeyi saran `ContentRowsScope` (`author`, `own`) altında `ContentCardPost` `CardLayoutContext`'ten satır çizer (kare görsel 104/144/192 px; kicker + zaman + durum; başlık; özet; yazar; sayaçlar; kutusuz, alt çizgili; `grid-template-columns: repeat(auto-fill, minmax(min(100%,30rem),1fr))`). Ayrı bir "satır kartı" adaptörü yazılmadı. `RowNoteContext`: satırın altına küçük not (ortak koleksiyonda "Ekleyen").
- `own` (İçeriklerim): durum rozeti yoksa "Yayında" rozeti, yazarsa "Düzenle" düğmesi (`editHref`; her tür kartı kendi düzenleme adresini verir: `/create?edit=`, `/requests/new?edit=`, `/workflows/create?edit=`, `/presets/create?edit=`, `/skills/create?edit=`). Özel prompt "Sadece ben" rozeti taşır (`prompt.privateBadge`).
- **Yüzeyler**: Arama (`search-view.tsx`; skill/alıntı sonuçları dahil) · Koleksiyon + Kaydedilenler (`collection-entry-list.tsx`) · Profil bölümleri (`profile-view.tsx`; yazar satırı gizli, yalnız Beğeniler'de görünür) · İçeriklerim (`my-content-view.tsx`).
- **Küçük satırlar** (`features/content/content-row.tsx`): `ContentThumb`, `ContentRowKicker`, `ContentRowSmall` (sm 72 px / xs 56 px). Kullanıldığı yerler: ekip dosyası / koleksiyona ekle seçicisi (`ContentPickerDialog`: kare kutulu çoklu seçim + altbilgide "Ekle (N)"; satır `data-picker-add` kutusu seçer, `data-picker-add-selected` toplu ekler), Space panosu "Promptly'den ekle" (`board-content-picker.tsx`), "Benzer" yan sütunu (`RelatedCards` xs), Keşfet "popüler promptlar" numaralı sıralı liste (`discover-editorial.tsx`, `data-discover-ranking`). Tek seçimli listeler (`ChatLibraryPicker`, yorum ekı seçicisi, paylaşım ve başvuru seçicileri) `OptionRowGroup`'un yeni hâlidir: kapak + kicker + başlık, uçta halka/nokta (`SelectMark`), `reselect`.
- Kapak görselleri: ekip seçicisi sorgu sonucundaki medyadan, sohbet/yorum/paylaşım seçicileri `usePickerCards` (`fetchAttachmentCards`, görünen içerikler için TEK sorgu) ile; ayar paketi ve Skill kapaksız olanlarda tür simgesi.

## Testler / kontroller

`tests/messaging-ui/run-card-title.mjs` yeni düzene göre yeniden yazıldı (başlık/özet/kicker görselin altında, görselin üstünde yazı yok, 12 px köşe, `< sm` kare sınırı, masaüstünde dik oran). Ağ taklitli; gerçek Supabase'e / cihaza KARŞI DENENMEDİ.

## Dokunulmayanlar

Odak, "Öne çıkan" büyük kart (`featured-post-card.tsx`), misafir vitrini (coverflow), yorum ekinin küçük kartı (`compact-content-card.tsx`), hikâye / bildirim / kişi-topluluk-koleksiyon kartları.
