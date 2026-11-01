# 317 — Promptly'nin KENDİ OAuth sunucusu (316'nın yerini alır)

> **Durum:** canlıda (2026-11-01): migration CI ile uygulandı, Edge Function `oauth` v1 + `mcp` v6 yüklendi, sunucu tarafı canlıda uçtan uca denendi. **claude.ai/ChatGPT ile gerçek bağlantı denenmedi.**

## Neden
316'da Supabase'in OAuth 2.1 sunucusunu bağladık ve çalıştı (onay sayfası açıldı, kod üretildi). Ama iki sorun çıktı:
1. Verdiği belirteç **hesabın TAMAMI adına çalışan oturum JWT'sidir** (RLS kullanıcınınkiyle aynı). Dinamik istemci kaydı (DCR) açılmadan claude.ai/ChatGPT'de sıradan bir kullanıcı bağlanamaz (bağlayıcı elle client ID/secret ister, secret herkese dağıtılamaz); DCR açılırsa kullanıcıdan izin alan HER istemci tüm hesaba erişir.
2. claude.ai belirteç uç noktasına `client_secret_post` ile geliyordu (günlükte: `client is registered for 'client_secret_basic' but 'client_secret_post' was used`) — elle kayıtlı istemcide ek ayar gerekti.

Çözüm: **kendi yetkilendirme sunucumuz**. Verdiği belirteç `pmt_` kişisel anahtarıdır (314): yalnız `read` (+ kullanıcı işaretlerse `write` = özel taslak), 1 saatlik ömür, iptal edilebilir. Bu yüzden DCR güvenle açık: kötü niyetli bir istemci en kötü ihtimalle kullanıcının promptlarını okuyabilir / özel taslak ekleyebilir.

## Mimari
- **Veritabanı** `20261102130000_oauth_server.sql` (yalnız ekleyici): `oauth_clients`, `oauth_requests` (bekleyen yetki isteği), `oauth_codes` (tek kullanımlık kod), `oauth_grants` (izin + yenileme belirteci özeti), `api_tokens.grant_id`.
  Hepsine istemci DOKUNAMAZ (RLS açık, yetkiler kapalı). Mantık SQL'dedir: `_oauth_register_client`, `_oauth_start_request`, `_oauth_exchange_code`, `_oauth_refresh`, `_oauth_revoke` (yalnız sahip rol = Edge Function'ın doğrudan Postgres bağlantısı) ve oturumlu kullanıcının dört RPC'si: `oauth_request_info`, `oauth_decide`, `list_my_oauth_grants`, `revoke_my_oauth_grant`.
  `create_api_token` / `list_my_api_tokens` OAuth belirteçlerini "elle oluşturduğum anahtarlar" listesinden ve 10 anahtar sınırından ayırır (`grant_id is null`).
- **Edge Function `oauth`** (`supabase/functions/oauth`, `verify_jwt` kapalı): ince HTTP katmanı (`src/lib/public-api/oauth.ts`, bağımlılıksız; kopyası `_shared/promptly/`): `/.well-known/oauth-authorization-server` (+ `openid-configuration`), `/register` (RFC 7591), `/authorize`, `/token`, `/revoke` (RFC 7009).
  `mcp` işlevi `/mcp/oauth-protected-resource`'ta `authorization_servers` olarak artık BU sunucuyu gösterir (Supabase `/auth/v1` değil).
- **Site** `/oauth/connect/?request=…` (`features/oauth/connect-view.tsx`): giriş şart; uygulama adı + dönüş alan adı + güven uyarısı + ne yapabilir/yapamaz; **yazma izni varsayılan KAPALI** (kutu işaretlenirse `write`). Ayarlar → Bağlı uygulamalar kendi izinlerini (kapsam + son kullanım) listeler ve iki adımda geri aldırır; eski (Supabase OAuth) izinler "hesabın tamamı" etiketiyle ayrıca görünür ve geri alınabilir.
- Belirteç `pmt_` biçiminde olduğu için kişisel uçlar (`/v1/me*`, `/mcp/me`) DEĞİŞMEDİ: aynı `_api_token_authenticate` yolu, aynı RLS/askı/hız sınırı. Kimlik yolu hâlâ tek.

## Güvenlik kararları
- Yalnız KAMUYA AÇIK istemci (secret yok), **PKCE `S256` zorunlu**; `redirect_uri` kayıtlıyla BİREBİR (geçersizse kullanıcı hiçbir yere yönlendirilmez, düz hata sayfası). Kayıtta yalnız `https` ya da `localhost`/`127.0.0.1`/`[::1]` http, en çok 5 adres, kullanıcı bilgisi (`user@`), parça (`#`) ve boşluk yok.
- Kod: 5 dk, tek kullanımlık, yalnız SHA-256 özeti saklanır; ikinci kez gösterilirse ondan doğan izin İPTAL edilir. Her doğrulama hatası kodu yakar. İstek (authorize→onay) 10 dk, tek kullanımlık.
- Yenileme belirteci her kullanımda DÖNER; eski belirteç 30 sn tolerans dışında yeniden gösterilirse (çalınma işareti) bütün izin iptal edilir. Erişim belirteci 1 saat; her yenilemede eski satır silinir (satır birikmez).
- Aynı kişi + aynı uygulama için tek etkin izin (yenisi eskisini kapatır). İptal/süresi dolan izinler 30 gün sonra silinir (Gizlilik metninde yazılı).
- Kullanıcı bağlanınca bildirim alır ("Yeni bir uygulama hesabına bağlandı: …. Sen yapmadıysan Ayarlar'dan hemen kaldır.") — sızıntıyı fark etmek için.
- Hız sınırı: IP başına genel dakikada 120, **kayıt saatte 10** (mevcut veritabanı sayaçlı sınırlayıcı, `RATE_LIMIT_SECRET`); kayıt tablosu 20 000'le sınırlı, hiç yetkilendirilmemiş kayıtlar 7 gün sonra silinir; bekleyen istek 50 000'le sınırlı.
- Bilinen sınır (her DCR'li OAuth'ta var): kötü niyetli bir istemci, kullanıcıyı kandırıp izin aldırabilir (kimlik avı). Önlem: ekran uygulama adını "doğrulanmamış" diye işaretler ve dönüş ALAN ADINI ayrıca gösterir; izin sınırlı ve geri alınabilir; bağlanınca bildirim gelir.
- Supabase'in kendi OAuth sunucusu artık KULLANILMIYOR. Açık kalması gereksiz yüzey: panelde **kapatılması** önerilir (eski `/oauth/consent` sayfası ve `verifyJwt` yolu kodda durur; kapatınca zararsız).

## Test
SQL `oauth-server.sql` 41/41 (yetkiler, kayıt doğrulamaları, PKCE, kod yeniden kullanımı, yenileme döndürme + yeniden kullanım tespiti, başka istemci, iptal, bildirim, süpürme); `api-tokens.sql` 35/35 ve `api-me.sql` 17/17 değişmedi.
Birim `oauth.test.ts` 16 (yönlendirme, metadata, kayıt, authorize hataları, token, hız sınırı), `oauth-connect.test.ts` 5, bildirim +1. UI `run-oauth-connect.mjs` 15/15, `run-oauth.mjs` 12/12, `run-developers.mjs` 15/15 (ağ taklitli).
**İngilizce karşılıkları eklendi.** Gizlilik metni (TR+EN) güncellendi; `TERMS_VERSION` artırılmadı; hukuki danışman onayı YOK.

## Canlı (2026-11-01)
- Migration `20261102130000` dağıtım hattıyla uygulandı (4 tablo, 13 fonksiyon). `oauth` v1 ve `mcp` v6 Supabase MCP aracıyla esbuild paketi olarak yüklendi (`./scripts/deploy-functions.sh oauth` yolu ÇALIŞTIRILMADI).
- Canlıda uçtan uca (curl + demo hesap; onay adımı `oauth_decide`'ı kullanıcı gibi SQL'den çağırarak): keşif (`/.well-known/oauth-authorization-server` + `openid-configuration`), kayıt (http dönüş adresi 400; `client_secret_post` isteyen istemciye de `none` döner), yetki (kayıtsız dönüş adresinde 400 sayfa + yönlendirme YOK; PKCE yoksa hata yönlendirmesi; geçerliyse site onay sayfasına 302),
  yanlış doğrulayıcı kodu yakar, doğru değişim `read write` belirteci verir, belirteçle `GET /v1/me`, `POST /v1/me/prompts` (özel taslak), `/mcp/me` 8 araç, yenileme (eski erişim belirteci 401, yenisi 200), `/revoke` sonrası erişim 401 ve yenileme `invalid_grant`. Açık `/mcp` hâlâ 4 araç; `/mcp/me` anahtarsız 401 + `WWW-Authenticate`; `/mcp/oauth-protected-resource` artık `authorization_servers: [<proje>/functions/v1/oauth]`.
- Deneme kalıntısı silindi (istemci → izin/belirteç/kod/istek cascade, taslak, bildirim): `oauth_*` tabloları 0 satır.
- **Denenmedi:** gerçek claude.ai/ChatGPT akışı (istemcinin DCR + keşif sırası, `resource` parametresi, belirteç yenilemesi); site onay sayfasının canlı Supabase'e karşı tarayıcıda açılması (yalnız ağ taklitli testle sınandı); 30 sn'lik yenileme toleransının canlı zamanlaması (SQL testinde var); `RATE_LIMIT_SECRET` ile gerçek 429 (kayıt sınırı canlıda aşılıp denenmedi).
- Not: RFC 8414 yol eklemeli keşif adresi (`/.well-known/oauth-authorization-server/functions/v1/oauth`) Supabase'in işlev yönlendirmesinde sunulamaz; istemci düşme sırasında `…/oauth/.well-known/oauth-authorization-server` ya da `openid-configuration` adresini bulmalı. Bulamazsa claude.ai'da bağlantı keşifte kalır — belirti: kayıt isteği hiç gelmez (oauth işlevinin günlüğünde görülür).
- CI notu: PR #418'de `ui` işi 16/17 (`run-search-notifications`, hangi senaryo günlükten çıkmadı) ile düştü, yerelde 3/3 17/17; `database`/`checks`/`mcp` yeşil. PR merge'ünde `ui` bitmemişti (kullanıcı açık talimatla merge ettirdi).
