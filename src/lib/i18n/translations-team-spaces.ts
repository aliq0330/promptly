/**
 * Ekip alanı (docs/history/349-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar (`...teamSpacesTranslations`).
 * Kullanıcı içeriği (ekip/Space adı, prompt metni) çevrilmez.
 */
export const teamSpacesTranslations = {
  "spaces.error.teamManaged": {
    tr: "Bu Space ekibe bağlı: kişiler, roller ve görünürlük ekip tarafından yönetilir.",
    en: "This Space belongs to a team: people, roles and visibility are managed by the team.",
  },
  "spaces.error.teamSpaceLimit": { tr: "Bir ekipte en çok 50 Space olabilir.", en: "A team can have at most 50 Spaces." },

  "notifMsg.teamSpaceOpened": { tr: "\"{{name}}\" adlı yeni ekip Space'ini açtı.", en: "Opened a new team Space \"{{name}}\"." },
  "notifMsg.teamPromptApproved": { tr: "\"{{name}}\" promptunu ekip kütüphanesinde onayladı.", en: "Approved your prompt \"{{name}}\" in the team library." },
  "notifMsg.teamPromptUnapproved": { tr: "\"{{name}}\" promptunun onayını kaldırdı.", en: "Removed the approval of your prompt \"{{name}}\"." },

  "notifMsg.teamReviewRequested": { tr: "\"{{name}}\" promptu için onay istedi.", en: "Asked for approval of the prompt \"{{name}}\"." },

  // Aşama 3: onaya gönder + sürüm geçmişi

  "team.space.membersNote": {
    tr: "Bu Space'in üyeleri ekipten gelir. Kişi eklemek, çıkarmak ya da rol vermek için ekip sayfasındaki Üyeler sekmesini kullan.",
    en: "This Space's members come from the team. To add, remove or change people, use the Members tab on the team page.",
  },
} as const;
