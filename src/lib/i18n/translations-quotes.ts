/**
 * Alıntıla modülünün TR/EN metinleri (docs/history/217-*). `translations.ts` bu nesneyi açar (`...quoteTranslations`), böylece
 * `TranslationKey` tipi ve `t()` bu anahtarları da tanır. Kullanıcı içeriği (not, başlık, kullanıcı adı) çevrilmez.
 */
export const quoteTranslations = {
  // ---- Hata iletileri (`create_quote`) ----
  "quotes.error.notAuthenticated": { tr: "Alıntılamak için giriş yapmalısın.", en: "You need to sign in to quote." },
  "quotes.error.forbidden": { tr: "Şu an alıntı yapamazsın.", en: "You can't quote right now." },
  "quotes.error.invalidContent": { tr: "Bu içerik alıntılanamaz.", en: "This can't be quoted." },
  "quotes.error.invalidNote": { tr: "Not en fazla 500 karakter olabilir.", en: "The note can be at most 500 characters." },
  "quotes.error.notFound": { tr: "İçerik bulunamadı ya da artık herkese açık değil.", en: "The content wasn't found or is no longer public." },
  "quotes.error.notPublic": { tr: "Yalnız yayında ve herkese açık içerik alıntılanabilir.", en: "Only published, public content can be quoted." },
  "quotes.error.blocked": { tr: "Bu içeriği alıntılayamazsın.", en: "You can't quote this content." },
  "quotes.error.alreadyQuoted": { tr: "Bu içeriği son 24 saatte zaten alıntıladın.", en: "You already quoted this in the last 24 hours." },
  "quotes.error.rateLimit": { tr: "Bugün çok fazla alıntı yaptın; biraz sonra tekrar dene.", en: "You've quoted a lot today; try again a little later." },

  // ---- Kart ----
  "quotes.badge": { tr: "Alıntı", en: "Quote" },
  "quotes.card.quoted": { tr: "alıntıladı", en: "quoted" },
  "quotes.card.menu": { tr: "Alıntı menüsü", en: "Quote menu" },
  "quotes.card.open": { tr: "Alıntıyı aç", en: "Open quote" },
  "quotes.card.contentGone": { tr: "Alıntılanan içerik artık görünmüyor.", en: "The quoted content is no longer visible." },
  "quotes.count": { tr: "{{count}} kez alıntılandı", en: "Quoted {{count}} times" },

  // ---- Etkileşim ----
  "quotes.engage.likesAria": { tr: "Alıntıyı beğen ({{count}})", en: "Like the quote ({{count}})" },
  "quotes.engage.commentsAria": { tr: "Alıntının yorumları ({{count}})", en: "Comments on the quote ({{count}})" },
  "quotes.engage.comments": { tr: "Yorumlar", en: "Comments" },
  "quotes.engage.sectionAria": { tr: "Alıntı etkileşimi", en: "Quote engagement" },

  // ---- Menü ve silme ----
  "quotes.menu.delete": { tr: "Alıntıyı sil", en: "Delete quote" },
  "quotes.delete.title": { tr: "Alıntı silinsin mi?", en: "Delete this quote?" },
  "quotes.delete.body": { tr: "Alıntı, beğenileri ve yorumlarıyla birlikte kalkar. Alıntıladığın içerik silinmez.", en: "The quote goes away with its likes and comments. The content you quoted isn't deleted." },
  "quotes.delete.confirm": { tr: "Sil", en: "Delete" },
  "quotes.report.title": { tr: "Alıntıyı şikâyet et", en: "Report this quote" },
  "quotes.page.scopeHelp": { tr: "Aşağıdaki içerik alıntılanan içeriğin kendisidir; beğeni, yorum ve paylaşım bu alıntıya aittir.", en: "The content below is the quoted content itself; likes, comments and shares belong to this quote." },
  "quotes.delete.done": { tr: "Alıntı silindi.", en: "Quote deleted." },

  // ---- Alıntıla bölümü (Paylaş penceresi) ----
  "quotes.section.title": { tr: "Alıntıla", en: "Quote" },
  "quotes.section.hint": { tr: "Notunla birlikte akışta ve topluluklarda paylaş", en: "Share it with your note in the feed and in communities" },
  "quotes.section.destinations": { tr: "Nerede görünsün?", en: "Where should it appear?" },
  "quotes.section.feed": { tr: "Akışta", en: "In the feed" },
  "quotes.section.feedHint": { tr: "Ana Sayfa, Keşfet, arama ve profilindeki \"Alıntılar\"da", en: "On Home, Discover, search and your profile's \"Quotes\"" },
  "quotes.section.communities": { tr: "Topluluklarda", en: "In communities" },
  "quotes.section.notePlaceholder": { tr: "Bir not ekle… (isteğe bağlı)", en: "Add a note… (optional)" },
  "quotes.section.noteLabel": { tr: "Alıntı notu", en: "Quote note" },
  "quotes.section.submit": { tr: "Alıntıla", en: "Quote" },
  "quotes.section.noDestination": { tr: "En az bir yer seç.", en: "Pick at least one place." },
  "quotes.section.feedDone": { tr: "Akışta alıntılandı.", en: "Quoted in the feed." },
  "quotes.section.openQuote": { tr: "Alıntıyı aç", en: "Open the quote" },
  "quotes.section.dailyHint": { tr: "Aynı içeriği günde bir kez alıntılayabilirsin.", en: "You can quote the same content once a day." },

  // ---- Alıntı sayfası ----
  "quotes.page.back": { tr: "Geri", en: "Back" },
  "quotes.page.titleFor": { tr: "{{name}} alıntıladı", en: "{{name}} quoted" },
  "quotes.page.openOriginal": { tr: "Orijinal içeriği aç", en: "Open the original" },
  "quotes.page.commentsTitle": { tr: "Alıntının yorumları", en: "Comments on the quote" },
  "quotes.page.commentsHelp": { tr: "Beğeni ve yorumlar bu alıntıya aittir; alıntılanan içeriğin sayaçlarını etkilemez.", en: "Likes and comments belong to this quote; they don't change the quoted content's counts." },
  "quotes.page.notFoundTitle": { tr: "Alıntı bulunamadı", en: "Quote not found" },
  "quotes.page.notFoundBody": { tr: "Alıntı silinmiş, alıntılanan içerik gizlenmiş ya da bu alıntıyı görme iznin yok.", en: "The quote was deleted, the quoted content is hidden, or you can't see this quote." },
  "quotes.page.loadError": { tr: "Alıntı yüklenemedi.", en: "The quote couldn't be loaded." },
  "quotes.page.toHome": { tr: "Ana Sayfa'ya git", en: "Go to Home" },

  // ---- Profil / Keşfet / arama ----
  "quotes.profile.tab": { tr: "Alıntılar", en: "Quotes" },
  "quotes.profile.emptyOwn": { tr: "Henüz alıntı yapmadın. Bir içeriğin Paylaş menüsünden alıntılayabilirsin.", en: "You haven't quoted anything yet. Use the Share menu of any post to quote it." },
  "quotes.profile.emptyOther": { tr: "Henüz alıntı yok.", en: "No quotes yet." },
  "quotes.profile.loadError": { tr: "Alıntılar yüklenemedi.", en: "Quotes couldn't be loaded." },
  "quotes.profile.more": { tr: "Daha fazla göster", en: "Show more" },
  "quotes.discover.section": { tr: "Alıntılar", en: "Quotes" },
  "quotes.discover.empty": { tr: "Henüz alıntı yok.", en: "No quotes yet." },
  "quotes.search.title": { tr: "Alıntılar", en: "Quotes" },

  // ---- Moderasyon ----
  "moderation.type.quote": { tr: "Alıntı", en: "Quote" },
  "moderation.type.space": { tr: "Space", en: "Space" },

  // ---- Bildirim (sunucu cümlelerinin İngilizce karşılıkları, `notification-message.ts`) ----
  "notifMsg.quotedContent": { tr: "İçeriğini alıntıladı: \"{{preview}}\"", en: "Quoted your post: \"{{preview}}\"" },
  "notifMsg.likedQuote": { tr: "Alıntını beğendi: \"{{preview}}\"", en: "Liked your quote: \"{{preview}}\"" },
  "notifMsg.commentedQuote": { tr: "Alıntına yorum yaptı: \"{{preview}}\"", en: "Commented on your quote: \"{{preview}}\"" },
} as const;
