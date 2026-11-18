/**
 * Ayarlar ana listesi ve alt sayfaları (docs/history/318-*) + Geliştirici ayarları sayfası — TR/EN metinleri. `translations.ts` bu nesneyi açar.
 * "Claude", "ChatGPT", "MCP", "OAuth", anahtar önekleri (`pmt_`) ve başlık adı `Authorization` gibi teknik/marka adlar çevrilmez.
 */
export const settingsTranslations = {
  // --- Ana liste (kategori satırlarının kısa açıklamaları + alt sayfa açıklamaları) ---
  "settings.hub.accountDesc": { tr: "Kullanıcı adı, e-posta ve şifre.", en: "Username, email and password." },
  "settings.hub.privacyDesc": { tr: "Sana kimin mesaj atabileceği, çevrimiçi durumunu kimlerin göreceği ve engellediğin kişiler.", en: "Who can message you, who can see your online status, and the people you've blocked." },
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
    tr: "Claude gibi bir araca kendi Promptly hesabını bağla: araç promptlarını (özel taslaklar dahil) ve kaydettiklerini okuyabilir, istersen özel taslak ekleyip düzenleyebilir. Yayınlayamaz, silemez.",
    en: "Connect your own Promptly account to a tool like Claude: it can read your prompts (private drafts included) and what you saved, and — if you allow — add and edit private drafts. It can't publish or delete.",
  },
  "devSettings.step5Value": { tr: "Değer: «Bearer», bir boşluk, sonra anahtarın:", en: "Value: “Bearer”, a space, then your key:" },
  "devSettings.step5Warn": { tr: "«Bearer» kelimesini ve ardındaki boşluğu unutma; yoksa bağlantı kurulmaz.", en: "Don't forget the word “Bearer” and the space after it, or the connection won't work." },
  "devSettings.step6": { tr: "Ekle'ye bas. Bağlanınca kişisel araçlar (ör. list_my_prompts) görünür.", en: "Press Add. Once connected, your personal tools (e.g. list_my_prompts) appear." },
  "devSettings.secretNote": { tr: "Anahtarı sohbete ya da herkese açık bir yere yazma; yalnızca bağlayıcı formuna yapıştır. Sızdığını düşünürsen aşağıdan hemen iptal et.", en: "Never type the key into a chat or anywhere public; paste it only into the connector form. If you think it leaked, revoke it below right away." },
  "devSettings.moreTools": { tr: "Claude Code, Cursor ve diğer araçlar için hazır komutlar Geliştirici belgelerinde.", en: "Ready-made commands for Claude Code, Cursor and other tools are in the Developer docs." },
  "devSettings.keysTitle": { tr: "Anahtarlarım", en: "My keys" },
  // --- Chrome uzantısı kartı (docs/history/429-*) ---
  "devSettings.extTitle": { tr: "Chrome uzantısı", en: "Chrome extension" },
  "devSettings.extLead": {
    tr: "Web'de gördüğün promptları tek dokunuşla taslağa kaydet, kütüphaneni yazdığın her yerde kullan. Henüz Chrome Web Store'da yok; aşağıdaki adımlarla elle yüklenir.",
    en: "Save prompts you find on the web as drafts in one tap, and use your library wherever you type. It isn't on the Chrome Web Store yet; install it by hand with the steps below.",
  },
  "devSettings.extVersion": { tr: "Sürüm {{version}} · Chrome 127 veya üstü", en: "Version {{version}} · Chrome 127 or later" },
  "devSettings.extDownload": { tr: "Uzantıyı indir (.zip)", en: "Download the extension (.zip)" },
  "devSettings.extInstallTitle": { tr: "Yükleme", en: "Install" },
  "devSettings.extStep1": { tr: "Zip dosyasını bir klasöre aç. Çıkan promptly-extension klasörünü silme ya da taşıma: Chrome uzantıyı bu klasörden çalıştırır.", en: "Unzip the file into a folder. Don't delete or move the promptly-extension folder it creates: Chrome runs the extension from it." },
  "devSettings.extStep2": { tr: "Chrome'da şu adresi aç (Chrome sayfalarına bağlantı verilemez; kopyalayıp adres çubuğuna yapıştır):", en: "In Chrome, open this address (Chrome pages can't be linked; copy it into the address bar):" },
  "devSettings.extStep3": { tr: "Sağ üstteki Geliştirici modu'nu aç.", en: "Turn on Developer mode in the top right." },
  "devSettings.extStep4": { tr: "Paketlenmemiş öğe yükle'ye bas ve promptly-extension klasörünü seç.", en: "Click Load unpacked and choose the promptly-extension folder." },
  "devSettings.extStep5": { tr: "Araç çubuğundaki yapboz simgesinden Promptly'yi sabitle, simgeye tıkla ve Promptly ile bağlan'a bas. Açılan izin ekranında \"yazma\" iznini açık bırak; yoksa taslak kaydedemez.", en: "Pin Promptly from the puzzle icon in the toolbar, click it, and press Connect with Promptly. Leave the \"write\" permission on in the page that opens, or it can't save drafts." },
  "devSettings.extUpdate": { tr: "Güncelleme: yeni zip'i aynı klasörün üstüne aç, chrome://extensions'ta uzantının yenile düğmesine bas.", en: "Updating: unzip the new file over the same folder, then press the extension's reload button on chrome://extensions." },
  "devSettings.extUseTitle": { tr: "Nasıl kullanılır", en: "How to use it" },
  "devSettings.extUseSave": { tr: "Kaydet: bir sayfada metin seç, sağ tıkla → Promptly'ye kaydet (ya da Alt+Shift+S). Açılan kartta başlık, tür, araç ve etiketi seç; başka yerden aldıysan kaynak otomatik yazılır. Gönderilmeden önce birkaç saniye Geri al seçeneği kalır.", en: "Save: select text on a page, right-click → Save to Promptly (or Alt+Shift+S). Pick a title, type, tool and tags on the card; if you found it elsewhere the source is filled in. You get a few seconds to undo before it's sent." },
  "devSettings.extUseImage": { tr: "Görsel: bir görsele sağ tıkla → Prompt'a görsel olarak ekle. Yalnız herkese açık https görselleri yüklenir.", en: "Image: right-click an image → Add as image to a prompt. Only public https images are uploaded." },
  "devSettings.extUsePalette": { tr: "Palet: yazdığın yerde (ör. bir yapay zekâ sohbet sitesi) Alt+Shift+P — kütüphaneni ara, değişkenleri doldur, Enter ile metin kutusuna ekle.", en: "Palette: where you type (e.g. an AI chat site) press Alt+Shift+P — search your library, fill the variables, press Enter to insert it into the text box." },
  "devSettings.extUseSlash": { tr: "Slash: bir sitede / ile de açılsın istersen uzantı penceresinde Bu sitede / ile aç'a bas; Chrome yalnız o site için izin ister, istediğin an kapatırsın.", en: "Slash: to open it with / on a site, press Open with / on this site in the popup; Chrome asks for permission for that site only, and you can turn it off any time." },
  "devSettings.extUseLibrary": { tr: "Kütüphane: uzantı simgesine tıkla. Son kullandıkların, Benim, Kaydettiklerim, Popüler ve Keşfet; taslakların ve bekleyen yakalamalar da burada. Yan panel sayfanla yan yana açık kalır.", en: "Library: click the extension icon. Recent, Mine, Saved, Popular and Explore; your drafts and pending captures are there too. The side panel stays open beside your page." },
  "devSettings.extUseVote": { tr: "Oy ve sonuç: \"Çalıştı mı?\" oyu ve sonuç paylaşımı Promptly'nin prompt sayfasında yapılır; yan paneldeki Şimdi sekmesi son kullandığın promptun sayfasını açar.", en: "Vote and results: the \"Did it work?\" vote and result sharing happen on the prompt's Promptly page; the side panel's Now tab opens the page of the prompt you used last." },
  "devSettings.extSafetyTitle": { tr: "İzinler ve gizlilik", en: "Permissions and privacy" },
  "devSettings.extSafe1": { tr: "Şifreni uzantı görmez. Giriş Promptly'nin kendi sayfasında yapılır (Google ile kayıtlıysan da); uzantı sınırlı bir erişim anahtarı alır.", en: "The extension never sees your password. You sign in on Promptly's own page (Google accounts included); the extension receives a limited access key." },
  "devSettings.extSafe2": { tr: "Uzantı yalnız özel taslak ekler. Yayınlamaz, görünürlüğü değiştirmez, hiçbir şeyi silmez.", en: "The extension only adds private drafts. It never publishes, changes visibility or deletes anything." },
  "devSettings.extSafe3": { tr: "Hiçbir sitede kalıcı erişimi yoktur. Kart ve palet yalnız sen sağ tık ya da kısayol kullandığında o sekmeye yüklenir; / özelliğini bir site için açarsan yalnız o siteye erişir.", en: "It has no standing access to any site. The card and palette load into a tab only when you right-click or use a shortcut; if you turn / on for a site, it reaches that site only." },
  "devSettings.extSafe4": { tr: "Erişim anahtarı yalnız uzantının arka planında durur; sayfaya yüklenen kod ona ulaşamaz.", en: "The access key lives only in the extension's background; code loaded into a page can't reach it." },
  "devSettings.extSafe5": { tr: "Chrome'un gösterdiği izinler: sağ tık menüsü, yerel depolama, etkin sekme ve betik yükleme (yalnız sen tetikleyince), yan panel, giriş penceresi ve bekleyen yakalamaları yeniden deneyen dakikalık zamanlayıcı.", en: "Permissions Chrome lists: context menu, local storage, active tab and script injection (only when you trigger it), side panel, the sign-in window, and a one-minute timer that retries pending captures." },
  "devSettings.extRevoke": { tr: "İstediğin an Bağlı uygulamalar'dan erişimi iptal edebilirsin.", en: "You can revoke access any time under Connected apps." },
  "devSettings.extRevokeLink": { tr: "Bağlı uygulamalar", en: "Connected apps" },
  "devSettings.docsTitle": { tr: "Geliştirici belgeleri", en: "Developer docs" },
  "devSettings.docsHint": { tr: "API örnekleri, MCP adresleri ve tüm araçlar için kurulum.", en: "API examples, MCP addresses and setup for every tool." },
} as const;
