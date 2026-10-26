# 250 — Prompt dışa / içe aktarma (JSON · Markdown · CSV)

**Durum:** uygulandı, **canlıya UYGULANMADI**. Migration `20260927100000_import_prompts.sql` repoda; `main`'e birleşince `deploy.yml` uygular (önce migration, sonra istemci; duman testi RPC'nin varlığını denetler). Yerel PostgreSQL'de sınandı (`supabase/tests/import-prompts.sql`, 29 kontrol, mutasyon denemesinde 4 kontrol kırıldı), arayüz ağ taklitli Playwright'ta (`run-exchange` 10/10; `run-profile-collections` 13/13, `run-shared-cards` 11/11, `run-detail-pages` 45/45 bozulmadı), çekirdek 15 birim testle. **Gerçek Supabase'e / gerçek oturuma / telefona / Excel'e karşı DENENMEDİ.**

## Amaç
Kullanıcı kendi promptlarını dosya olarak çıkarabilsin ve dosyadan geri alabilsin. Bu iş, sonraki adımların (public API, CLI, MCP, GitHub senkronizasyonu) ortak temelidir: hepsi aynı dönüştürme çekirdeğini ve aynı içe aktarma RPC'sini kullanacak.

## Kapsam (bilerek dar)
Yalnız **Prompt**. Workflow / Hazır Ayar / İstek aynı biçime sonra eklenir. Görseller ve çıktı dosyaları dosyaya girmez (gönderi medyası private bucket'tadır, imzalı adres 10 dk yaşar). API, token, bot, skill paketi, GitHub: bu işte YOK.

## Parçalar
- **Çekirdek** `src/lib/exchange/` (saf TypeScript, `node --test`): `prompt-format.ts` (model, sınırlar, tek doğrulama yeri `normalizePrompt`), `json.ts`, `csv.ts`, `markdown.ts`, `index.ts` (`serializePrompts` / `parsePrompts` / `exportFileName`). Her dosya `schemaVersion` taşır; gelecekteki sürüm sessizce okunmaz, reddedilir.
- **Veri katmanı** `src/lib/supabase/prompt-exchange.ts`: `fetchOwnPromptsForExport` (taslak + "Sadece ben" dahil, `community_id is null`), `fetchPromptForExport`, `importPrompts` (RPC); `prompt-variables.ts` → `fetchVariablesForPrompts` (toplu).
- **RPC** `import_prompts(p_items jsonb, p_dry_run boolean)`: SECURITY **INVOKER**; önce hepsini doğrular, sonra tek işlemde yazar. Geçersiz kayıt varsa hiçbir şey yazılmaz; hız sınırı gibi bir hata da bütün işlemi geri alır.
- **Arayüz** `src/features/exchange/`: `ExportPromptsModal`, `ImportPromptsModal`, `download-file.ts`, `exchange-labels.ts`. Girişler: Kütüphanem → Promptlar bölümünde "İçe aktar" / "Dışa aktar" (`my-content-view.tsx`), kendi promptunun ⋮ menüsünde "Dışa aktar" (`post-menu.tsx`). Metinler `translations-exchange.ts` (TR + EN).

## Biçimler
| Biçim | Taşır | Not |
|---|---|---|
| JSON | her alan + değişken tanımları | Tam yedek; zarf `{format:"promptly.prompts", schemaVersion, exportedAt, items}`. Çıplak dizi ve tek nesne de okunur. |
| Markdown | başlık bloğu (`---`) + prompt metni | Birden çok prompt `<!-- promptly:next -->` ile ayrılır. Başlık bloğu YAML DEĞİL, bilerek dar bir alt küme (`anahtar: "json değer"` ya da elle `a, b` listesi). Değişken tanımı yok; `{ad}` jetonları metinde kalır. Metin ayracı içeriyorsa dışa aktarma hata verir (bozuk dosya yazmaz). |
| CSV | satır başına bir prompt | UTF-8 BOM'lu indirilir (Excel). Listeler hücre içinde satır sonuyla ayrılır (etiket/araç adı kontrol karakteri taşıyamaz). `= + - @` ile başlayan hücre tek tırnakla korunur ve okurken aynen geri alınır (CSV enjeksiyonu; yazma→okuma birebir). |

Dışa aktarılmayan / içe aktarmada YOK SAYILAN alanlar: yazar, durum, görünürlük, sayaçlar, topluluk, köken, medya. Dosyada bulunsalar bile istemci de RPC de atar.

## Güvenlik kararları
- **Kimlik:** RPC çağıranın kimliğiyle çalışır (INVOKER). RLS, askı (`enforce_can_post`), hız sınırı (prompt saatte 30) ve `char_length` CHECK'leri normal bir `insert` gibi geçerlidir; hiçbiri atlanmaz. Anon EXECUTE kapalı.
- **Sonuç her zaman** çağıranın kendi özel taslağıdır (`draft` + `private` + `original`, `community_id` boş, sayaçlar 0). Yayınlamak kullanıcının ayrı eylemidir.
- **Yinelenme:** aynı yazarda aynı başlık + aynı metin → `duplicate` olarak atlanır; aynı dosyayı iki kez içe aktarmak çift kayıt yaratmaz. (Plandaki ayrı `content_external_refs` tablosu GEREKMEDİ; yeni tablo yok.)
- **Kategori:** tanınmıyorsa boş bırakılır ve uyarı verilir (içerik yine eklenir).
- Tek içe aktarmada en çok **30** prompt (hız sınırıyla uyumlu), dosya en çok 2 MB.
- Export yalnız KENDİ promptları; topluluğa özgü içerik dışarı çıkmaz.

## Bulunan hatalar (bu işte)
- `text[] || 'literal'` PostgreSQL'de dizi değişmezi sayılır ("malformed array literal"): uyarı listesi `array_append(…, 'x'::text)` ile kuruldu. SQL testi yakaladı.
- Chromium başsız modda ASCII olmayan `download` adını (`yağmurlu-gece.json`) yok sayıp `download` yazıyor; dosya adları artık yalnız ASCII (`ğ→g`, `İ→i`), bu git yolları ve sonraki GitHub senkronizasyonu için de güvenli.

## Bilinçli sınırlar / açık
- Markdown ve CSV değişken TANIMI taşımaz (yalnız JSON); Workflow/Hazır Ayar/İstek yok; medya yok.
- 30'dan çok prompt tek dosyada içe aktarılamaz (dosyayı bölmek gerekir); kuru çalıştırma hız sınırı kotasını denetlemez (kota doluysa gerçek çalıştırma `rate_limit` ile hepsini geri alır, mesaj gösterilir).
- Düzenlenmiş dosyayı yeniden içe aktarmak mevcut promptu GÜNCELLEMEZ (yeni taslak oluşturur ya da, başlık+metin aynıysa atlar). Güncelleme/senkronizasyon GitHub aşamasının işi.
- Playwright'ta RPC yanıtı taklittir; gerçek kuralları `import-prompts.sql` doğrular. Başkasının promptunda menü öğesinin görünmediği arayüz testiyle SINANMADI (kod `isOwn` ile korur).
- Sonraki adım (sırayla): API token'ları + salt-okunur `/v1`, sonra CLI, skill paketleri, MCP, GitHub.
