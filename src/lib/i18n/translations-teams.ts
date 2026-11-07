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
  "teams.empty.invite": {
    tr: "Bir ekibe davet edildiysen davetin Topluluklar → Davet ve başvurular bölümünde.",
    en: "If you were invited to a team, the invitation is under Communities → Invites and requests.",
  },
  "teams.empty.inviteLink": { tr: "Davetlerime bak", en: "See my invitations" },

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

  "teams.tab.feed": { tr: "Paylaşımlar", en: "Posts" },
  "teams.band.eyebrow": { tr: "Ekip", en: "Team" },
  "teams.band.openChat": { tr: "Ekip sohbetini aç", en: "Open team chat" },
  "teams.visibilityLabel": { tr: "Ekip · tamamen kapalı", en: "Team · invite only" },
  "teams.messages.entryAria": { tr: "Ekip sohbetleri", en: "Team chats" },
} as const;
