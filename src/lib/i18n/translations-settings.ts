/**
 * Ayarlar ana listesi ve alt sayfaları (docs/history/318-*) + Geliştirici ayarları sayfası — TR/EN metinleri. `translations.ts` bu nesneyi açar.
 * "Claude", "ChatGPT", "MCP", "OAuth", anahtar önekleri (`pmt_`) ve başlık adı `Authorization` gibi teknik/marka adlar çevrilmez.
 */
export const settingsTranslations = {
  // --- Ana liste (kategori satırlarının kısa açıklamaları + alt sayfa açıklamaları) ---
  "settings.hub.accountDesc": { tr: "Kullanıcı adı, e-posta ve şifre.", en: "Username, email and password." },
  "settings.hub.privacyDesc": { tr: "Sana kimin mesaj atabileceği ve engellediğin kişiler.", en: "Who can message you, and the people you've blocked." },
  "settings.hub.preferencesDesc": { tr: "Görünüm, dil ve tanıtım turu.", en: "Appearance, language and the welcome tour." },
  "settings.hub.developerDesc": {
    tr: "Promptly'yi Claude, ChatGPT gibi araçlarla ya da kendi kodunla kullanmak için anahtarlar ve bağlantılar.",
    en: "Keys and connections to use Promptly with tools like Claude and ChatGPT, or from your own code.",
  },
  "settings.hub.legalDesc": { tr: "Kullanım Koşulları ve Gizlilik Politikası.", en: "Terms of Use and Privacy Policy." },
  "settings.hub.dangerDesc": { tr: "Geri alınamayan işlemler.", en: "Actions that can't be undone." },
  "settings.hub.moderationDesc": { tr: "Şikâyetler, kullanıcılar ve site istatistikleri.", en: "Reports, users and site statistics." },
  // --- Geliştirici ayarları ---
  "devSettings.connectTitle": { tr: "Yapay zekâ aracına bağla", en: "Connect an AI tool" },
  "devSettings.connectLead": {
    tr: "Claude gibi bir araca kendi Promptly hesabını bağla: araç promptlarını (özel taslaklar dahil) ve kaydettiklerini okuyabilir, istersen hesabına özel taslak ekleyebilir. Yayınlayamaz, silemez.",
    en: "Connect your own Promptly account to a tool like Claude: it can read your prompts (private drafts included) and what you saved, and — if you allow — add private drafts. It can't publish or delete.",
  },
  "devSettings.methodKey": { tr: "Anahtarla (önerilen)", en: "With a key (recommended)" },
  "devSettings.methodKeyLead": { tr: "Çalıştığı doğrulanmış yol. Anahtarı bağlayıcı formuna bir başlık olarak yapıştırırsın.", en: "The route that is verified to work. You paste the key into the connector form as a header." },
  "devSettings.step1": { tr: "Aşağıdaki «Anahtarlarım» bölümünde bir anahtar oluştur ve kopyala (yalnızca okuma yeterli).", en: "Create a key in “My keys” below and copy it (read-only is enough)." },
  "devSettings.step2": { tr: "Claude'da: Ayarlar → Bağlayıcılar → Özel bağlayıcı ekle. Diğer araçlarda adım adları farklı olabilir.", en: "In Claude: Settings → Connectors → Add custom connector. Step names differ in other tools." },
  "devSettings.step3": { tr: "Adres olarak şunu yapıştır:", en: "Paste this as the address:" },
  "devSettings.step4": { tr: "Kimlik doğrulama bölümünde «Oturum açma yok» seç.", en: "In the authentication section choose “No sign-in”." },
  "devSettings.step5": { tr: "İstek başlıklarına bir başlık ekle. Ad:", en: "Add a request header. Name:" },
  "devSettings.step5Value": { tr: "Değer: «Bearer», bir boşluk, sonra anahtarın:", en: "Value: “Bearer”, a space, then your key:" },
  "devSettings.step5Warn": { tr: "«Bearer» kelimesini ve ardındaki boşluğu unutma; yoksa bağlantı kurulmaz.", en: "Don't forget the word “Bearer” and the space after it, or the connection won't work." },
  "devSettings.step6": { tr: "Ekle'ye bas. Bağlanınca kişisel araçlar (ör. list_my_prompts) görünür.", en: "Press Add. Once connected, your personal tools (e.g. list_my_prompts) appear." },
  "devSettings.secretNote": { tr: "Anahtarı sohbete ya da herkese açık bir yere yazma; yalnızca bağlayıcı formuna yapıştır. Sızdığını düşünürsen aşağıdan hemen iptal et.", en: "Never type the key into a chat or anywhere public; paste it only into the connector form. If you think it leaked, revoke it below right away." },
  "devSettings.methodOauth": { tr: "Hesabınla giriş (OAuth) — deneysel", en: "Sign in with your account (OAuth) — experimental" },
  "devSettings.methodOauthBody": {
    tr: "Anahtar girmeden «Şimdi oturum aç» + «Otomatik olarak kaydet» ile bağlanmayı deneyebilirsin; onay sayfasında neye izin verdiğini görürsün. Bazı araçlarda henüz çalışmıyor: takılırsa yukarıdaki anahtar yolunu kullan.",
    en: "You can try connecting without a key using “Sign in now” + “Register automatically”; the consent page shows what you allow. It doesn't work in some tools yet: if it gets stuck, use the key route above.",
  },
  "devSettings.moreTools": { tr: "Claude Code, Cursor ve diğer araçlar için hazır komutlar Geliştirici belgelerinde.", en: "Ready-made commands for Claude Code, Cursor and other tools are in the Developer docs." },
  "devSettings.keysTitle": { tr: "Anahtarlarım", en: "My keys" },
  "devSettings.docsTitle": { tr: "Geliştirici belgeleri", en: "Developer docs" },
  "devSettings.docsHint": { tr: "API örnekleri, MCP adresleri ve tüm araçlar için kurulum.", en: "API examples, MCP addresses and setup for every tool." },
} as const;
