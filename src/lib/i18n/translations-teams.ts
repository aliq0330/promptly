/**
 * Ekipler başlığı (docs/history/350-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar (`...teamsTranslations`).
 * Ekip = "tamamen kapalı" topluluk; kullanıcı içeriği (ekip adı, açıklama) çevrilmez.
 */
export const teamsTranslations = {
  "teams.title": { tr: "Ekipler", en: "Teams" },
  "nav.teams": { tr: "Ekipler", en: "Teams" },
  "teams.intro": {
    tr: "Ekibinle ortak Space'ler, sohbet ve paylaşımlar — hepsi yalnızca üyelere açık.",
    en: "Shared Spaces, chat and posts with your team — all open to members only.",
  },
  "teams.create": { tr: "Ekip oluştur", en: "Create team" },
  "teams.card.spaces.one": { tr: "{{count}} Space", en: "{{count}} Space" },
  "teams.card.spaces.other": { tr: "{{count}} Space", en: "{{count}} Spaces" },
  "teams.card.openSpaces": { tr: "Space'ler", en: "Spaces" },
  "teams.card.openChat": { tr: "Ekip sohbeti", en: "Team chat" },
  "teams.card.unread": { tr: "{{count}} okunmamış mesaj", en: "{{count}} unread messages" },
  "teams.card.active": { tr: "Son etkinlik: {{time}}", en: "Last activity: {{time}}" },
  "teams.empty.title": { tr: "Henüz bir ekibin yok", en: "You're not in a team yet" },
  "teams.empty.body": {
    tr: "Ekip, yalnızca davet ettiğin kişilerin girebildiği kapalı bir çalışma alanıdır: ortak Space'ler, sohbet ve paylaşımlar bir arada.",
    en: "A team is a private workspace only the people you invite can enter: shared Spaces, chat and posts in one place.",
  },

  "teams.create.title": { tr: "Ekip oluştur", en: "Create a team" },
  "teams.create.nameLabel": { tr: "Ekip adı", en: "Team name" },
  "teams.create.submit": { tr: "Ekibi oluştur", en: "Create team" },
  "teams.create.goToTeam": { tr: "Ekibe git", en: "Go to the team" },
  "teams.create.privateNote": {
    tr: "Ekip her zaman tamamen kapalıdır: Keşfet'te ve aramada görünmez, yalnızca davet ettiklerin girer. Ortak Space'ler açabilir, sohbet edebilirsin.",
    en: "A team is always invite-only: it never appears in Discover or search, and only the people you invite can join. You can open shared Spaces and chat.",
  },
  "teams.settings.alwaysPrivate": {
    tr: "Ekipler her zaman tamamen kapalıdır; görünürlük değiştirilemez.",
    en: "Teams are always invite-only; the visibility cannot be changed.",
  },

  "teams.convert.toTeam": { tr: "Ekibe çevir", en: "Turn into a team" },
  "teams.convert.toTeamHelp": {
    tr: "Bu topluluğu ekibe çevirirsen Ekipler'e taşınır: Keşfet ve aramadan kalkar, yalnızca davetle girilir; ortak Space'ler açabilirsin.",
    en: "Turning this community into a team moves it to Teams: it leaves Discover and search, joining is by invitation only, and you can open shared Spaces.",
  },
  "teams.convert.toTeamTitle": { tr: "Topluluk ekibe çevrilsin mi?", en: "Turn this community into a team?" },
  "teams.convert.toTeamBody": {
    tr: "Topluluk Ekipler'e taşınır ve Topluluklar'dan kalkar. Keşfet, arama ve önerilerden tamamen çıkar; içerik yalnızca üyelere açık kalır. Yeni üyelik yalnızca davetle olur. Mevcut üyeler kalır; bekleyen başvurular senin kararını bekler.",
    en: "The community moves to Teams and leaves Communities. It disappears from Discover, search and suggestions entirely; content stays members-only. New members join only by invitation. Current members stay; pending requests wait for your decision.",
  },
  "teams.convert.toTeamToast": { tr: "Topluluk ekibe çevrildi.", en: "The community is now a team." },
  "teams.convert.toCommunity": { tr: "Topluluğa çevir", en: "Turn into a community" },
  "teams.convert.toCommunityHelp": {
    tr: "İstersen bu ekibi (kapalı) topluluğa çevirebilirsin. Ekibe bağlı Space varken (arşivlenmiş olanlar dahil) çevrilemez; önce o Space'leri silmen gerekir.",
    en: "You can turn this team into a (private) community. It can't be converted while any team Space (archived ones included) is linked to it; delete those Spaces first.",
  },
  "teams.convert.toCommunityTitle": { tr: "Ekip topluluğa çevrilsin mi?", en: "Turn this team into a community?" },
  "teams.convert.toCommunityBody": {
    tr: "Ekip Topluluklar'a taşınır ve Ekipler'den kalkar. Arama ve önerilerde görünür olur (ad, açıklama, görsel, üye sayısı); içerik yine yalnızca üyelerde kalır. Katılım istek ve onayla olur. Mevcut üyeler ve bekleyen başvurular değişmez.",
    en: "The team moves to Communities and leaves Teams. It becomes visible in search and suggestions (name, description, picture, member count); content stays members-only. Joining needs a request and approval. Current members and pending requests are unchanged.",
  },
  "teams.convert.toCommunityToast": { tr: "Ekip topluluğa çevrildi.", en: "The team is now a community." },

  "teams.tab.feed": { tr: "Paylaşımlar", en: "Posts" },
  "teams.band.eyebrow": { tr: "Ekip", en: "Team" },
  "teams.band.openChat": { tr: "Ekip sohbetini aç", en: "Open team chat" },
  "teams.visibilityLabel": { tr: "Ekip · tamamen kapalı", en: "Team · invite only" },
  "teams.messages.entryAria": { tr: "Ekip sohbetleri", en: "Team chats" },
} as const;
