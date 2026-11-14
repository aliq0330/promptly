/**
 * Ortak koleksiyon (docs/history/386-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar (`...collabTranslations`).
 * Koleksiyon adı, kullanıcı adı ve içerik başlığı çevrilmez.
 */
export const collabTranslations = {
  "collab.kicker": { tr: "Ortak", en: "Shared" },
  "collab.partnerOne": { tr: "1 ortak", en: "1 partner" },
  "collab.partnerMany": { tr: "{{count}} ortak", en: "{{count}} partners" },
  "collab.withPartners": { tr: "{{owner}} ve {{count}} ortak", en: "{{owner}} and {{count}} partners" },
  "collab.withPartnerOne": { tr: "{{owner}} ve 1 ortak", en: "{{owner}} and 1 partner" },
  "collab.tabsAria": { tr: "Koleksiyon bölümleri", en: "Collection sections" },
  "collab.tabItems": { tr: "İçerik", en: "Content" },
  "collab.tabPartners": { tr: "Ortaklar", en: "Partners" },
  "collab.addContent": { tr: "İçerik ekle", en: "Add content" },
  "collab.managePartners": { tr: "Ortakları yönet", en: "Manage partners" },
  "collab.leave": { tr: "Ortaklıktan ayrıl", en: "Leave collection" },
  "collab.yourRole": { tr: "Senin rolün", en: "Your role" },
  "collab.roleOwner": { tr: "Sahip", en: "Owner" },
  "collab.roleMember": { tr: "Ortak", en: "Partner" },
  "collab.you": { tr: "sen", en: "you" },

  // İçerik ekle (ContentPickerDialog'u yeniden kullanır)
  "collab.addTitle": { tr: "Koleksiyona içerik ekle", en: "Add content to the collection" },
  "collab.addHint": { tr: "Ortak koleksiyona yalnız herkese açık, yayında içerik eklenebilir.", en: "Only public, published content can be added to a shared collection." },
  "collab.addedToast": { tr: "Koleksiyona eklendi.", en: "Added to the collection." },
  "collab.addFailed": { tr: "İçerik eklenemedi. Tekrar dene.", en: "Could not add the content. Try again." },

  // Ortaklar sekmesi
  "collab.partnersTitle": { tr: "Ortak çalışanlar", en: "Partners" },
  "collab.partnersCount": { tr: "{{count}} / {{max}}", en: "{{count}} / {{max}}" },
  "collab.invite": { tr: "Davet et", en: "Invite" },
  "collab.addedItems": { tr: "{{count}} içerik ekledi", en: "Added {{count}} items" },
  "collab.addedItemsNone": { tr: "Henüz içerik eklemedi", en: "Has not added anything yet" },
  "collab.pendingTitle": { tr: "Bekleyen davetler", en: "Pending invitations" },
  "collab.pending": { tr: "Bekliyor", en: "Pending" },
  "collab.revokeInvite": { tr: "Daveti geri çek", en: "Withdraw invitation" },
  "collab.removeMember": { tr: "Ortaklıktan çıkar", en: "Remove from collection" },
  "collab.memberMenuAria": { tr: "{{name}} için işlemler", en: "Actions for {{name}}" },
  "collab.partnersLoadFailed": { tr: "Ortaklar yüklenemedi.", en: "Could not load the partners." },
  "collab.noPartnersYet": { tr: "Henüz ortak yok. Kullanıcı adıyla birini davet et.", en: "No partners yet. Invite someone by username." },
  "collab.partnersHint": { tr: "Ortaklar içerik ekler. Bir içeriği yalnız onu ekleyen kaldırabilir.", en: "Partners add content. Only the person who added an item can remove it." },

  // Davet penceresi
  "collab.inviteTitle": { tr: "Ortak davet et", en: "Invite a partner" },
  "collab.usernameLabel": { tr: "Kullanıcı adı", en: "Username" },
  "collab.usernamePlaceholder": { tr: "@kullaniciadi", en: "@username" },
  "collab.inviteHint": {
    tr: "Davet kabul edilince koleksiyon onun profilinde de görünür. Koleksiyon özelse yalnız ortaklar görür. Eklediği içerikleri yalnız o kaldırabilir.",
    en: "Once accepted, the collection also shows on their profile. If the collection is private only partners can see it. Only they can remove what they add.",
  },
  "collab.inviteSend": { tr: "Davet gönder", en: "Send invitation" },
  "collab.inviteSent": { tr: "Davet gönderildi.", en: "Invitation sent." },

  // Ortağı çıkar / ayrıl
  "collab.removeTitle": { tr: "{{name}} ortaklıktan çıkarılsın mı?", en: "Remove {{name}} from the collection?" },
  "collab.leaveTitle": { tr: "Ortaklıktan ayrılmak istiyor musun?", en: "Leave this shared collection?" },
  "collab.removeBody": {
    tr: "{{name}} bu koleksiyona {{count}} içerik ekledi. Bu içerikleri yalnız onu ekleyen kaldırabildiği için ne olacağını seç.",
    en: "{{name}} added {{count}} items to this collection. Only the person who added an item can remove it, so choose what happens to them.",
  },
  "collab.leaveBody": {
    tr: "Bu koleksiyona {{count}} içerik ekledin. Bu içeriklerin ne olacağını seç. Koleksiyon artık profilinde görünmez.",
    en: "You added {{count}} items to this collection. Choose what happens to them. The collection will no longer show on your profile.",
  },
  "collab.keepItems": { tr: "Koleksiyonda kalsınlar", en: "Keep them in the collection" },
  "collab.keepItemsHint": { tr: "İçerikler koleksiyonun sahibine geçer, sahibi isterse kaldırır.", en: "They pass to the collection's owner, who can remove them." },
  "collab.removeItemsOption": { tr: "Eklediklerini de kaldır", en: "Remove what they added too" },
  "collab.removeItemsHint": { tr: "{{count}} içerik koleksiyondan çıkar. İçerikler Kaydedilenler'de kalır.", en: "{{count}} items leave the collection. They stay in Saved." },
  "collab.removeConfirm": { tr: "Ortaklıktan çıkar", en: "Remove" },
  "collab.leaveConfirm": { tr: "Ortaklıktan ayrıl", en: "Leave" },

  // Koleksiyon formu
  "collab.sharedLabel": { tr: "Ortak çalışma", en: "Shared collection" },
  "collab.sharedHint": { tr: "Başkalarını davet edip birlikte içerik ekleyin.", en: "Invite others and add content together." },
  "collab.unshareableTitle": { tr: "{{count}} içerik ortak koleksiyonda olamaz", en: "{{count}} items cannot be in a shared collection" },
  "collab.unshareableHint": {
    tr: "Ortak koleksiyona yalnız herkese açık, yayında içerik girer; çünkü her ortak aynı içeriği okuyabilmeli. Çıkarınca içerikler Kaydedilenlerin tümü'nde kalır.",
    en: "Only public, published content can be in a shared collection so every partner can read it. Removing keeps them in All saved.",
  },
  "collab.removeItem": { tr: "Çıkar", en: "Remove" },
  "collab.reasonCommunity": { tr: "topluluk gönderisi", en: "community post" },
  "collab.reasonNotPublic": { tr: "herkese açık değil", en: "not public" },
  "collab.untitled": { tr: "Başlıksız içerik", en: "Untitled content" },
  "collab.checking": { tr: "İçerikler kontrol ediliyor…", en: "Checking the content…" },
  "collab.turnOffWarn": {
    tr: "Ortak çalışmayı kapatırsan {{count}} ortak çıkarılır. Eklediklerinin içerikleri koleksiyonda sende kalır.",
    en: "Turning sharing off removes {{count}} partners. The content they added stays in the collection with you.",
  },
  "collab.deleteWarn": { tr: "Ortakların eklediği içerikler de koleksiyondan çıkar. İçerikler ortakların Kaydedilenler'inde kalır.", en: "Content your partners added leaves the collection too. It stays in their Saved." },

  // Kaydet penceresi, raf, kart
  "collab.withOwner": { tr: "{{name}} ile", en: "With {{name}}" },
  "collab.lockedHint": { tr: "Yalnız ekleyen kaldırabilir", en: "Only the person who added it can remove it" },
  "collab.addedBy": { tr: "{{name}} ekledi", en: "Added by {{name}}" },
  "collab.privateShared": { tr: "Ortak · Özel", en: "Shared · Private" },

  // Davet şeridi (/saved)
  "collab.invitesAria": { tr: "Koleksiyon davetleri", en: "Collection invitations" },
  "collab.inviteStrip": { tr: "{{name}} seni \"{{collection}}\" koleksiyonuna ortak olarak davet etti.", en: "{{name}} invited you to be a partner in \"{{collection}}\"." },
  "collab.accept": { tr: "Kabul et", en: "Accept" },
  "collab.decline": { tr: "Reddet", en: "Decline" },
  "collab.joined": { tr: "Koleksiyona katıldın.", en: "You joined the collection." },
  "collab.respondFailed": { tr: "Davete yanıt verilemedi. Tekrar dene.", en: "Could not answer the invitation. Try again." },

  // Hakkında
  "collab.aside.partners": { tr: "Ortaklar", en: "Partners" },

  // Sunucu hata kodları (server-errors.ts)
  "error.collectionNotFound": { tr: "Koleksiyon bulunamadı.", en: "Collection not found." },
  "error.collectionSystem": { tr: "Kaydedilenlerin tümü ortak yapılamaz.", en: "All saved cannot be shared." },
  "error.collectionHasUnshareable": { tr: "Koleksiyonda ortak olamayacak içerikler var. Önce onları çıkar.", en: "The collection has content that cannot be shared. Remove it first." },
  "error.collectionNotShared": { tr: "Önce koleksiyonu ortak çalışmaya aç.", en: "Turn on sharing for the collection first." },
  "error.collectionUserNotFound": { tr: "Bu kullanıcı adıyla biri bulunamadı.", en: "No one with that username was found." },
  "error.collectionSelfInvite": { tr: "Kendini davet edemezsin.", en: "You cannot invite yourself." },
  "error.collectionAlreadyMember": { tr: "Bu kişi zaten ortak.", en: "This person is already a partner." },
  "error.collectionInviteExists": { tr: "Bu kişiye zaten bir davet gönderildi.", en: "An invitation was already sent to this person." },
  "error.collectionInviteNotFound": { tr: "Davet artık geçerli değil.", en: "This invitation is no longer valid." },
  "error.collectionMemberLimit": { tr: "Bir koleksiyonda sahibiyle birlikte en çok 10 kişi olabilir.", en: "A collection can have at most 10 people including the owner." },
  "error.collectionJoinedLimit": { tr: "En çok 50 ortak koleksiyona katılabilirsin.", en: "You can join at most 50 shared collections." },
  "error.collectionOwnerCannotLeave": { tr: "Sahip ortaklıktan ayrılamaz; koleksiyonu silebilir.", en: "The owner cannot leave; they can delete the collection." },
  "error.collectionItemNotShareable": { tr: "Ortak koleksiyona yalnız herkese açık, yayında içerik eklenebilir.", en: "Only public, published content can be added to a shared collection." },
  "error.collectionFollowMember": { tr: "Ortak olduğun koleksiyonu takip edemezsin.", en: "You cannot follow a collection you are a partner in." },

  // Bildirim cümleleri (SQL'in yazdığı Türkçe kalıpların karşılığı; notification-message.ts)
  "notifMsg.collabInvited": { tr: "Seni \"{{name}}\" koleksiyonuna ortak olarak davet etti.", en: "Invited you to be a partner in the collection \"{{name}}\"." },
  "notifMsg.collabJoined": { tr: "\"{{name}}\" koleksiyonuna ortak oldu.", en: "Became a partner in your collection \"{{name}}\"." },
  "notifMsg.collabLeft": { tr: "\"{{name}}\" koleksiyonundan ayrıldı.", en: "Left your collection \"{{name}}\"." },
  "notifMsg.collabAdded": { tr: "\"{{name}}\" koleksiyonuna içerik ekledi.", en: "Added content to the collection \"{{name}}\"." },
  "notifMsg.collabRemoved": { tr: "Seni \"{{name}}\" koleksiyonunun ortaklığından çıkardı.", en: "Removed you from the collection \"{{name}}\"." },
  "notifMsg.collabOff": { tr: "\"{{name}}\" koleksiyonunda ortak çalışma kapatıldı.", en: "Sharing was turned off for the collection \"{{name}}\"." },
  "notifMsg.collabDeleted": { tr: "\"{{name}}\" koleksiyonu sahibi tarafından silindi.", en: "The collection \"{{name}}\" was deleted by its owner." },
} as const;
