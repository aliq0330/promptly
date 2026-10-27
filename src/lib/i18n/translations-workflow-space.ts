/**
 * Workflow ↔ Space bağlantısının TR/EN metinleri (docs/history/261-*). `translations.ts` bu nesneyi açar (`...workflowSpaceTranslations`).
 * Kullanıcı içeriği (workflow/Space/adım adı, değişken etiketi) çevrilmez.
 */
export const workflowSpaceTranslations = {
  // ---- Akış diyagramı (pano çerçevesi + önizleme) ----
  "wfSpace.flow.input": { tr: "Girdi", en: "Input" },
  "wfSpace.flow.output": { tr: "Çıktı", en: "Output" },
  "wfSpace.flow.fromStep": { tr: "↩ Adım {{n}}", en: "↩ Step {{n}}" },
  "wfSpace.flow.moreChips": { tr: "+{{count}}", en: "+{{count}}" },
  "wfSpace.flow.untitledStep": { tr: "Adsız adım", en: "Untitled step" },
  "wfSpace.flow.noContent": { tr: "Bağlı içerik yok", en: "No linked content" },
  "wfSpace.flow.relatesTo": { tr: "Adım {{n}} ({{title}}) · {{type}}", en: "Step {{n}} ({{title}}) · {{type}}" },

  // ---- Katmanlar (hem formda hem aktarma penceresinde) ----
  "wfSpace.layer.io": { tr: "Girdi ve çıktılar", en: "Inputs and outputs" },
  "wfSpace.layer.ioHint": { tr: "Her adımın girdi değişkenleri ve çıktıları.", en: "Each step's input variables and outputs." },
  "wfSpace.layer.links": { tr: "Bağlı içerikler", en: "Linked content" },
  "wfSpace.layer.linksHint": { tr: "Adımlarda kullanılan promptlar.", en: "The prompts used in the steps." },
  "wfSpace.layer.relations": { tr: "İlişkiler", en: "Relations" },
  "wfSpace.layer.relationsHint": { tr: "Bu içerikler arasındaki Benzer / Alternatif / Esinlenme bağları.", en: "Similar / Alternative / Inspired-by links between those contents." },

  // ---- Space içinden: "Workflow aktar" ----
  "wfSpace.import.menu": { tr: "Workflow aktar", en: "Import workflow" },
  "wfSpace.import.title": { tr: "Workflow aktar", en: "Import workflow" },
  "wfSpace.import.hint": {
    tr: "Panoya akış diyagramı olarak getirilecek bir workflow seç. Workflow kopyalanmaz: sonradan değişirse pano da güncellenir.",
    en: "Pick a workflow to bring onto the board as a flow diagram. It is not copied: if the workflow changes later, the board follows.",
  },
  "wfSpace.import.onlyOwn": { tr: "Burada yalnız sana ait, yayınlanmış workflow'lar listelenir.", en: "Only your own published workflows are listed here." },
  "wfSpace.import.emptyTitle": { tr: "Yayınlanmış workflow'un yok", en: "You have no published workflow" },
  "wfSpace.import.emptyHint": { tr: "Önce bir workflow oluştur ve yayınla, sonra buradan panoya getir.", en: "Create and publish a workflow first, then bring it onto the board from here." },
  "wfSpace.import.create": { tr: "Workflow oluştur", en: "Create workflow" },
  "wfSpace.import.onBoard": { tr: "Panoda", en: "On board" },
  "wfSpace.import.preview": { tr: "Önizleme", en: "Preview" },
  "wfSpace.import.layers": { tr: "Panoda neler görünsün?", en: "What should the board show?" },
  "wfSpace.import.alreadyOnBoard": { tr: "Bu workflow zaten panoda. Çerçeveyi panodan düzenleyebilirsin.", en: "This workflow is already on the board. You can adjust its frame there." },
  "wfSpace.import.privateWarn": {
    tr: "Bu workflow \"Sadece ben\". Bu Space'i açan başkaları çerçeveyi \"erişilemiyor\" olarak görür. İstersen önce workflow'u herkese açık yap.",
    en: "This workflow is \"Only me\". Other people who open this Space will see the frame as \"unavailable\". You may want to make the workflow public first.",
  },
  "wfSpace.import.submit": { tr: "Panoya aktar", en: "Add to board" },
  "wfSpace.import.loadFailed": { tr: "Workflow yüklenemedi. Biraz sonra tekrar dene.", en: "Couldn't load the workflow. Try again in a moment." },

  // ---- Workflow formu: "Space'te göster" ----
  "wfSpace.field.label": { tr: "Space'te göster", en: "Show in a Space" },
  "wfSpace.field.hint": { tr: "Workflow'u bir Space panosunda akış diyagramı olarak göster.", en: "Show this workflow on a Space board as a flow diagram." },
  "wfSpace.field.on": { tr: "Space'te gösterilecek", en: "Will be shown in a Space" },
  "wfSpace.field.off": { tr: "Kapalı", en: "Off" },
  "wfSpace.field.switchHint": { tr: "Workflow tek kaynak kalır; pano adımlarını ondan okur.", en: "The workflow stays the single source; the board reads its steps from it." },
  "wfSpace.field.pick": { tr: "Space seç", en: "Choose a Space" },
  "wfSpace.field.newSpace": { tr: "Yeni Space oluştur", en: "Create a new Space" },
  "wfSpace.field.newSpaceHint": { tr: "Workflow'un adıyla, özel olarak başlar.", en: "Starts private, named after the workflow." },
  "wfSpace.field.loadFailed": { tr: "Space'lerin yüklenemedi.", en: "Couldn't load your Spaces." },
  "wfSpace.field.notePublic": {
    tr: "Space herkese açık: workflow sayfasında panonun önizlemesi herkese görünür.",
    en: "The Space is public: the board preview shows on the workflow page for everyone.",
  },
  "wfSpace.field.noteSpacePrivate": {
    tr: "Bu Space herkese açık değil: workflow sayfasında önizleme yalnız Space üyelerine görünür. Space'i herkese açık yapabilirsin.",
    en: "This Space isn't public: the preview on the workflow page is only visible to Space members. You can make the Space public.",
  },
  "wfSpace.field.noteWorkflowPrivate": {
    tr: "Workflow \"Sadece ben\" olduğu için başkaları panoda çerçeveyi \"erişilemiyor\" olarak görür.",
    en: "Because the workflow is \"Only me\", other people see the frame as \"unavailable\" on the board.",
  },
  "wfSpace.field.draftHint": { tr: "Taslakta kaydedilen workflow Space'e eklenmez; bağ yayınlayınca kurulur.", en: "A workflow saved as a draft isn't added to the Space; the link is made when you publish." },
  "wfSpace.field.applyFailed": {
    tr: "Workflow kaydedildi ama Space'e eklenemedi. Tekrar \"Paylaş\"a basarak yeniden deneyebilirsin.",
    en: "The workflow was saved but couldn't be added to the Space. Press \"Share\" again to retry.",
  },

  // ---- Workflow sayfası: Space panosu önizlemesi ----
  "wfSpace.preview.heading": { tr: "Space panosu", en: "Space board" },
  "wfSpace.preview.boardAria": { tr: "Space panosunun salt okunur önizlemesi", en: "Read-only preview of the Space board" },
  "wfSpace.preview.spacesAria": { tr: "Bu workflow'un bağlı olduğu Space'ler", en: "Spaces this workflow is linked to" },
  "wfSpace.preview.public": { tr: "Herkese açık Space", en: "Public Space" },
  "wfSpace.preview.private": { tr: "Yalnız sen ve üyeler görür", en: "Only you and members can see this" },
  "wfSpace.preview.readOnly": { tr: "Salt okunur önizleme", en: "Read-only preview" },
  "wfSpace.preview.open": { tr: "Panoyu aç", en: "Open board" },
  "wfSpace.preview.failed": { tr: "Pano yüklenemedi.", en: "Couldn't load the board." },
} as const;
