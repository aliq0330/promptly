# 9.170 — Dört içerik türü için sürüm geçmişi (Prompt, Prompt İsteği, Hazır Ayar, Workflow)

Durum: kod, migration'lar, testler ve belgeler repoda. **Canlı: yalnızca `20260919940000` uygulandı** (`request_versions` + trigger + `prompt_versions` politikası, kayıt dosya sürümüyle düşüldü); `20260919950000` (workflow) ve `20260919960000` (hazır ayar) HENÜZ uygulanmadı — gövdelerinde `delete from` bulunduğu için Supabase MCP'nin yıkıcı-ifade onayı bekleyip 60 sn'de zaman aşımına uğradı, hiçbir yarım değişiklik kalmadı (kontrol edildi). `docs/yapilacaklar.md` madde 9.

## Neyin üzerine kuruldu

Prompt'ta zaten vardı: `prompt_versions` + `record_prompt_version` trigger'ı (dört alan: title, description, prompt_text, tool; `initial` / `owner_edit` / `edit_suggestion_accepted`), `PromptHistoryPanel`, `DiffText` / `diffWords`. Bunlar **korundu** (trigger, imza, numaralandırma değişmedi). `content_edits` yerinde ve `previous_values` hâlâ herkese kapalı. Sürüm geçmişi paralel bir altyapı değildir: aynı desen (üst içerikten okunur, yalnızca veritabanı yazar, ilk anlamlı düzenlemeden ÖNCEKİ içerik v1) üç yeni türe uygulandı.

## Snapshot kapsamı

| Tür | Tablo | Snapshot | Snapshot dışı |
|---|---|---|---|
| Prompt | `prompt_versions` (var) | title, description, prompt_text, tool | değişkenler, DNA, medya, etiket/taksonomi, görünürlük/durum, sayaçlar |
| Prompt İsteği | `request_versions` (yeni) | title, description, creative_direction, preferred_tool | status, response_count, selected_response_prompt_id, kapanma, medya, etiketler, sayaçlar |
| Workflow | `workflow_versions` (yeni) | title, description + `snapshot` jsonb: adımlar (`key`=adım kimliği, position, title, description, instructions, step_type, prompt_id, request_id, inputs, outputs) + bağlantılar (`from`/`to` adım anahtarı, output_key, input_key) | kapak/medya, etiketler, taksonomi, görünürlük/durum, sayaçlar |
| Hazır Ayar | `preset_versions` (yeni) | title, description + `snapshot` jsonb: alan ağacı (`key`=alan kimliği, position, name, type, kind, content_types, config, seçenekler: key/label/value/fragment_en/fragment_tr) + `selection` | kapak, etiketler, taksonomi (content_type/category/subcategory), `tools` (öneri metadatası), görünürlük/durum, `use_count` ve sayaçlar |

- Bağlantılar sıra numarasına değil **kararlı adım anahtarına** bağlıdır; sıra değişince yanlış adımlar birbirine bağlanmaz. Adım/alan/seçenek kimlikleri (editör zaten korur) geri dönmede de korunur; bu yüzden `inputs[].source` ve `selection` anahtarları geçerli kalır ve sürümler arası fark "her şey değişti" demez.
- **Yorum (Hazır Ayar `selection`):** `selection` (alan başına tek değer) editörün bugün de kaydettiği modeldir ve hazır ayarın içeriğinin parçasıdır (değerler olmadan geri dönme eksik olurdu), bu yüzden snapshot'a girdi. Platform kataloğunun eski anahtarları olduğu gibi taşınır; eski `{grupId: seçenekId}` modeline yeni mantık eklenmedi.

## Sürüm oluşturma kuralları

- **İlk anlamlı düzenlemeden önceki gerçek içerik v1** (`initial`, `created_at` = asıl içeriğin oluşturulma zamanı); sahte v1 yok, hiç düzenlenmemiş içerikte sürüm yok. Sonrakiler `owner_edit`. Taslakta düzenleme sürüm açmaz (prompt ile aynı kural; yayınlama bir düzenleme sayılmaz).
- Sayaç, durum, görünürlük, kapak, kategori, etiket değişimi sürüm açmaz (testli).
- **İstek:** `prompt_requests_record_version` AFTER UPDATE OF (4 alan) trigger'ı — `record_prompt_version` deseninde (SECURITY DEFINER, `search_path` sabit).
- **Workflow / Hazır Ayar:** tek kayıt yolu **sahibin kaydetmesi**: `save_workflow_content(id, title, description, steps, connections)` / `save_preset_content(id, title, description, selection, fields)` (SECURITY DEFINER, sahibi `auth.uid()` ile sunucuda doğrular, ebeveyn satırı `FOR UPDATE` kilitli). Aynı transaction'da eski snapshot alınır → içerik uygulanır → yeni snapshot ile karşılaştırılır → fark varsa v1 (gerekirse) + yeni sürüm yazılır. Eski akışta başlık/açıklama ebeveyn UPDATE'iyle, adımlar/alanlar ayrı isteklerle yazılıyordu: eski başlık o ana kadar kaybolduğu için v1 doğru kurulamazdı, ayrıca Hazır Ayar alanları atomik değildi. İstemci artık varolan içeriği önce bu RPC'ye kaydeder, sonra kalan sütunları (kapak, durum, görünürlük…) günceller; ebeveyn UPDATE'inden başlık/açıklama çıkarıldı. **Yeni içerik oluşturma yolu değişmedi** (`save_workflow_graph` / `replacePresetFields`): oluşturma bir düzenleme değildir.
- Son sürümden bu yana içerik sürümsüz değişmişse (taslak döneminde düzenleme) yeni sürümden önce eski içerik bir ara sürüm olarak yazılır — geçmişte boşluk kalmaz.

## Geri dönme

Geçmiş satırı asla değişmez; geri dönme **yeni bir sahip düzenlemesidir**, yeni sürümü mevcut mekanizma yazar (v4, v1'in içeriğini taşıyabilir; v1 durur, güncel v4 olur).
- **Prompt / İstek:** sahibin olağan UPDATE'i (yalnız snapshot alanları); trigger yeni sürümü yazar. Yeni RPC yok. 0 satır etkilenmesi hata sayılır; sonucu, trigger'ın gerçekten yeni sürüm açıp açmadığı belirler.
- **Workflow / Hazır Ayar:** `restore_workflow_version(version_id, workflow_id default null)` / `restore_preset_version(...)`: sürümü bulur, sahipliği doğrular (`... not yours`), verilen içerik kimliği sürümün içeriğiyle uyuşmuyorsa reddeder (`does not belong`), snapshot'ı kaydetme biçimine çevirip aynı yardımcıyla uygular ve sürümü aynı yardımcıyla yazar; tek transaction (bozuk snapshot/kısıt ihlali → hiçbir değişiklik kalmaz). Sürüm zaten canlı içerikle aynıysa `false` döner ve hiçbir şey yazılmaz. Silinmiş bir prompt'a bağlı adım, canlı satırlardaki `ON DELETE SET NULL` gibi bağsız geri gelir. Kapak/etiket/taksonomi/görünürlük/durum/sayaçlar değişmez. Bildirim yok.
- İstemcide onay penceresi zorunlu; metin neyin değişmeyeceğini söyler. İyimser güncelleme yok: onay açık kalır, hata `history.restoreFailed` (ham sunucu metni gösterilmez), başarıda sayfa yeniden yüklenir (içerik, önbellekler, sayaçlar tek seferde doğru okunur) ve tek seferlik "vN içeriği geri yüklendi" bildirimi çıkar; "zaten güncel" durumunda başarı iddia edilmez.

## Erişim ve güvenlik

- Sürüm SELECT politikası **üst içeriğin kendi SELECT kuralını devralır** (`exists (select 1 from <ebeveyn> …)` alt sorgusu ebeveynin RLS'ine tabidir): herkese açık + yayınlanmış içerik herkese, taslak/özel yalnız sahibine. **`prompt_versions` politikası değiştirildi** (`alter policy` ile yerinde, drop yok): eskisi yalnız `status = 'published'` bakıyordu; "Sadece ben" bir prompt'un sürümleri başkalarına açıktı (testle doğrulandı).
- Yeni sürüm tablolarında INSERT/UPDATE/DELETE politikası **yok**, ayrıca `anon`/`authenticated`'dan yazma yetkileri geri alındı. Yazan fonksiyonlar SECURITY DEFINER ve `search_path = public`; yardımcılar (`_workflow_snapshot`, `_*_apply_content`, `_*_record_version`) hiçbir istemci rolüne açık değil; RPC'ler yalnız `authenticated`.
- `content_edits.previous_values` açılmadı; düzenleme önerisi metni genel listede yok (sahip, kabul edilmiş sürümün yanında yalnızca öneren adını görür; diğerleri yalnızca "Düzenleme önerisi kabul edildi").

## Arayüz

- Ortak liste: `features/versions/version-history-panel.tsx` (Prompt'un panelinden genelleştirildi; `prompt-history-panel.tsx` artık ince bir adaptör). Yeniden eskiye, "vN · Güncel" yalnız en yükseğe, göreli tarih, neden (İlk hâl / Sahibi düzenledi / Düzenleme önerisi kabul edildi), **aynı anda tek karşılaştırma**, varsayılan = bir önceki sürüm (v1 için bir sonraki) + "Eski sürüm"/"Yeni sürüm" seçicileri, yalnız değişen alanlar. Kopyala yalnız Prompt (`prompt_text`) ve İstek (`creative_direction`, boşsa `description`); Hazır Ayar/Workflow'da yok. Geri dönme yalnız sahibe, güncel sürümde gösterilmez.
- Fark görünümleri: `version-diffs.tsx` — metin için mevcut `DiffText`/`diffWords`; Workflow: eklenen/kaldırılan/sırası değişen/değişen adımlar + eklenen/kaldırılan bağlantılar; Hazır Ayar: eklenen/kaldırılan/yeniden adlandırılan/tipi ve sırası değişen alanlar, seçenek ekleme/kaldırma/etiket/değer/sıra, seçili değer. Ham JSON gösterilmez. Karar mantığı `lib/version-history.ts` (saf, testli).
- Detay sayfaları: `components/ui/tabs` ile **İstek | Geçmiş**, **Workflow | Geçmiş**, **Hazır Ayar | Geçmiş** (aksiyon satırından sonra, gövdeden önce; Geçmiş yalnız sürüm varsa, sahibe de). Workflow'un Akış / Adım adım seçicisi içerik sekmesinin içinde kalır. Prompt'ta mevcut sekme yerinde; sahip için boş Geçmiş sekmesi kaldırıldı.
- `EditHistoryPanel` Geçmiş sekmesinin altında ve yalnız sürümlerin kapsamadığı alanlarla sınırlı (`editHistoryExtraFields`). Not: `content_edits` bugün yalnızca zaten snapshot'ta olan dört alanı izlediği için panel şu an pratikte boş kalır (tetikleyiciye dokunulmadı).

## i18n

Hepsi `translations.ts`'te TR + EN. Eklenen anahtarlar (66, `history.*`): `tab, sectionsAria, titleRequest, titleWorkflow, titlePreset, compare, oldVersion, newVersion, sameVersion, noDifference, suggestedBy, restore, restoreTitle, restoreLead, restoreConfirmPrompt, restoreConfirmRequest, restoreConfirmWorkflow, restoreConfirmPreset, restoreNextVersion, restoring, restoreFailed, restoreUnchanged, restoredToast, moved, stepsAdded, stepsRemoved, stepsMoved, stepsChanged, connectionsAdded, connectionsRemoved, connection, stepPosition, untitledStep, none, fieldsAdded, fieldsRemoved, fieldsMoved, fieldsChanged, fieldRenamed, fieldTypeChanged, fieldSettingsChanged, valueChanged, optionsAdded, optionsRemoved, optionLabelChanged, optionValueChanged, optionTextChanged, optionsReordered, field.{instructions,stepType,content,contentChanged,contentRemoved,contentAdded,inputs,outputs}, fieldType.{single_select,multi_select,dropdown,text,number,slider,toggle,color}, stepType.{prompt,request}`. Değişen mevcut metinler: `promptHistory.sourceInitial` ("İlk hâl" / "Original state"), `promptHistory.sourceOwnerEdit` ("Sahibi düzenledi"). Kaldırılan kullanılmayan anahtarlar: `promptHistory.compareWith`, `promptTabs.historyEmpty`. Yeni bildirim cümlesi yok (geri dönme sahibin kendi düzenlemesi).

## Migration'lar (yalnızca ekleyici; `drop table/column` yok, mevcut dosyalar değişmedi) — CANLIYA UYGULANMADI

- `20260919940000_request_versions.sql` — `request_versions`, `record_request_version` trigger'ı; `prompt_versions` SELECT politikasının sıkılaştırılması (`alter policy`, yerinde).
- `20260919950000_workflow_versions.sql` — `workflow_versions`, yardımcılar, `save_workflow_content`, `restore_workflow_version`.
- `20260919960000_preset_versions.sql` — `preset_versions`, yardımcılar, `save_preset_content`, `restore_preset_version`.

**Canlıya alırken sıra: önce migration'lar, sonra istemci kodu.** Yeni istemci, varolan bir workflow/hazır ayarı kaydederken yeni RPC'leri çağırır; migration yokken bu kayıtlar hata verir. Eski istemci + yeni migration birlikte çalışır (eski `save_workflow_graph` yerinde), yalnız o istemciden yapılan düzenlemeler sürümlenmez. Mevcut içeriklere geriye dönük sürüm üretilmez (hiç düzenlenmemiş = sürümsüz).

## Test sonuçları (yerel; gerçek Supabase'e karşı DENENMEDİ)

- `npm test`: 256/256 (20 yeni test: `src/lib/version-history.test.ts` — ardışık olmayan sürüm karşılaştırması, değişmeyen alanların listelenmemesi, adım ekleme/kaldırma/sıra+metin, bağlantı ekleme/kaldırma, alan ekleme/kaldırma/ad/tip/sıra, seçenek değişiklikleri, istek farkı ve kopyalama metni, düzenleme geçmişi süzgeci, varsayılan karşılaştırma).
- Temiz PostgreSQL 16'ya 92 migration baştan oynatıldı (hatasız). `supabase/tests/version-history.sql`: 58 kontrol, 0 FAIL — v1/initial + created_at, sayaç/durum/görünürlük/kapak değişiminin sürüm açmaması, taslakta sürüm yok, geri dönmenin yeni sürüm açması ve eski satırların bayt bayt aynı kalması, yetkisiz (başka kullanıcı) geri dönme/kaydetme reddi, sürümün başka içeriğe uygulanamaması, bozuk snapshot'ta geri dönmenin hiçbir şey bırakmaması, silinmiş bağlı prompt, özel içeriğin sürümlerinin başkalarına kapalı olması, istemci yazma reddi, yardımcıların EXECUTE yetkisi. `counter-protection.sql` ve `saved-collections.sql` yeniden çalıştırıldı: 0 FAIL.
- Ağ taklitli Playwright (derlenmiş statik site + bellek içi sahte Supabase REST; depoda tutulmuyor): 21 senaryo, hepsi geçti — dört türde Geçmiş sekmesinin yalnız sürüm varsa görünmesi, liste sırası ve "Güncel", tek açık karşılaştırma ve seçiciler, kopyalama, ziyaretçide geri dönme düğmesi yok, onay metinleri, iptalde istek yok, başarıda yalnızca snapshot alanlarının yazılması + yeniden yükleme + bildirim, başarısızlıkta hata ve hiçbir değişiklik/başarı bildirimi yok, "zaten güncel" durumu, öneren adının yalnız sahibe görünmesi, İngilizce. Karanlık tema ve mobil için ekran görüntüleri gözle incelendi.
- `npx tsc --noEmit`, `npm run lint` (hata yok, 4 eski uyarı), `npm run build`: temiz.

## Bilinen eksikler

- Gerçek Supabase'e/cihaza karşı denenmedi; migration'lar canlıya uygulanmadı.
- Workflow farkında bağlı içerik değişimi adıyla değil "bağlı içerik değişti/kaldırıldı/bağlandı" olarak gösterilir (snapshot başlık tutmaz).
- Varolan workflow/hazır ayar/isteklerin geçmişi yoktur (geriye dönük üretilmez); sahip, adım/alan tablolarına RLS gereği doğrudan yazabildiği için o yoldan yapılan değişiklikler sürümlenmez (editör ve geri dönme RPC'den geçer).
- Geri dönme sonrası sayfa yeniden yüklenir (tek akışla dört türün önbelleğini doğru tazelemenin en küçük yolu).
- İstek trigger'ı (prompt'ta olduğu gibi) `max()+1` kullanır: aynı isteğe eşzamanlı iki düzenleme tekil kısıt nedeniyle birini reddedebilir; Workflow/Hazır Ayar'da ebeveyn satırı kilitlidir.
