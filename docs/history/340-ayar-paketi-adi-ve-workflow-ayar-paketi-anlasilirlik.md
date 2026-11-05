# 340 — "Hazır ayar" → "Ayar paketi" + Workflow / Ayar paketi anlaşılırlık düzeltmeleri

**Durum: uygulandı (repoda; yalnız istemci metni ve istemci mantığı — migration yok, canlıya ayrıca bir şey uygulanmaz).**

## Neden
Kullanıcı "workflow ve hazır ayar anlaşılır mı?" diye sordu. Metinler ve formlar okununca yedi sorun çıktı; "Hazır ayar" adı da sistemin kendi varsayılanı gibi okunuyor, oysa kullanıcının oluşturup paylaştığı bir paket. Yeni ad **Ayar paketi** (kullanıcı seçti). İngilizce **Preset** kalır (yaratıcı araçlarda yerleşik kelime).

## Yeniden adlandırma (yalnız görünen Türkçe)
- `lib/i18n/translations*.ts` içindeki ~100 `tr` değeri, Türkçe ek uyumuyla (`hazır ayarla` → `ayar paketiyle`, `hazır ayara` → `ayar paketine`, `hazır ayarın vereceği` → `ayar paketinin vereceği`…); yasal metin (`legal-content.ts`, 3 cümle — yalnız ad değişti, **`TERMS_VERSION` artmadı**: anlam değişmedi); Telegram komut açıklaması.
- **Bilerek değişmeyenler:** veritabanı, rotalar (`/presets`), kod adları, `hazirayar` Telegram komutu (kalıcı komut; `ayar`/`preset` takma adları zaten var); `lib/notification-message.ts` ve Telegram `notify.ts` kalıpları — bunlar SQL tetikleyicilerinin yazdığı "Hazır ayarını beğendi" metniyle EŞLEŞİR (CLAUDE.md §4.5: SQL bildirim metni Türkçe kalır); ekranda gösterilen karşılığı (`notifMsg.*`, `nc.obj.preset`) "ayar paketi" oldu. Kod yorumları dokunulmadı.
- Playwright senaryolarındaki metin eşleşmeleri (`run-preset-try`, `run-exchange`, `run-create-destination`, `run-focus-feed`, `run-pagination`, …) yeni adla güncellendi.

## Yedi düzeltme
1. **Workflow için tek ad:** "iş akışı", "çalışma akışı", "zincir", "Akışı paylaş" kalktı → "Workflow" (`akış` yalnız "Akış" görünümünün adı). Otomatik çalıştırmada "Zincir … duracak/bitti" → "Çalıştırma …".
2. **`workflow.noteToolsMeta`:** "Promptly hiçbir modeli çalıştırmaz" ("Otomatik çalıştır" ile çelişiyordu) → "Yalnızca bilgi amaçlı — workflow'un hangi araçlar için hazırlandığını gösterir."
3. **Ölü yönlendirme:** `preset.saveHint` "Ek Ayar Önerileri → Kaydettiklerim" diyordu; böyle bir yüzey yok. Gerçek ad: "Ayar Paketleri ve Ek Alan Önerileri" → Kaydettiklerim.
4. **alan / parametre:** ayar paketi düzenleyicisinde (`presetBuilder.*`, `presetField.addShort/addTitle/createNew/searchPlaceholder/noMatch/removeAria`, `presetFit.fields`) "alan" → "parametre". Prompt formundaki "Alanlar / Ek Alan Önerileri" (prompt değişkeni alanları) ve ortak `presetField.others/noOptions/removeFromForm` bilerek AYNI kaldı; ekleme penceresi artık kendi `presetBuilder.otherParams`ını kullanır.
5. **Ayar paketi neyin ayarı?** Detay sayfasındaki kutunun başına `preset.whatIs` ("bir prompta bağlı değildir: bir kez seçersin, uyumlu her prompta uygularsın"); liste açıklaması (`preset.pageDescription`) ve oluşturma ipucu (`preset.createHint`) aynı fikri söyler. Kartta açıklama yok kuralı gereği karta metin EKLENMEDİ (kart zaten parametre çiplerini ve "N parametre · araç" satırını gösterir).
6. **"Ayarlar" sekmesi → "İşlemler"** (workflow adım detayı; taşı/kopyala/sil). "Hazır ayar"la karışmasın.
7. **Girdileri promptun değişkenlerinden öner:** adıma bir prompt bağlanınca (yeni adım ya da "Mevcut içeriği değiştir") promptun `{değişken}`leri o adımın girdileri olarak eklenir (`suggestInputsFromVariables`, `lib/workflow-logic.ts`; saf, birim testli). Kurallar: bağlantısız eklenir (hangisi önceki adımdan gelecek kişi seçer); var olan girdilere dokunmaz, aynı adlı (büyük/küçük harf, boşluk) atlanır; en çok 8; yalnız prompt adımı; okuma hatası hiçbir şey eklemez; ekleyince tek bildirim ("N değişken girdi olarak eklendi…", `workflow.inputsSuggested`). Okuma `fetchVariablesForPrompt` (mevcut); değişiklik kaydedilmemiş sayılır (`touch`).

## İngilizce karşılıklar
Eklendi/güncellendi: `workflow.pageDescription`, `workflow.step3Title`, `workflow.noteToolsMeta`, `workflow.tabSettings`, `workflow.auto.stopsAt/finished`, `preset.saveHint/pageDescription/createHint/whatIs`, `presetBuilder.*` (alan → parameter), `presetField.*`, `presetFit.fields`, `presetBuilder.otherParams`, `workflow.inputsSuggested`.

## Doğrulama
`tsc` temiz, `npm run lint` 0 hata (15 eski uyarı), `npm test` 940/940 (yeni: `workflow-logic.test.ts`, 5 test), `npm run build` temiz. Ağ taklitli Playwright: `run-preset-try` 10/10, `run-workflow-auto` 11/11, `run-create-destination` 16/16, `run-exchange` 45/45, `run-workflow-space` 40/40 (yeni senaryolar 10 ve 10b: değişkenlerden girdi önerisi + okuma hatasında hiçbir şey eklenmez), `run-profile-collections` 13/13, `run-save-collections` 7/7.
Bu değişiklikle İLGİSİZ, eskiden beri düşen iki senaryo: `run-pagination` 4 (profil araması artık `prompt_text`'i de arıyor, test eski sorgu biçimini bekliyor) ve `run-focus-feed` 9 ("Kaydet" 336'dan beri bir dokunuşla kaydeder, test hâlâ pencere bekliyor) — bu oturumda düzeltilmedi; ikincisi için taban sürümde ayrıca koşturulmadı, test koduna bakılarak çıkarıldı.

## Sınırlar / denenmedi
- Gerçek Supabase'e, gerçek cihaza karşı DENENMEDİ; yalnız birim testleri + ağ taklitli Playwright.
- Türkçe ek uyumu betikle uygulandı ve diff'ten okunarak denetlendi; ekranda her cümle tek tek gezilmedi.
- Madde 7'de seçilen kural: bağlı varsayılan girdi ("önceki adımın çıktısı") ile prompt değişkeni girdileri yan yana durur; ilk değişken kendiliğinden önceki çıktıya bağlanmaz.
