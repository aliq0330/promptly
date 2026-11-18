# Promptly Chrome uzantısı (v1.2)

Manifest V3, bağımlılıksız (derleme adımı yok). Kullanıcıya anlatım Ayarlar → Geliştirici → "Chrome uzantısı" kartındadır
(`src/features/settings/extension-section.tsx`); bu dosya geliştiriciler içindir. Tarihçe: `docs/history/429-*`.

## Çalıştırma / paketleme
- Geliştirme: `chrome://extensions` → Geliştirici modu → **Paketlenmemiş öğe yükle** → bu klasör.
- Dağıtım zip'i: `node scripts/build-extension.mjs` → `public/downloads/promptly-extension.zip` (`npm run build/dev` kendiliğinden çalıştırır; zip repoya girmez).
  Zip'e `tests/` ve bu dosya girmez. **Sürüm** `manifest.json` → `version`; kartta görünen sayı da oradan gelir. Davranış değişince sürümü artır.
- Testler: `npm test` (`promptly-extension/tests/*.test.mjs`, saf mantık + sahte `chrome`/`fetch`) ve gerçek Chromium'da
  `node promptly-extension/tests/e2e/run.mjs` (sahte Promptly sunucusu + test sayfası; `playwright` gerekir, `npm i --no-save playwright`).

## Mimari (klasik betikler, ortak global'ler: `self.PI`, `PVars`, `PStore`, `PAuth`, `PApi`, `PQueue`, `PLib`, `PSlash`, `PUI`)
| Dosya | Görev |
|---|---|
| `background.js` | service worker: sağ tık menüsü, kısayollar, kuyruk boşaltma (tek sıra), rozet, mesaj kapısı (`ply:*`) |
| `shared/auth.js` | OAuth (sitenin KENDİ sunucusu, `317-*`): DCR + PKCE S256 + `launchWebAuthFlow`; **yenileme `navigator.locks` ile tek kilit** (belirteç döner, yarış yok) |
| `shared/api.js` | açık API: herkese açık uçlar belirteçsiz, `/me*` OAuth Bearer; 401'de bir kez yenile-dene; yazma YALNIZ `POST /v1/me/prompts` + `media-upload` |
| `shared/vars.js` | saf: `{değişken}`, `[konu]`→`{konu}`, araç/tür tahmini, **`buildPromptsFile`** (sitenin dışa aktarma biçimi, `source` atfı) |
| `shared/queue.js` | kuyruk: 6 sn bekletme ("Geri al"), kalıcı hata → `failed` (kuyruğu DURDURMAZ), geçici hata → durdurur; `statusOf` |
| `shared/library.js` | kaynaklar (son/benim/kaydettiğim/taslaklar/popüler/keşfet), metin getirme, çevrimdışı önbellek, son kullanılanlar |
| `shared/platforms.js` | **Çalıştır**: hedef tanıma, yol kararı (yaz / adresle aç / kopyala+aç), sayfaya yazan işlev; hiçbir yolda otomatik göndermez |
| `shared/browse.js` | saf gezinme mantığı: süzgeç → API argümanı, Görünümlerim, slotlar, kart yer tutucusu, dışa aktarma dosyası |
| `shared/browser.js`, `shared/run-ui.js`, `shared/wide.css` | geniş görünümün DOM parçaları: kart, süzgeç çubuğu, Ana Sayfa/Keşfet/Kütüphane, ayrıntı bölmesi, bölünmüş düğme |
| `shared/structured.js`, `shared/workflow-run.js` | JSON/YAML renklendirme (yalnız gösterim, metin değişmez); workflow adım adım durum mantığı (yan panel "Workflow" sekmesi) |
| `shared/context.js` | yan panel bağlamı: açık sekme yapay zekâ sitesi mi, seçili metin (isteğe bağlı 4 site izniyle) |
| `shared/slash.js` | site başına "/ ile aç": `optional_host_permissions` + dinamik içerik betiği; kapatınca ikisi de kalkar |
| `shared/ui.js`, `popup/`, `sidepanel/` | arayüz; kütüphane görünümü tek yerde (`createLibrary`) |
| `content/overlay.js` | sayfaya enjekte edilen yakalama kartı + palet + "/" (Shadow DOM) |

## Kurallar (bozma)
0. **Popup kök boyutu sabit px'tir** (`popup.css`: oturumlu `body.app` 780×600, oturumsuz 400 px): `vw/vh/dvh/%` YASAK. Açılır pencere önce küçük açılır ve içeriğe göre büyür; görünüm birimi o küçük boyuta kilitler ve pencere hiç büyümez (1.1'de Android'de dar/kırpık görünen hata, `docs/history/431-*`). `extension.test.mjs` + e2e korur.
1. **Sayfaya enjekte edilen betik depoya/belirtece/ağa ERİŞEMEZ**: arka plan `storage.setAccessLevel(TRUSTED_CONTEXTS)` koyar; `overlay.js` yalnız `chrome.runtime.sendMessage` kullanır ve `auth/api/store/queue/library` modüllerini İÇERMEZ (`tests/extension.test.mjs` + e2e bunu doğrular). Yeni bir sayfa özelliği mesaj kapısına (`handlers`, `FROM_CONTENT`) eklenir.
2. **Kalıcı site erişimi YOK** (1.1: yan panel bağlamı için kullanıcı İSTERSE yalnız ChatGPT/Claude/Gemini/Perplexity adreslerine izin verir; `PContext.enable()` kullanıcı hareketiyle, kaldırılabilir; "tabs" izni EKLENMEZ): `host_permissions` yalnız Promptly sunucusu; `activeTab` + `scripting` yalnız kullanıcı eylemiyle. "/" için izin site başına, kullanıcı hareketiyle (`permissions.request`) istenir. `<all_urls>` ve `content_scripts` bildirimi YASAK (test korur).
3. **Yazma = yalnız özel taslak** (`write` kapsamı). Yayınlama, görünürlük, silme, "Çalıştı mı?" oyu, sonuç paylaşımı açık API'de YOKTUR; bunlar sitede yapılır (yan panel → "Sitede oy ver"). Bu yetenekleri eklemek kapsamı genişletmektir: ürün kararı, OAuth izin ekranı ve `me.ts` birlikte.
4. **Atıf**: web'den gelen içerik varsayılan "başka yerden" olarak kaydedilir ve `source` (site + sayfa adresi) taşır; sunucu açıklamaya "Kaynak:" satırı yazar.
5. Yalnız https ve 443'teki herkese açık görseller yüklenir (sunucu da SSRF korumalıdır); `data:`/`blob:`/http görsel hiç gönderilmez.
6. Metinler `shared/i18n.js` (TR+EN, parametre kümeleri eşit); arayüzde sabit metin yok. Kullanıcı içeriği DOM'a `textContent` ile yazılır, `innerHTML` yalnız sabit ikon/marka SVG'si için.
7. Gönderilen taslak API'den silinemez: "Geri al" yalnız bekletme süresinde (henüz kuyruktayken) çalışır.
8. Config'te gizli anahtar yok (yalnız adresler); eski sürümdeki anon anahtar kalktı.

## Bilinen sınırlar
- 1.2: küçük resim/Çalıştı % için canlı API'nin yeni sürümü (Edge `api` deploy) gerekir, yoksa yer tutucu; Ana Sayfa'da sana özel/takip akışı, koleksiyonlar, sonuç/sürüm/yorum sekmeleri, beğeni/kaydet/oy ve ayar paketi uygulama YOK (sunucu + yazma kapsamı onayı bekliyor, `431-*`); slot kısayolu popup içinde 1–5 tuşu (Chrome 4 öneri kısayolu sınırı). Çalıştır adres parametreleri/seçicileri gerçek sitelere karşı DENENMEDİ (sitelerin arayüzüne bağlıdır, bozulursa kopyalanır). Ayrıntı: `docs/history/430-*`.
- `launchWebAuthFlow` (gerçek giriş penceresi) headless Chromium'da çalıştırılamadı: OAuth birim testli (PKCE vektörü, kod değişimi, yenileme yarışı), canlı sunucunun herkese açık uçları ve OAuth metadatası gerçek istemciyle okundu; gerçek Chrome'da uçtan uca giriş DENENMEDİ.
- Kayıtlı yönlendirme adresi `https://<uzantı-kimliği>.chromiumapp.org/`: paketlenmemiş yüklemede kimlik klasör yoluna göre değişir, bu yüzden istemci kaydı (DCR) yüklemeye özgüdür ve yönlendirme değişirse yeniden kaydolur. Web Store'a çıkılırsa kimlik sabitlenir.
- Skill ve Space'e ekleme yok (Skill bayrağı kapalı; Space yazma yeteneği açık API'de yok).
