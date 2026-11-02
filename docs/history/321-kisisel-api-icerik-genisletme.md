# 321 — Kişisel API/MCP genişletme: istek · hazır ayar · workflow, taslak güncelleme, "ben kimim"

> **Durum:** repoda, testli (birim + MCP + yerel PostgreSQL SQL testi). **Canlıya UYGULANMADI:** migration `20261102140000_api_me_content.sql` boru hattıyla uygulanır; Edge Function `api` ve `mcp` ELLE yeniden deploy edilmelidir (CI deploy etmez) ve **migration'dan SONRA** (yeni kod `api_me_whoami` ister; `GET /me` önce deploy edilirse hata verir). Gerçek Supabase'e / claude.ai'ye / bir MCP istemcisine KARŞI DENENMEDİ.

## İstek (kullanıcı)
Kişisel yüzeyde (anahtar ya da OAuth ile bağlanan araç) istek, hazır ayar ve workflow okunabilsin ve özel taslak olarak eklenebilsin; taslaklar (prompt dahil) güncellenebilsin; oturumun kullanıcı adı/görünen adı görülebilsin.

## Kararlar (kullanıcı onayladı)
1. Güncelleme yalnız **özel taslaklara**. Yayınlanmış içerik bu yüzeyden değişmez (422 `not_draft`).
2. **Yayınlama yok** (ne REST ne MCP): yama ile `status`/`visibility` gönderilirse veritabanı `unknown_field` ile reddeder. Yayınlama sitede, kişinin elinde.
3. **Silme yok.**
4. Çakışma: güncelleme `expectedUpdatedAt` ister (en son okunan `updatedAt`); kayıt bu arada değiştiyse **hiçbir şey yazılmaz** (409 `conflict`, hata mesajı güncel zamanı verir) — istemci yeniden okur, kendi değişikliğini üstüne uygular, yeniden dener.

## Ne yapıldı
- **SQL (`20261102140000`, yalnız ekleme, hepsi SECURITY INVOKER — RLS/askı/hız sınırı atlanmaz):** `api_me_whoami`; `api_me_requests|presets|workflows` (keyset liste) ve `api_me_request|preset|workflow` (ayrıntı jsonb; workflow adımları 1 tabanlı `position`la, `updatedAt` milisaniyeli ISO); `api_me_update_draft(tür, id, yama, beklenen_zaman)` — satırı `for update` kilitler, sahip + topluluğa özgü değil + silinmemiş + TASLAK + zaman eşleşmesi denetler, **önce tüm doğrulama sonra yazma**, araç/etiket/kategori için içe aktarmayla AYNI `_import_common`, etiketleri yalnız verilmişse değiştirir, ana UPDATE her zaman çalışır (belirteç yenilenir). Anon'a kapalı.
- **Yama alanları:** prompt: title, description, promptText, contentType, category, subcategory, tools, tags · istek: + creativeDirection (promptText yok) · hazır ayar: + selection (tümü değişir) · workflow: title, description, category, subcategory, tools, tags, `stepEdits` (var olan adımların başlık/açıklama/yönergesi, konuma göre). Workflow adım yapısı/bağlantı/prompt değişmez; prompt `variables` kendiliğinden metinden türer.
- **Çekirdek (`src/lib/public-api/me-content.ts`):** `getWhoami`, `listMyContent`, `getMyContent`, `importMyContent` (`parseContent` → `import_content` / `import_workflows`; başka türün dosyası reddedilir), `updateMyDraft` (RPC kodlarını HTTP'ye çevirir). Yeni hata kodları `conflict` (409) ve `unprocessable` (422).
- **REST:** `GET /me` (kullanıcı adı, görünen ad, avatar, profil bağlantısı, kapsamlar) · `GET|POST /me/{requests|presets|workflows}` · `GET|PATCH /me/{requests|presets|workflows|prompts}/{id}`; PATCH gövdesi `{ expectedUpdatedAt, changes }`. OpenAPI + dizin güncellendi; CORS `PATCH`.
- **MCP (`/mcp/me`):** `whoami`, `list_my_content`, `get_my_content` (tür parametreli), `save_request_draft`, `save_preset_draft`, `save_workflow_draft`, `update_my_draft` (tür + id + `expected_updated_at` + `changes`). Yazanların hepsi `destructiveHint:false`; yayınla/sil aracı YOK (testle sabitlendi).
- **Metinler (TR+EN):** anahtar erişim açıklamaları, `/developers` (yeni adımlar + `curlMeListOther`/`curlMeUpdate`), onay ekranı ("Özel taslak eklemesine ve düzenlemesine de izin ver" + "yayındaki içeriğini düzenleyemez"), bağlı uygulamalar ("Taslak ekleme ve düzenleme"), bağlama rehberi, Gizlilik Politikası'ndaki kapsam cümlesi. Mevcut OAuth testi (`run-oauth-connect.mjs`) yeni metne uyduruldu.
- `scripts/smoke-test.mjs`: üç yeni RPC ziyaretçiye kapalı mı.

## Testler
- `supabase/tests/api-me-content.sql` (27 kontrol): whoami; üç liste + keyset; ayrıntılar; başarılı güncelleme (belirteç yenilenir); çakışma; belirteç zorunlu; yayınlanmış → `not_draft` (4 tür); başkasının kaydı `not_found`; doğrulama reddi + kısmi yazma yok; yama ile yayınlama imkânsız; etiket sayaçları değişmez; workflow `stepEdits`; ikinci kullanıcı; anon reddi. Komşu `api-me.sql`, `anon-hardening.sql` yeniden koşuldu (0 başarısız).
- Birim `me-content.test.ts` (8) + `me.test.ts` güncel + `public-api.test.ts` rota listesi; MCP `remote.test.ts` (araç listesi, whoami, liste/okuma, üç `save_*`, `update_my_draft` çakışma + salt-okunur anahtar reddi): 32/32.

## Bilinen sınırlar (dürüst not)
- **Güncelleme yalnız API'nin eklediği taslaklara değil, kişinin TÜM yayınlanmamış taslaklarına dokunabilir** (elle yazdıkları dahil) — yazma izni bunu kapsar; onay ekranı/anahtar açıklaması bunu söyler.
- **Taslaklar sürümlenmez** (`save_*_content` yalnız yayınlanmış içerikte sürüm yazar): API güncellemesi eski metni geri getirilemez biçimde değiştirir. `expectedUpdatedAt` yalnız EŞZAMANLI ezmeyi önler, yanlış içerikle üzerine yazmayı değil.
- Workflow'a adım ekleme/silme/yeniden bağlama, prompt `variables` tanımı, görsel/medya, yayınlama, silme YOK.
- Eski yazma izinleri (321 öncesi verilmiş OAuth izinleri ve `write` anahtarları) bu yeni "düzenleme" yeteneğini de kazanır; kapsam adı değişmedi (`write`). Anahtar/izin metni güncellendi ama mevcut sahiplere ayrıca bildirim gitmez.
- Gerçek ortamda denenmedi: canlı migration, Edge deploy, claude.ai/Cursor bağlayıcısı, gerçek OAuth belirteciyle PATCH.

## Yayına alma sırası
1. PR birleşir → boru hattı migration'ı uygular. 2. `api` ve `mcp` Edge Function'ları yeniden deploy (`./scripts/deploy-functions.sh api|mcp` ya da "Deploy Edge Functions"). 3. Canlıda `GET /me` ve `tools/list` ile doğrula. Sıra tersine çevrilirse `GET /me` yeni RPC yokluğundan 502 verir.
