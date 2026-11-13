import type { PromptComment } from "@/types";

/** Yorum sıralaması (docs/history/385-*): üst düzey yorumlar için; yanıtlar her sıralamada eskiden yeniye okunur. */
export type CommentSort = "newest" | "liked" | "oldest";

export const COMMENT_SORTS: readonly CommentSort[] = ["newest", "liked", "oldest"];
export const DEFAULT_COMMENT_SORT: CommentSort = "newest";

/** Eskiden yeniye (yanıtlar ve sunucunun "en eski" sırası). */
export const byCreatedAsc = (a: PromptComment, b: PromptComment) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/**
 * Üst düzey yorum karşılaştırıcısı: sabitlenen yorum HER sıralamada başta; sonra seçilen sıra.
 * Sunucudaki `order by pinned_at desc nulls last, …` ile aynı kuralı izler (sayfalar birleşince sıra bozulmasın).
 */
export function compareTopLevel(sort: CommentSort): (a: PromptComment, b: PromptComment) => number {
  return (a, b) => {
    const pinned = (b.pinnedAt ? 1 : 0) - (a.pinnedAt ? 1 : 0);
    if (pinned !== 0) return pinned;
    if (sort === "oldest") return byCreatedAsc(a, b);
    if (sort === "liked") {
      const likes = b.likeCount - a.likeCount;
      if (likes !== 0) return likes;
    }
    return byCreatedAsc(b, a);
  };
}
