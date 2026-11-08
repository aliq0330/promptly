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
  "spaces.library.versionShow": { tr: "Tamamını göster", en: "Show all" },
  "spaces.library.versionHide": { tr: "Gizle", en: "Hide" },

  "team.space.membersNote": {
    tr: "Bu Space'in üyeleri ekipten gelir. Kişi eklemek, çıkarmak ya da rol vermek için ekip sayfasındaki Üyeler sekmesini kullan.",
    en: "This Space's members come from the team. To add, remove or change people, use the Members tab on the team page.",
  },
} as const;
