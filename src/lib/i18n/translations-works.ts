/**
 * "Çalıştı mı?" oyu (docs/history/296-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar (`...worksTranslations`).
 * Oy kuralları sunucudadır; buradaki cümleler yalnız gösterim ve sunucu kodlarının çevirisidir.
 */
export const worksTranslations = {
  "prompt.works.title": { tr: "Çalıştı mı?", en: "Did it work?" },
  "prompt.works.yes": { tr: "Çalıştı", en: "It worked" },
  "prompt.works.no": { tr: "Çalışmadı", en: "It didn't work" },
  "prompt.works.groupAria": { tr: "Bu prompt senin için çalıştı mı?", en: "Did this prompt work for you?" },
  "prompt.works.summary": { tr: "%{{percent}} çalıştı · {{total}} oy", en: "{{percent}}% worked · {{total}} votes" },
  "prompt.works.few": { tr: "Henüz yeterli oy yok ({{total}} oy)", en: "Not enough votes yet ({{total}})" },
  "prompt.works.proven": { tr: "Kanıtlanmış", en: "Proven" },
  "prompt.works.provenHint": { tr: "En az 10 kişi oy verdi ve çalıştı diyenlerin oranı yüksek.", en: "At least 10 people voted and most said it worked." },
  "prompt.works.copyFirst": { tr: "Oy vermek için promptu önce kopyalayıp dene.", en: "Copy and try the prompt first to vote." },
  "prompt.works.undoHint": { tr: "Oyunu geri almak için aynı düğmeye tekrar bas.", en: "Press the same button again to remove your vote." },
  "prompt.works.voteFailed": { tr: "Oy kaydedilemedi. Tekrar dene.", en: "Couldn't save your vote. Try again." },
  "error.selfVote": { tr: "Kendi promptuna oy veremezsin.", en: "You can't vote on your own prompt." },
  "error.copyRequired": { tr: "Oy vermek için promptu önce kopyalamış olmalısın.", en: "You need to copy the prompt before you can vote." },
} as const;
