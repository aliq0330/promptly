# 438 — Prompt değişkenleri: metindeki `{jeton` kendiliğinden değişken olur (MCP/API/editör)

**Durum:** uygulandı. Birim testleri (`prompt-variables-auto`, `exchange/variable-fill`, `public-api/me-variables`, `me`, `me-content`, `mcp/test/remote`), yerel PostgreSQL'de SQL testi (`supabase/tests/api-me-sync-draft-variables.sql`, 15 denetim) ve ağ taklitli Playwright (`run-variable-define` 6/6) ile sınandı.
**Gerçek Supabase'e / gerçek Edge Function'a / gerçek ChatGPT-Claude bağlantısına KARŞI DENENMEDİ.** Migration canlıya CI ile (deploy.yml) uygulanır; **Edge Function'lar `api` ve `mcp` elle deploy edilir** (aşağıda). İngilizce karşılıklar eklendi (`variable.defineAll`, `variable.suggestions*`, `variable.savePartialFailed`).

## Sorun
ChatGPT/Claude "Promptly Visual Trend" skill'i `save_prompt_draft` ile prompt kaydediyordu. Araç `import_prompts`'a her zaman `variables: []` gönderiyordu: metinde `{city}` vardı ama `prompt_variables`'ta satır YOKTU. Sonuç:
- Oluşturma ekranı "Metinde tanımlanmamış değişken(ler) var" uyarısı veriyordu ve çözüm sunmuyordu (elle tek tek "Değişken ekle").
- Kaydedilirse prompt sayfasında doldurma alanı çıkmıyor, kopyalanan metinde süslü parantez kalıyordu.
- `get_my_prompt` `variables`'ı METİNDEKİ jetonlardan türettiği için skill hiçbir şeyin eksik olduğunu göremiyordu.
- `update_my_draft` `promptText`'i değiştirebiliyordu ama değişken satırlarına hiç dokunamıyordu.
- Ayrıca sitede değişken kaydı (`replaceVariablesForPrompt`) hata verirse yalnız `console.error` yazılıyordu (kullanıcı görmüyordu) ve fonksiyon önce siliyor sonra ekliyordu (ekleme çökerse eski tanımlar kayboluyordu).

## Kurallar
1. **Tek tarama kuralı** `src/lib/prompt-variables.ts` `isDefinableTokenName`: boşluk, `{ } " ' \` : ; , < > ( ) [ ] \ / =` yok, 1–40 karakter, yalnız rakam/`_`/`-` değil. JSON örneği (`{"a": 1}`), `{1}`, `{x, y}` değişken sayılmaz; Türkçe harfli adlar (`{şehir}`) geçer. SQL'deki aynı kural `api_me_sync_draft_variables` içindedir (`prompt-variables-auto.test.ts` iki yeri metin olarak karşılaştırır — biri değişirse ikisi birlikte).
2. **Karşılaştırma tam eşleşmedir** (jeton motoru ve `unique (prompt_id, name)` büyük/küçük harfe duyarlı): `{City}` ve `{city}` ayrı değişkendir.
3. **Üst sınır 30** değişken; fazlası eklenmez ve raporlanır (`skipped`).
4. **Yeni içeri aktarma yolu kendi jeton taramasını yazmaz**: `exchange/variable-fill.ts` `withDefinedVariables(item)` çağırır. `importMyPrompts` (MCP `save_prompt_draft`, `POST /me/prompts`, Telegram `/taslak`, Chrome uzantısı) ve sitenin "içe aktar"ı (`prompt-exchange.ts` `importPrompts`) bunu kullanır. Moderatör toplu yüklemesi (`admin_import_prompts`) DEĞİŞMEDİ (`${değişken}` biçimli kaynak dosyalar var).
5. **Taslak güncellemede** (`update_my_draft`, `PATCH /me/prompts/{id}`): `changes.variables` listeyi TAMAMEN değiştirir; `promptText` değişince metindeki yeni jetonlar her zaman boş metin değişkeni olur. İş yeni RPC `api_me_sync_draft_variables(p_id, p_variables, p_expected_updated_at)` (INVOKER, yalnız kendi + topluluğa/ekibe özgü olmayan + TASLAK; çakışma/doğrulama hatasında hiçbir satır yazılmaz; anon çağıramaz). `updateMyDraft` önce prompt RPC'sini, sonra bunu AYNI işlemde çağırır (biri reddederse işlem geri alınır).
6. **Yazar tanımları açık hata verir** (`public-api/me-variables.ts` `variablesFromInput`): varsayılanı seçeneklerde olmayan `select`, bozuk aralık, tek seçenek vb. sessizce başka değere dönmez — yoksa prompt sayfasındaki varsayılan değer, görseli üretmekte kullanılan değerden farklı olurdu.
7. **`get_my_prompt` / `GET /me/prompts/{id}`**: `variables` (metindeki jetonlar, eskisi gibi) + yeni `variableDetails` (GERÇEKTEN tanımlı olanlar: tür, varsayılan, açıklama, `examples`) + `undefinedVariables`. Skill kaydı doğrulamak için `undefinedVariables`'ın boş olmasına bakar.

## "Örnek değerler" (metin değişkeni)
Yazarın 2–4 örneği `prompt_variables.config.suggestions` (jsonb, ≤6 öğe, her biri ≤80 karakter; **migration gerekmedi**, `config` serbest nesne) içinde durur. Okuyucu alanın altında dokunarak doldurur çipleri görür; **yine istediğini yazabilir** (seçim türünden farkı budur). Kaynak: `types` `PromptVariableConfig.suggestions`, `prompt-variables.ts` `sanitizeSuggestions` (çekirdekte, bağımlılıksız), `prompt-variable-types.ts` (normalize/parse), `variable-spec-editor.tsx` ("Örnek değerler" alanı; ham metin yerel durumda, temizlik kayıtta), `variable-field.tsx` (çipler). Dışa/içe aktarma ve açık API `config`'i olduğu gibi taşıdığı için ek kod gerekmedi. Etiket artık `hava_durumu` yerine "hava durumu" görünür (yalnız gösterim; jeton adı değişmez).

## Editör
- Uyarının yanında **"Tümünü tanımla (N)"** (`data-testid=define-all-orphans`): yalnız `isDefinableTokenName`'i geçen yetim jetonları boş metin değişkeni yapar; kalanlar (JSON parçası) uyarıda durur.
- **Değişken kaydı artık sessiz değil** (`create-prompt-form.tsx` `saveVariables`): düzenleme modunda sayfada hata gösterilir; yeni prompt oluşturulduysa `/create?edit=<id>&varsFailed=1` ile uyarıyla düzenleme ekranına gidilir (`outputFailed` kalıbı). `replaceVariablesForPrompt` silmeden önce eski satırları okur, ekleme başarısız olursa geri yükler.

## Deploy (elle)
- Migration `20261211100000_api_me_sync_draft_variables.sql`: CI (`deploy.yml`) uygular; yalnız yeni fonksiyon ekler. `scripts/smoke-test.mjs` anon'a kapalı olduğunu denetler.
- Edge Function'lar CI ile deploy EDİLMEZ: **`api`** ve **`mcp`** yeniden deploy edilmeli (`supabase functions deploy api mcp` ya da "Deploy Edge Functions" workflow'u). Kopyalar `node scripts/sync-function-shared.mjs` ile güncellendi. Deploy EDİLMEZSE: site ve migration çalışır, ama ChatGPT/Claude bağlantısı eski davranışta kalır (değişken oluşturmaz).
- `mcp/` npm paketi (`promptly-mcp`) yerel kullanım içindir; yayınlanacaksa sürüm artırılır.

## Skill tarafı
Skill metni (`Promptly Visual Trend Generator`) değişkenleri artık `save_prompt_draft`'ın `variables` alanıyla göndermeli, kaydı `get_my_prompt` ile doğrulamalı. Metin depoya EKLENMEDİ (kullanıcı isteği); sohbette verildi.
