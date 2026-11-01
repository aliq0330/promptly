# 314 — Kişisel API anahtarları: veri modeli + Ayarlar arayüzü (313'ün 2. ve 3. adımı)

> **Durum:** repoda; migration `20261102110000_api_tokens.sql` canlıya UYGULANMADI (deploy hattı merge'de uygular). Anahtarla çağrılabilen uçlar
> (`/v1/me*`, kimlikli MCP) **henüz YOK** (313 §9 adım 4); bu yüzden ekranda "Önizleme" notu var — anahtar oluşturulur/iptal edilir ama şimdilik hiçbir uç onu kabul etmez.

## Veritabanı (`supabase/migrations/20261102110000_api_tokens.sql`)
- `api_tokens` (kullanıcı, ad, `token_hash` SHA-256, `prefix`, `scopes` read/write, `kind`, süre/son kullanım/iptal). RLS açık, **istemciye hiçbir yetki yok**.
- Ham anahtar `pmt_` + 32 bayt base64url (47 karakter), yalnız `create_api_token` yanıtında BİR kez döner; özet saklanır (Space bağlantı jetonu kalıbı).
- RPC'ler (SECURITY DEFINER, kimlik `auth.uid()`): `create_api_token(ad, kapsamlar, gün)` · `list_my_api_tokens()` (özet/ham anahtar dönmez) · `revoke_api_token(id)` (yalnız kendi anahtarın; başkasınınsa `false`, varlığı sızmaz).
- Kurallar: ad 1–60, kapsam `read`/`write`, süre 30/90/365 gün ya da süresiz (varsayılan 90); en çok 10 ETKİN anahtar (`token_limit`); saatte 20 oluşturma (`_rate_limit`); askı engeller, `write` kapsamı ayrıca paylaşım engelini denetler (`_assert_can_act`);
  oluşturunca kişiye `system` bildirimi (sızıntıyı fark etmek için; metin sabit kalıp, `notifMsg.apiTokenCreated`); 180 günden eski iptal/süresi dolmuş satırlar yeni oluştururken temizlenir; hesap silinince `on delete cascade`.
- `_api_token_authenticate(token)`: **hiçbir istemci rolüne açık değil**; yalnız Edge Function'ın doğrudan Postgres bağlantısı (sahip rol) çağırır. Geçersiz/iptal/süresi dolmuş/askıdaki hesap → satır yok; `last_used_at` dakikada en çok bir kez yazılır.
  Çağıran sonucu alıp işlem içinde `set local role authenticated` + `request.jwt.claims` kurar (313 §3 yol B; canlıda Edge'den denendi) — RLS/askı/hız sınırı tetikleyicileri aynen çalışır.
- Test: `supabase/tests/api-tokens.sql` 35/35 (biçim, özet saklama, anon kapalı, başkasının anahtarı, sınırlar, hız sınırı, askı, paylaşım engeli, süre/iptal, `last_used_at` kısma, hesap silme).
- Duman testi (`scripts/smoke-test.mjs`): `list_my_api_tokens` (yumuşak), `api_tokens` tablosu ve `_api_token_authenticate` ziyaretçiye KAPALI olmalı (tersine denetim).

## Arayüz
- Ayarlar → yeni "Geliştirici" grubu (yan menüde de) → `ApiKeysSection` (`features/settings/api-keys-section.tsx`): oluştur (ad, erişim = Yalnızca okuma / Okuma + özel taslak yazma, süre), **tek seferlik gösterim** (kopyala; "Anahtarı kaydettim" deyince bellekten ve sayfadan silinir), liste (durum etkin/süresi doldu/iptal, kapsam, önek, oluşturma/bitiş/son kullanım), **iki adımlı iptal**, sınır ve hata durumları.
- Saf yardımcılar `lib/api-tokens.ts` (+test 5), veri katmanı `lib/supabase/api-tokens.ts` (yalnız RPC), sunucu kodları `server-errors.ts` (`token_limit`, `invalid_name`, `invalid_scope`, `invalid_expiry` → satır içi, toast yok).
- Çeviri: `lib/i18n/translations-api-keys.ts` (TR+EN, **İngilizce karşılıkları eklendi**); bildirim kalıbı `notification-message.ts` (+test).
- Gizlilik: "API anahtarların" maddesi (yalnız özet saklanır, hesapla silinir); Koşullar: "Otomatik erişim" bölümüne anahtar sorumluluğu paragrafı. **Hukuki danışmandan geçmedi; `TERMS_VERSION` ARTIRILMADI** (bandı çıkarmak sahibinin kararı).
- Test: `tests/messaging-ui/run-api-keys.mjs` 11/11 (ağ taklitli; gerçek Supabase'e/cihaza karşı DENENMEDİ).

## Bilerek yapılmayanlar / sıradaki
- Anahtarı kabul eden uçlar, kimlikli MCP, anahtar başına hız sınırı, `/developers` sayfası güncellemesi (313 §9 adım 4); OAuth (adım 5).
- Anahtar başına istek sayısı tutulmuyor (yalnız `last_used_at`).
- Moderatörün başkasının anahtarını iptal etmesi / listelemesi yok (askıdaki hesabın anahtarı zaten doğrulanmaz).
