/**
 * Ekip sayfası "Merkez" yönü (docs/history/366-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar (`...teamCenterTranslations`).
 * Kullanıcı içeriği (ekip/proje/dosya adı, öğe başlığı, kişi adı) çevrilmez.
 */
export const teamCenterTranslations = {
  // --- Bant ve sekmeler ---
  "tc.band.kicker": { tr: "EKİP", en: "TEAM" },
  "tc.band.menu": { tr: "Ekip menüsü", en: "Team menu" },
  "tc.band.menu.info": { tr: "Ekip bilgisi", en: "Team info" },
  "tc.band.menu.notifications": { tr: "Sohbet bildirimleri", en: "Chat notifications" },
  "tc.tab.overview": { tr: "Genel bakış", en: "Overview" },
  "tc.tab.approvals": { tr: "Onaylar", en: "Approvals" },

  // --- Genel bakış ---
  "tc.over.waiting": { tr: "Senden bekleyenler", en: "Waiting for you" },
  "tc.over.changesWaiting": { tr: "Değişiklik istenenler", en: "Changes requested" },
  "tc.over.waitingOpen": { tr: "{{count}} karar · Aç", en: "{{count}} decisions · Open" },
  "tc.over.waitingPhone": { tr: "Senden bekleyenler: {{count}} karar", en: "Waiting for you: {{count}} decisions" },
  "tc.over.open": { tr: "Aç", en: "Open" },
  "tc.over.activity": { tr: "Son etkinlik", en: "Recent activity" },
  "tc.over.activityEmpty": { tr: "Henüz etkinlik yok.", en: "No activity yet." },
  "tc.over.channels": { tr: "Kanallar", en: "Channels" },
  "tc.over.unread": { tr: "{{count}} yeni", en: "{{count}} new" },
  "tc.over.changesChip": { tr: "{{count}} değişiklik istendi", en: "{{count}} changes requested" },
  "tc.activity.someone": { tr: "Biri", en: "Someone" },
  "tc.activity.added": { tr: "“{{title}}” ekledi", en: "added “{{title}}”" },
  "tc.activity.approved": { tr: "“{{title}}” öğesini onayladı", en: "approved “{{title}}”" },
  "tc.activity.changes": { tr: "“{{title}}” için değişiklik istedi", en: "requested changes on “{{title}}”" },
  "tc.activity.file": { tr: "“{{title}}” dosyasını açtı", en: "opened the file “{{title}}”" },
  "tc.activity.joined": { tr: "ekibe katıldı", en: "joined the team" },

  // --- Proje sayfası ---
  "tc.proj.yourRole": { tr: "Senin rolün", en: "Your role" },
  "tc.proj.waitingBanner": { tr: "{{count}} öğe seni bekliyor", en: "{{count}} items are waiting for you" },
  "tc.proj.reviewOn": { tr: "Onay açık: {{names}}", en: "Review on: {{names}}" },
  "tc.proj.projectWide": { tr: "Proje geneli", en: "Project-wide" },
  "tc.proj.filePending": { tr: "{{count}} bekliyor", en: "{{count}} waiting" },
  "tc.proj.directPublish": { tr: "Doğrudan yayında", en: "Published directly" },
  "tc.proj.boards": { tr: "Proje panoları", en: "Project boards" },
  "tc.proj.edit": { tr: "Düzenle", en: "Edit" },

  // --- Dosya sayfası ---
  "tc.file.reviewOn": { tr: "Onay açık", en: "Review on" },
  "tc.file.reviewOff": { tr: "Onay kapalı", en: "Review off" },
  "tc.file.counts": { tr: "{{approved}} onaylı · {{pending}} bekliyor · {{changes}} değişiklik", en: "{{approved}} approved · {{pending}} waiting · {{changes}} changes" },
  "tc.file.review": { tr: "İncele", en: "Review" },
  "tc.file.waiting": { tr: "Onay bekleyen", en: "Waiting for review" },
  "tc.file.variables": { tr: "Değişkenler:", en: "Variables:" },

  // --- Onaylar panosu ---
  "tc.appr.title": { tr: "Onay panosu", en: "Approval board" },
  "tc.appr.subtitle": { tr: "Karar bekleyenler, değişiklik istenenler ve bugün onaylananlar", en: "Waiting for a decision, changes requested and approved today" },
  "tc.appr.allProjects": { tr: "Tüm projeler", en: "All projects" },
  "tc.appr.pending": { tr: "Senden bekleyen", en: "Waiting for you" },
  "tc.appr.pendingShort": { tr: "Bekleyen", en: "Waiting" },
  "tc.appr.changes": { tr: "Değişiklik istenen", en: "Changes requested" },
  "tc.appr.changesShort": { tr: "Değişiklik", en: "Changes" },
  "tc.appr.approved": { tr: "Bugün onaylanan", en: "Approved today" },
  "tc.appr.approvedShort": { tr: "Onaylanan", en: "Approved" },
  "tc.appr.statusAria": { tr: "Durum", en: "Status" },
  "tc.appr.columnEmpty": { tr: "Burada bir şey yok.", en: "Nothing here." },
  "tc.appr.empty": { tr: "Bekleyen onay yok", en: "No approvals waiting" },
  "tc.appr.emptyBody": { tr: "Onaya gönderilen, değişiklik istenen ve bugün onaylanan öğeler burada görünür.", en: "Items sent for review, with changes requested, or approved today appear here." },
  "tc.appr.proposal": { tr: "DEĞİŞİKLİK ÖNERİSİ", en: "PROPOSED CHANGE" },
  "tc.appr.package": { tr: "PAKET · {{count}} ÖĞE", en: "PACKAGE · {{count}} ITEMS" },
  "tc.appr.approvedAt": { tr: "Onaylandı", en: "Approved" },
  "tc.appr.leadNote": { tr: "Liderin notu: {{note}}", en: "Lead's note: {{note}}" },
  "tc.appr.fixIt": { tr: "Düzeltip yeniden gönder", en: "Fix it and send it again" },
  "tc.appr.waitingAuthor": { tr: "{{name}} düzeltecek", en: "Waiting for {{name}}" },
  "tc.appr.leadOnly": { tr: "Kararı projenin lideri verir.", en: "A project lead makes the decision." },

  // --- Üyeler ---
  "tc.members.inviteHint": { tr: "Katılım yalnız davetle: kullanıcı adı ya da bağlantı.", en: "Joining is by invitation only: a username or a link." },
  "tc.members.pending": { tr: "Bekleyen davetler · {{count}}", en: "Pending invitations · {{count}}" },
  "tc.members.noProject": { tr: "Henüz projede değil", en: "Not on a project yet" },
  "tc.members.in.lead": { tr: "{{count}} projede lider", en: "Lead on {{count}} projects" },
  "tc.members.in.edit": { tr: "{{count}} projede düzenleyici", en: "Editor on {{count}} projects" },
  "tc.members.in.view": { tr: "{{count}} projede görüntüleyici", en: "Viewer on {{count}} projects" },

  // --- Sohbet ---
  "tc.chat.notifyAndInfo": { tr: "Bildirim ve kanal bilgisi", en: "Notifications and channel info" },

  // --- Panel ---
  "tc.panel.prev": { tr: "önceki dönem: {{count}}", en: "previous period: {{count}}" },
  "tc.panel.waiting": { tr: "Bekleyen onay", en: "Waiting for review" },
  "tc.panel.oldest": { tr: "en eskisi {{days}} gün", en: "oldest {{days}} days" },
  "tc.panel.noAlerts": { tr: "Dikkat gerektiren bir şey yok.", en: "Nothing needs attention." },

  // --- Yönetim ---
  "tc.admin.overview": { tr: "Genel", en: "General" },
  "tc.admin.auditAll": { tr: "Tümü", en: "See all" },
} as const;
