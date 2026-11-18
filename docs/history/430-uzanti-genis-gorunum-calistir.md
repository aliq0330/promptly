# 430 — Chrome uzantısı v1.1: geniş görünüm, Çalıştır, yan panel bağlamı (+ giriş hatası düzeltmesi)

**Tarih:** 2026-11-18 · **Klasör:** `promptly-extension/` (1.0.0 → 1.1.0) · **Karar kaynağı:** kullanıcı (prompts.chat uzantısıyla karşılaştırma → mockup → "3 adımı da beraber uygula ve merge et").

## Neden
1. **Giriş hatası (1.0.1):** `PAuth.connect()` popup sayfasında çalışıyordu; giriş sekmesi açılınca popup kapanıyor (Android'de kesin: Titanium'da "İzin ver"den sonra `about:blank`'ta kalıyordu), token değişimi hiç çalışmıyordu. Giriş artık arka planda (`background.js` `connect` işleyicisi, hizmet çalışanı 20 sn'de bir canlı tutulur); popup/yan panel mesaj yollar, sonuç `storage` değişimiyle yansır. Kullanıcı Titanium'da denedi: çalıştı.
2. **Karşılaştırma (prompts.chat uzantısı, resmî olmayan, açık kaynak):** en büyük fark "Çalıştır" (prompt'u yapay zekâ sitesine götürme) ve dar popup'tı. Sitenin API'sinin bugün verdiği/vermediği ayrıca ölçüldü (aşağıda "Sınırlar").

## Ne yapıldı
- **Çalıştır** (`shared/platforms.js` mantık, `shared/run-ui.js` arayüz): ChatGPT · Claude · Gemini · Perplexity. Üç yol: (1) açık sekme hedef siteyse giriş kutusuna yazar (mevcut yazının SONUNA ekler, silmez; `innerHTML` yok, `execCommand('insertText')`), (2) adres parametresi varsa yeni sekmede açar, (3) yoksa/çok uzunsa (>6000) kopyalar + siteyi açar. **Hiçbir yolda otomatik gönderilmez.** Kopyalama sekme açılmadan ÖNCE yapılır (açılınca popup kapanabilir). Yazma başarısızsa (izin yok/seçici bozuldu) kopyalar. Bölünmüş düğme (`splitButton`) + ▾ menüsü (her satırda yöntem yazar) + üst çubukta hedef seçici; seçilen hedef hatırlanır (`platform`).
- **Geniş kabuk** (popup 780×600; Chrome üst sınırı 800×600, dar ekranda tam genişlik): sabit sekmeler **Ana Sayfa · Keşfet · Kütüphane**. Süzgeçler (`shared/browse.js` saf mantık, `shared/browser.js` DOM): tür, araç, etiket → API'ye (`content_type`, `tool`, `tag`); "yalnız değişkenli" istemcide. **Görünümlerim** (kayıtlı süzgeç setleri, en çok 12, yalnız bu cihazda), ⚙ ile hangi süzgeçlerin görüneceği + kart yoğunluğu (Rahat/Sıkı/Liste). Görsel kartlar, hover'da Kopyala/Çalıştır, ayrıntı bölmesi (değişken formu, canlı önizleme, slota sabitle, Çalıştır ▾).
- **Kütüphane:** Benim · Kaydettiklerim · Taslaklar · Son kullanılan · Bekleyen; **hızlı slotlar** (5; popup'ta 1–5 tuşu) ve **toplu seçim + JSON dışa aktarma** (sitenin `promptly.prompts` biçimi, `PVars.buildPromptsFile`).
- **Yan panel bağlamı** (`shared/context.js`): kullanıcı İSTERSE yalnız dört yapay zekâ sitesi için izin verir (`optional_host_permissions` içinde; manifest izin listesi DEĞİŞMEDİ, "tabs" izni YOK) → panel hangi sitede olduğunu anlar, sayfada seçili metni gösterir, `{seçim}`/`secim`/`selection` değişkenli promptları önerir ("Yaz"), seçimi "Prompt olarak yakala" ile taslağa yollar. İzin kaldırılabilir.
- Ayarlar → Geliştirici → "Chrome uzantısı" kartı metinleri güncellendi (TR+EN); `npm test` artık `promptly-extension/tests/*.test.mjs`'i de koşar (README bunu söylüyordu ama listede yoktu).

## Bilinçli kararlar / sınırlar
- **Kart görseli yok:** açık API görsel adresi dönmüyor; kartta türe + kimliğe göre KARARLI renk yüzeyi yer tutucudur (gerçek görsel değil). Gerçek görsel için yeni okuma ucu (imzalı görsel adresi) gerekir.
- **Ana Sayfa "Sana özel / Takip ettiklerim" akışı yok:** `/me/feed` ucu yok. Şimdilik popüler/yeni + son kullandıkların; ekranda "yakında" notu var. "Çalıştı %" rozeti, ayar paketi uygulama, sonuçlar/sürümler, koleksiyonlar aynı nedenle yok.
- **Beğeni/kaydet/koleksiyona ekle/takip/"Çalıştı mı?" oyu yok:** yazma kapsamı bilerek yalnız özel taslak (`315-*`, `321-*`); genişletmek ürün + OAuth izin ekranı kararıdır.
- **Workflow'u adım adım yazdırma yapılmadı** (mockup'ta vardı): workflow okuma + adım durumu ayrıca tasarlanmalı.
- **Hızlı slot kısayolu Alt+1…5 DEĞİL**, popup içinde 1–5 tuşu: Chrome en çok 4 öneri kısayolu verir (manifest `commands` sınırı).
- Site adres parametreleri (`?q=`) ve giriş kutusu seçicileri sitelerin kendi arayüzüne bağlıdır ve zamanla değişebilir; bozulursa kopyalama yedeği devreye girer. **Gerçek sitelere karşı DENENMEDİ** (sandbox'ta dış ağ güvenilmez): e2e'de adresler/yazma sahte sayfayla ve açılan sekmenin adresiyle sınandı.
- **Android (Titanium) davranışı:** `activeTab`/`scripting` yazma yolu ve yan panel (Android'de yok) denenmedi.

## Doğrulama
- Birim: `promptly-extension/tests/*.test.mjs` 68 test (yeni: `platforms.test.mjs` — adres/yol kararı, kopyala-önce-aç sırası, yedek yol, sayfaya yazan işlev sahte DOM'la; `browse.test.mjs` — süzgeç→API, Görünümlerim, slotlar, dışa aktarma). `npm test` 1339/1339.
- Uçtan uca gerçek Chromium + yüklenmiş uzantı: `node promptly-extension/tests/e2e/run.mjs` 21 senaryo (süzgeçler API'ye gider, Görünümlerim kalıcı, slot + toplu JSON indirme, **açık sekmeye gerçekten yazma** [host izniyle, sonuna ekler], adresle yeni sekme, kart/hedef seçici/▾ menüsü, yan panel bağlamı seçili metin + Yaz, içerik betiği depoya erişemez, konsolda hata yok). Test bir hata yakaladı: yan panel bağlam kodu yanlış fonksiyonun içine yerleşmişti (`startContext is not defined`).
- Arayüz: `tests/messaging-ui/run-extension-card.mjs` 6/6. `tsc` temiz, `lint` 0 hata, `build` (yer tutucu env ile) temiz.
