/**
 * Çevrimiçi durum, son görülme ve gizlilik (docs/history/329-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar.
 */
export const presenceTranslations = {
  "presence.online": { tr: "Çevrimiçi", en: "Online" },
  "presence.lastSeen": { tr: "Son görülme {{time}}", en: "Last seen {{time}}" },
  "presence.onlineCount": { tr: "{{count}} çevrimiçi", en: "{{count}} online" },
  "presence.activeShort": { tr: "{{count}} aktif", en: "{{count}} active" },
  "presence.activeCount": { tr: "{{count}} üye şu an aktif", en: "{{count}} members active now" },

  "presence.settingsTitle": { tr: "Çevrimiçi durumu", en: "Online status" },
  "presence.settingsHint": {
    tr: "Sitede açıkken diğer üyeler seni çevrimiçi görebilir. İstersen açık olsan bile çevrimdışı görünebilirsin.",
    en: "While the site is open, other members can see you're online. You can also appear offline even while you're here.",
  },
  "presence.mode.auto": { tr: "Otomatik", en: "Automatic" },
  "presence.mode.autoHint": { tr: "Siteyi açıkken çevrimiçi görünürsün; son görülmen güncellenir.", en: "You appear online while the site is open; your last seen is updated." },
  "presence.mode.invisible": { tr: "Görünmez", en: "Invisible" },
  "presence.mode.invisibleHint": {
    tr: "Açık olsan da çevrimdışı görünürsün. Son görülmen ne gösterilir ne güncellenir.",
    en: "You appear offline even while you're here. Your last seen is neither shown nor updated.",
  },
  "presence.audienceTitle": { tr: "Kimler görebilir?", en: "Who can see it?" },
  "presence.audienceHint": { tr: "Çevrimiçi durumunu ve son görülmeni kimler görebilir?", en: "Who can see that you're online and when you were last seen?" },
  "presence.audience.everyone": { tr: "Herkes", en: "Everyone" },
  "presence.audience.everyoneHint": { tr: "Oturum açmış tüm üyeler. Oturum açmamış ziyaretçiler hiçbir zaman göremez.", en: "Every signed-in member. Signed-out visitors never see it." },
  "presence.audience.following": { tr: "Takip ettiklerim", en: "People I follow" },
  "presence.audience.followingHint": { tr: "Yalnızca senin takip ettiğin kişiler.", en: "Only people you follow." },
  "presence.audience.mutual": { tr: "Karşılıklı takip", en: "Mutual follows" },
  "presence.audience.mutualHint": { tr: "Yalnızca birbirinizi takip ettiğiniz kişiler.", en: "Only people you follow who also follow you." },
  "presence.audience.nobody": { tr: "Hiç kimse", en: "Nobody" },
  "presence.audience.nobodyHint": { tr: "Kimse çevrimiçi durumunu ve son görülmeni göremez.", en: "No one can see that you're online or when you were last seen." },
  "presence.reciprocity": {
    tr: "Karşılıklılık: durumunu gizlersen (Görünmez ya da Hiç kimse) sen de başkalarının çevrimiçi durumunu ve son görülmesini göremezsin. Engellediğin ve seni engelleyen kişiler birbirinin durumunu hiçbir zaman görmez.",
    en: "It works both ways: if you hide your status (Invisible or Nobody), you can't see other people's online status or last seen either. You and people you've blocked, or who blocked you, never see each other's status.",
  },
  "presence.saveFailed": { tr: "Kaydedilemedi. Tekrar dene.", en: "Couldn't save. Try again." },
  "presence.saved": { tr: "Kaydedildi.", en: "Saved." },
  "presence.unavailable": { tr: "Çevrimiçi durumu şu an kullanılamıyor.", en: "Online status isn't available right now." },

  "presence.menuLabel": { tr: "Durumun", en: "Your status" },
  "presence.menuAppearOnline": { tr: "Çevrimiçi görün", en: "Appear online" },
  "presence.menuAppearOffline": { tr: "Görünmez ol", en: "Go invisible" },
  "presence.menuStateOnline": { tr: "Çevrimiçi görünüyorsun", en: "You appear online" },
  "presence.menuStateInvisible": { tr: "Görünmezsin", en: "You're invisible" },
  "presence.menuStateHidden": { tr: "Durumun kimseye görünmüyor", en: "Your status is hidden from everyone" },
  "presence.menuSettings": { tr: "Durum gizliliği", en: "Status privacy" },

  "presence.filterOnline": { tr: "Çevrimiçi", en: "Online" },
  "presence.onlineMembersTitle": { tr: "Şu an çevrimiçi", en: "Online now" },
  "presence.onlineMembersEmpty": { tr: "Şu an çevrimiçi görünen üye yok.", en: "No members appear online right now." },
  "presence.onlineMembersMore": { tr: "Tüm çevrimiçi üyeler", en: "All online members" },
  "presence.staffTitle": { tr: "Yönetim ekibinden çevrimiçi olanlar", en: "Moderators online now" },
  "presence.staffHint": {
    tr: "Bir sorun, şikâyet ya da katılım isteği için şu an ulaşabileceğin yöneticiler.",
    en: "Admins you can reach right now about a problem, a report or a join request.",
  },
  "presence.staffEmpty": { tr: "Şu an çevrimiçi görünen yönetici yok.", en: "No admins appear online right now." },
  "presence.hiddenSelfNote": {
    tr: "Kendi durumunu gizlediğin için başkalarının çevrimiçi durumu gösterilmiyor.",
    en: "Other people's online status isn't shown because you've hidden your own.",
  },
  "presence.eventActive": { tr: "{{count}} katılımcı şu an çevrimiçi", en: "{{count}} attendees online now" },
  "presence.eventAttendeesAria": { tr: "Şu an çevrimiçi olan katılımcılar", en: "Attendees who are online now" },
  "presence.going": { tr: "Gidiyor", en: "Going" },
  "presence.maybe": { tr: "Belki", en: "Maybe" },
} as const;
