### 9.67 Dört liste sayfası tek yerleşimde + Promptlar sayfası

`/prompts` (yeni), `/requests`, `/generators`, `/workflows` artık tek ortak bileşeni kullanıyor: `features/content/content-list-page.tsx` (`ContentListPage`). Üstten alta: eyebrow + başlık + açıklama + "oluştur" butonu, 3 adım kartı, gelişmiş arama kutusu (`AdvancedSearchBox`: kullanıcı/etiket/araç/tür çipleri, serbest metin, sıralama), tür çipleri (Tümü/Görsel/Metin/Ses/Video; kategori/alt kategori ilerledikçe açılır), sonuçlar.
- Arama her sayfada yalnızca o sayfanın içerik türünü arar (sayfa kendi `searchPrompts/searchRequests/searchGenerators/searchWorkflows` fonksiyonunu verir); `AdvancedSearchBox`'a `hideKindSuggestions` eklendi (Prompt/İstek/Generator/Workflow tür çipleri bu sayfalarda öneri olarak çıkmaz).
- İstekler sayfası Açık/Kapandı filtresini `extra` + `postFilter` ile korur. Workflow'da kategori yok: yalnızca tür çipleri (workflow'un zincirlediği türlerle eşleşir).
- Sidebar'a "Promptlar" (`/prompts`) eklendi; mobil alt navigasyona eklenmedi (5 öğe kuralı).
- TR+EN eklendi (`nav.prompts`, `prompts.*`, `request.step*`, `workflow.step*`). Migration yok. tsc/lint/build temiz; tarayıcıda gerçek veriyle denenmedi.
