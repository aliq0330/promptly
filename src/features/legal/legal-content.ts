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
export const TERMS_VERSION = "2026-11-01";
export const TERMS_EFFECTIVE_AT = "2026-11-01T07:00:00Z";

// İki belge ayrı güncellenir: birinin değişmesi diğerinin tarihini oynatmaz.
const PRIVACY_UPDATED: Bilingual = { tr: "Son güncelleme: 1 Kasım 2026", en: "Last updated: November 1, 2026" };
const TERMS_UPDATED: Bilingual = { tr: "Son güncelleme: 1 Kasım 2026", en: "Last updated: November 1, 2026" };

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
            "Profilin ve içeriklerin: biyografi, avatar, ilgi alanları, paylaştığın promptlar, istekler, workflow'lar, hazır ayarlar, yorumlar, beğeniler, kaydettiklerin, koleksiyonların, takip ettiklerin, engellediklerin ve yaptığın şikâyetler.",
            "Mesajların: gönderdiğin ve aldığın doğrudan mesajlar ve fotoğraflar. Yalnızca konuşmanın tarafları görebilir.",
            "Yüklediğin dosyalar: görsel, ses ve video dosyaları.",
            "Tercihlerin: tema, palet ve dil seçimin. Bunlar hesabında ve tarayıcında saklanır.",
          ],
          [
            "Your account details: your email address, your password (stored only in encrypted form), your username and your display name. If you sign in with Google, we receive your name and email address from Google; we do not import your profile picture automatically.",
            "Your profile and content: bio, avatar, interests, the prompts, requests, workflows and presets you share, comments, likes, saves, collections, the people you follow or block, and the reports you file.",
            "Your messages: the direct messages and photos you send and receive. Only the people in the conversation can see them.",
            "Files you upload: image, audio and video files.",
            "Your preferences: theme, palette and language. These are stored in your account and in your browser.",
          ],
        ),
        p(
          "Reklam göstermiyoruz, reklam veya davranış takibi için üçüncü taraf çerezleri ya da analitik araçları kullanmıyoruz.",
          "We do not show ads, and we do not use third-party cookies or analytics tools for advertising or behavioural tracking.",
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
            "Studio: kendi yapay zekâ servisinin API anahtarını sen girersin. Anahtar sunucularımıza veya veritabanımıza kaydedilmez; yalnızca tarayıcının belleğinde (açıkça izin verirsen tarayıcında) tutulur. İstekler tarayıcından doğrudan seçtiğin servise gider ve o servisin kendi gizlilik koşulları geçerlidir.",
          ],
          [
            "Supabase: database, authentication and file storage. The servers are in Europe (Ireland).",
            "Google: only for authentication if you choose \"Continue with Google\".",
            "GitHub Pages: serves the site itself. GitHub may keep standard connection logs, such as visitors' IP addresses.",
            "Google Gemini: when you use the feature that extracts a prompt from an image, the image you pick is sent to Google's Gemini service through our server function for analysis. We do not keep the image for this purpose.",
            "Public API and MCP (promptly-mcp): they only read public content through Supabase. These requests ask for no account information and we do not link them to an account; however, Supabase may keep standard connection logs, such as IP addresses. To limit excessive use, API and MCP requests keep a one-way digest derived from the IP address for at most one hour. To show a prompt's author how many times it was used through the API or MCP (as a total only) and to count the same person once per prompt per day, a digest of the same kind is kept for at most one day; the total does not say who used it. The IP address itself is not stored for these purposes.",
            "Studio: you enter the API key of your own AI service. The key is not saved on our servers or in our database; it is kept only in your browser's memory (or in your browser, if you explicitly allow it). Requests go from your browser directly to the service you choose, and that service's own privacy terms apply.",
          ],
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
          "Paylaştığın içeriklerin (promptlar, istekler, workflow'lar, hazır ayarlar, yorumlar, görseller, ses ve video) sahibi sen kalırsın. İçeriğini yayınladığında bize, onu Promptly'de barındırmak, göstermek ve seçtiğin görünürlüğe göre diğer kullanıcılarla paylaşmak için gerekli, dünya çapında ve ücretsiz bir kullanım izni vermiş olursun. Bu izin içeriğini silmenle veya hesabını kapatmanla sona erer; başkalarının zaten yaptığı yanıtlar ve alıntılar bundan etkilenmez.",
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
          "Bir prompt'u Promptly dışında yeniden yayınlarsan (başka bir site, depo, koleksiyon, kitap, ürün vb.) yazarının adını ve Promptly bağlantısını göstermelisin. Dışa aktarma, API ve MCP çıktıları bu atıfı (\"@kullanıcı · Promptly\" ve bağlantı) kendiliğinden taşır; onu silme veya değiştirme. Başkasının prompt'unu kendi eserinmiş gibi gösterme.",
          "If you republish a prompt outside Promptly (another site, repository, collection, book, product, etc.) you must show its author's name and the Promptly link. Exports and the output of the API and MCP carry this credit (\"@username · Promptly\" and a link) automatically; do not remove or change it. Do not present someone else's prompt as your own work.",
        ),
        p("Şunlar için ayrıca izin gerekir:", "You need separate permission to:"),
        ul(
          [
            "Başkasının yüklediği görsel, ses ve video dosyalarını (prompt çıktılarını) sahibinin izni olmadan indirip yeniden yayınlamak. Yukarıdaki izin yalnızca prompt metni ve açıklaması içindir.",
            "Özel, taslak ya da yalnızca bir topluluğun üyelerine açık içerikleri Promptly dışına çıkarmak.",
          ],
          [
            "Download and republish images, audio and video files (prompt outputs) uploaded by someone else without the owner's permission. The permission above covers only the prompt text and description.",
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
