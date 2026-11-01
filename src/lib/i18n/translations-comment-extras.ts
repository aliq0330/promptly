/**
 * Yorumda fotoğraf · GIF · içerik eki ve mesajda GIF (docs/history/308-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar
 * (`...commentExtrasTranslations`). Kullanıcı içeriği, GIF başlıkları ve marka adı (GIPHY) çevrilmez.
 */
export const commentExtrasTranslations = {
  // --- Yorum yazma çubuğu ---
  "commentExtras.addPhoto": { tr: "Fotoğraf ekle", en: "Add a photo" },
  "commentExtras.addGif": { tr: "GIF ekle", en: "Add a GIF" },
  "commentExtras.addContent": { tr: "İçerik ekle", en: "Attach content" },
  "commentExtras.removePhoto": { tr: "Fotoğrafı kaldır", en: "Remove photo" },
  "commentExtras.removeGif": { tr: "GIF'i kaldır", en: "Remove GIF" },
  "commentExtras.removeContent": { tr: "İçeriği kaldır", en: "Remove content" },
  "commentExtras.hint": {
    tr: "Yoruma 1 görsel (fotoğraf ya da GIF) ve 1 içerik eklenebilir.",
    en: "You can add 1 image (a photo or a GIF) and 1 piece of content to a comment.",
  },
  "commentExtras.preparing": { tr: "Fotoğraf hazırlanıyor…", en: "Preparing the photo…" },
  "commentExtras.photoAlt": { tr: "Yoruma eklenen fotoğraf", en: "Photo attached to the comment" },
  "commentExtras.gifAlt": { tr: "Yoruma eklenen GIF", en: "GIF attached to the comment" },
  "commentExtras.mediaFailed": { tr: "Görsel yüklenemedi", en: "Couldn't load the image" },
  "commentExtras.attachmentLoading": { tr: "İçerik yükleniyor", en: "Loading content" },
  "commentExtras.attachmentFailed": { tr: "İçerik yüklenemedi.", en: "Couldn't load this content." },
  "commentExtras.attachmentOpen": { tr: "{{type}}: {{title}} — aç", en: "{{type}}: {{title}} — open" },
  "commentExtras.stepCount": { tr: "{{count}} adım", en: "{{count}} steps" },

  // --- İçerik seçici ---
  "commentExtras.picker.title": { tr: "İçerik ekle", en: "Attach content" },
  "commentExtras.picker.mine": { tr: "Benimkiler", en: "Mine" },
  "commentExtras.picker.saved": { tr: "Kaydettiklerim", en: "Saved" },
  "commentExtras.picker.sourceAria": { tr: "İçerik kaynağı", en: "Content source" },
  "commentExtras.picker.help": {
    tr: "Yorumu okuyan herkes görebilsin diye yalnızca herkese açık içerikler eklenebilir.",
    en: "Only public content can be attached, so everyone who reads the comment can see it.",
  },
  "commentExtras.picker.savedEmpty": {
    tr: "Bu türde kaydettiğin herkese açık içerik yok.",
    en: "You haven't saved any public content of this type.",
  },
  "commentExtras.picker.add": { tr: "Ekle", en: "Attach" },
  "commentExtras.picker.pickOne": { tr: "Bir içerik seç", en: "Pick an item" },

  // --- GIF seçici (GIPHY) ---
  "gif.title": { tr: "GIF ekle", en: "Add a GIF" },
  "gif.search": { tr: "GIF ara", en: "Search GIFs" },
  "gif.clearSearch": { tr: "Aramayı temizle", en: "Clear search" },
  "gif.topicsAria": { tr: "GIF konuları", en: "GIF topics" },
  "gif.topic.trend": { tr: "Trend", en: "Trending" },
  "gif.topic.clap": { tr: "Alkış", en: "Applause" },
  "gif.topic.wow": { tr: "Vay canına", en: "Wow" },
  "gif.topic.thanks": { tr: "Teşekkürler", en: "Thanks" },
  "gif.topic.lol": { tr: "Güldüm", en: "LOL" },
  "gif.topic.love": { tr: "Kalp", en: "Love" },
  "gif.empty": { tr: "Bu aramaya uygun GIF bulunamadı.", en: "No GIFs matched this search." },
  "gif.loadFailed": { tr: "GIF'ler yüklenemedi.", en: "Couldn't load GIFs." },
  "gif.rateLimited": {
    tr: "GIF servisi şu an yoğun. Biraz sonra tekrar dene.",
    en: "The GIF service is busy right now. Try again in a moment.",
  },
  "gif.notConfigured": {
    tr: "GIF servisi bu sitede henüz yapılandırılmadı.",
    en: "The GIF service isn't set up on this site yet.",
  },
  // Kaynak ibaresi `gif.poweredBy` rozetidir (GIPHY şartı); bu satır yalnız kullanım ipucudur.
  "gif.attribution": { tr: "Birine dokununca eklenir.", en: "Tap one to add it." },
  "gif.poweredBy": { tr: "Powered by GIPHY", en: "Powered by GIPHY" }, // resmî işaretin erişilebilir adı (marka, çevrilmez)
  "gif.pickAria": { tr: "GIF seç: {{title}}", en: "Pick GIF: {{title}}" },
  "gif.untitled": { tr: "GIF", en: "GIF" },
  "gif.badge": { tr: "GIF", en: "GIF" },

  // --- Mesajlaşma ---
  "messages.attach.gif": { tr: "GIF", en: "GIF" },
  "messages.attach.gifHint": { tr: "GIPHY'de ara ve gönder", en: "Search GIPHY and send" },
  "messages.sentAGifPreview": { tr: "Bir GIF gönderdi.", en: "Sent a GIF." },
  "messages.aGif": { tr: "Bir GIF", en: "A GIF" },
  "chat.pin.gif": { tr: "GIF", en: "GIF" },
  "notifMsg.previewGif": { tr: "bir GIF gönderdi", en: "sent a GIF" },
  "messages.gifSendFailed": { tr: "GIF gönderilemedi.", en: "Couldn't send the GIF." },

  // --- Hatalar ve bildirimler ---
  "error.attachmentNotPublic": {
    tr: "Bu içerik artık herkese açık değil, yoruma eklenemez.",
    en: "This content isn't public anymore, so it can't be attached to a comment.",
  },
  "notifMsg.commentedWorkflowNone": { tr: "Workflow'una yorum yaptı.", en: "Commented on your workflow." },
  "notifMsg.commentedPresetNone": { tr: "Hazır ayarına yorum yaptı.", en: "Commented on your preset." },
  "notifMsg.commentedResultNone": { tr: "Sonucuna yorum yaptı.", en: "Commented on your result." },
  "notifMsg.commentedQuoteNone": { tr: "Alıntına yorum yaptı.", en: "Commented on your quote." },
  "notifMsg.mentionedCommentNone": { tr: "Seni bir yorumda andı.", en: "Mentioned you in a comment." },
} as const;
