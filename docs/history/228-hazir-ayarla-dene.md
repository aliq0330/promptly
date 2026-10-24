# 228 — Hazır ayarla dene: prompt + hazır ayar birlikte, "Uyumlu" kuralı

**Durum:** uygulandı (yalnız istemci kodu, migration yok). Birim testler (`prompt-parts.test.ts`, `preset-fit.test.ts`; `npm test` 427/427) ve ağ taklitli Playwright `run-preset-try` 6/6; **gerçek Supabase'e / gerçek AI çağrısına / gerçek telefona karşı denenmedi**. İngilizce karşılıklar eklendi (`presetFit.*`, `promptTry.*`, `presetTry.*`, `studio.presetAdd|presetRemove`). Tasarım önce tuvalde çizildi (önce/sonra), kullanıcı onayıyla kodlandı.

## Sorun
İnsanlar prompt paylaşıyor, hazır ayar da var ama ikisini birleştirip denemenin yeri yoktu: Studio TEK kaynak alıyordu (Prompt YA DA Hazır ayar; `finalPrompt`'ta prompt seçiliyse hazır ayar yok sayılıyordu), prompt sayfasından hazır ayara, hazır ayar sayfasından prompta geçiş yoktu. Hazır ayar `Preset` tipinde bir prompta bağlı değil (taşınabilir parametre paketi: `fields` + `selection` + `category` + `tools`).

## "Uyumlu" kuralı (`src/lib/preset-fit.ts`, saf, birim testli)
İki AYRI soru, karıştırılmaz:
1. **Hazır ayar ↔ prompt** (`presetFit`): içerik türü aynı olmak ZORUNDA (değilse "none", hiç listelenmez). Kategori ve önerilen araç yalnız seviyeyi belirler: kategori aynı/hazır ayarın kategorisi yok + araç kesişiyor/biri boş → **match** ("Görsel · Fotoğrafçılık · Midjourney ile eşleşti" / "Araçtan bağımsız"); kategori farklı ya da araç başka → **partial** ("Kısmen · Başka araç: GPT Image", "Farklı kategori: …"). Reddedilmez, çünkü "85 mm lens, yumuşak ışık" gibi cümleler çoğu modelde çalışır. Araç karşılaştırması araç kimliğiyle (`gpt-image:gpt-image-1` → `gpt-image`). Sıralama: araç eşleşmesi, kategori, alt kategori, ortak etiket, popülerlik; partial −60.
2. **Alan ↔ hedef araç** (`fieldAvailable`): bir araca ÖZEL alan (`TOOL_ONLY_FIELDS`: Midjourney'in `mj_ar`/`mj_stylize`/`mj_chaos` sonekleri) hedef araçlar arasında kendi aracı yoksa kendiliğinden kapanır (bilinen araç yoksa da kapalı). Studio'nun hedefi seçilen sağlayıcıdır (`toolIdFor`: Gemini/OpenAI), prompt sayfasınınki promptun önerilen araçlarıdır. Midjourney alan listesi (`prompt-extra-settings.ts`) bu tek tablodan türetilir.
Sınır: "uyumlu" = "bu tür prompt için hazırlanmış", "sonuç iyi çıkar" değil; promptun içindeki "50 mm" ile ayarın "85 mm"ini ayırt etmeyiz — son prompt önizlemesi ve alan alan kapama bunun içindir.

## Ne eklendi
- **Son prompt = prompt + hazır ayar**, parçalarıyla (`src/lib/prompt-parts.ts` `assemblePromptParts`; `composePrompt` artık onun birleşimi, eski metin kuralıyla birebir testli; `composePromptParts` kaynağı `prompt`/`preset` diye ayırır). `FinalPromptPreview`: ayarın eklediği parçalar boyalı + açıklama ("Prompttan" / "Hazır ayardan").
- **Studio** (`/studio?prompt=&preset=`): Prompt taban, hazır ayar katman ("Hazır ayar ekle (isteğe bağlı)", `studio-view.tsx`); uyum rozeti (`FitBadge`) promptun araç/kategorisine göre; "Eklenecek alanlar" (`StudioFieldSwitches`) alan alan aç/kapa, hedefe uymayan alan kapalı + nedeni; prompt değişince hazır ayar kalır, "Hazır ayarı kaldır" promptu bırakır. Yalnız hazır ayar kaynağı da artık Midjourney soneklerini Gemini/OpenAI'ye eklemez.
- **Prompt sayfası "Hazır ayarla dene"** (`prompts/prompt-try-section.tsx`): aynı türdeki hazır ayarlar (son 60 herkese açık + kaydettiklerin, 3 dk önbellek, istemcide sıralanır; sunucu RPC'si yok), seçili ayarın son prompt önizlemesi, **Studio'da dene** (`OpenInStudioButton presetId`), **Ayarlı metni kopyala** (`CopyPromptButton`, kullanım sayacına yazar), **Çalıştır** (`RunButton`: kopyala + aracı aç, mevcut `prefillUrl` altyapısı).
- **Hazır ayar sayfası "Bir promptla dene"**: `StudioSourcePicker fitFor` — prompt listesi uyuma göre süzülür/dizilir ("Uyumlu olanlar" yalnız match), rozetli; seçince Studio iki kaynakla açılır.

## Bilinçli sınırlar
- Hazır ayar değerleri prompt sayfasında düzenlenmez (varsayılan seçim); düzenleme Studio'da.
- Aday liste istemcide (47 hazır ayar canlıda); çok artarsa `compatible_presets` RPC'si (`community_id is null`, karar sunucuda) migration ister.
- Studio karşılaştırma satırları (ek modeller) aynı son prompt'u kullanır; alan kapama yalnız ana modele göre.
- "Bu promptla üretilenler" galerisi ve hazır ayar adının sonuçta görünmesi yapılmadı (mevcut `PromptResultsSection` aynen).
