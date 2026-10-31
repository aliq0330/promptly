# 288 — Prompt metni TAM EKRAN yazma + sabit "Değişkene dönüştür" ve "Hazır ayarlar"

**Durum:** uygulandı (yalnız istemci; migration yok). Mockup kullanıcıyla birlikte seçildi (iki Artifact: "Şablon Editörü Önerileri" → "Tam Ekran Şablon Editörü"),
sonra siteye taşındı. Saf mantık birim testli (`prompt-word-target.test.ts`); arayüz senaryoları `tests/messaging-ui/run-prompt-fullscreen.mjs`'e
yazıldı ama bu oturumda ÇALIŞTIRILAMADI (npm registry'ye erişim yok → `node_modules`/`next build` yok). `tsc` / `lint` / `build` / Playwright çalıştırılmadı;
yalnız sözdizimi ayrıştırıcıyla denetlendi. Gerçek telefona / iOS klavyesine / gerçek Supabase'e karşı DENENMEDİ.

## Önceki deneme (#379 → #380) ile farkı
#379 aynı alanı baştan yazmıştı (formdaki düzenleyiciyi karta çevirmiş, değişken listesi/pencereleri silmişti) ve kullanıcı isteğiyle geri alındı. Bu iş
**yalnızca ekler**: formdaki düzenleyici, Şablon/Önizleme, değişken listesi, "Değişken ekle" seçicisi, Görselden yardım, Hazır ayar satırı ve bütün
pencereler olduğu gibi kalır; tam ekran bunların üstüne açılan ikinci bir GÖRÜNÜMDÜR.

## Ne eklendi
- **"Tam ekran" düğmesi** (`prompt-text-editor.tsx`, Şablon/Önizleme'nin yanında; telefonda yalnız simge). Önizleme sekmesinde pasif.
- **Tam ekran katmanı** (`prompt-fullscreen-editor.tsx`): `Portal`, `fixed`, `z-49` (Modal'lar z-50 → değişken penceresi ve Hazır ayarlar paneli katmanın ÜSTÜNE
  açılır; Escape önce onları kapatır), `lockBodyScroll`, ekran klavyesi açıkken `visualViewport`'a oturur. Aynı `value`/`variables` üzerinde çalışır; kapanınca form olduğu gibi.
  Metin alanı `PromptDocEditor fill` (çerçevesiz, 16 px — iOS yakınlaştırmaz; formdaki kutuyla aynı jeton/seçim/geri al altyapısı).
- **Üstte iki SABİT katman** (metin kayarken/klavye açılırken yerinden oynamaz):
  1. başlık satırı: Kapat · Prompt Metni + "N değişken · M karakter" · Geri al/Yinele (yerel `execCommand`) · Bitti;
  2. sol üstte TEK dönüştürme düğmesi (yüksekliği sabit: yalnız içeriği değişir, ekran zıplamaz), sağında **Hazır ayarlar** (uygulanan sayı rozetiyle).
- **Düğmenin kararı** (`lib/prompt-word-target.ts`, `findConvertTarget`):

  | Durum | Düğme |
  |---|---|
  | İmleç kelimenin içinde/yanında | Değişkene dönüştür “kelime” (kelimenin TAMAMI) |
  | Seçim var (baş/son boşluk kırpılır) | Değişkene dönüştür “seçilen metin” |
  | İmleç boşlukta/noktalamada | pasif "Bir kelimeye dokun" |
  | Seçimde `{ }` var | pasif "Seçimde değişken var" |
  | İmleç hazır `{değişken}`in içinde/yanında ya da seçim tam bir jeton | Değişkeni düzenle (tanımsız jetonda "Değişkeni tanımla") |
  | Dönüştürme yapıldı (4,5 sn) | yeşil "Değişken oluşturuldu" + sağda **Geri al** |

  Kelime = harf/rakam/birleşik işaret/`_`; tire ve kesme işareti ayraçtır ("Adana'da" → yalnız "Adana", `{Adana}'da`).
- **Dönüştürme tek dokunuş**: ad kelimeden üretilir (`suggestVariableName`: ilk 3 kelime, `_` ile, ilk harf büyük, ≤40), varsayılan değer = dönüşen metin, tür metin.
  Aynı ad (büyük/küçük harf duyarsız) zaten varsa yeni değişken açılmaz, mevcut olana bağlanır ("Mevcut değişkene bağlandı"). **Geri al** metni geri verir ve bu dönüştürmenin
  AÇTIĞI değişkeni siler (mevcuda bağlandıysa dokunmaz); kullanıcı yazarsa geri al kendiliğinden kapanır (`afterValue` karşılaştırması). Simge ile yerel geri al ise yalnız metni geri alır
  (açılan değişken listede kullanılmıyor olarak kalır — elle silinmiş jetonla aynı durum).
- **Düzenleme** için mevcut `VariableEditorModal` açılır (ikinci pencere yazılmadı). Tanımsız jetonda önce geçici bir taslak eklenir; pencere kaydedilmeden kapanırsa taslak geri alınır.
- **Hazır ayarlar üstte**: `ExtraSettingsSection` artık dışarıdan yönetilebilir (`open`/`onOpenChange`, verilmezse eskisi gibi kendi durumunu tutar); form (`create-prompt-form.tsx`)
  durumu tutar, hem formdaki kesik çizgili satır hem tam ekrandaki düğme AYNI paneli (Topluluk sekmesiyle açılan mevcut panel) açar. Rozet = uygulanan ayar/alan sayısı (`countSelected`).
- `DraftVariable` + `makeTempId` `draft-variable.ts`'e taşındı (çevrimsel içe aktarma olmasın); `prompt-text-editor.tsx` tipi yeniden dışa aktarır, eski içe aktarmalar bozulmadı.
- Çeviri: `fullscreen.*` 13 anahtar, TR + EN birlikte (`composer.convertToVariable` yeniden kullanıldı).

## Kurallar (sonraki işler için)
- Tam ekran bir görünümdür, ikinci bir editör değildir: yeni bir değişken eylemi eklenecekse hem formdaki düzenleyiciye hem bu katmana ayrı ayrı kodlanmaz; karar `lib/prompt-word-target.ts`'te, veri değişikliği `onVariablesChange`/`onChange` üzerinden.
- Katmanın üstüne açılacak her pencere `Modal` olmalı (z-50 > 49); ayrı `fixed` bir yüzey yazma.
- Dönüştürme düğmesinin boyutu sabit kalmalı: yeni bir durum eklenirse yalnız iki satırlık içerik (tür + değer) değişir.

## Sınırlar
- Dokunmatikte kelime seçmek tarayıcının kendi seçimidir (uzun basma); imleç kelimeye konunca düğme kendiliğinden günceller. iOS/Android'in kendi seçim menüsü ayrıca açılır, çakışması gerçek cihazda denenmedi.
- Ad ilk 3 kelimeden üretilir; uzun bir seçim kısalan bir ad alır (dönüşen metin yine seçimin tamamıdır). Ad önerisi sezgiseldir, katalog/yapay zekâ eşleşmesi yok.
- Sol üst köşe büyük telefonlarda sağ başparmaktan uzaktır; düğme 46 px yüksekliğinde. Sağa alma ayarı yok.
- Geri al/Yinele simgeleri tarayıcının yerel yığınına dayanır (`execCommand`): etkin/pasif durumu bilinmez.
- "Görselden yardım" tam ekranda yok (formdaki Şablon sekmesinde kalır).
