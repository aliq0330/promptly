/**
 * Ekip/topluluk sohbet sayfaları ve hiyerarşik sessize alma (docs/history/369-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar (`...teamChatTranslations`).
 * Kullanıcı içeriği (ekip/proje/dosya/kanal adı, mesaj metni) çevrilmez.
 */
export const teamChatTranslations = {
  // --- Bildirim cümleleri (SQL tetikleyicisi Türkçe yazar; `notification-message.ts` kalıbı buraya çevirir) ---
  "notifMsg.teamChannelPosted": { tr: "{{name}} #{{channel}} kanalına yazdı: “{{preview}}”", en: "{{name}} wrote in #{{channel}}: “{{preview}}”" },

  // --- Hata kodları ---
  "tm.error.channel_exists": { tr: "Bu dosyanın zaten bir sohbet kanalı var.", en: "This file already has a chat channel." },
  "tm.error.project_channel_limit": { tr: "Bir projede en çok 30 kanal olabilir.", en: "A project can have at most 30 channels." },

  // --- Ekip sayfası (Mesajlar'dan açılan) ---
  "th.team.meta": { tr: "Ekip · {{members}}", en: "Team · {{members}}" },
  "th.channels": { tr: "Kanallarınız", en: "Your channels" },
  "th.projects": { tr: "Projeler", en: "Projects" },
  "th.default": { tr: "Varsayılan", en: "Default" },
  "th.mainChat": { tr: "Proje sohbeti", en: "Project chat" },
  "th.tag.main": { tr: "Proje", en: "Project" },
  "th.tag.file": { tr: "Dosya", en: "File" },
  "th.addChannel": { tr: "Kanal ekle", en: "Add channel" },
  "th.teamPage": { tr: "Ekip sayfası", en: "Team page" },
  "th.openProject": { tr: "Projeyi aç (pano ve dosyalar)", en: "Open project (board and files)" },
  "th.notFound": { tr: "Bu ekibe erişimin yok ya da ekip bulunamadı.", en: "You don't have access to this team, or it doesn't exist." },

  // --- Proje sayfası ---
  "th.project.meta": { tr: "{{team}} · Proje · {{members}}", en: "{{team}} · Project · {{members}}" },
  "th.project.chats": { tr: "Sohbetler", en: "Chats" },
  "th.project.filesNoChat": { tr: "Sohbeti olmayan dosyalar", en: "Files without a chat" },
  "th.project.filesNoChatHint": { tr: "Dosya sohbeti kendiliğinden açılmaz. İstediğin dosya için aç.", en: "File chats aren't created automatically. Create one for the files that need it." },
  "th.file.items": { tr: "{{count}} öğe", en: "{{count}} items" },
  "th.file.createChat": { tr: "Sohbet oluştur", en: "Create chat" },
  "th.project.notFound": { tr: "Proje bulunamadı ya da erişimin yok.", en: "Project not found, or you don't have access." },

  // --- Sessizlik etiketleri (satırlarda) ---
  "th.chip.channel": { tr: "Sessiz", en: "Muted" },
  "th.chip.project": { tr: "Sessiz · proje", en: "Muted · project" },
  "th.chip.team": { tr: "Sessiz · ekip", en: "Muted · team" },

  // --- Sessize alma kartı (ekip / proje) ---
  "th.mute.team.title": { tr: "Ekibi sessize al", en: "Mute this team" },
  "th.mute.team.off": { tr: "Ekibin tüm kanallarından ve projelerinden bildirim gelmez.", en: "No notifications from any of this team's channels or projects." },
  "th.mute.team.on": {
    tr: "Sessizde: bu ekipten bildirim gelmiyor. Sahiplik devri, rol değişikliği ve erişim süresi bildirimleri yine gelir.",
    en: "Muted: no notifications from this team. Ownership transfers, role changes and access-period notices still arrive.",
  },
  "th.mute.project.title": { tr: "Projeyi sessize al", en: "Mute this project" },
  "th.mute.project.off": {
    tr: "Bu projenin tüm kanallarından (proje sohbeti, dosya ve ek kanallar) bildirim gelmez. Ekibin diğer sohbetleri etkilenmez.",
    en: "No notifications from any channel of this project (project chat, file and extra channels). The team's other chats are unaffected.",
  },
  "th.mute.project.on": { tr: "Sessizde: bu projenin hiçbir kanalından bildirim gelmiyor.", en: "Muted: no notifications from any channel of this project." },
  "th.mute.project.teamMuted": {
    tr: "Ekip de sessizde, bu yüzden proje zaten sessiz. Ekibin sesini açınca bu ayar devreye girer.",
    en: "The team is muted too, so this project is muted already. This setting takes over once you unmute the team.",
  },

  // --- Kanal bilgisi: bildirim düzeyi ve miras ---
  "th.notify.heading": { tr: "Bu kanalda bildirim", en: "Notifications in this channel" },
  "th.notify.all": { tr: "Her yeni mesajda, okuyana kadar bir kez bildirim gelir.", en: "You get one notification per unread stretch, for any new message." },
  "th.notify.mentions": { tr: "Yalnız seni andıklarında bildirim gelir.", en: "You're notified only when someone mentions you." },
  "th.notify.none": { tr: "Sessiz: bu kanaldan hiç bildirim gelmez.", en: "Muted: no notifications from this channel." },
  "th.inherit.team": { tr: "Ekip sessizde olduğu için bu kanaldan bildirim gelmiyor.", en: "This channel sends no notifications because the team is muted." },
  "th.inherit.project": { tr: "Proje sessizde olduğu için bu kanaldan bildirim gelmiyor.", en: "This channel sends no notifications because the project is muted." },
  "th.inherit.unmuteTeam": { tr: "Ekibin sesini aç", en: "Unmute the team" },
  "th.inherit.unmuteProject": { tr: "Projenin sesini aç", en: "Unmute the project" },
  "th.inherit.note": { tr: "Aşağıdaki seçim saklanır, ama ekip/proje sessizken etkisizdir.", en: "The choice below is kept, but has no effect while the team or project is muted." },

  // --- Projeye kanal ekle ---
  "th.newChannel.title": { tr: "Projeye kanal ekle", en: "Add a channel to the project" },
  "th.newChannel.name": { tr: "Kanal adı", en: "Channel name" },
  "th.newChannel.namePlaceholder": { tr: "duyurular", en: "announcements" },
  "th.newChannel.nameHint": { tr: "Küçük harf, rakam ve tire. Aynı projede ad tek olmalı; başka projelerde de kullanılabilir.", en: "Lowercase letters, digits and hyphens. Unique within the project; other projects may reuse it." },
  "th.newChannel.description": { tr: "Açıklama (isteğe bağlı)", en: "Description (optional)" },
  "th.newChannel.posting": { tr: "Kim yazar?", en: "Who can post?" },
  "th.newChannel.postingAll": { tr: "Projedeki herkes", en: "Everyone in the project" },
  "th.newChannel.postingLeads": { tr: "Yalnız liderler", en: "Leads only" },
  "th.newChannel.create": { tr: "Kanalı oluştur", en: "Create channel" },
  "th.newChannel.nameRequired": { tr: "Kanal adı gerekli.", en: "A channel name is required." },

  // --- Dosya oluştururken ---
  "th.newFile.chatTitle": { tr: "Bu dosya için sohbet kanalı oluşturulsun mu?", en: "Create a chat channel for this file?" },
  "th.newFile.chatHint": {
    tr: "Sohbet kanalı kendiliğinden açılmaz. İstersen şimdi aç, istersen sonra projenin sohbet sayfasından oluştur.",
    en: "A chat channel isn't created automatically. Create it now, or later from the project's chat page.",
  },
  "th.newFile.chatSwitch": { tr: "Dosya için sohbet kanalı oluştur", en: "Create a chat channel for this file" },
  "th.newFile.goToFile": { tr: "Dosyaya git", en: "Go to file" },
  "th.file.chatSection": { tr: "Dosya sohbeti", en: "File chat" },
  "th.file.chatOpen": { tr: "Dosya sohbetini aç", en: "Open file chat" },
  "th.file.chatNone": { tr: "Bu dosyanın sohbet kanalı yok.", en: "This file has no chat channel." },
  "th.file.chatNoneLead": { tr: "Bu dosyanın sohbet kanalı yok. İstersen şimdi oluştur.", en: "This file has no chat channel. Create one if you want." },
  "th.file.chatCreate": { tr: "Sohbet kanalı oluştur", en: "Create chat channel" },
  "th.project.notifications": { tr: "Bildirimler", en: "Notifications" },
  "th.newFile.chatFailed": { tr: "Dosya oluşturuldu ama sohbet kanalı açılamadı. Projenin sohbet sayfasından yeniden dene.", en: "The file was created but its chat channel couldn't be. Try again from the project's chat page." },

  // --- Topluluk sayfası (Mesajlar'dan açılan) ---
  "th.community.meta": { tr: "Topluluk · {{members}}", en: "Community · {{members}}" },
  "th.community.rooms": { tr: "Odalarınız", en: "Your rooms" },
  "th.community.addRoom": { tr: "Oda ekle", en: "Add room" },
  "th.community.page": { tr: "Topluluk sayfası", en: "Community page" },
  "th.community.noRooms": { tr: "Bu toplulukta henüz sohbet odası yok.", en: "This community has no chat rooms yet." },
  "th.community.notFound": { tr: "Bu topluluğa erişimin yok ya da topluluk bulunamadı.", en: "You don't have access to this community, or it doesn't exist." },

  // --- Mesajlar listesi satırı ---
  "th.row.projects": { tr: "{{count}} proje", en: "{{count}} projects" },
  "th.row.moreNames": { tr: "+{{count}}", en: "+{{count}}" },

  // --- Kanal listesi sohbet listesi gibi çalışır (docs/history/381-*): süzgeç, arama, seçim modu ---
  "th.filter.aria": { tr: "Listeyi süz", en: "Filter the list" },
  "th.filter.channels": { tr: "Kanallar", en: "Channels" },
  "th.filter.chats": { tr: "Sohbetler", en: "Chats" },
  "th.filter.rooms": { tr: "Odalar", en: "Rooms" },
  "th.filter.unread": { tr: "Okunmamış", en: "Unread" },
  "th.filter.muted": { tr: "Sessize alınanlar", en: "Muted" },
  "th.filter.empty": { tr: "Bu süzgece uyan bir şey yok.", en: "Nothing matches this filter." },
  "th.search.channels": { tr: "Kanallarda ara", en: "Search channels" },
  "th.search.chats": { tr: "Sohbetlerde ara", en: "Search chats" },
  "th.search.rooms": { tr: "Odalarda ara", en: "Search rooms" },
  "th.noChannels": { tr: "Bu ekipte açılacak bir kanal yok.", en: "This team has no channel to open." },
  "th.back.team": { tr: "Ekip", en: "Team" },
  "th.sel.count.channel": { tr: "{{count}} kanal seçildi", en: "{{count}} channels selected" },
  "th.sel.count.room": { tr: "{{count}} oda seçildi", en: "{{count}} rooms selected" },
  "th.sel.count.chat": { tr: "{{count}} sohbet seçildi", en: "{{count}} chats selected" },
  "th.sel.count.item": { tr: "{{count}} öğe seçildi", en: "{{count}} items selected" },
  "th.sel.selectChannels": { tr: "Kanal seç", en: "Select channels" },
  "th.sel.selectRooms": { tr: "Oda seç", en: "Select rooms" },
  "th.sel.mute": { tr: "Sessize al", en: "Mute" },
  "th.sel.unmute": { tr: "Sesi aç", en: "Unmute" },
  "th.sel.nothingUnread": { tr: "Okunmamış bir şey yok.", en: "Nothing is unread." },
  "th.sel.pinnedToast": { tr: "Listenin başına sabitlendi.", en: "Pinned to the top of the list." },
  "th.sel.unpinnedToast": { tr: "Sabitleme kaldırıldı.", en: "Unpinned." },
  "th.sel.mutedToast": { tr: "Sessize alındı.", en: "Muted." },
  "th.sel.unmutedToast": { tr: "Sesi açıldı.", en: "Unmuted." },
  "th.sel.readToast": { tr: "{{count}} öğe okundu olarak işaretlendi.", en: "{{count}} marked as read." },
  "th.sel.deletedToast": { tr: "{{count}} öğe silindi.", en: "{{count}} deleted." },
  "th.sel.partialFailed": { tr: "{{failed}} öğede işlem yapılamadı; seçili kaldılar, tekrar dene.", en: "The action failed for {{failed}}; they stay selected, try again." },
  "th.sel.deleteTitle": { tr: "{{count}} öğe silinsin mi?", en: "Delete {{count}} selected?" },
  "th.mute.community.title": { tr: "Topluluğu sessize al", en: "Mute this community" },
  "th.mute.community.off": { tr: "Topluluğun yeni mesajları listede nokta yakmaz; topluluk etkinliği bildirimleri gelmez.", en: "New messages don't light the list dot; community event notifications stop." },
  "th.mute.community.on": { tr: "Sessizde: bu topluluktan bildirim gelmiyor.", en: "Muted: no notifications from this community." },
} as const;
