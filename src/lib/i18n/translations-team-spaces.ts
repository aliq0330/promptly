/**
 * Ekip alanı (docs/history/349-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar (`...teamSpacesTranslations`).
 * Kullanıcı içeriği (ekip/proje adı, prompt metni) çevrilmez.
 */
export const teamSpacesTranslations = {
  "spaces.error.teamManaged": {
    tr: "Bu alan ekibe bağlı: kişiler, roller ve görünürlük ekip tarafından yönetilir.",
    en: "This area belongs to a team: people, roles and visibility are managed by the team.",
  },
  "spaces.error.teamSpaceLimit": { tr: "Bir ekipte en çok 50 proje olabilir.", en: "A team can have at most 50 projects." },

  "notifMsg.teamSpaceOpened": { tr: "\"{{name}}\" adlı yeni ekip projesini açtı.", en: "Opened a new team project \"{{name}}\"." },
  "notifMsg.teamPromptApproved": { tr: "\"{{name}}\" promptunu ekip kütüphanesinde onayladı.", en: "Approved your prompt \"{{name}}\" in the team library." },
  "notifMsg.teamPromptUnapproved": { tr: "\"{{name}}\" promptunun onayını kaldırdı.", en: "Removed the approval of your prompt \"{{name}}\"." },

  "notifMsg.teamReviewRequested": { tr: "\"{{name}}\" promptu için onay istedi.", en: "Asked for approval of the prompt \"{{name}}\"." },

  // Aşama 3: onaya gönder + sürüm geçmişi

  "team.space.membersNote": {
    tr: "Bu alanın üyeleri ekipten gelir. Kişi eklemek, çıkarmak ya da rol vermek için projenin kişiler ve roller bölümünü kullan.",
    en: "This area's members come from the team. To add, remove or change people, use the project's people and roles.",
  },
} as const;
