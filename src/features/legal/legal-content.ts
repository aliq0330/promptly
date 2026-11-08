import type { Language } from "@/lib/i18n/translations";

/** A piece of text in both site languages (these documents are static data, so they live here rather than in translations.ts). */
export type Bilingual = Record<Language, string>;

export type LegalBlock =
  | { type: "p"; text: Bilingual }
  | { type: "ul"; items: Record<Language, string[]> };

export interface LegalSection {
  title: Bilingual;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  title: Bilingual;
  updated: Bilingual;
  intro: Bilingual;
  sections: LegalSection[];
}

/** The one public contact address of both documents. */
export const LEGAL_CONTACT_EMAIL = "aliq0330@gmail.com";

/**
 * Kullanım Koşulları'nın SÜRÜMÜ ve yürürlüğe girdiği an. Koşullar önemli ölçüde değişince ikisi birlikte güncellenir: oturum açmış herkese
 * "Kullanım Koşulları güncellendi" bandı yeniden çıkar (`features/legal/terms-update-notice.tsx`, karar `lib/legal-notice.ts`).
 * Yürürlükten sonra hesap açan kişi bandı görmez (kayıt ekranında yeni metni zaten görmüştür). Yalnız yazım düzeltmesi için artırma.
 */
export const TERMS_VERSION = "2026-11-08";
export const TERMS_EFFECTIVE_AT = "2026-11-08T12:00:00Z";

// İki belge ayrı güncellenir: birinin değişmesi diğerinin tarihini oynatmaz.
const PRIVACY_UPDATED: Bilingual = { tr: "Son güncelleme: 8 Kasım 2026", en: "Last updated: November 8, 2026" };
const TERMS_UPDATED: Bilingual = { tr: "Son güncelleme: 2 Kasım 2026", en: "Last updated: November 2, 2026" };

const p = (tr: string, en: string): LegalBlock => ({ type: "p", text: { tr, en } });
const ul = (tr: string[], en: string[]): LegalBlock => ({ type: "ul", items: { tr, en } });

export const PRIVACY_POLICY: LegalDocument = {
  title: { tr: "Gizlilik Politikası", en: "Privacy Policy" },
  updated: PRIVACY_UPDATED,
  intro: {
    tr: "Promptly, yapay zekâ promptlarını paylaşabildiğin, keşfedebildiğin ve yeniden kullanabildiğin bir topluluk sitesidir. Bu sayfa hangi bilgileri topladığımızı, neden topladığımızı ve bu bilgiler üzerinde neler yapabileceğini anlatır.",
    en: "Promptly is a community site where you can share, discover and reuse AI prompts. This page explains what information we collect, why we collect it, and what you can do with it.",
  },
  sections: [
    {
      title: { tr: "Topladığımız bilgiler", en: "Information we collect" },
      blocks: [
        ul(
          [
            "Hesap bilgilerin: e-posta adresin, şifren (yalnızca şifrelenmiş olarak saklanır), kullanıcı adın ve görünen adın. Google ile giriş yaparsan Google'dan adını ve e-posta adresini alırız; profil fotoğrafını otomatik almayız.",
            "Profilin ve içeriklerin: biyografi, avatar, ilgi alanları, paylaştığın promptlar, istekler, workflow'lar, ayar paketleri, yorumlar, beğeniler, kaydettiklerin, koleksiyonların, takip ettiklerin, engellediklerin ve yaptığın şikâyetler. Bir promptu kopyaladıktan sonra verdiğin \"Çalıştı mı?\" oyu da burada sayılır: oyunun kendisi gizlidir, ama o promptta yorum ya da sonuç bıraktıysan oyun yorumunun ve sonucunun yanında rozet olarak herkese görünür.",
            "Mesajların: gönderdiğin ve aldığın doğrudan mesajlar, fotoğraflar ve GIF'ler. Yalnızca konuşmanın tarafları görebilir. GIF'lerin kendisini saklamayız; yalnızca hangi GIF olduğunu belirten GIPHY kimliğini saklarız (aşağıda \"Hizmet sağlayıcılar\" bölümündeki GIPHY maddesine bak).",
            "Yüklediğin dosyalar: görsel, ses ve video dosyaları.",
            "Tercihlerin: tema, palet ve dil seçimin. Bunlar hesabında ve tarayıcında saklanır.",
            "API anahtarların: kişisel API anahtarı oluşturursan anahtarın adını, ilk karakterlerini (listede tanıman için), erişim kapsamını ve oluşturulma, bitiş, iptal ve son kullanım zamanlarını saklarız. Anahtarın kendisini değil, yalnızca geri döndürülemeyen bir özetini tutarız; bu yüzden anahtarı sonradan gösteremeyiz. Hesabını sildiğinde anahtarların da silinir.",
            "Bağlı uygulamalar: bir uygulamaya \"Promptly hesabınla giriş\" (OAuth) izni verirsen, uygulamanın kendi bildirdiği adı ve dönüş adresini, senin onu hangi kapsamla (okuma / özel taslak ekleme ve düzenleme) ve ne zaman yetkilendirdiğini ve son kullanım zamanını veritabanımızda saklarız; belirteçlerin kendisi saklanmaz, yalnızca geri döndürülemez özetleri tutulur. İzni Ayarlar'dan istediğin zaman geri alabilirsin; geri alınan ve süresi dolan izinler 30 gün sonra silinir.",
          ],
          [
            "Your account details: your email address, your password (stored only in encrypted form), your username and your display name. If you sign in with Google, we receive your name and email address from Google; we do not import your profile picture automatically.",
            "Your profile and content: bio, avatar, interests, the prompts, requests, workflows and presets you share, comments, likes, saves, collections, the people you follow or block, and the reports you file. This also includes your \"Did it work?\" vote, which you can cast after copying a prompt: the vote itself is private, but if you leave a comment or a result on that prompt, your vote is shown next to it as a badge that everyone can see.",
            "Your messages: the direct messages, photos and GIFs you send and receive. Only the people in the conversation can see them. We do not store the GIFs themselves; we only store the GIPHY ID that says which GIF it is (see the GIPHY item under \"Service providers\" below).",
            "Files you upload: image, audio and video files.",
            "Your preferences: theme, palette and language. These are stored in your account and in your browser.",
            "Your API keys: if you create a personal API key, we store its name, its first characters (so you can recognise it in the list), its access scope, and when it was created, expires, was revoked and was last used. We do not keep the key itself, only a one-way digest of it, so we cannot show it to you again. Your keys are deleted when you delete your account.",
            "Connected apps: if you allow an app to sign in with your Promptly account (OAuth), we store in our database the name and return address the app declared, the scope you authorized (read / add and edit private drafts), when, and when it was last used; the tokens themselves are not stored, only irreversible digests. You can take the permission back in Settings at any time; revoked and expired permissions are deleted after 30 days.",
          ],
        ),
        p(
          "Reklam göstermiyoruz; reklam veya davranış takibi için analitik araçları ya da takip çerezleri kullanmıyoruz. Çerezler ve tarayıcı depolaması hakkında ayrıntı için aşağıdaki \"Çerezler ve tarayıcı depolaması\" bölümüne bak.",
          "We do not show ads, and we do not use analytics tools or tracking cookies for advertising or behavioural tracking. For details on cookies and browser storage, see the \"Cookies and browser storage\" section below.",
        ),
      ],
    },
    {
      title: { tr: "Bilgileri neden kullanıyoruz", en: "How we use information" },
      blocks: [
        ul(
          [
            "Hesabını oluşturmak, oturumunu açık tutmak ve sana giriş yaptırmak.",
            "İçeriklerini yayınlamak, görünürlük ayarına (herkese açık ya da özel) göre göstermek ve etkileşimleri (beğeni, yorum, takip, mesaj, bildirim) çalıştırmak.",
            "Kötüye kullanımı önlemek, şikâyetleri incelemek ve topluluğu güvende tutmak.",
            "Siteyi çalışır tutmak ve geliştirmek.",
          ],
          [
            "To create your account, keep you signed in and let you log in.",
            "To publish your content, show it according to its visibility (public or private) and run interactions (likes, comments, follows, messages, notifications).",
            "To prevent abuse, review reports and keep the community safe.",
            "To keep the site running and improve it.",
          ],
        ),
      ],
    },
    {
      title: { tr: "Kimler görür", en: "Who can see what" },
      blocks: [
        p(
          "Herkese açık yayınladığın içerikler ve profil bilgilerin (kullanıcı adın, görünen adın, avatarın, biyografin) siteyi ziyaret eden herkes tarafından görülebilir. Özel olarak işaretlediğin içerikler ve taslakların yalnızca sana görünür; bu içeriklerin görsel, ses ve video dosyalarına başkaları erişemez. E-posta adresin başkalarına gösterilmez. Kişisel bilgilerini satmıyoruz.",
          "Content you publish publicly and your profile details (username, display name, avatar, bio) can be seen by anyone who visits the site. Content you mark private and your drafts are visible only to you, and other people cannot access the image, audio and video files of that content. Your email address is not shown to others. We do not sell your personal information.",
        ),
      ],
    },
    {
      title: { tr: "Ekipler", en: "Teams" },
      blocks: [
        p(
          "Bir ekibe katıldığında; ekipteki rolün, katılma tarihin, davet edenin ve (konuksan) kurum adın ile erişim bitiş tarihin saklanır. Ekibin Space'leri, kütüphanesi ve kanalları yalnızca erişimi olan ekip üyelerine ve konuklara görünür; özel kanalın varlığı ve mesajları kanalda olmayan üyelere de gösterilmez. Ekip yöneticileri üyelik, rol ve erişim bilgilerini görür ve ekibin verilerini dışa aktarabilir.",
          "When you join a team we store your role in it, your join date, who invited you and, if you are a guest, your organisation name and the date your access ends. The team's Spaces, library and channels are visible only to team members and guests who have access; the existence and messages of a private channel are not shown even to members who are not in it. Team admins can see membership, role and access information and can export the team's data.",
        ),
        p(
          "Ekibin Denetim günlüğü, ekipte kimin neyi ne zaman yaptığını kaydeder (üye ekleme/çıkarma, rol ve erişim değişiklikleri, prompt onayları, politika değişiklikleri, kanal işlemleri, bir kanal mesajının bildirilmesi, dışa aktarma). Kayıtta mesaj ya da prompt metni değil, işlemin türü, hedefin adı ve gerektiğinde kısa bir ayrıntı bulunur. Günlüğü yalnızca ekip yönetimi görür; ekip silinince günlük de silinir, hesabını silersen kayıtlardaki adın kaldırılır ama işlem kaydı kalır.",
          "The team's Audit log records who did what and when in the team (adding and removing members, role and access changes, prompt approvals, policy changes, channel actions, reporting a channel message, exports). An entry holds the kind of action, the name of its target and, when needed, a short detail — not message or prompt text. Only team admins can see the log; it is deleted with the team, and if you delete your account your name is removed from entries but the record of the action stays.",
        ),
        p(
          "Ekip kütüphanesini API ya da MCP ile okuyan kişi ve anahtar için gün başına okunan prompt sayısı tutulur (hangi kişinin hangi anahtarı ya da uygulaması, hangi gün, kaç okuma); prompt metni tutulmaz. Ekip yönetimi bu özeti görür ve bir anahtarı ekip kütüphanesinden engelleyebilir. Hesabını silersen bu kullanım kayıtların da silinir. Bir kanal mesajını bildirirsen şikâyet site moderatörlerine değil yalnızca o ekibin sahip ve yöneticilerine gider.",
          "For each person and key that reads the team library through the API or MCP we keep how many prompts were read per day (which person's key or app, which day, how many reads); the prompt text is not kept. Team admins can see this summary and can block a key from the team library. If you delete your account your usage records are deleted too. If you report a channel message, the report goes only to that team's owner and admins, not to site moderators.",
        ),
      ],
    },
    {
      title: { tr: "Hizmet sağlayıcılar", en: "Service providers" },
      blocks: [
        p(
          "Siteyi çalıştırmak için şu hizmetleri kullanırız; ilgili bilgiler yalnızca bu amaçla onlarla paylaşılır:",
          "We use the following services to run the site; the relevant information is shared with them only for that purpose:",
        ),
        ul(
          [
            "Supabase: veritabanı, kimlik doğrulama ve dosya depolama. Sunucular Avrupa'dadır (İrlanda).",
            "Google: yalnızca \"Google ile devam et\" seçeneğini kullanırsan kimlik doğrulama için.",
            "GitHub Pages: sitenin kendisini yayınlar. GitHub, siteyi ziyaret edenlerin IP adresi gibi standart bağlantı kayıtlarını tutabilir.",
            "Google Gemini: bir görselden prompt çıkarma özelliğini kullandığında, seçtiğin görsel sunucu fonksiyonumuz aracılığıyla analiz için Google'ın Gemini servisine gönderilir. Görseli bu amaçla bizde saklamayız.",
            "Açık API ve MCP (promptly-mcp): yalnızca herkese açık içeriği Supabase üzerinden okur. Bu isteklerde hesap bilgisi istemeyiz ve istekleri bir hesapla ilişkilendirmeyiz; ancak Supabase, standart bağlantı kayıtlarını (ör. IP adresi) tutabilir. Aşırı kullanımı sınırlamak için API ve MCP isteklerinde IP adresinden türetilmiş, geri döndürülemeyen bir özet en çok bir saat saklanır. Bir promptun API ya da MCP ile kaç kez kullanıldığını (yazarına toplu sayı olarak göstermek için) ve aynı kişinin aynı promptu günde bir kez sayılmasını sağlamak için de aynı türde bir özet en çok bir gün saklanır; sayı kimin kullandığını içermez. IP adresinin kendisi bu amaçlarla kaydedilmez.",
            "GIPHY: yorumlara ve mesajlara GIF eklemek için GIPHY'nin servisini kullanırız. GIF seçiciyi açtığında ve GIF içeren bir yorum ya da mesaj görüntülendiğinde, tarayıcın doğrudan GIPHY'nin sunucularına (api.giphy.com ve media.giphy.com) bağlanır. GIPHY bu bağlantılarda IP adresin, tarayıcı bilgin ve (seçiciyi kullanıyorsan) yazdığın arama kelimesi gibi standart bağlantı bilgilerini alabilir; bu bilgiler Promptly üzerinden geçmez, GIPHY'nin kendi gizlilik koşullarına ve çerez uygulamalarına tabidir. Bu, GIF'i gönderen kişi için olduğu kadar GIF'i gören herkes için de geçerlidir. Arama kelimelerini sunucularımıza kaydetmeyiz; GIF'in kendisini kopyalamayız, yalnızca GIPHY kimliğini saklarız. Bir GIF'i GIPHY kaldırırsa yorumda ya da mesajda artık görünmez.",
            "Telegram botu: Telegram'da botumuzu kullanırsan Telegram, mesajlarını (komutların, aradığın kelimeler dahil), Telegram kullanıcı adını/adını, kullanıcı numaranı ve dil ayarını bizim botumuza iletir; bunlar Telegram'ın kendi gizlilik koşullarına da tabidir. Herkese açık komutlar için hesap gerekmez ve mesajlarını kaydetmeyiz; yalnızca aşırı kullanımı sınırlamak için Telegram kullanıcı numarasından türetilmiş, geri döndürülemeyen bir özet en çok bir saat saklanır. Hesabını botla bağlarsan (Ayarlar → Geliştirici → Telegram) bağlantı için Telegram kullanıcı numaranı, sohbet numaranı, kullanıcı adını/adını ve dilini hesabına bağlı olarak saklarız; bağlama kodu yalnızca özet olarak ve en çok 10 dakika saklanır. Bağlıyken botla yazdığın özel taslaklar ve düzenlemeler Telegram sunucularından geçer. İsteğe bağlı bildirimleri (varsayılan KAPALI) açarsan haftalık özet ve etkinlik bildirimleri (başkalarının yorum önizlemeleri dahil) Telegram'a gönderilir ve Telegram sunucularında durur. Bağlantıyı Ayarlar'dan ya da botta /ayril ile istediğin an kaldırırsın; botu engellersen bağlantı kendiliğinden kaldırılır. Bot yayınlama ve silme yapamaz.",
            "Studio: kendi yapay zekâ servisinin API anahtarını sen girersin. Anahtar sunucularımıza veya veritabanımıza kaydedilmez; yalnızca tarayıcının belleğinde (açıkça izin verirsen tarayıcında) tutulur. İstekler tarayıcından doğrudan seçtiğin servise gider ve o servisin kendi gizlilik koşulları geçerlidir.",
          ],
          [
            "Supabase: database, authentication and file storage. The servers are in Europe (Ireland).",
            "Google: only for authentication if you choose \"Continue with Google\".",
            "GitHub Pages: serves the site itself. GitHub may keep standard connection logs, such as visitors' IP addresses.",
            "Google Gemini: when you use the feature that extracts a prompt from an image, the image you pick is sent to Google's Gemini service through our server function for analysis. We do not keep the image for this purpose.",
            "Public API and MCP (promptly-mcp): they only read public content through Supabase. These requests ask for no account information and we do not link them to an account; however, Supabase may keep standard connection logs, such as IP addresses. To limit excessive use, API and MCP requests keep a one-way digest derived from the IP address for at most one hour. To show a prompt's author how many times it was used through the API or MCP (as a total only) and to count the same person once per prompt per day, a digest of the same kind is kept for at most one day; the total does not say who used it. The IP address itself is not stored for these purposes.",
            "GIPHY: we use GIPHY's service to let you add GIFs to comments and messages. When you open the GIF picker, and when a comment or message that contains a GIF is displayed, your browser connects directly to GIPHY's servers (api.giphy.com and media.giphy.com). In those connections GIPHY may receive standard connection information such as your IP address, your browser details and (if you use the picker) the search word you typed; this information does not pass through Promptly and is subject to GIPHY's own privacy terms and cookie practices. This applies to the person who sends a GIF as much as to everyone who views it. We do not log search words on our servers; we do not copy the GIF itself, we only store its GIPHY ID. If GIPHY removes a GIF, it no longer shows in the comment or message.",
            "Telegram bot: if you use our bot on Telegram, Telegram passes your messages (your commands, including the words you search for), your Telegram username/name, user number and language setting to our bot; these are also subject to Telegram's own privacy terms. Public commands need no account and we do not store your messages; only to limit overuse, a one-way digest derived from your Telegram user number is kept for at most an hour. If you link your account to the bot (Settings → Developer → Telegram) we store, tied to your account, your Telegram user number, chat number, username/name and language for the link; the link code is kept only as a digest for at most 10 minutes. While linked, private drafts and edits you write through the bot pass through Telegram's servers. If you turn on the optional notifications (OFF by default), the weekly summary and activity notifications (including previews of other people's comments) are sent to Telegram and remain on its servers. You can remove the link at any time in Settings or with /unlink in the bot; if you block the bot, the link is removed automatically. The bot cannot publish or delete.",
            "Studio: you enter the API key of your own AI service. The key is not saved on our servers or in our database; it is kept only in your browser's memory (or in your browser, if you explicitly allow it). Requests go from your browser directly to the service you choose, and that service's own privacy terms apply.",
          ],
        ),
      ],
    },
    {
      title: { tr: "Çerezler ve tarayıcı depolaması", en: "Cookies and browser storage" },
      blocks: [
        p(
          "Promptly kendi çerezlerini (cookie) kullanmaz. Bunun yerine tarayıcının yerel depolamasını (localStorage ve sessionStorage) kullanırız: bu bilgiler yalnızca senin tarayıcında durur ve çerezler gibi her istekle otomatik olarak sunucuya gönderilmez. Reklam veya takip için kullanılmaz. Tarayıcında şunlar saklanır:",
          "Promptly does not use cookies of its own. Instead we use your browser's local storage (localStorage and sessionStorage): this information stays in your browser and, unlike cookies, is not sent to a server automatically with every request. It is not used for advertising or tracking. The following is stored in your browser:",
        ),
        ul(
          [
            "Oturum bilgin: giriş yapmış kalman için. Çıkış yaptığında silinir.",
            "Tercihlerin: tema, palet ve dil seçimin; kart ya da ızgara görünümü, ana sayfa sekmesi ve benzeri görünüm seçimlerin.",
            "Küçük kolaylıklar: kapattığın ipuçları ve öneri kartları, son kullandığın emojiler, tercih ettiğin yapay zekâ aracı, \"Kullanım Koşulları güncellendi\" bandını gördüğün bilgisi gibi.",
            "Studio API anahtarın: yalnızca açıkça izin verirsen. Anahtar sunucularımıza gönderilmez.",
          ],
          [
            "Your session information: so that you stay signed in. It is deleted when you sign out.",
            "Your preferences: your theme, palette and language; card or grid view, the home page tab and similar display choices.",
            "Small conveniences: tips and suggestion cards you dismissed, the emojis you used recently, your preferred AI tool, whether you have seen the \"Terms of Use updated\" banner, and similar.",
            "Your Studio API key: only if you explicitly allow it. The key is not sent to our servers.",
          ],
        ),
        p(
          "Bu bilgileri tarayıcının ayarlarından \"site verilerini temizle\" diyerek istediğin zaman silebilirsin; bu durumda oturumun kapanır ve tercihlerin sıfırlanır. Kullandığımız üçüncü taraf hizmetler (örneğin \"Google ile devam et\" kullanırsan Google, GIF görüntülerken GIPHY) kendi alan adlarında kendi çerezlerini veya benzer teknolojilerini kullanabilir; bunlar Promptly'nin denetiminde değildir ve ilgili hizmetin kendi politikalarına tabidir.",
          "You can delete this information at any time by choosing \"clear site data\" in your browser settings; your session will then end and your preferences will be reset. The third-party services we use (for example Google if you use \"Continue with Google\", or GIPHY when GIFs are displayed) may use their own cookies or similar technologies on their own domains; these are not under Promptly's control and are subject to that service's own policies.",
        ),
      ],
    },
    {
      title: { tr: "Saklama ve silme", en: "Retention and deletion" },
      blocks: [
        p(
          "Bilgilerini hesabın var olduğu sürece saklarız. Ayarlar → \"Hesabımı sil\" ile hesabını istediğin zaman kalıcı olarak silebilirsin. Bu işlem profilini, içeriklerini, mesajlarını ve yüklediğin dosyaları siler. Başkalarının sana verdiği yanıtlar ve yorumlar, onların içeriği olduğu için korunur. Silinen veriler yedeklerde sınırlı bir süre daha kalabilir.",
          "We keep your information for as long as your account exists. You can permanently delete your account at any time from Settings → \"Delete my account\". This removes your profile, content, messages and uploaded files. Replies and comments other people made on your content are kept, because they are their content. Deleted data may remain in backups for a limited time.",
        ),
      ],
    },
    {
      title: { tr: "Hakların", en: "Your rights" },
      blocks: [
        p(
          "Bilgilerine erişebilir, profil ve Ayarlar sayfalarından düzeltebilir, hesabını silebilirsin. Bunların ötesinde, yürürlükteki mevzuat (ör. KVKK ve GDPR) kapsamındaki haklarını kullanmak için bize aşağıdaki adresten yazabilirsin.",
          "You can access your information, correct it from your profile and Settings pages, and delete your account. Beyond that, to exercise your rights under applicable law (for example KVKK and GDPR), you can write to us at the address below.",
        ),
      ],
    },
    {
      title: { tr: "Çocuklar", en: "Children" },
      blocks: [
        p(
          "Promptly 13 yaşın altındaki çocuklara yönelik değildir ve bilerek bu yaştaki çocuklardan bilgi toplamayız. Böyle bir hesap fark edersek sileriz.",
          "Promptly is not directed at children under 13 and we do not knowingly collect information from them. If we find such an account, we delete it.",
        ),
      ],
    },
    {
      title: { tr: "Değişiklikler", en: "Changes" },
      blocks: [
        p(
          "Bu politikayı güncelleyebiliriz. Önemli bir değişiklik olduğunda bu sayfadaki tarihi güncelleriz.",
          "We may update this policy. When there is a significant change, we update the date on this page.",
        ),
      ],
    },
  ],
};

export const TERMS_OF_USE: LegalDocument = {
  title: { tr: "Kullanım Koşulları", en: "Terms of Use" },
  updated: TERMS_UPDATED,
  intro: {
    tr: "Promptly'yi kullanarak bu koşulları kabul etmiş olursun. Lütfen dikkatle oku; kabul etmiyorsan siteyi kullanma.",
    en: "By using Promptly you agree to these terms. Please read them carefully; if you do not agree, do not use the site.",
  },
  sections: [
    {
      title: { tr: "Hesabın", en: "Your account" },
      blocks: [
        p(
          "Hesabını doğru bilgilerle oluşturmalı, şifreni ve hesabının güvenliğini korumalısın. Hesabında olan her şeyden sen sorumlusun. En az 13 yaşında olmalısın.",
          "You must create your account with accurate information and keep your password and account secure. You are responsible for everything that happens in your account. You must be at least 13 years old.",
        ),
      ],
    },
    {
      title: { tr: "Senin içeriklerin", en: "Your content" },
      blocks: [
        p(
          "Paylaştığın içeriklerin (promptlar, istekler, workflow'lar, ayar paketleri, yorumlar, görseller, ses ve video) sahibi sen kalırsın. İçeriğini yayınladığında bize, onu Promptly'de barındırmak, göstermek ve seçtiğin görünürlüğe göre diğer kullanıcılarla paylaşmak için gerekli, dünya çapında ve ücretsiz bir kullanım izni vermiş olursun. Bu izin içeriğini silmenle veya hesabını kapatmanla sona erer; başkalarının zaten yaptığı yanıtlar ve alıntılar bundan etkilenmez.",
          "You remain the owner of the content you share (prompts, requests, workflows, presets, comments, images, audio and video). When you publish content you give us a worldwide, royalty-free permission to host it on Promptly, display it, and share it with other users according to the visibility you chose. This permission ends when you delete the content or close your account; replies and quotes other people already made are not affected.",
        ),
        p(
          "Yalnızca paylaşma hakkına sahip olduğun içerikleri yüklemelisin. Başkalarının telif hakkını, gizliliğini veya diğer haklarını ihlal eden içerik paylaşma.",
          "Only upload content you have the right to share. Do not share content that infringes other people's copyright, privacy or other rights.",
        ),
      ],
    },
    {
      title: { tr: "Başkalarının içeriklerini kullanma ve atıf", en: "Using other people's content, and attribution" },
      blocks: [
        p(
          "Promptly'de herkese açık yayınlanan bir prompt'u (başlık, açıklama ve prompt metni) herkes okuyabilir, kopyalayabilir, kendi yapay zekâ üretimlerinde kullanabilir ve Promptly'nin sunduğu dışa aktarma, açık API ve MCP araçlarıyla indirebilir. Bir prompt'u herkese açık yayınlayan kişi bu kullanımlara izin vermiş olur. O prompt'larla ürettiğin çıktıları (görsel, metin, ses, video) kişisel ya da ticari amaçla kullanabilirsin; çıktılar üzerindeki haklar kullandığın yapay zekâ servisinin koşullarına tabidir.",
          "Anyone can read, copy, use in their own AI generations, and download (with Promptly's export, public API and MCP tools) a prompt that is published publicly on Promptly: its title, description and prompt text. By publishing a prompt publicly, its author allows these uses. You may use the outputs (images, text, audio, video) you generate with those prompts for personal or commercial purposes; the rights in outputs are subject to the terms of the AI service you use.",
        ),
        p(
          "Aynı izin, herkese açık yayınlanan istek, ayar paketi ve workflow'ların başlığı, açıklaması ve metin ya da parametre alanları (istekte yaratıcı yön, ayar paketinde seçili değerler, workflow'da adımların başlığı, açıklaması ve yönergesi) için de geçerlidir; bunlar da aynı araçlarla okunabilir ve indirilebilir. Bunları herkese açık yayınlayan kişi bu kullanımlara izin vermiş olur ve aynı atıf kuralı geçerlidir.",
          "The same permission applies to the title, description and text or parameter fields of requests, presets and workflows that are published publicly (a request's creative direction, a preset's selected values, a workflow's step titles, descriptions and instructions); they can be read and downloaded with the same tools. By publishing them publicly, their author allows these uses, and the same attribution rule applies.",
        ),
        p(
          "Bir prompt'u Promptly dışında yeniden yayınlarsan (başka bir site, depo, koleksiyon, kitap, ürün vb.) yazarının adını ve Promptly bağlantısını göstermelisin. Dışa aktarma, API ve MCP çıktıları bu atıfı (\"@kullanıcı · Promptly\" ve bağlantı) kendiliğinden taşır; onu silme veya değiştirme. Başkasının prompt'unu kendi eserinmiş gibi gösterme.",
          "If you republish a prompt outside Promptly (another site, repository, collection, book, product, etc.) you must show its author's name and the Promptly link. Exports and the output of the API and MCP carry this credit (\"@username · Promptly\" and a link) automatically; do not remove or change it. Do not present someone else's prompt as your own work.",
        ),
        p("Şunlar için ayrıca izin gerekir:", "You need separate permission to:"),
        ul(
          [
            "Başkasının yüklediği görsel, ses ve video dosyalarını (prompt çıktılarını) sahibinin izni olmadan indirip yeniden yayınlamak. Yukarıdaki izin yalnızca metin ve açıklama alanları içindir.",
            "Özel, taslak ya da yalnızca bir topluluğun üyelerine açık içerikleri Promptly dışına çıkarmak.",
          ],
          [
            "Download and republish images, audio and video files (prompt outputs) uploaded by someone else without the owner's permission. The permission above covers only text and description fields.",
            "Take private content, drafts, or content visible only to the members of a community out of Promptly.",
          ],
        ),
        p(
          "Başka bir kaynaktan alınıp Promptly'ye aktarılan içerikler (ör. \"Kaynak: prompts.chat (CC0)\" satırı olanlar) kendi lisanslarıyla gelir; kaynak satırı o lisansı belirtir. Kendi eserin olmayan bir içeriği yüklerken kaynağını ve lisansını belirtmelisin.",
          "Content brought into Promptly from another source (for example, items with a \"Source: prompts.chat (CC0)\" line) comes under its own licence, which the source line states. When you upload something that is not your own work, state its source and licence.",
        ),
      ],
    },
    {
      title: { tr: "Otomatik erişim (API ve MCP)", en: "Automated access (API and MCP)" },
      blocks: [
        p(
          "Promptly'nin herkese açık API'sini ve MCP paketini (promptly-mcp) kullanabilirsin; bunlar yalnızca herkese açık içeriği okur ve hesap gerektirmez. Siteyi aşırı yüklememeli ve uyguladığımız sınırları aşmaya çalışmamalısın; sınırları aşan ya da siteye zarar veren kullanımı engelleyebiliriz. Bu araçların döndürdüğü metinler kullanıcı içeriğidir: bir yapay zekâ aracına ya da otomasyona vermeden önce kontrol etmek ve sonuçlarından sorumlu olmak sana aittir.",
          "You may use Promptly's public API and MCP package (promptly-mcp); they only read public content and need no account. You must not overload the site or try to get around the limits we apply; we may block use that exceeds them or harms the site. The text these tools return is user content: checking it before you give it to an AI tool or automation, and being responsible for the results, is up to you.",
        ),
        p(
          "Kişisel bir API anahtarı oluşturursan, o anahtarla yapılan her işlem senin adına yapılmış sayılır. Anahtarını kimseyle paylaşma ve herkese açık yerlere (depo, ekran görüntüsü, paylaşılan not) koyma; sızdığını düşünürsen hemen iptal et. Anahtarla da içerik kuralları, hız sınırları ve hesap kısıtlamaları aynen geçerlidir; kötüye kullanılan ya da siteye zarar veren anahtarları iptal edebiliriz.",
          "If you create a personal API key, everything done with that key counts as done by you. Do not share your key or put it anywhere public (a repository, a screenshot, a shared note); if you think it has leaked, revoke it right away. The content rules, rate limits and account restrictions apply to actions made with a key too; we may revoke keys that are abused or that harm the site.",
        ),
      ],
    },
    {
      title: { tr: "Ekipler", en: "Teams" },
      blocks: [
        p(
          "Bir ekipte yaptığın işlemler ekibin Denetim günlüğüne kaydedilir ve ekip yönetimi tarafından görülebilir. Ekibe yazdığın promptlar, değişkenler ve mesajlar ekibin çalışma alanındadır: ekip yönetimi bunları onaylayabilir, kullanımdan kaldırabilir ya da dışa aktarabilir; ekipten çıkarılırsan içeriklerin akıbeti ekibin politikasına ve çıkarılırken yöneticinin seçtiği seçeneğe göre belirlenir (ekipte kalır, bir üyeye devredilir ya da sana kişisel kopya olarak verilir).",
          "What you do in a team is recorded in the team's Audit log and can be seen by the team's admins. The prompts, variables and messages you write to a team live in the team's workspace: admins can approve, deprecate or export them, and if you are removed from the team, what happens to your content follows the team's policy and the option the admin picks when removing you (it stays with the team, is handed to a member, or is given to you as a personal copy).",
        ),
        p(
          "Ekip kütüphanesini API ya da MCP ile okuyan bir araç, ekip yönetiminin belirlediği kurallara tabidir; yönetim erişimi kapatabilir ya da bir anahtarı engelleyebilir. Ekibe, erişimi olmayan kişilerin içeriği görmesini sağlayacak biçimde bilgi taşımamalısın.",
          "A tool that reads the team library through the API or MCP is subject to the rules the team's admins set; they can switch the access off or block a key. You must not move team information in a way that lets people who do not have access see it.",
        ),
      ],
    },
    {
      title: { tr: "Kabul edilebilir kullanım", en: "Acceptable use" },
      blocks: [
        p("Şunları yapma:", "Do not:"),
        ul(
          [
            "Yasa dışı, nefret içeren, tehdit edici, taciz eden veya başkalarına zarar vermeyi amaçlayan içerik paylaşmak.",
            "Zararlı yazılım, istenmeyen toplu mesaj (spam) veya yanıltıcı içerik yaymak.",
            "Başkasının hesabına izinsiz erişmeye, siteyi veya diğer kullanıcıları rahatsız etmeye ya da siteyi aşırı yüklemeye çalışmak.",
            "Başka biri gibi davranmak.",
          ],
          [
            "Share illegal, hateful, threatening or harassing content, or content meant to harm others.",
            "Spread malware, spam or misleading content.",
            "Try to access someone else's account without permission, disrupt the site or other users, or overload the site.",
            "Impersonate someone else.",
          ],
        ),
      ],
    },
    {
      title: { tr: "Moderasyon", en: "Moderation" },
      blocks: [
        p(
          "Kullanıcılar içerikleri şikâyet edebilir. Bu koşulları ihlal eden içerikleri kaldırabilir, hesapları geçici olarak kısıtlayabilir veya kalıcı olarak kapatabiliriz.",
          "Users can report content. We may remove content that violates these terms, temporarily restrict accounts, or close them permanently.",
        ),
      ],
    },
    {
      title: { tr: "Yapay zekâ içerikleri", en: "AI-generated content" },
      blocks: [
        p(
          "Promptly'deki promptlar ve çıktılar topluluk tarafından paylaşılır; doğruluğunu, kalitesini veya belirli bir amaca uygunluğunu garanti etmeyiz. Yapay zekâ servisleri (ör. Studio'da kendi anahtarınla kullandıkların) kendi koşullarına tabidir; onların kullanımından sen sorumlusun.",
          "Prompts and outputs on Promptly are shared by the community; we do not guarantee their accuracy, quality or fitness for a particular purpose. AI services (for example the ones you use in Studio with your own key) are subject to their own terms, and you are responsible for your use of them.",
        ),
      ],
    },
    {
      title: { tr: "Sorumluluk sınırı", en: "Disclaimer" },
      blocks: [
        p(
          "Site \"olduğu gibi\" sunulur; kesintisiz veya hatasız çalışacağını taahhüt etmeyiz. Yasaların izin verdiği ölçüde, siteyi kullanmandan doğan dolaylı zararlardan sorumlu değiliz.",
          "The site is provided \"as is\"; we do not promise it will run without interruption or errors. To the extent permitted by law, we are not liable for indirect damages arising from your use of the site.",
        ),
      ],
    },
    {
      title: { tr: "Hesabı kapatma", en: "Closing your account" },
      blocks: [
        p(
          "Hesabını istediğin zaman Ayarlar → \"Hesabımı sil\" ile kapatabilirsin. Verilerin nasıl işlendiği Gizlilik Politikası'nda anlatılır.",
          "You can close your account at any time from Settings → \"Delete my account\". How your data is handled is described in the Privacy Policy.",
        ),
      ],
    },
    {
      // docs/history/343-*: CC BY 4.0 atıf şartı. Bilgi amaçlı ek — koşulların anlamını değiştirmez, TERMS_VERSION artmadı.
      title: { tr: "Üçüncü taraf lisansları", en: "Third-party credits" },
      blocks: [
        ul(
          [
            "İkonlar: Solar Icon Set — 480 Design. Creative Commons Atıf 4.0 (CC BY 4.0, creativecommons.org/licenses/by/4.0) lisansıyla kullanılır; Promptly için bileşenlere dönüştürüldü ve bazıları canlandırıldı.",
            "Yazı tipleri: Bricolage Grotesque, DM Sans ve JetBrains Mono — SIL Open Font License 1.1.",
            "Promptly logosu, tepki emojileri ve efektleri Promptly'nindir.",
          ],
          [
            "Icons: Solar Icon Set by 480 Design, used under Creative Commons Attribution 4.0 (CC BY 4.0, creativecommons.org/licenses/by/4.0); converted into components for Promptly, some of them animated.",
            "Fonts: Bricolage Grotesque, DM Sans and JetBrains Mono, under the SIL Open Font License 1.1.",
            "The Promptly logo, reaction emoji and their effects are Promptly's own.",
          ],
        ),
      ],
    },
    {
      title: { tr: "Değişiklikler", en: "Changes" },
      blocks: [
        p(
          "Bu koşulları güncelleyebiliriz. Güncellemeden sonra siteyi kullanmaya devam etmen, yeni koşulları kabul ettiğin anlamına gelir. Önemli değişikliklerde bu sayfadaki tarihi güncelleriz.",
          "We may update these terms. Continuing to use the site after an update means you accept the new terms. For significant changes we update the date on this page.",
        ),
      ],
    },
  ],
};
