### 9.56 Kapsamlı Türkçe → İngilizce i18n Denetimi ve Uygulaması (devam ediyor)

Kullanıcının "PROMPTLY — COMPLETE TURKISH → ENGLISH I18N AUDIT &
IMPLEMENTATION" başlıklı, 42 maddelik kapsamlı şartnamesi üzerine —
**"İngilizce seçildiğinde site tamamen İngilizce olmalı; yalnızca sidebar/
header/settings İngilizce olup içerik sayfalarının Türkçe kalması KABUL
EDİLMEZ"** kuralı bağlayıcı. Bu, Bölüm 9.49'un kurduğu dil altyapısını
(`LanguageProvider`/`useLanguage()`/`useTranslation()`/`t()`/
`TranslationKey`, `promptly-language` localStorage anahtarı, `<html lang>`,
`languageInitScript`) **DEĞİŞTİRMEDEN**, yalnızca genişleterek yapılıyor —
yeni bir i18n kütüphanesi eklenmedi, mevcut düz `key -> {tr, en}` mimarisi
(`src/lib/i18n/translations.ts`) korunuyor, yalnızca ad alanına göre
gruplanmış (`common.*`, `nav.*`, `prompt.*`, `request.*`, `generator.*`,
`field.*`, `profile.*`, `messages.*`, `notifications.*`, `collection.*`,
`auth.*`, `discover.*`, `following.*`, `saved.*`, `result.*`, `variable.*`,
`tag.*`, `report.*`, `vision.*` vb.) yeni anahtarlar ekleniyor.

**Bağlayıcı kurallar (şartnameden):**
- Kullanıcı içeriği (prompt başlığı/açıklaması/metni, yorumlar, kullanıcı
  adları, biyografiler, kullanıcının kendi yazdığı etiket adları) ASLA
  otomatik çevrilmiyor — olduğu gibi gösteriliyor.
- Marka/teknik adlar (Promptly, Supabase, Next.js, React, TypeScript,
  Tailwind, GitHub, Claude, Gemini, GPT, Midjourney, Suno, JSON, HTML,
  Markdown, Instagram, TikTok, teknik formatlar) hiçbir zaman çevrilmiyor.
  "Prompt" kelimesi her iki dilde de "Prompt" kalıyor.
- İngilizce metin gerçek, doğal ürün dili olmalı — literal/makine çevirisi
  değil.
- Her yeni anahtar EKLENMEDEN önce `translations.ts` içinde aynı Türkçe
  kaynak metnin zaten bir karşılığı olup olmadığı `grep` ile kontrol
  ediliyor — varsa yeniden kullanılıyor, aynı metnin iki farklı anahtar
  altında yinelenmesi engelleniyor.
- **Aynı İngilizce kavramın Türkçe kaynakta gerçekten FARKLI kelime/
  noktalama ile iki (veya daha fazla) yerde var olduğu durumlarda** (ör.
  "İptal" vs "Vazgeç", "Siliniyor…" vs "Siliniyor...", period'lu vs
  period'suz aynı cümle) orijinal Türkçe metni sessizce birleştirmemek
  için AYRI anahtarlar açılıyor (`common.cancelAction` vs `common.cancel`,
  `messages.editWindowExpiredError` vs `messages.editWindowExpired` gibi).

**Mimari desenler (bu bölüm boyunca tekrar tekrar kullanıldı):**
- **Hook-çağıran-hook:** bir bileşen zaten `useTranslation()` çağırabiliyorsa
  doğrudan çağırıyor; aynı dosyadaki AYRI bir fonksiyon/alt bileşen kendi
  `useTranslation()` çağrısını kendisi yapıyor.
- **Düz (component olmayan) fonksiyonlar için `translateForRuntime(key,
  params?)`:** `src/lib/i18n/translations.ts`'teki bu yardımcı,
  `document.documentElement.lang`'i doğrudan okuyup (React ağacının dışında)
  `t()` ile birebir aynı `{{token}}` interpolasyonunu uyguluyor — `src/lib/
  *.ts` ve `src/lib/supabase/*.ts` gibi hook çağıramayan modüllerin
  fırlattığı gerçek, kullanıcıya gösterilen `Error` mesajları için
  kullanılıyor.
- **Modül-seviyeli statik sabit tuzağı:** bir dosyanın en üstünde BİR KEZ
  hesaplanıp modül önbelleğe alınan bir `Record<..., string>` (örn. eski
  `FRIENDLY_MESSAGES`), dil sonradan değiştirilse bile İLK YÜKLEMEDEKİ dile
  donuk kalır — `src/lib/supabase/image-analysis.ts`'te bu, sabiti her
  çağrıda yeniden hesaplayan bir `friendlyMessages()` fonksiyonuna
  çevrilerek düzeltildi.
- **Değer/etiket ayrımı:** saklanan bir sabit değerler kümesi (ör.
  `INTEREST_OPTIONS`, `GENERATOR_CATEGORY_TOPIC_LABELS`) hem VERİTABANINDA
  saklanan değer hem kendi görüntü etiketi olarak kullanılıyorsa, saklanan
  dizi/değerler HİÇ değiştirilmiyor (var olan veriyi bozmamak için);
  yanına yeni bir `Record<Value, TranslationKey>` haritası ekleniyor, her
  görüntüleme yeri bu haritadan `t(map[value])` okuyacak şekilde
  güncelleniyor (bilinmeyen bir değer için güvenli `value in MAP`
  fallback'i ile).
- **Varsayılan prop değeri bir hook çağıramaz:** `paramName = "Türkçe
  literal"` gibi bir varsayılan parametre değeri, bileşen gövdesinde
  `paramName ?? t("key")` şeklinde hesaplanan opsiyonel bir prop'a
  çevriliyor.

**Bilinçli olarak Türkçe bırakılan, kullanıcı-arayüzü DIŞI metinler:**
- Kod içi Türkçe yorumlar/dokümantasyon (hiçbir zaman çevrilmiyor — bu
  dosyanın kendisi ve kod yorumları geliştirici dokümantasyonu, kullanıcı
  arayüzü değil).
- `src/lib/supabase/client.ts`'in üstteki ortam değişkeni eksikliği hatası
  — React ağacı hiç kurulmadan, derleme/deploy zamanında (yani bir gerçek
  kullanıcının hiçbir zaman göremeyeceği bir yapılandırma hatası olarak)
  fırlıyor.
- `src/lib/supabase/image-analysis.ts`'teki `console.error(...)` satırları
  — dosyanın kendi belgelediği kural gereği (ham Gemini/Edge Function
  hatası KULLANICIYA HİÇ gösterilmiyor, yalnızca developer log'una
  yazılıyor) bunlar zaten tamamen geliştirici-taraflı teşhis metinleri;
  kullanıcının GERÇEKTEN gördüğü metin her zaman `friendlyMessages()`'ten
  gelen, dile göre çevrilen kısa mesaj.
- `/settings`'teki dil seçicisinin kendi "Türkçe"/"English" etiketleri
  (Bölüm 9.49'da zaten kasıtlı olarak `t()` ile SARILMADI — İngilizce
  moddayken "Türkçe" seçeneğinin "Turkish"e dönüşmesi, kullanıcının hangi
  seçeneğin onu Türkçeye geri döndüreceğini bir daha ayırt edememesine yol
  açardı).

**Gerçek, önceden var olan hatalar bu denetim sırasında bulunup düzeltildi
(çeviri işinden bağımsız, gerçek buglar):**
- `shared-content-card.tsx`: bir paylaşılan istek kartındaki durum rozeti
  `STATUS_LABELS[request.status]`'i (bir `TranslationKey`) `t()`
  sarmalayıcısı OLMADAN doğrudan render ediyordu — ekranda çevrilmiş metin
  yerine ham anahtar string'i ("request.statusOpen" gibi) görünürdü.
- Birkaç `formatRelativeTime(...)` çağrı yeri (`generator-detail-view.tsx`,
  `conversation-row.tsx`, `message-bubble.tsx`, `notification-row.tsx`) yeni
  eklenen `language` parametresini unutmuştu.
- Birkaç `useCallback` bağımlılık dizisinde (`real-prompts-provider.tsx`,
  `use-tag-picker.ts`, `real-requests-provider.tsx`) çağrılan `t`
  fonksiyonu deps dizisine eklenmemişti (`react-hooks/exhaustive-deps`).

---

**İLERLEME LİSTESİ VE KALAN PLAN** (bu bölüm her alt görev tamamlandıkça
güncellenip commit+push edilecek — kaldığın yerden devam etmek için
buraya bakılmalı):

1. [x] **Generator alt sistemi** — builder, runtime alanları, doğrulama
   mesajları (`generator-builder.tsx`, `generator-runtime-field.tsx`,
   `generator-details-form.tsx`, `generator-detail-view.tsx`,
   `generator-template.ts`, `generator-output.ts`, ve 17 dosya toplamda).
2. [x] **Profil alt sistemi** — header, aksiyonlar, rozetler, istatistikler,
   sekmeler, `/profile/edit` sayfası, `INTEREST_OPTION_LABELS` haritası
   (15 dosya).
3. [x] **Mesajlaşma alt sistemi** — konuşma listesi/satırı, mesaj
   balonları, composer, aksiyon menüsü, `translateSendError` (13 dosya).
4. [x] **Bildirimler alt sistemi** — liste, satır, `/notifications` sayfası.
5. [x] **Koleksiyonlar alt sistemi** — kart, form, form modalı, kebab
   menü, detay görünümü, kaydetme modalı (7 dosya + yeni `collection.*`
   anahtar ad alanı).
6. [x] **Auth sayfaları + paylaşılan UI kabuğu** — login/signup/
   reset-password, auth layout, `translateAuthError` (artık
   `getRuntimeLanguage()` ile dile duyarlı), app-shell, theme-toggle,
   detail-skeleton, feed-placeholder-header, page-header/section-header,
   placeholder-page, prompt-card-skeleton.
7. [x] **Kalan app-level sayfalar** — discover, following, requests, saved
   (settings zaten çevrilmişti, yalnızca kasıtlı "Türkçe"/"English" native
   dil adları hariç doğrulandı).
8. [x] **`lib/supabase/*.ts` içindeki fırlatılan Türkçe hata mesajları** —
   14 dosyanın tamamı: `client.ts` (kasıtlı olarak Türkçe bırakıldı — bkz.
   yukarı), `collections.ts`, `comments.ts`, `profiles.ts`,
   `prompt-edit-suggestions.ts`, `prompt-variables.ts`, `reports.ts`,
   `tags.ts`, `prompt-results.ts`, `requests.ts`, `prompts.ts`,
   `generators.ts`, `messages.ts`, `image-analysis.ts` (+ `FRIENDLY_
   MESSAGES` sabitinin `friendlyMessages()` fonksiyonuna çevrilmesi —
   yukarıdaki "modül-seviyeli statik sabit tuzağı" notu).
9. [x] **Kalan `formatRelativeTime` çağrı yerlerinin `language` parametresi
   eksikliği için son tarama** — repo genelinde `grep -rn "formatRelativeTime("`
   ile bulunan TÜM 15 çağrı yeri (`generator-detail-view.tsx`,
   `notification-row.tsx`, `edit-history-panel.tsx` ×2, `result-detail-
   view.tsx`, `prompt-detail-view.tsx`, `prompt-history-panel.tsx`,
   `result-card.tsx`, `edit-suggestions-panel.tsx`, `comment-node.tsx`,
   `post-header.tsx`, `request-detail-view.tsx`, `request-card.tsx`,
   `message-bubble.tsx`, `conversation-row.tsx`) kontrol edildi — HEPSİ
   zaten `language` argümanını doğru geçiriyor (bu görev boyunca fırsat
   buldukça alt sistem taramalarında düzeltilmişti, bu son tarama sıfır
   yeni düzeltme gerektirdi, yalnızca doğruladı). `formatRelativeTime`'ın
   kendisi `language: Language = "tr"` varsayılan parametresi taşıdığından
   (eksik bir çağrı `tsc` hatası ÜRETMEZ, sessizce Türkçeye düşer) bu
   tarama `tsc`'ye güvenmeden, doğrudan grep ile yapıldı. `formatJoinDate`
   (profile-about.tsx) varsayılansız/zorunlu bir `language` parametresi
   kullanıyor — `tsc` zaten her çağrı yerini garanti ediyor. Diğer
   `lib/utils.ts` biçimlendiricileri (`formatCount`) dile duyarlı değil,
   kapsam dışı.
10. [x] **Repo geneli son Türkçe grep taraması + build doğrulaması —
    TAMAMLANDI.** Çevrilen son eksikler: `tags-discover-view.tsx` (`/tags`),
    `search-view.tsx`, `report-button.tsx`, `lib/utils.ts` görsel hata
    mesajları (`translateForRuntime`). Tek tek doğrulanan diğer dosyalar
    (`add-result-modal`, `request-detail-view`, `generator-detail-view`,
    `emoji-picker`, `generator-template`, `notification-utils`) yalnızca kod
    yorumu / transliterasyon haritası içeriyordu; `auth-errors.ts` zaten
    `{tr,en}` çiftli; `app/layout.tsx` statik SEO `metadata` açıklaması
    bilinçli Türkçe kaldı. Kasıtlı Türkçe veri dosyaları (katalog, aday
    etiketler, ikon/vision eşleme, interest-options, `/dev/*`) çevrilmedi.
    `tsc`, `lint` ve tam `next build` temiz.
11. [x] **Final i18n teknik raporu — TAMAMLANDI** (aşağıda).

**Final i18n raporu (12 madde):**
1. **Mimari:** Bölüm 9.49'un düz `key -> {tr, en}` sözlüğü, `LanguageProvider`/
   `useTranslation()`/`t()` ve `promptly-language` localStorage tercihi
   DEĞİŞTİRİLMEDİ; yeni kütüphane eklenmedi. Yalnızca ad alanlarına göre
   yeni anahtarlar eklendi (`common.*`, `nav.*`, `prompt.*`, `request.*`,
   `generator.*`, `profile.*`, `messages.*`, `collection.*`, `tag.*`,
   `search.*`, `report.*`, `image.*` vb.).
2. **Anahtar sayısı:** `translations.ts` artık yaklaşık 979 anahtar içeriyor
   (Bölüm 9.49 sonunda yalnızca nav/header/settings kabuğu vardı).
3. **Kapsam:** ~187 `src` dosyası değişti; generator, profil, mesajlaşma,
   bildirimler, koleksiyonlar, auth, ortak UI, discover/following/requests/
   saved/tags/search sayfaları, modallar ve `lib/supabase/*` hata
   mesajları çevrildi.
4. **Yeni yardımcılar:** `translateForRuntime()` (React dışı kod),
   dile duyarlı `formatRelativeTime`, `getRuntimeLanguage()`; değer/etiket
   ayrımı için `INTEREST_OPTION_LABELS` gibi `Record<Value, TranslationKey>`
   haritaları.
5. **Hata/toast/doğrulama metinleri:** `lib/supabase/*.ts` (14 dosya),
   `lib/utils.ts` görsel hataları, `auth-errors.ts`, `image-analysis.ts`
   (`friendlyMessages()` fonksiyona çevrildi) dile duyarlı.
6. **Bu denetimde bulunup düzeltilen gerçek hatalar:** paylaşılan istek
   kartında çevrilmemiş ham anahtar görünmesi; eksik `language` argümanlı
   `formatRelativeTime` çağrıları; `useCallback` deps'inde eksik `t`.
7. **Bilinçli Türkçe bırakılanlar:** kod yorumları, `client.ts` env hatası,
   `console.error` teşhis logları, dil seçicideki "Türkçe"/"English",
   `layout.tsx` statik SEO açıklaması, kullanıcı içeriği, marka/teknik adlar.
8. **[KAPATILDI] Generator kataloğu:** yeni `src/lib/generator-field-catalog-en.ts`
   1216 katalog metninin (kategori/alt kategori/alan/seçenek/paket
   etiketleri, placeholder'lar) İngilizce karşılığını tutuyor; katalog
   verisi (option `value` slug'ları, `jsonPath`) DEĞİŞMEDİ. Picker artık
   `catalogText()` ile görüntülüyor, arama iki dilde çalışıyor, mükerrer
   alan kontrolü iki dili de sayıyor, ve bir alan generatora eklenirken
   `localizeCatalogField()` ile o anki dilde yazılıyor (option değerleri/
   görseller/renkler aynı). Sayılar, f-stop'lar, format ve marka/teknoloji
   adları bilinçli olarak iki dilde aynı. `tag-candidates.ts` (etiket
   adları, kalıcı veri) çevrilmedi.
9. **[KAPATILDI] Bildirim metinleri:** SQL trigger'ları ve eski satırlar
   dokunulmadan, yeni `src/lib/notification-message.ts` bilinen Türkçe
   cümle şablonlarını tanıyıp aktif dilde yeniden üretiyor (tırnak içindeki
   kullanıcı içeriği aynen geçer; bilinmeyen metin olduğu gibi kalır).
   `notification-row.tsx` bunu kullanıyor. Migration gerekmedi.
10. **Diğer kapsam dışı:** `/dev/*` test sayfaları.
11. **Test:** `npx tsc --noEmit`, `npm run lint` ve tam `next build`
    (26 statik rota) temiz. Tarayıcıda uçtan uca İngilizce/Türkçe geçiş
    taraması bu sandbox'ta (Supabase erişimi yok) yeni yazılmadı.
12. **Sonraki öneri:** katalog verisini `{tr,en}` çiftli hale getirmek ve
    bildirimleri yapılandırılmış şekle taşımak (ayrı görevler).

**Bilinen, kapsam dışı bırakılan boşluk (raporda dürüstçe belirtilecek):**
`AppNotification.message`, SQL migration trigger'ları (Bölüm 9.6/9.12'nin
`20260919230000` migration'ı) tarafından SUNUCU TARAFINDA, Türkçe olarak
oluşturulan dinamik bir metindir — bu, istemci tarafı bir `t()` çağrısıyla
çevrilemez, backend/veritabanı tarafında (yeni trigger fonksiyonları veya
`message` yerine yapılandırılmış bir `{type, params}` şekli yazıp
istemcinin kendi `t()` ile render etmesi gibi) ayrı bir değişiklik
gerektirir. Bu görevin kapsamına alınmadı, sessizce atlanmadı — raporda
açıkça "yapılamadı" diye işaretlenecek.

**Sonraki adım:** i18n görevi (Madde 1-11) tamamlandı; açık boşluklar
yukarıda 8-9. maddelerde.
