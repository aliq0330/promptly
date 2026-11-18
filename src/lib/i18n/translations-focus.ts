/**
 * Odak'ın dikey akışı + prompt kartı (docs/history/436-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar (`...focusTranslations`).
 * Eski Odak metinleri (`focusFeed.*` çekirdeği) `translations.ts`'te kalır.
 */
export const focusTranslations = {
  // ---- Sahne (gönderi yüzü): şerit, sonuçlar, görselsiz sahneler ----
  "focusFeed.workedFor": { tr: "{{count}} kişide çalıştı", en: "Worked for {{count}} people" },
  "focusFeed.variableCount": { tr: "{{count}} değişken", en: "{{count}} variables" },
  "focusFeed.variables": { tr: "Değişkenler", en: "Variables" },
  "focusFeed.promptLabel": { tr: "Prompt", en: "Prompt" },
  "focusFeed.varEmpty": { tr: "boş", en: "empty" },
  "focusFeed.readyToCopy": { tr: "Kopyalamaya hazır · {{count}} karakter", en: "Ready to copy · {{count}} characters" },
  "focusFeed.repliesCount": { tr: "{{count}} yanıt", en: "{{count}} replies" },
  "focusFeed.workflowStrip": { tr: "{{count}} adım · kendi anahtarınla otomatik de çalışır", en: "{{count}} steps · also runs automatically with your own key" },
  "focusFeed.openSkill": { tr: "Skill'i aç", en: "Open Skill" },
  "focusFeed.openCard": { tr: "Prompt kartını aç", en: "Open the prompt card" },
  "focusFeed.stepFallback": { tr: "Adım {{n}}", en: "Step {{n}}" },
  "focusFeed.resultOf": { tr: "{{current}}/{{total}} sonuç", en: "Result {{current}}/{{total}}" },
  "focusFeed.prevResult": { tr: "Önceki sonuç", en: "Previous result" },
  "focusFeed.nextResult": { tr: "Sonraki sonuç", en: "Next result" },
  // ---- Değişken doldurma (sahnede) ----
  "focusFeed.tapVariable": { tr: "Değişkene dokun, burada doldur.", en: "Tap a variable to fill it right here." },
  "focusFeed.fieldsProgress": { tr: "{{filled}} / {{total}} alan", en: "{{filled}} / {{total}} fields" },
  "focusFeed.fillTitle": { tr: "Değişkeni doldur: {{name}}", en: "Fill variable: {{name}}" },
  "focusFeed.fillVariable": { tr: "Değişken", en: "Variable" },
  "focusFeed.fillDone": { tr: "Tamam", en: "Done" },
  "focusFeed.fillNext": { tr: "Sonraki alan: {{name}}", en: "Next field: {{name}}" },
  // ---- Masaüstü klavye ipuçları ----
  "focusFeed.keysPosts": { tr: "↑ ↓ gönderi", en: "↑ ↓ posts" },
  "focusFeed.keysResults": { tr: "← → sonuç", en: "← → results" },
  "focusFeed.keysCopy": { tr: "C kopyala", en: "C copy" },
  "focusFeed.keysPanel": { tr: "P panel", en: "P panel" },
  // ---- Kart (telefonda alt sayfa, masaüstünde yan panel) ----
  "focusSheet.tabsAria": { tr: "Kart bölümleri", en: "Card sections" },
  "focusSheet.tabResults": { tr: "Sonuçlar", en: "Results" },
  "focusSheet.tabVersions": { tr: "Sürümler", en: "Versions" },
  "focusSheet.tabParams": { tr: "Parametreler", en: "Parameters" },
  "focusSheet.tool": { tr: "Araç", en: "Tool" },
  "focusSheet.category": { tr: "Kategori", en: "Category" },
  "focusSheet.provenPercent": { tr: "Kanıtlanmış · %{{percent}}", en: "Proven · {{percent}}%" },
  "focusSheet.fillAndCopy": { tr: "Doldurup kopyala", en: "Fill and copy" },
  "focusSheet.tryInStudio": { tr: "Studio'da dene", en: "Try in Studio" },
  "focusSheet.hidePanel": { tr: "Paneli gizle", en: "Hide panel" },
  "focusSheet.showPanel": { tr: "Paneli göster", en: "Show panel" },
} as const;
