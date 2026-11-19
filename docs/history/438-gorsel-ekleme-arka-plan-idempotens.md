# 438 — Taslağa görsel ekleme: arka plan/otomasyon uyumu, idempotens, aşama raporu

**Sorun (kullanıcı):** ChatGPT uygulaması AÇIKKEN `AI görsel → Promptly connector → özel taslak → attach_image` çalışıyor; uygulama KAPALIYKEN ya da zamanlanmış
otomasyonda `BLOCKED_FILE_REFERENCE` ile kırılıyor. İstenen: uygulama kapalıyken de zincirin tamamen çalışması, tekrar koşuda çift ek/taslak olmaması,
hata aşamalarının ayrı raporlanması.

## Gerçek neden (kodla doğrulandı)
- `BLOCKED_FILE_REFERENCE` **repoda hiç geçmiyor**: Promptly sunucusu üretmiyor, **ChatGPT istemcisi** üretiyor. `attach_image` aracının `image_file` parametresi
  `_meta["openai/fileParams"]` ile işaretli (333-*): ChatGPT, sohbetteki dosyayı kendi tarafında geçici bir `download_url`'ye çevirip araca verir. Uygulama kapalı
  ya da iş arka planda koşarken istemci bu dosya başvurusunu vermeyi reddediyor → **araç hiç çağrılmıyor**, yani sunucuda düzeltilebilecek bir hata yok.
- Promptly'nin kabul ettiği kaynaklar (kodla: `src/lib/public-api/media.ts`): **A)** herkese açık https `image_url` (SSRF korumalı indirilir) — kabul edilir;
  **B)** istemci dosya başvurusu → yalnız `download_url` olarak, yani yine bir URL; **C)** uploadMedia→mediaId akışı YOK (yeni sahte API yazılmadı).
- Dolayısıyla koşul şu: **görselin baytlarına sahip olan taraf onları Promptly'ye kendisi ulaştırabilmeli.** ChatGPT'nin kendi kum havuzunda duran ve dışarıya
  hiçbir kalıcı adres vermeyen bir görsel, bu arka plan modunda Promptly'ye ulaştırılamaz — bunu Promptly tarafında çözmenin yolu yok (MCP'de akış tek yönlüdür;
  modelin görseli base64 metin olarak yazması pratikte çalışmaz). Çözüm, görseli **dışarıdan erişilebilir bir yere ya da doğrudan Promptly'ye** koyabilen
  bir üretim/depolama adımı kullanmaktır; aşağıdaki iki yeni yol bunu mümkün kılar.

## Ne yapıldı (migration + Edge + çekirdek + MCP + betik)
1. **Doğrudan bayt yükleme** — `media-upload` artık ikinci bir gövde biçimi kabul eder: `Content-Type: image/png|jpeg|webp` (ya da `application/octet-stream`) +
   gövde = görselin kendisi (≤ 8 MB), parametreler adreste (`?prompt_id=&generation_id=&alt=`). İndirme yok, tarayıcı/ChatGPT/herkese açık adres gerekmez; bayt
   kaynağı hangisi olursa olsun AYNI doğrulamadan geçer (`sniffImage`: tür/boyut baytlardan, SVG/GIF/HTML red) ve AYNI yoldan yazılır
   (`prompt-media/{kullanıcı}/{uuid}.{uzantı}` — yol sunucuda kurulur). Mevcut JSON + `image_url` biçimi aynen çalışır. Yükleme **sunucu tarafında** olur; service
   role yalnız `media-upload`'da (CLAUDE.md §7 değişmedi), istemciye/`api`/`mcp`'ye gitmez.
2. **İdempotens: `generation_id`** — her ek isteğe bağlı bir iş kimliği taşır (`prompt_media.generation_id`, `(prompt_id, generation_id)` kısmi UNIQUE;
   biçim `^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$`). Aynı iş ikinci kez koşarsa `begin` mevcut eki döner, **hiçbir şey indirilmez/yüklenmez/yazılmaz**
   (`duplicate: true`); 4 görsel dolu olsa bile yeniden deneme başarıdır; eşzamanlı iki istek yarışırsa `commit` (taslak satırı `for update`) kazananı döner ve
   kaybedenin yüklediği dosya silinir. Taslağın kendisi için çift kayıt korumasını `save_prompt_draft` ("aynı başlık+metin reddedilir") zaten sağlıyor; ayrı bir
   taslak-meta sütunu eklenmedi.
3. **Aşama raporu** — sonuç VE hata `pipeline` taşır: `{ draftCheck, imageSource, storageUpload, imageAttachment, published:false }` (her biri
   `success|failed|skipped`; kırılan aşamadan sonrakiler `skipped`, sonraki aşama hiç çalıştırılmaz). Hata gövdesi ve MCP araç hatası `stage` + `pipeline` içerir;
   `image_file` ile gelip açılamayan bağlantı için araç, nedeni ve çıkış yolunu (kalıcı https `image_url` ya da siteden ekleme) söyler. Görsel ÜRETİMİ ve taslak
   OLUŞTURMA bu yüzeyin dışındadır (üretimi sen/otomasyonun yapar, taslağı `save_prompt_draft` / `POST /v1/me/prompts` açar) — bu yüzden rapor onları içermez.
4. **`scripts/attach-draft-image.mjs`** — otomasyon/cron/CI için bağımlılıksız köprü: `--file` (bayt) ya da `--url`, `--prompt-id`, `--generation-id`; anahtar
   `PROMPTLY_API_KEY` (yalnız `Authorization` başlığında, çıktıya yazılmaz), adres `PROMPTLY_SUPABASE_URL`. Geçici hatalarda (ağ, 429/502/503/504) AYNI
   `generation_id` ile en çok 3 deneme (idempotens olduğu için çift ek riski yok), 4xx denenmez; çıkış 0 başarı (`duplicate` dahil) / 1 hata / 2 kullanım.

**Hiçbir şey yayınlanmaz:** kapsam 333/321 ile aynıdır — yalnız KENDİ, yayınlanmamış, topluluğa özgü olmayan, `image` türlü taslak, en çok 4 görsel; yayınlama/
görünürlük/silme yoktur ve `published` her yanıtta `false`'tur. Kullanılan anahtar `write` kapsamlıdır; hiçbir public bucket açılmadı (`prompt-media` private,
satırda yalnız kimlik adresi durur, gösterim signed URL ile).

## Önerilen otomasyon akışı (ChatGPT uygulaması kapalıyken)
```
zamanlanmış iş (cron / GitHub Actions / kendi sunucun)
  → trend araştırması + prompt üretimi + görsel üretimi (görsel BAYTLARI bu işte)
  → save_prompt_draft / POST /v1/me/prompts          (özel taslak, content_type "image")
  → node scripts/attach-draft-image.mjs --file out.png --prompt-id … --generation-id promptly_visual_trend_<UTC-saat>
  → { duplicate:false, pipeline:{…success…, published:false} }
```
Görseli kalıcı bir https adresine koyan bir üretim adımın varsa aynı betik `--url` ile çalışır (adres, Promptly sunucusu indirirken geçerli olmalı; kısa ömürlü
imzalı adres işe yarar ama süresi dolmadan indirilir). Storage yolu (`prompt-media/{kullanıcı}/{uuid}.{uzantı}`) uuid adlıdır — tarih/`generation_id` yola
YAZILMAZ (DB CHECK'i uuid ister); idempotens satırdaki `generation_id` ile sağlanır.

## Canlıya alma sırası (HİÇBİRİ bu oturumda yapılmadı)
1. Migration `20261211100000_api_me_media_generation_id.sql` — boru hattı (`deploy.yml`) uygular; yalnız ekleyici (eski `begin(uuid)`/`commit(…6 arg)` kalır).
2. `./scripts/deploy-functions.sh media-upload` — yeni işlev yeni iki RPC'yi çağırır, bu yüzden migration'dan SONRA.
3. `./scripts/deploy-functions.sh mcp` — araç şeması değişti (`generation_id`, açıklama, `idempotentHint`).
Ortam değişkeni: Edge Function'lara yeni sır GEREKMEZ (mevcut `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`). Betik için `PROMPTLY_API_KEY`
(+ `PROMPTLY_SUPABASE_URL`) otomasyonun kendi gizli deposunda tutulur.

## Test
`src/lib/public-api/media.test.ts` 16 → 25 (bayt kaynağı, tek kaynak şartı, idempotens + yarış, biçim, aşama raporu, ikili işleyici, istemci); `mcp/test` 36 → 38;
`supabase/tests/api-me-media-generation.sql` 14 madde (yerel PostgreSQL 16, tüm migration'lar baştan, FAILED=0) ve eski `api-me-media.sql` FAILED=0 (geriye uyum);
`scripts/attach-draft-image.test.mjs` 6; `npm test` 1429/1429; `tsc`, `eslint` temiz; `scripts/smoke-test.mjs` iki yeni RPC (canlı şemaya karşı çalışmaz önce migration).
**Denenmedi:** gerçek Supabase/Storage'a karşı uçtan uca yükleme, gerçek ChatGPT/Claude arka plan çalıştırması, Deno'da `deno check` (Deno kurulu değil); `_shared`
kopyası `sync-function-shared.mjs` ile üretildi. İngilizce karşılık: araç/hata metinleri zaten İngilizce; kullanıcıya görünen site metni değişmedi.
