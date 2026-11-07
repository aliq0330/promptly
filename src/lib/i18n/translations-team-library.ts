/**
 * Ekip kütüphanesi (docs/history/348-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar (`...teamLibraryTranslations`).
 * Kullanıcı içeriği (prompt başlığı/metni, değişken adı ve değeri, Space adı) çevrilmez.
 */
export const teamLibraryTranslations = {
  "spaces.kind.team_library": { tr: "Ekip kütüphanesi", en: "Team library" },
  "spaces.group.general": { tr: "Genel", en: "General" },
  "spaces.group.marketing": { tr: "Pazarlama", en: "Marketing" },
  "spaces.group.support": { tr: "Destek", en: "Support" },
  "spaces.group.development": { tr: "Geliştirme", en: "Development" },

  "spaces.activity.item_approved": { tr: "\"{{label}}\" promptunu onayladı", en: "approved the \"{{label}}\" prompt" },
  "spaces.activity.item_unapproved": { tr: "\"{{label}}\" promptunun onayını kaldırdı", en: "removed the approval of the \"{{label}}\" prompt" },
  "spaces.activity.untitledPrompt": { tr: "adsız", en: "untitled" },

  "spaces.error.approvalForbidden": { tr: "Onay işaretini yalnızca Space sahibi değiştirebilir.", en: "Only the Space owner can change the approval mark." },
  "spaces.error.variableLimit": { tr: "Bir ekip kütüphanesinde en çok 50 ortak değişken olabilir.", en: "A team library can have at most 50 shared variables." },

  "spaces.library.approved": { tr: "Onaylı", en: "Approved" },
  "spaces.library.pending": { tr: "Onay bekliyor", en: "Awaiting approval" },
  "spaces.library.approvedTitle": { tr: "Space sahibi onayladı: {{time}}", en: "Approved by the Space owner: {{time}}" },
  "spaces.library.approve": { tr: "Onayla", en: "Approve" },
  "spaces.library.unapprove": { tr: "Onayı kaldır", en: "Remove approval" },
  "spaces.library.approvalHint": { tr: "Başlık ya da metin değişirse onay kendiliğinden kalkar.", en: "If the title or text changes, the approval is removed automatically." },
  "spaces.library.statusFilter": { tr: "Onay durumuna göre süz", en: "Filter by approval" },
  "spaces.library.statusAll": { tr: "Tümü", en: "All" },
  "spaces.library.statusApproved": { tr: "Onaylı", en: "Approved" },
  "spaces.library.statusPending": { tr: "Onay bekleyen", en: "Awaiting approval" },
  "spaces.library.emptyApproved": { tr: "Onaylı prompt yok", en: "No approved prompts" },
  "spaces.library.emptyApprovedHelp": { tr: "Sahip, bir taslağı \"Onayla\" ile işaretleyince burada görünür.", en: "Prompts show up here once the owner marks a draft with \"Approve\"." },
  "spaces.library.publicWarning": {
    tr: "Bu ekip kütüphanesini Space'i görebilen herkese açıyorsun: promptlar (onaylı olsun olmasın) onlara da görünür. Ekip değişkenlerinin değerleri yine yalnız üyelere görünür.",
    en: "You're opening this team library to anyone who can see the Space: its prompts (approved or not) become visible to them. The values of the team variables stay visible to members only.",
  },


  "spaces.library.fillCopy": { tr: "Doldur ve kopyala", en: "Fill & copy" },
  "spaces.library.fillTitle": { tr: "Doldur ve kopyala", en: "Fill & copy" },
  "spaces.library.fillIntro": { tr: "Ekibin ortak değerleri hazır geldi; kalanları sen doldur.", en: "The team's shared values are filled in; fill in the rest." },
  "spaces.library.fillNoVariables": { tr: "Bu promptta değişken yok; olduğu gibi kopyalanır.", en: "This prompt has no variables; it is copied as is." },
  "spaces.library.fromTeam": { tr: "Ekip değeri", en: "Team value" },
  "spaces.library.fillPlaceholder": { tr: "Bir değer yaz", en: "Enter a value" },
  "spaces.library.fillMissing": { tr: "Boş bıraktığın değişkenler metinde {{names}} olarak kalır.", en: "Variables you leave empty stay as {{names}} in the text." },
  "spaces.library.fillPreview": { tr: "Önizleme", en: "Preview" },

  "spaces.library.vars.title": { tr: "Ekip değişkenleri", en: "Team variables" },
  "spaces.library.vars.count": { tr: "{{count}}/{{max}}", en: "{{count}}/{{max}}" },
  "spaces.library.vars.intro": {
    tr: "Marka adı, ton gibi ekibin ortak değerleri. Prompt metnindeki {marka_adi} gibi değişkenler bunlarla dolar.",
    en: "Values the whole team shares, like brand name or tone. Variables such as {marka_adi} in a prompt are filled from these.",
  },
  "spaces.library.vars.secretWarning": {
    tr: "Parola ya da anahtar gibi gizli bilgi yazma: değerleri Space'in tüm üyeleri görür.",
    en: "Don't enter secrets such as passwords or keys: every member of the Space can see the values.",
  },
  "spaces.library.vars.empty": { tr: "Henüz ortak değişken yok.", en: "No shared variables yet." },
  "spaces.library.vars.emptyEditor": { tr: "İlk değişkeni ekle; promptlarda aynı adı {ad} olarak kullan.", en: "Add the first variable; use the same name as {name} in your prompts." },
  "spaces.library.vars.name": { tr: "Değişken adı", en: "Variable name" },
  "spaces.library.vars.namePlaceholder": { tr: "marka_adi", en: "brand_name" },
  "spaces.library.vars.value": { tr: "Değer", en: "Value" },
  "spaces.library.vars.add": { tr: "Ekle", en: "Add" },
  "spaces.library.vars.edit": { tr: "{{name}} değişkenini düzenle", en: "Edit the {{name}} variable" },
  "spaces.library.vars.delete": { tr: "{{name}} değişkenini sil", en: "Delete the {{name}} variable" },
  "spaces.library.vars.errName": { tr: "Geçersiz ad: en çok 40 karakter, boşluk ve süslü parantez olmadan.", en: "Invalid name: up to 40 characters, no spaces or curly braces." },
  "spaces.library.vars.errValue": { tr: "Değer en çok 500 karakter olabilir.", en: "A value can be at most 500 characters." },
  "spaces.library.vars.errDuplicate": { tr: "Bu adda bir değişken zaten var.", en: "A variable with this name already exists." },
  "spaces.library.vars.loadError": { tr: "Ekip değişkenleri yüklenemedi.", en: "Couldn't load the team variables." },
} as const;
