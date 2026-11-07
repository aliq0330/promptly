/**
 * Ekip alanı (docs/history/349-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar (`...teamSpacesTranslations`).
 * Kullanıcı içeriği (ekip/Space adı, prompt metni) çevrilmez.
 */
export const teamSpacesTranslations = {
  "groups.cap.create_spaces": { tr: "Ekibe Space açma ve yönetme", en: "Create and manage team Spaces" },
  "groups.cap.create_spacesHelp": {
    tr: "Tamamen kapalı toplulukta (ekip alanı) Space açar; ekibe bağlı Space'leri yeniden adlandırır, arşivler ve siler.",
    en: "Creates Spaces in an invite-only community (team space); renames, archives and deletes the Spaces linked to the team.",
  },
  "groups.cap.approve_library": { tr: "Ekip kütüphanesinde onay verme", en: "Approve prompts in the team library" },
  "groups.cap.approve_libraryHelp": {
    tr: "Ekibin ortak kütüphanesindeki prompt taslaklarını onaylar ya da onayını kaldırır.",
    en: "Approves or removes approval from prompt drafts in the team's shared library.",
  },
  "groups.error.community_has_team_spaces": {
    tr: "Bu ekibin Space'leri var; \"tamamen kapalı\" olmaktan çıkamaz. Önce Space'leri sil ya da bırak.",
    en: "This team has Spaces, so it can't stop being invite-only. Delete the Spaces first.",
  },
  "spaces.error.teamManaged": {
    tr: "Bu Space ekibe bağlı: kişiler, roller ve görünürlük ekip tarafından yönetilir.",
    en: "This Space belongs to a team: people, roles and visibility are managed by the team.",
  },
  "spaces.error.teamSpaceLimit": { tr: "Bir ekipte en çok 50 Space olabilir.", en: "A team can have at most 50 Spaces." },

  "communities.detail.tab.spaces": { tr: "Space'ler", en: "Spaces" },

  "team.spaces.intro": {
    tr: "Ekibin ortak çalışma alanları. Ekibe katılan herkes buradaki Space'leri görür ve düzenler; ekipten ayrılan erişimini kaybeder.",
    en: "The team's shared workspaces. Everyone in the team sees and edits these Spaces; whoever leaves the team loses access.",
  },
  "team.spaces.count": { tr: "{{count}}/{{max}} Space", en: "{{count}}/{{max}} Spaces" },
  "team.spaces.new": { tr: "Yeni Space", en: "New Space" },
  "team.spaces.empty": { tr: "Henüz ekip Space'i yok", en: "No team Spaces yet" },
  "team.spaces.emptyCreator": {
    tr: "İlk ortak alanı aç: ekip kütüphanesi, moodboard ya da serbest bir proje.",
    en: "Open the first shared space: a team library, a moodboard or a free project.",
  },
  "team.spaces.emptyMember": { tr: "Space'leri ekibin yetkilileri açar.", en: "The team's managers open the Spaces." },
  "team.spaces.limitReached": { tr: "Ekip Space sınırına (50) ulaşıldı.", en: "The team's Space limit (50) has been reached." },
  "team.spaces.loadError": { tr: "Ekibin Space'leri yüklenemedi.", en: "Couldn't load the team's Spaces." },
  "team.spaces.createTitle": { tr: "Ekibe yeni Space", en: "New team Space" },
  "team.spaces.createHelp": {
    tr: "Space özel olur; ekibin bütün üyeleri görür ve düzenler. Kişileri ekip yönetir.",
    en: "The Space is private; every team member sees and edits it. The team manages the people.",
  },

  "notifMsg.teamSpaceOpened": { tr: "\"{{name}}\" adlı yeni ekip Space'ini açtı.", en: "Opened a new team Space \"{{name}}\"." },
  "notifMsg.teamPromptApproved": { tr: "\"{{name}}\" promptunu ekip kütüphanesinde onayladı.", en: "Approved your prompt \"{{name}}\" in the team library." },
  "notifMsg.teamPromptUnapproved": { tr: "\"{{name}}\" promptunun onayını kaldırdı.", en: "Removed the approval of your prompt \"{{name}}\"." },

  "notifMsg.teamReviewRequested": { tr: "\"{{name}}\" promptu için onay istedi.", en: "Asked for approval of the prompt \"{{name}}\"." },

  // Aşama 3: onaya gönder + sürüm geçmişi
  "spaces.error.reviewForbidden": { tr: "İnceleme isteğini yalnızca onay isteme düğmesi değiştirebilir.", en: "The review request can only be changed with the request-approval button." },
  "spaces.library.requestReview": { tr: "Onaya gönder", en: "Request approval" },
  "spaces.library.requestReviewHint": { tr: "Onay yetkililerine haber verir. Metin değişse de istek bekler; onay verilince ya da geri çekilince kalkar.", en: "Notifies the people who can approve. The request stays even if the text changes; it ends when it is approved or withdrawn." },
  "spaces.library.withdrawReview": { tr: "İsteği geri çek", en: "Withdraw request" },
  "spaces.library.reviewRequested": { tr: "Onay istendi", en: "Approval requested" },
  "spaces.library.reviewRequestedTitle": { tr: "Onay yetkililerinden onay istendi.", en: "Approval was requested from the approvers." },
  "spaces.library.statusRequested": { tr: "Onay istenen", en: "Approval requested" },
  "spaces.library.emptyRequested": { tr: "Onay isteyen prompt yok", en: "No prompts awaiting a decision" },
  "spaces.library.versions": { tr: "Sürümler", en: "Versions" },
  "spaces.library.versionsTitle": { tr: "Sürüm geçmişi", en: "Version history" },
  "spaces.library.versionsIntro": { tr: "Başlık ya da metin her değiştiğinde eski hâli burada saklanır (son 50). Geri yüklemek yeni bir düzenlemedir; onay kalkar.", en: "Each time the title or text changes, the previous version is kept here (last 50). Restoring is a new edit; the approval is removed." },
  "spaces.library.versionsEmpty": { tr: "Henüz eski sürüm yok.", en: "No earlier versions yet." },
  "spaces.library.versionsError": { tr: "Sürümler yüklenemedi.", en: "Couldn't load the versions." },
  "spaces.library.versionBy": { tr: "{{name}} yazdı", en: "Written by {{name}}" },
  "spaces.library.versionWasApproved": { tr: "Onaylıydı", en: "Was approved" },
  "spaces.library.versionRestore": { tr: "Geri yükle", en: "Restore" },
  "spaces.library.versionRestoring": { tr: "Yükleniyor…", en: "Restoring…" },
  "spaces.library.versionRestored": { tr: "Sürüm geri yüklendi.", en: "Version restored." },
  "spaces.library.versionShow": { tr: "Tamamını göster", en: "Show all" },
  "spaces.library.versionHide": { tr: "Gizle", en: "Hide" },

  "team.chat.spacesTitle": { tr: "Ortak Space'ler", en: "Shared Spaces" },
  "team.chat.allSpaces": { tr: "Tüm Space'ler", en: "All Spaces" },
  "team.share.button": { tr: "Sohbete gönder", en: "Send to chat" },
  "team.share.sending": { tr: "Gönderiliyor…", en: "Sending…" },
  "team.share.sent": { tr: "Ekip sohbetine gönderildi", en: "Sent to the team chat" },
  "team.share.failed": { tr: "Sohbete gönderilemedi. Tekrar dene.", en: "Couldn't send to the chat. Try again." },
  "team.share.promptNote": { tr: "Ekip kütüphanesinden: \"{{title}}\"", en: "From the team library: \"{{title}}\"" },

  "team.space.badge": { tr: "Ekip: {{name}}", en: "Team: {{name}}" },
  "team.space.openTeam": { tr: "Ekip sayfası", en: "Team page" },
  "team.space.openChat": { tr: "Ekip sohbeti", en: "Team chat" },
  "team.space.membersNote": {
    tr: "Bu Space'in üyeleri ekipten gelir. Kişi eklemek, çıkarmak ya da rol vermek için ekip sayfasındaki Üyeler sekmesini kullan.",
    en: "This Space's members come from the team. To add, remove or change people, use the Members tab on the team page.",
  },
} as const;
