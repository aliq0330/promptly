/**
 * Tepkiler (docs/history/265-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar (`...reactionTranslations`).
 * Tepkinin adı, Telegram'ın emoji paketindeki simgeye değil kartın dilindeki duyguya bağlıdır; kişi adları/kullanıcı adları çevrilmez.
 */
export const reactionTranslations = {
  // ---- Altı tepki ----
  "reaction.love": { tr: "Sevdim", en: "Love" },
  "reaction.fire": { tr: "Ateş", en: "Fire" },
  "reaction.wow": { tr: "Vay be", en: "Wow" },
  "reaction.clap": { tr: "Alkış", en: "Applause" },
  "reaction.haha": { tr: "Komik", en: "Funny" },
  "reaction.idea": { tr: "Faydalı", en: "Useful" },

  // ---- Düğme + seçici ----
  "reaction.add": { tr: "Tepki ver", en: "React" },
  "reaction.pickerAria": { tr: "Tepki seç", en: "Choose a reaction" },
  "reaction.remove": { tr: "Tepkini kaldır", en: "Remove your reaction" },
  "reaction.buttonAria": { tr: "Tepki ver ({{count}} tepki)", en: "React ({{count}} reactions)" },
  "reaction.changeAria": { tr: "Tepkin: {{reaction}}. Değiştirmek için aç ({{count}} tepki)", en: "Your reaction: {{reaction}}. Open to change it ({{count}} reactions)" },

  // ---- "Kim ne tepki verdi" özeti ----
  "reaction.summary.you": { tr: "Sen", en: "You" },
  "reaction.summary.and": { tr: " ve ", en: " and " },
  "reaction.summary.onlyYou": { tr: "Tepki verdin", en: "You reacted" },
  "reaction.summary.names": { tr: "{{names}} tepki verdi", en: "{{names}} reacted" },
  "reaction.summary.namesRest": { tr: "{{names}} ve {{count}} kişi tepki verdi", en: "{{names}} and {{count}} others reacted" },
  "reaction.summary.namesRestOne": { tr: "{{names}} ve 1 kişi tepki verdi", en: "{{names}} and 1 other reacted" },
  "reaction.summary.count": { tr: "{{count}} kişi tepki verdi", en: "{{count}} people reacted" },
  "reaction.summary.countOne": { tr: "1 kişi tepki verdi", en: "1 person reacted" },
  "reaction.summary.aria": { tr: "{{count}} tepki, kimin ne verdiğini göster", en: "{{count}} reactions, show who reacted with what" },

  // ---- Tepkiler sayfası ----
  "reaction.sheet.title": { tr: "Tepkiler", en: "Reactions" },
  "reaction.sheet.total": { tr: "{{count}} tepki", en: "{{count}} reactions" },
  "reaction.sheet.all": { tr: "Tümü", en: "All" },
  "reaction.sheet.tabsAria": { tr: "Tepki türü", en: "Reaction type" },
  "reaction.sheet.you": { tr: "Sen", en: "You" },
  "reaction.sheet.removeMine": { tr: "Tepkimi kaldır", en: "Remove my reaction" },
  "reaction.sheet.empty": { tr: "Bu tepkiyi henüz kimse vermedi.", en: "Nobody has given this reaction yet." },
} as const;
