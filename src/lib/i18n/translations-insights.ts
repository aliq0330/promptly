/**
 * Yaratıcı paneli (docs/history/293-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar (`...insightsTranslations`).
 * Prompt başlıkları, araç adları ve kullanıcı adları çevrilmez; tepki adları `reaction.*` anahtarlarından gelir.
 */
export const insightsTranslations = {
  "nav.insights": { tr: "Yaratıcı paneli", en: "Creator insights" },
  "insights.title": { tr: "Yaratıcı paneli", en: "Creator insights" },
  "insights.subtitle": {
    tr: "Promptlarının son dönemde nasıl karşılandığı. Yalnızca sen görürsün.",
    en: "How your prompts have been received lately. Only you can see this.",
  },
  "insights.period.menuTitle": { tr: "Dönem", en: "Period" },
  "insights.period.menuAria": { tr: "Dönemi seç", en: "Choose the period" },
  "insights.period.7": { tr: "Son 7 gün", en: "Last 7 days" },
  "insights.period.30": { tr: "Son 30 gün", en: "Last 30 days" },
  "insights.period.90": { tr: "Son 90 gün", en: "Last 90 days" },

  "insights.tile.copies": { tr: "Kopyalama", en: "Copies" },
  "insights.tile.reactions": { tr: "Tepki", en: "Reactions" },
  "insights.tile.comments": { tr: "Yorum", en: "Comments" },
  "insights.tile.saves": { tr: "Kaydedilme", en: "Saves" },
  "insights.tile.followers": { tr: "Yeni takipçi", en: "New followers" },
  "insights.trend.up": { tr: "▲ %{{percent}}", en: "▲ {{percent}}%" },
  "insights.trend.down": { tr: "▼ %{{percent}}", en: "▼ {{percent}}%" },
  "insights.trend.new": { tr: "● Yeni", en: "● New" },
  "insights.trend.flat": { tr: "— Değişmedi", en: "— No change" },
  "insights.trend.upAria": { tr: "Önceki döneme göre %{{percent}} arttı", en: "Up {{percent}}% from the previous period" },
  "insights.trend.downAria": { tr: "Önceki döneme göre %{{percent}} azaldı", en: "Down {{percent}}% from the previous period" },
  "insights.trend.newAria": { tr: "Önceki dönemde hiç yoktu, bu dönem başladı", en: "None in the previous period, started this period" },
  "insights.trend.flatAria": { tr: "Önceki dönemle aynı", en: "Same as the previous period" },
  "insights.trend.vsPrev": { tr: "önceki {{days}} güne göre", en: "vs the previous {{days}} days" },

  "insights.chart.title": { tr: "Günlük trend", en: "Daily trend" },
  "insights.chart.range": { tr: "{{from}} – {{to}} · günlük kopyalama ve tepki", en: "{{from}} – {{to}} · daily copies and reactions" },
  "insights.chart.aria": {
    tr: "Son {{days}} günün günlük kopyalama ve tepki sayısı. En yüksek gün {{day}}: {{count}} kopyalama.",
    en: "Daily copies and reactions over the last {{days}} days. Highest day {{day}}: {{count}} copies.",
  },
  "insights.chart.ariaFlat": {
    tr: "Son {{days}} günün günlük kopyalama ve tepki sayısı. Bu dönemde kopyalama yok.",
    en: "Daily copies and reactions over the last {{days}} days. No copies in this period.",
  },
  "insights.chart.peakCopies": { tr: "{{count}} kopyalama", en: "{{count}} copies" },
  "insights.chart.peakReactions": { tr: "{{count}} tepki", en: "{{count}} reactions" },

  "insights.top.title": { tr: "En çok kopyalananlar", en: "Most copied" },
  "insights.top.copies": { tr: "kopyalama", en: "copies" },
  "insights.top.reactions": { tr: "tepki", en: "reactions" },
  "insights.top.new": { tr: "Yeni", en: "New" },
  "insights.top.empty": { tr: "Bu dönemde kopyalanan ya da tepki alan prompt yok.", en: "No prompt was copied or reacted to in this period." },
  "insights.top.rowAria": { tr: "{{title}}: {{copies}} kopyalama, {{reactions}} tepki", en: "{{title}}: {{copies}} copies, {{reactions}} reactions" },

  "insights.mix.title": { tr: "Tepki dağılımı", en: "Reaction mix" },
  "insights.mix.subtitle": { tr: "Son {{days}} günde aldığın {{count}} tepki", en: "{{count}} reactions you received in the last {{days}} days" },
  "insights.mix.empty": { tr: "Bu dönemde tepki almadın.", en: "You received no reactions in this period." },

  "insights.note.title": { tr: "Bu sayılar nasıl hesaplanır?", en: "How are these numbers counted?" },
  "insights.note.body": {
    tr: "Kopyalama, bir promptu o gün kopyalayan oturum açmış kullanıcı başına bir sayılır; misafirler ve kendi kopyaların sayılmaz. Tepki, yorum, kaydetme ve takip ilk gerçekleştikleri güne yazılır, geri alınanlar geçmişten de düşer. Günler UTC'dir. Yalnızca herkese açık, yayında promptların sayılır; topluluğa özgü promptlar dahil değildir.",
    en: "A copy counts once per signed-in user per prompt per day; guests and your own copies are not counted. Reactions, comments, saves and follows are dated by when they first happened, and ones that were undone drop out of the past too. Days are UTC. Only your published public prompts are counted; community-only prompts are not included.",
  },

  "insights.empty.title": { tr: "Henüz gösterilecek veri yok", en: "Nothing to show yet" },
  "insights.empty.description": {
    tr: "Herkese açık bir prompt paylaştığında kopyalama, tepki ve yorumlar burada görünür.",
    en: "Once you share a public prompt, its copies, reactions and comments will show up here.",
  },
  "insights.empty.action": { tr: "Prompt oluştur", en: "Create a prompt" },
  "insights.loadError": { tr: "Panel yüklenemedi. Bağlantını kontrol edip tekrar dene.", en: "Couldn't load the dashboard. Check your connection and try again." },
} as const;
