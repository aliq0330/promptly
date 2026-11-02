/**
 * Bağlantı ekranları (docs/history/319-*): "Yapay zekâ aracına bağla" rehberi (Ayarlar → Geliştirici ve /developers), /developers bölümleri ve sabit
 * bölüm şeridi, OAuth onay ekranının yeni satırları, Bağlı uygulamalar kartı — TR/EN metinleri. `translations.ts` bu nesneyi açar.
 * "Claude", "ChatGPT", "MCP", "OAuth", anahtar önekleri (`pmt_`), `Authorization`, "Client ID", "Secret" gibi teknik/marka adlar çevrilmez.
 */
export const connectGuideTranslations = {
  // --- Rehber: yol seçimi ve adım kartı ---
  "guide.pick": { tr: "Önce yolu seç", en: "First, pick a route" },
  "guide.method.oauth.title": { tr: "İzin vererek bağlan", en: "Connect by granting access" },
  "guide.method.oauth.badge": { tr: "Deneysel", en: "Experimental" },
  "guide.method.oauth.desc": { tr: "Anahtar yok, tek onay.", en: "No key, one approval." },
  "guide.method.key.title": { tr: "Anahtarla bağlan", en: "Connect with a key" },
  "guide.method.key.desc": { tr: "Her araçta çalışır. Bir anahtar kopyalarsın.", en: "Works in every tool. You copy one key." },
  "guide.stepOf": { tr: "Adım {{n}} / {{total}}", en: "Step {{n}} / {{total}}" },
  "guide.back": { tr: "Geri", en: "Back" },
  "guide.next": { tr: "Sonraki adım", en: "Next step" },
  "guide.restart": { tr: "Baştan göster", en: "Show again" },
  "guide.allSteps": { tr: "Tüm adımlar", en: "All steps" },
  "guide.keysLink": { tr: "Anahtarlarım'a git", en: "Go to My keys" },
  "guide.address": { tr: "Kişisel bağlayıcı adresi", en: "Personal connector address" },
  "guide.oauth.done": {
    tr: "Bitti. Araç artık promptlarını okuyabilir. İzni istediğin an «Bağlı uygulamalar»dan geri alırsın.",
    en: "Done. The tool can now read your prompts. You can take the permission back any time in “Connected apps”.",
  },
  "guide.key.done": {
    tr: "Bitti. Anahtarı kimseyle paylaşma; sızdığını düşünürsen «Anahtarlarım»dan hemen iptal et.",
    en: "Done. Don't share the key with anyone; if you think it leaked, revoke it right away in “My keys”.",
  },
  // --- Rehber: ekranda ne göreceksin (aracın bağlayıcı formu, örnek) ---
  "guide.sketch.label": { tr: "Ekranda şuna benzer bir form görürsün (araca göre değişir)", en: "You'll see a form like this (it varies by tool)" },
  "guide.sketch.title": { tr: "Özel bağlayıcı ekle", en: "Add custom connector" },
  "guide.sketch.name": { tr: "Ad", en: "Name" },
  "guide.sketch.url": { tr: "Uzak MCP sunucusu adresi", en: "Remote MCP server address" },
  "guide.sketch.paste": { tr: "buraya yapıştır…", en: "paste here…" },
  "guide.sketch.onlyThis": { tr: "Sadece bu kutu", en: "Only this box" },
  "guide.sketch.advanced": { tr: "Client ID · Secret (gelişmiş)", en: "Client ID · Secret (advanced)" },
  "guide.sketch.empty": { tr: "boş bırak", en: "leave empty" },
  // --- Rehber: ortak adım ---
  "guide.connector.title": { tr: "Bağlayıcı ekleme ekranına git", en: "Go to the add-connector screen" },
  "guide.connector.body": {
    tr: "Claude'da: Ayarlar → Bağlayıcılar → Özel bağlayıcı ekle. Diğer araçlarda adlar farklı olabilir.",
    en: "In Claude: Settings → Connectors → Add custom connector. Names differ in other tools.",
  },
  // --- Rehber: izin vererek ---
  "guide.oauth.open.title": { tr: "Uygulamanı aç", en: "Open your AI app" },
  "guide.oauth.open.body": {
    tr: "Claude ya da ChatGPT. Telefondaysan uygulamayı, bilgisayardaysan web sitesini aç.",
    en: "Claude or ChatGPT. On a phone open the app, on a computer open the website.",
  },
  "guide.oauth.address.title": { tr: "Adresi yapıştır", en: "Paste the address" },
  "guide.oauth.address.body": {
    tr: "Aşağıdaki adresi kopyala, formdaki adres kutusuna yapıştır. Kimlik doğrulamada «Şimdi oturum aç» + «Otomatik olarak kaydet» seçili kalsın; «Client ID» ve «Secret» boş.",
    en: "Copy the address below and paste it into the address box. Keep “Sign in now” + “Register automatically” selected; leave “Client ID” and “Secret” empty.",
  },
  "guide.oauth.connect.title": { tr: "Bağlan'a bas", en: "Press Connect" },
  "guide.oauth.connect.body": {
    tr: "Promptly açılır. Giriş yapmadıysan önce giriş yaparsın, sonra izin ekranına dönersin.",
    en: "Promptly opens. If you're not signed in you sign in first, then land on the permission screen.",
  },
  "guide.oauth.allow.title": { tr: "İzin ver'e bas", en: "Press Allow" },
  "guide.oauth.allow.body": {
    tr: "Açılan izin ekranında neye izin verdiğini oku. İstersen taslak ekleme/düzenleme iznini de aç, sonra «İzin ver»e bas.",
    en: "Read what you're allowing on the permission screen. Optionally turn on the add/edit drafts permission, then press “Allow”.",
  },
  // --- Rehber: anahtarla ---
  "guide.key.create.title": { tr: "Anahtar oluştur", en: "Create a key" },
  "guide.key.create.body": {
    tr: "«Anahtarlarım» bölümünde «Anahtar oluştur»a bas; adına «Claude» yaz. Yalnızca okuma yeter.",
    en: "In the “My keys” section press “Create key” and name it “Claude”. Read-only is enough.",
  },
  "guide.key.copy.title": { tr: "Anahtarı kopyala", en: "Copy the key" },
  "guide.key.copy.body": {
    tr: "pmt_ ile başlar ve yalnızca BİR kez görünür. Kapatırsan yenisini oluşturursun.",
    en: "It starts with pmt_ and is shown only ONCE. If you close it, you create a new one.",
  },
  "guide.key.address.title": { tr: "Adresi yapıştır", en: "Paste the address" },
  "guide.key.address.body": { tr: "Formdaki adres kutusuna şunu yapıştır:", en: "Paste this into the address box of the form:" },
  "guide.key.noauth.title": { tr: "«Oturum açma yok» seç", en: "Choose “No sign-in”" },
  "guide.key.noauth.body": { tr: "Kimlik doğrulama bölümünde.", en: "In the authentication section." },
  "guide.key.header.title": { tr: "Bir başlık ekle", en: "Add a header" },
  "guide.key.header.body": { tr: "İstek başlıklarına yeni bir başlık ekle. Ad kutusuna şunu yaz:", en: "Add a new request header. In the name box type:" },
  "guide.key.value.title": { tr: "Değeri yaz", en: "Type the value" },
  "guide.key.add.title": { tr: "Ekle'ye bas", en: "Press Add" },
  // --- /developers: bölümler ve "Başlangıç" ---
  "devSec.eyebrow": { tr: "Bölüm {{n}} / {{total}}", en: "Section {{n}} / {{total}}" },
  "devSec.start": { tr: "Başlangıç", en: "Start" },
  "devSec.mcp": { tr: "Claude'a bağla", en: "Connect to Claude" },
  "devSec.account": { tr: "Hesabınla bağla", en: "Connect your account" },
  "devSec.api": { tr: "HTTP API", en: "HTTP API" },
  "devSec.editors": { tr: "Kod editörleri", en: "Code editors" },
  "devSec.rules": { tr: "Bilmen gerekenler", en: "Good to know" },
  "devStart.title": { tr: "Hangi yolu seçmeliyim?", en: "Which route should I pick?" },
  "devStart.read.title": { tr: "Hesapsız oku", en: "Read without an account" },
  "devStart.read.desc": { tr: "Herkese açık promptlar. Anahtar ve giriş yok.", en: "Public prompts. No key, no sign-in." },
  "devStart.account.title": { tr: "Kendi hesabınla", en: "With your own account" },
  "devStart.account.desc": { tr: "Kendi promptların ve kaydettiklerin. İzin ver ya da anahtar kullan.", en: "Your own prompts and saved items. Grant access or use a key." },
  "devStart.code.title": { tr: "Kod yazıyorum", en: "I'm writing code" },
  "devStart.code.desc": { tr: "HTTP API ile ara, getir, doldur.", en: "Search, fetch and fill with the HTTP API." },
  "devAccount.title": { tr: "Hesabınla bağla", en: "Connect your account" },
  "devAccount.lead": {
    tr: "Kendi promptlarını (özel taslaklar dahil) bir yapay zekâ aracında kullanmak ya da hesabında özel taslak eklemek/düzenlemek için hesabını bağla. Önce yolu seç; sonra adım adım gideriz.",
    en: "Connect your account to use your own prompts (private drafts included) in an AI tool, or to add and edit private drafts in your account. Pick a route first; then we go step by step.",
  },
  "devAccount.codeTitle": { tr: "Kodla kullan (kişisel anahtar)", en: "Use from code (personal key)" },
  // --- /developers: sabit bölüm şeridi ---
  "devNav.label": { tr: "Sayfa bölümleri", en: "Page sections" },
  "devNav.prev": { tr: "Önceki bölüm", en: "Previous section" },
  "devNav.next": { tr: "Sonraki bölüm", en: "Next section" },
  "devNav.list": { tr: "Bölüm listesi", en: "Section list" },
  "devNav.position": { tr: "{{n}} / {{total}}", en: "{{n}} / {{total}}" },
  // --- OAuth onay ekranı (docs/history/319-*) ---
  "connect.rowRead": { tr: "Okuyabilir", en: "Can read" },
  "connect.rowNever": { tr: "Asla yapamaz", en: "Can never" },
  // --- Bağlı uygulamalar kartı ---
  "apps.connected": { tr: "Bağlı", en: "Connected" },
} as const;
