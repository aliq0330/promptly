/**
 * Gönderi ⋮ menüsü, profilde sabitleme ve Paylaş penceresinin yeni eylemleri (docs/history/480-*) — TR/EN metinleri.
 * `translations.ts` bu nesneyi açar (`...postMenuTranslations`). Satır kararları `lib/post-menu.ts`'tedir; buradaki cümleler yalnız gösterimdir.
 */
export const postMenuTranslations = {
  "postMenu.stats": { tr: "İstatistik görüntüle", en: "View statistics" },
  "postMenu.addToCollection": { tr: "Koleksiyona ekle", en: "Add to collection" },
  "postMenu.pin": { tr: "Profilde sabitle", en: "Pin to profile" },
  "postMenu.unpin": { tr: "Sabitlemeyi kaldır", en: "Unpin from profile" },
  "postMenu.pinned": { tr: "Profilde sabit", en: "Pinned to profile" },
  "postMenu.pinDone": { tr: "Profilinde sabitlendi", en: "Pinned to your profile" },
  "postMenu.unpinDone": { tr: "Sabitleme kaldırıldı", en: "Unpinned from your profile" },
  "postMenu.pinFailed": { tr: "Sabitlenemedi. Tekrar dene.", en: "Couldn't pin this. Please try again." },
  "postMenu.follow": { tr: "Takip et", en: "Follow" },
  "postMenu.unfollow": { tr: "Takipten çık", en: "Unfollow" },
  "postMenu.notifyPause": { tr: "Bildirimleri duraklat", en: "Pause notifications" },
  "postMenu.notifyResume": { tr: "Bildirimleri sürdür", en: "Resume notifications" },
  "postMenu.notifyPaused": { tr: "Bu gönderinin bildirimleri duraklatıldı", en: "Notifications for this post are paused" },
  "postMenu.notifyResumed": { tr: "Bu gönderinin bildirimleri sürdürüldü", en: "Notifications for this post are back on" },
  "postMenu.mute": { tr: "Sessize al", en: "Mute" },
  "postMenu.unmute": { tr: "Sesi aç", en: "Unmute" },
  "postMenu.block": { tr: "Engelle", en: "Block" },
  "postMenu.unblock": { tr: "Engeli kaldır", en: "Unblock" },
  "postMenu.blockTitle": { tr: "{{name}} engellensin mi?", en: "Block {{name}}?" },
  "postMenu.blockBody": {
    tr: "Bu kişi seni takip edemez, içeriklerini göremez ve seninle etkileşime giremez. İstediğin zaman engeli kaldırabilirsin.",
    en: "They won't be able to follow you, see your posts or interact with you. You can unblock them any time.",
  },
  "postMenu.report": { tr: "Şikayet et", en: "Report" },
  "error.profilePinLimit": {
    tr: "Profilinde en çok 3 gönderi sabitleyebilirsin. Önce birinin sabitini kaldır.",
    en: "You can pin up to 3 posts to your profile. Unpin one first.",
  },
  "share.action.copyLink": { tr: "Bağlantıyı kopyala", en: "Copy link" },
  "share.action.system": { tr: "Diğer uygulamalar", en: "Other apps" },
  "share.action.export": { tr: "Dışa aktar", en: "Export" },
} as const;
