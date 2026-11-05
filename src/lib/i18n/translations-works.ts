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
  // Oydan sonra isteğe bağlı davet + yorum/sonuç rozeti (docs/history/341-*)
  "prompt.works.badgeHint": { tr: "Bu kişinin bu promptla ilgili oyu", en: "This person's vote on this prompt" },
  "prompt.works.inviteNoTitle": { tr: "Neyi beklemiştin, ne çıktı?", en: "What did you expect, and what came out?" },
  "prompt.works.inviteNoHint": {
    tr: "Yaratıcı promptu düzeltirken işine yarar. Yorumun «Çalışmadı» rozetiyle görünür.",
    en: "It helps the creator fix the prompt. Your comment shows with a “Didn't work” badge.",
  },
  "prompt.works.inviteNoPlaceholder": { tr: "Örn. Hangi araçta denedin, çıktı nasıl bozuldu?", en: "E.g. which tool you tried and how the output went wrong" },
  "prompt.works.inviteYesPlaceholder": { tr: "Nasıl kullandın, neyi değiştirdin?", en: "How did you use it, what did you change?" },
  "prompt.works.inviteTextAria": { tr: "Oyunun nedenini yaz", en: "Write why you voted this way" },
  "prompt.works.inviteYesResult": { tr: "Oyun kaydedildi. Nasıl çıktığını göstermek ister misin?", en: "Vote saved. Want to show how it turned out?" },
  "prompt.works.inviteYesComment": { tr: "Oyun kaydedildi. Nasıl kullandığını eklemek ister misin?", en: "Vote saved. Want to add how you used it?" },
  "prompt.works.inviteShareResult": { tr: "Sonucunu paylaş", en: "Share your result" },
  "prompt.works.inviteAddComment": { tr: "Yorum ekle", en: "Add a comment" },
  "prompt.works.inviteSend": { tr: "Yorumu gönder", en: "Post comment" },
  "prompt.works.inviteLater": { tr: "Şimdi değil", en: "Not now" },
  "prompt.works.inviteSent": { tr: "Yorumun eklendi. Oyunla birlikte görünür.", en: "Your comment was added. It shows together with your vote." },
  "result.markWorked": { tr: "Bunu «Çalıştı» olarak da işaretle", en: "Also mark this as “It worked”" },
  "result.markWorkedHint": {
    tr: "Henüz oy vermedin. Oyun sonuç kartında rozet olarak görünür. Kendiliğinden işaretlenmez, sen seçersin.",
    en: "You haven't voted yet. Your vote shows as a badge on the result card. It's never ticked for you — your choice.",
  },
  "result.worksShownYes": { tr: "Oyun: «Çalıştı» — sonucunla birlikte görünür.", en: "Your vote: “It worked” — shown together with your result." },
  "result.worksShownNo": { tr: "Oyun: «Çalışmadı» — sonucunla birlikte görünür.", en: "Your vote: “It didn't work” — shown together with your result." },
  "error.selfVote": { tr: "Kendi promptuna oy veremezsin.", en: "You can't vote on your own prompt." },
  "error.copyRequired": { tr: "Oy vermek için promptu önce kopyalamış olmalısın.", en: "You need to copy the prompt before you can vote." },
} as const;
