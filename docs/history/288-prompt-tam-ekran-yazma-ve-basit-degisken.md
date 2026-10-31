# 288 — Prompt metni TAM EKRAN yazma + basit değişken ekleme

**Durum:** uygulandı (yalnız istemci; migration yok). Mockup kullanıcıyla birlikte seçildi (Design tuvali "Prompt yazma: tam ekran + basit değişken"),
sonra siteye birebir taşındı. Ağ taklitli Playwright (`tests/messaging-ui/run-prompt-writer.mjs`) + birim test (`prompt-variable-name.test.ts`) ile sınandı;
gerçek telefona / iOS klavyesine / gerçek Supabase'e karşı DENENMEDİ.

## Neden
Eski akışta basit bir değişken için bile iki katman ve beş alan geçiliyordu: "Değişken ekle" → seçici sayfa (arama + 3 süzgeç + liste) →
"Yeni değişken oluştur" → pencerede Ad · Tür (6 çip) · Varsayılan · Açıklama · Koşul · Ekle (seçenekte her biri için iki kutu + görsel/renk). Telefonda
yazma kutusu, Şablon/Önizleme sekmeleri, ipucu, "Görselden yardım", "Hazır Ayarlar" ve değişken listesi aynı ekranı paylaşıyordu.

## Ne değişti
- **Formda tek kart** (`PromptTextEditor`, `prompt-text-editor.tsx`): metin (`{değişken}`ler çip) + "N değişken" + "Tam ekran yaz". Dokununca yazma
  katmanı açılır. Formdaki kesik çizgili "Hazır Ayarlar ve Ek Alan Önerileri" satırı, "Görselden yardım" kutusu ve değişken listesi kalktı.
- **Tam ekran katman** (`prompt-fullscreen-editor.tsx`): üstte başlık + **Bitti**; altında bu bölümle ilgili üç kısayol — **Hazır ayarlar** (panel Topluluk
  sekmesinde), **Ek alanlar** (Alanlar sekmesinde, uygulanan sayı rozeti), **Görselden yardım** (alt sayfa); çerçevesiz yazma alanı (`PromptDocEditor fill`);
  altta tek sabit çubuk. Katman `visualViewport`'a oturur (alt çubuk klavyenin üstünde), `z-49`: `Modal`lar (z-50) üstüne açılır, Escape önce üstteki
  `Modal`ı kapatır. Önizleme sekmesi yerine alt çubukta **Önizleme** düğmesi (değerleri deneme alanları korundu).
- **Alt çubuk üç durumlu:** normal = `{ } Değişken` + "N değişken · M karakter" + Önizleme; bir kelime seçiliyken = **Değişken yap**; bir `{jeton}` seçiliyken =
  **Düzenle** (tanımsız/yetim jetonda **Tanımla**; ayrıca metinden kaldır).
- **Üç tek-amaçlı sayfa** (`Modal` + `VariableSheetFrame`; başlık + kayan gövde + sabit alt satır, docs/history/242-*):
  - `VariableAddSheet`: TEK ad kutusu (Enter), "Bu promptta" çipleri (dokununca imlece eklenir), "Önerilen · tek dokunuş" çipleri (ortam, stil, renk paleti, kamera
    açısı, duygu — dile göre; tanımlı olanlar çıkar), altta "Hazır alan kütüphanesi" (mevcut `FieldCatalogPicker`). Aynı ad (büyük/küçük harf duyarsız) yenisini değil var olanı ekler.
  - `VariableConvertSheet`: TEK alan; ad hazır (`suggestNameFromText`: kelimeden; kelime bir hazır alanın seçeneğiyse o alanın adları çip — katalog yalnız bu sayfa
    açılınca tembel yüklenir), varsayılan değer kelimenin kendisi; çok yerde geçiyorsa "hepsini değiştir" sürer.
  - `VariableEditSheet` (eski `VariableEditorModal`'ın yerine): üstte Ad + "Nasıl doldurulsun?" (Metin · Seçenekli · Sayı · Aç/Kapa) + türe göre tek kutu
    (seçenekler yaz-Enter çipleri, dolu olan varsayılan; metinde varsayılan değer; sayı/kaydırıcı/aç-kapa ayarları doğrudan). **Gelişmiş**: Çoklu seçim/Kaydırıcı, seçenek
    ayrıntıları (değer/görsel/renk — eski `VariableSpecEditor`, `hideTypePicker`), açıklama, koşul. Silme iki adımlı (kaç yerde kullanıldığını söyler). Kaydedilen veri DEĞİŞMEDİ.
- `ExtraSettingsSection` artık tetik satırı çizmez: `panel`/`onPanelChange` ile form yönetir (`create-prompt-form.tsx`); uygulanan ayar özeti formda kalır.
- `PromptComposer` (Generator alanları, `mode="field"`) dokunulmadı; `mode="variable"` kolları artık kullanılmıyor (silinmedi).
- Silinen dosyalar: `variable-create-modal.tsx`, `variable-editor-modal.tsx`, `variable-list.tsx`.

## Kurallar (sonraki işler için)
- Prompt metni formda EDİTÖR değil karttır; `#prompt-text` (gerçek `<textarea>`) yalnız tam ekran katman açıkken vardır. Yeni bir doğrulama/odak kodu textarea'ya doğrudan
  ulaşmaya çalışmaz.
- Değişken sayfalarında olay React ağacında dış yayın formuna kabarır: gönderimi `VariableSheetFrame`/`event.stopPropagation()` durdurur — yeni sayfa aynı çerçeveyi kullanır.
- Yeni bir değişken yüzeyi yazarken bu üç sayfayı kullan; ikinci bir "tür + açıklama + koşul" penceresi kurma.

## Sınırlar
- Dokunmatikte kelime seçmek uzun basmayla (tarayıcının kendi seçimi) yapılır; mockup'taki "dokun = seç" gerçek textarea'da yoktur. Jetona dokununca jeton seçilir (mevcut davranış) ve alt çubuk "Düzenle" olur.
- Ad önerisi sezgiseldir (kelimenin kendisi + katalog seçeneği eşleşmesi); yapay zekâ/anlam çıkarma yok.
- "Hazır ayarlar" ve "Ek alanlar" ayrı bir yüzey değil, mevcut panelin iki sekmesidir; rozet yalnız seçili alan sayısını gösterir.
