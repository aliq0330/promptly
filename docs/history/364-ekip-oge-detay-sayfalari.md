# 364 — Ekip projeleri: öğe detay sayfaları (Prompt · Görsel · Not · Palet)

**Durum: KODLANDI (yalnız istemci; veritabanı değişikliği YOK). Ağ taklitli Playwright (`run-team-projects` 30/30) + birim testi; gerçek Supabase/cihazda DENENMEDİ.**
Kullanıcı Claude Design'da hazırlanmış "Gezgin — öğe detay sayfaları" mockup'ını (Liste · Prompt · Görsel · Not · Palet · Pano) siteye uygulamak istedi.
363'te listedeki bir satıra dokununca yalnız o öğenin SEKMESİ açılıyordu ("tek öğeye odaklanma yok" sınırı); bu iş o sınırı kapatır.

## Yapılanlar

| Konu | Karar |
|---|---|
| Adres | `?item=<öğe kimliği>` (alan sayfasında: dosya `?file=` ya da pano `?board=` ile birlikte); palet ayrı tablo olduğu için `?item=palette:<palet kimliği>`. Pano araçları için `?focus=<öğe>` (pano sekmesi o öğeye odaklı açılır). Yardımcılar: `lib/team-item-kit.ts` (`paletteItemParam/paletteItemId/splitPromptTokens`, birim testli), `projectLink` `item`/`focus` alanları. |
| Liste | `AreaFolderList` satırı prompt/görsel/not/palet için öğenin kendi sayfasına gider; workflow/ayar paketi/istek satırı içerik sekmesine gitmeye devam eder (kendi sayfaları var). |
| Üst çubuk | Öğe sayfasında dosya/pano başlık bloğu ve ⓘ gizlenir; `ProjectPathBar` yol çiplerine öğe adı eklenir ve ⓘ yerine **⋯** (`onMore`) çıkar. Geri oku listeye döner. |
| Prompt | `{değişken}` jetonları renkli; **"Değişkenleri doldur" anahtarı** (varsayılan açık): metin ve kopyalanan şey dosya > proje değerleriyle dolar (`effectiveVariables` / `fillProjectVariables`, değeri olmayan jeton AYNEN kalır). "DEĞİŞKENLER" kartı her jeton için değeri + kaynağı (dosyadan / projeden / değer yok) gösterir. Alt çubuk: "Doldurarak kopyala" ↔ "Olduğu gibi kopyala". |
| Onay | Alt çubuk durum + rolle belirlenir: lider + bekleyen → "Değişiklik iste" (not ZORUNLU, `team_review_decide`) / "Onayla"; ekleyen → "Onaya gönder" / "Geri çek". Karar sunucuda verilir (`lib/team-projects.ts` yalnız gösterim aynasıdır). `changes` durumunda "Liderin notu" kartı. |
| Görsel | 4:3 görsel, "Büyüt" çipi → mevcut `ImageLightbox`; Boyut / Biçim / Ekleyen satırları (olmayan veri satırı çizilmez, uydurulmaz); "Panoda göster". |
| Not | Sarı gövde kartı + Bağlı öğe / Görünürlük satırları. |
| Palet | Şerit + renk başına satır, dokununca HEX kopyalanır ("Kopyalandı"). |
| ⋯ menüsü | "Panoda göster" · "Sil" (yalnız `canDeleteItem` / paletteki düzenleyiciye) → onay penceresi → silinince liste. Görüntüleyicide yalnız "Panoda göster". |
| Pano | Yeni sayfa yazılmadı: pano zaten 363'te gruplanmış araç çubuğuyla (`sub=board`) var; "Panoda göster" oraya `focus` ile gider. |
| Dil | `tp.item.*` anahtarları TR+EN (`translations-team-projects.ts`). **İngilizce karşılıkları eklendi.** |

## Bilinen sınırlar / dürüst notlar

- Mockup'taki değişken listesi proje+dosya değişkenlerinin hepsini gösteriyordu; burada metinde GEÇEN jetonlar listelenir (değeri olmayan "değer yok" der).
- "Ekleyen" adı `profiles`'tan ayrı bir okumayla gelir; okunamazsa "Eklendi · zaman" yazılır.
- Görsel "Biçim" adres uzantısından çıkarılır (jpg/jpeg → JPEG); uzantı bilinmiyorsa satır yoktur.
- Görsel/palet/not düzenleme bu sayfada YOK (eski sekmelerdeki pencereler duruyor); prompt "Değişiklik öner" akışı alan listesindeki onay panelinde kaldı.
- Gerçek Supabase, gerçek telefon (iOS Safari) ve panoya odaklanma davranışı gerçek tuvalde DENENMEDİ (yalnız adres ve sekme doğrulandı).
