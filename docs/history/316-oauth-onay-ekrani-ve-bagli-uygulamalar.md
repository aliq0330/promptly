# 316 — OAuth: onay ekranı + bağlı uygulamalar (313'ün 5. adımı)

> **Durum:** repoda. **Canlıda ÇALIŞMASI için senin Supabase panelinde yapacağın adımlar var (aşağıda); özellik beta ve bu projede açılabildiği DOĞRULANMADI.**
> OAuth sunucusu kapalıyken hiçbir şey bozulmaz: onay sayfası "istek açılamadı" der, Ayarlar'daki "Bağlı uygulamalar" bölümü hiç görünmez, kişisel MCP anahtarla çalışmaya devam eder.

## Ne yapıldı
- **Onay ekranı** `/oauth/consent?authorization_id=…` (`features/oauth/consent-view.tsx`, saf yardımcılar `lib/oauth-consent.ts`): giriş şart (`RequireAuth`, `?next=` istek kimliğini korur);
  `supabase.auth.oauth.getAuthorizationDetails` → uygulamanın adı, sitesi, **dönüş adresinin alan adı**, istenen kapsamlar, açık bir güven uyarısı → **İzin ver / Reddet**
  (`approveAuthorization` / `denyAuthorization`, `skipBrowserRedirect`; dönüş adresi yalnız https/yerel ise izlenir). Daha önce izin verilmişse doğrudan döner.
  İstemcinin `logo_uri`'si YÜKLENMEZ (rastgele dış resim = izleme/kimlik avı).
- **Ayarlar → Geliştirici → Bağlı uygulamalar** (`settings/connected-apps-section.tsx`): `listGrants` + iki adımlı `revokeGrant` (Supabase o istemcinin oturumlarını kapatır). Liste okunamazsa (OAuth sunucusu kapalı) bölüm HİÇ çizilmez.
- **Kişisel MCP** (`…/mcp/me`, 315): kimliksiz isteğe `401` + `WWW-Authenticate: Bearer resource_metadata=".../mcp/oauth-protected-resource"`; o adres RFC 9728 korumalı kaynak metadatasını verir
  (`authorization_servers: [<proje>/auth/v1]`). OAuth belirteci Supabase Auth'a doğrulatılır (`GET /auth/v1/user`).
- Gizlilik: "Bağlı uygulamalar" maddesi (TR+EN). `TERMS_VERSION` artırılmadı. **İngilizce karşılıkları eklendi.**
- Test: `oauth-consent.test.ts` 4, `legal-content.test.ts` +1, `run-oauth.mjs` 12/12 (ağ taklitli; gerçek OAuth sunucusuna/claude.ai/ChatGPT'ye KARŞI DENENMEDİ).

## ÖNEMLİ RİSK — belirteç hesabın TAMAMI adına çalışır
Supabase OAuth sunucusunun verdiği erişim belirteci **standart bir Supabase kullanıcı belirtecidir** (`client_id` iddialı); RLS kullanıcınınkiyle aynı uygulanır. Promptly'nin kendi `/mcp/me` ucu bu belirteçle
yalnız OKUMA yapar (kapsam sunucuda zorunlu), AMA belirteci eline geçiren bir uygulama onu doğrudan Supabase REST'ine (herkese açık anon anahtarla) göndererek kullanıcının sitede yapabildiği her şeyi
yapabilir (mesaj okuma, içerik yazma…). Bu yüzden: (1) onay ekranı bunu açıkça söyler; (2) **dinamik istemci kaydını (DCR) AÇMA önerilir** — herkesin istemci kaydedip kullanıcıdan izin istemesine yol açar; yalnız güvendiğin
istemcileri (claude.ai, ChatGPT) elle kaydet; (3) kalıcı çözüm, OAuth belirteçleri için (`auth.jwt()->>'client_id'`) kısıtlayıcı RLS politikalarıdır — kapsamı büyük (çok tablo), bu turda YAPILMADI.

## Senin yapacakların (Supabase paneli)
1. **Authentication → OAuth Server**: OAuth sunucusunu aç. (Beta; bu projede kullanılabildiğini panelde göreceksin.)
2. **Authorization Path**: onay sayfası `https://aliq0330.github.io/promptly/oauth/consent`. Panel yolu Site URL'ye göre alıyorsa Site URL'nin `https://aliq0330.github.io/promptly` olduğundan emin ol, yoksa tam adresi gir. Gerçek bir yetkilendirme isteğiyle açıldığını doğrula.
3. **Dinamik kaydı kapalı tut**, istemcileri elle ekle: claude.ai dönüş adresi `https://claude.ai/api/mcp/auth_callback`, ChatGPT `https://chatgpt.com/connector_platform_oauth_redirect` (BU ADRESLER UYDURMA DEĞİL ama sürüm sürüm değişebilir — istemcinin kendi belgesinden doğrula).
4. Bağlayıcı adresi olarak `https://xqxybhjcyrvaroknucdq.supabase.co/functions/v1/mcp/me` ekle; claude.ai/ChatGPT 401'den OAuth akışını başlatır.
5. Edge Function'lar (`api`, `mcp`) deploy edilmiş olmalı (315).

## Denenmedi / bilinmeyen
Gerçek akış (claude.ai/ChatGPT → Supabase → onay ekranı → belirteç → `/mcp/me`), Supabase'in yetkilendirme yolunu nasıl çözdüğü, bazı istemcilerin `/.well-known/oauth-protected-resource` adresini kök alan adından aramaya çalışması (Supabase kökünü biz yönetmiyoruz; spesifikasyona uyan istemci `WWW-Authenticate` başlığını izler).
