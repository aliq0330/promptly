# 431 — Chrome uzantısı v1.2: popup boyut hatası düzeltmesi + küçük resim, Çalıştı %, Cursor, JSON/YAML, workflow adım adım

**Tarih:** 2026-11-18 · **Klasör:** `promptly-extension/` (1.1.0 → 1.2.0) + açık API çekirdeği · **Karar kaynağı:** kullanıcı (Titanium/Android ekran görüntüleri: "görünüm hataları var, yapmadıklarının hepsini tamamla").

## Görünüm hatası (kök neden)
1.1'de popup kökünü `body { width: 780px; max-width: 100vw }` + `#app { height: 600px; max-height: 100vh }` ile boyutlamıştım. Açılır pencere ÖNCE küçük açılır ve içerik boyuna göre büyür; `100vw/100vh` o küçük başlangıç boyutuna KİLİTLENDİĞİ için pencere hiç büyümedi: oturumsuz ekran ~230 px'e sıkıştı (metin dar sütunda, düğme kırpık), oturumlu ekranda arama kutusu ikona indi, süzgeç çipleri üstten kırpıldı, alt çubuktaki ipucu dar bir sütuna sıkıştı. **Düzeltme:** kök boyut yalnız sabit px (oturumlu `body.app` 780×600, oturumsuz 400 px; sınıf `render()`'da), `vw/vh/%` YOK; alt çubuk satır kaydırır, ipucu kendi satırında; `body { overflow: auto }` (pencere tarayıcıca kısılırsa içerik kırpılmaz, kaydırılır). Koruma: `extension.test.mjs` (popup.css'te görünüm birimi/yüzde kök boyut olamaz) + e2e (240×300'lük küçük pencerede de gövde sabit 780×600 / 400). Android'de popup'ın gerçek üst sınırı tarayıcıya bağlıdır; gerçek cihazda DENENMEDİ.

## Eklenenler
- **Küçük resim (açık API):** `GET /v1/prompts` ve `/prompts/popular` özetine `thumbnailUrl` (ilk görselin ~10 dk'lık İMZALI adresi). Satırlar `prompt_media(url,position)` gömülür; imza ANON anahtarla Storage `POST /storage/v1/object/sign/prompt-media` (tek toplu istek; yetkiyi Storage politikası verir, hiçbir kural genişlemez, service role yok). **Hata güvenli:** imza alınamazsa/ağ düşerse liste yine döner, `thumbnailUrl: null`. Kalıcı bağlantı DEĞİL (OpenAPI'de yazılı). Uzantı kartı yer tutucunun üstüne `<img>` biner; yüklenemezse (süresi dolmuş) yer tutucu kalır.
- **"Çalıştı %" (açık API):** özete `works: { yes, no } | null` (`prompt_works_stats` gömülür; oy yoksa null). Uzantı rozeti yalnız ≥5 oyda yüzde gösterir (sitenin "az oyla yüzde yok" kuralı).
- **Cursor** (5. hedef): `cursor://anysphere.cursor-deeplink/prompt?text=…` ile uygulamada açar; özel şema açılamazsa kopyalar + siteyi açar. İzin isteğine girmez (sitesi yok).
- **JSON/YAML renklendirme** (`shared/structured.js`): yalnız gösterim; metin DEĞİŞMEZ (jetonlar birleşince özgün metin, rastgele girdilerle sınanır), tüm kalıplar doğrusal zamanlı (düşmanca girdi testi).
- **Workflow adım adım** (yan panel "Workflow" sekmesi, `shared/workflow-run.js`): herkese açık workflow ara → başlat → her adımın promptu önceki adımın çıktısıyla (`önceki/girdi/çıktı/seçim` değişkenleri) çözülüp Çalıştır ile gider → çıktıyı sonraki adıma taşı → bitir. Durum yalnız bu cihazda (`wf`). Hiçbir adım otomatik gönderilmez. Prompt'u herkese açık olmayan adım "elle yap" olur. Çıktı kutusuna yazılan metin, panel her depo değişiminde yeniden çizilirken KAYBOLMAZ (e2e bunu yakaladı).

## Yapılmadı (neden)
Aşağıdakilerin hepsi üretim veritabanı/yetki değişikliği ister ve ayrı onay gerektirir (migration'lar `main`'e birleşince deploy hattında otomatik uygulanır; Edge Function'lar elle deploy edilir):
- **Ana Sayfa "Sana özel / Takip ettiklerim" akışı, Koleksiyonlar sekmesi, Sonuçlar/Sürümler/Yorumlar sekmeleri:** yeni `api_me_*` okuma RPC'leri + `/v1/me/*` uçları (migration + me.ts + OpenAPI + SQL testleri).
- **Beğeni, kaydet, koleksiyona ekle, takip, "Çalıştı mı?" oyu:** yeni bir YAZMA kapsamı (`interact`): `api_tokens.scopes` + `oauth_grants/oauth_codes` CHECK'leri, onay ekranı anahtarı, hız sınırı, Kullanım Koşulları sürümü (`TERMS_VERSION`) — README kural 3: ürün/hukuk kararı.
- **Ayar paketi uygulama:** ayar paketinin parametrelerinin prompt metnine nasıl bileşeceği sitedeki `presetFit`/Studio mantığına bağlı; uzantıda uydurma biçim yazılmadı.
- **Slot kısayolu Alt+1…5:** Chrome en çok 4 öneri kısayolu verir (2'si kayıt/palet); slotlar popup içinde 1–5 tuşuyla çalışır.
- **Edge `api` Function'ı deploy EDİLMEDİ** (CI deploy etmez): küçük resim/oy alanları canlı API'ye yansıyana kadar uzantı yer tutucu gösterir (`thumbnailUrl` yoksa renk yüzeyi, `works` yoksa rozet yok). "Deploy Edge Functions" iş akışı ya da `supabase functions deploy api mcp` gerekir.

## Doğrulama
- Birim: uzantı 80+ test (yeni: `structured.test.mjs`, `workflow-run.test.mjs`, Cursor/boyut testleri); açık API `public-api.test.ts` 27 test (küçük resim imzası tek istek + anon kimlik, hata güvenli, `mediaPathOf`, oylar).
- Uçtan uca gerçek Chromium + yüklenmiş uzantı: 23 senaryo (küçük pencerede sabit boyut, küçük resim + bozuk küçük resim yedeği + Çalıştı % rozeti, JSON renklendirme, Cursor menü satırı, workflow baştan sona). e2e dili `tr`ye sabitlendi (ortamın tarayıcı dili en-US idi).
