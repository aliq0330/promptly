/**
 * Yorum sıralaması, sabit yorum ve "yeni yorum" hapı (docs/history/385-*) — TR/EN metinleri. `translations.ts` bu nesneyi açar
 * (`...commentOrderTranslations`).
 */
export const commentOrderTranslations = {
  "comments.sort.label": { tr: "Yorumları sırala", en: "Sort comments" },
  "comments.sort.newest": { tr: "En yeni", en: "Newest" },
  "comments.sort.liked": { tr: "En beğenilen", en: "Top" },
  "comments.sort.oldest": { tr: "En eski", en: "Oldest" },
  "comments.sort.newestHint": { tr: "Son yazılan yorum en üstte", en: "Latest comment first" },
  "comments.sort.likedHint": { tr: "En çok tepki alan önce", en: "Most reactions first" },
  "comments.sort.oldestHint": { tr: "Tartışma yazıldığı sırayla", en: "In the order it was written" },
  "comments.sort.repliesNote": { tr: "Yanıtlar her sıralamada eskiden yeniye okunur.", en: "Replies always read oldest to newest." },
  "comments.newOne": { tr: "1 yeni yorum · göster", en: "Show 1 new comment" },
  "comments.newMany": { tr: "{{count}} yeni yorum · göster", en: "Show {{count}} new comments" },
  "comments.pinnedLabel": { tr: "Sabitlenmiş yorum", en: "Pinned comment" },
  "comments.pin": { tr: "Sabitle", en: "Pin" },
  "comments.unpin": { tr: "Sabitlemeyi kaldır", en: "Unpin" },
  "comments.pinFailed": { tr: "Yorum sabitlenemedi.", en: "Couldn't pin the comment." },
  "comments.authorBadge": { tr: "Yazar", en: "Author" },
  "error.pinNotAllowed": { tr: "Yorumu yalnızca içeriğin sahibi sabitleyebilir.", en: "Only the owner of the content can pin a comment." },
  "error.pinTopLevelOnly": { tr: "Yalnızca ana yorumlar sabitlenebilir.", en: "Only top-level comments can be pinned." },
} as const;
