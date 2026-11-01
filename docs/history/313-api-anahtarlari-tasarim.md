# 313 — Kişisel API anahtarları (Faz 2): TASARIM TASLAĞI

> **TASLAK — uygulanmadı.** Yol haritasındaki Ö6/Ö11'in (`docs/yapilacaklar.md`) ayrıntılı tasarımıdır. Aşağıdaki "Kullanıcı kararları"
> netleşmeden kod/migration yazılmaz. Mevcut durum: açık API + MCP yalnız anonim, salt-okunur (`297-*`, `299-*`, `302-*`, `304-*`).

## 1. Ne çözüyoruz

Anahtarsız API herkesi aynı kişi sayar (sınır IP başına), yalnız herkese açık veriyi okur, hiçbir şey yazmaz. Kişisel anahtarla:
- kişi **kendi** özel promptlarını, taslaklarını, kaydettiklerini okuyabilir (kendi Claude/Cursor'una bağlayarak);
- betik/CLI/MCP ile **kendi hesabına** (özel taslak olarak) prompt yazabilir (CLI: Ö7, GitHub: Ö10, bot kimliği: Ö11 bunun üstüne kurulur);
- sınır IP'ye değil **anahtara** bağlanır, kullanım kişiye görünür, sızan anahtar tek tıkla iptal edilir.

## 2. Anahtarın yapısı

| Konu | Karar (öneri) |
|---|---|
| Biçim | `pmt_` + 32 rastgele bayt (base64url). Gösterim önekiyle: `pmt_Ab3d…` |
| Saklama | Yalnız SHA-256 özeti (`token_hash`); ham anahtar **bir kez** gösterilir, kurtarılamaz (Space bağlantı jetonu kalıbı, `213-*`) |
| Tablo | `api_tokens`: `id`, `user_id`, `name` (≤60), `token_hash` (unique), `prefix`, `scopes text[]`, `kind` (`user`/`agent`/`bot`), `created_at`, `last_used_at`, `expires_at`, `revoked_at` |
| İstemci erişimi | Tabloya istemci **doğrudan yazamaz/okuyamaz**; oluşturma/listeleme/iptal yalnız RPC (`create_api_token` ham anahtarı bir kez döndürür) |
| Sınır | Kişi başına en çok 10 etkin anahtar; varsayılan son kullanma 90 gün (kullanıcı 30/90/365 gün/süresiz seçer) |
| Kapsam | `read` = kendi özel/taslak/kaydedilenler; `write` = kendi hesabına **özel taslak** yazma. `publish` (herkese açmak) ilk fazda YOK — yayın insan eylemidir |
| Silinen hesap | `on delete cascade`; askıdaki hesabın anahtarları çalışmaz (`_assert_can_act`) |

## 3. Anahtarla kim olunur — asıl teknik risk

Edge Function service role ile yazarsa `auth.uid()` boş kalır; hız sınırı, askı ve RLS atlanır (`yapilacaklar.md` Ö6). Hedef: işlem
**kullanıcının kimliğiyle ve onun RLS'iyle** çalışsın. Seçenekler:

| Yol | Nasıl | Artı | Eksi |
|---|---|---|---|
| **A. Kısa ömürlü JWT üretmek** | Edge Function anahtarı doğrular, `sub=<user>`, `role=authenticated`, 60 sn ömürlü JWT imzalar, PostgREST'i o JWT ile çağırır | RLS/trigger/RPC'ler hiç değişmez | JWT imza sırrı gerekir (Edge secret); proje asimetrik imza anahtarlarına geçtiyse kullanılamayabilir → **önce canlıda doğrulanmalı** |
| **B. Doğrudan Postgres bağlantısı** | `SUPABASE_DB_URL` ile tek işlemde `set local role authenticated` + `request.jwt.claims` kurup mevcut INVOKER RPC'leri çağırmak (PostgREST'in yaptığı) | Sır gerekmez, RLS aynı | Edge'de Postgres sürücüsü + bağlantı havuzu; her istekte bağlantı maliyeti |
| **C. DEFINER RPC'lerde yetkiyi elle yeniden yazmak** | `api_*(p_token, …)` içinde kontrolleri kopyalamak | Basit görünür | **Reddedildi:** DEFINER içinde `set role` yapılamaz, RLS atlanır, her kural iki yerde yaşar |
| D. Sihirli bağlantı oturumu (`switch-account` kalıbı) | Admin API ile gerçek oturum üretmek | Sır gerekmez | Yavaş, Auth hız sınırlarına takılır, kullanıcı e-postasına bağlı; API trafiği için uygun değil |

**Öneri:** A veya B — ikisinden hangisinin bu projede çalıştığını gösteren **küçük bir deneme** ile seçilir (canlı Supabase'e erişim gerekir; sandbox'tan yapılamaz).

## 4. Uçlar (ilk dilim)

| Uç | Kapsam | Not |
|---|---|---|
| `GET /v1/me` | read | Kim olduğum, anahtarın kapsamı/bitişi |
| `GET /v1/me/prompts` | read | Kendi promptlarım (özel/taslak dahil), sayfalı |
| `GET /v1/me/saved` | read | Kaydettiklerim |
| `POST /v1/me/prompts` | write | Mevcut `import_prompts` kuralları: hep özel taslak, yazar/durum/sayaç dosyadan alınmaz, ≤30/istek, hız sınırı |
| MCP (kimlikli) | read/write | Aynı `server.ts`'e `list_my_prompts`, `save_prompt_draft` araçları; anonim adres değişmez |

Her yazma çağrısı mevcut tetikleyicilerden geçer (askı, `enforce_can_post`, `_rate_limit`) — yeni kural yazılmaz.

## 5. Sınırlar ve gözlem

- Hız sınırı **anahtar başına** (öneri: read 120/dk, write 30/dk) + var olan kullanıcı başına `_rate_limit`'ler; sayaç veritabanında (`302-*` kalıbı, bellek içi çalışmadı).
- `last_used_at` ve kullanım sayısı Ayarlar'da görünür; Yaratıcı paneli "API / MCP kullanımı" kutusu (`304-*`) kimlikli kullanımı ayrı satır olarak ekler.
- Yeni anahtar oluşturulunca ve ilk kullanımda `system` bildirimi (sızıntıyı fark etmek için).
- Arayüz: Ayarlar → "Geliştirici anahtarları" (oluştur: ad + kapsam + süre; listele: önek, son kullanım; iptal). Anahtar bir kez gösterilir ve "kopyaladım" demeden pencere kapanmaz.
- Hukuk: Gizlilik'e anahtar/kullanım kaydı maddesi, Koşullar'a "anahtarını paylaşma, sorumluluk sende" maddesi (danışman gözüyle).

## 6. Bilerek dışarıda

- ChatGPT / claude.ai **özel bağlayıcıları** sabit anahtar başlığı gönderemez (yalnız OAuth ya da kimliksiz; üçüncü taraf kılavuzlara göre) → o yüzey için OAuth ayrı, büyük bir iş.
- Herkese açma (`publish`), silme, yorum/beğeni gibi sosyal yazmalar, topluluk içeriği.
- Anahtarlı herkese açık "bot profili" (Ö11 ikinci seçenek: ayrı `auth.users` satırı).

## 7. Kullanıcı kararları (kod yazmadan önce)

1. **Kapsam:** yalnız okuma mı (en güvenli ilk adım), okuma + özel taslak yazma mı?
2. **Kim:** herkes mi, önce yalnız moderatör/sahip (beta) mı?
3. **Teknik yol (§3):** A/B denemesi için canlı projede küçük bir doğrulama yapmama izin var mı?
4. **OAuth** (ChatGPT/claude.ai kişisel bağlayıcı) şimdi kapsam dışı kalsın mı?
