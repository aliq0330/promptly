import type { TranslationKey } from "@/lib/i18n/translations";

/**
 * Tepkiler (docs/history/265-*): beğeni artık altı tepkiden biridir. Sıra seçicideki sıradır; `love` eski "beğeni"nin karşılığıdır
 * (`prompt_likes.reaction` varsayılanı), bu yüzden eski satırlar ve `like_count` (TOPLAM tepki) aynen geçerlidir.
 * Anahtarlar veritabanındaki CHECK ile aynıdır (`prompt_likes_reaction_check`) — yenisi eklenirse ikisi birlikte güncellenir.
 */
export const REACTION_KEYS = ["love", "fire", "wow", "clap", "haha", "idea"] as const;
export type ReactionKey = (typeof REACTION_KEYS)[number];
export const DEFAULT_REACTION: ReactionKey = "love";

export const REACTION_LABEL: Record<ReactionKey, TranslationKey> = {
  love: "reaction.love",
  fire: "reaction.fire",
  wow: "reaction.wow",
  clap: "reaction.clap",
  haha: "reaction.haha",
  idea: "reaction.idea",
};

export function isReactionKey(value: unknown): value is ReactionKey {
  return typeof value === "string" && (REACTION_KEYS as readonly string[]).includes(value);
}

export type ReactionCounts = Record<ReactionKey, number>;

export function emptyCounts(): ReactionCounts {
  return { love: 0, fire: 0, wow: 0, clap: 0, haha: 0, idea: 0 };
}

/** `reaction_stats` satırlarından (target başına en çok 6) sayılar; bilinmeyen anahtar yok sayılır. */
export function countsFromRows(rows: { reaction: string; n: number }[]): ReactionCounts {
  const counts = emptyCounts();
  for (const row of rows) if (isReactionKey(row.reaction)) counts[row.reaction] += Math.max(0, row.n);
  return counts;
}

export function totalOf(counts: ReactionCounts): number {
  return REACTION_KEYS.reduce((sum, key) => sum + counts[key], 0);
}

/** En çok verilen `limit` tepki (sıfır olanlar yok); eşitlikte seçici sırası. */
export function topReactions(counts: ReactionCounts, limit = 3): ReactionKey[] {
  return REACTION_KEYS.filter((key) => counts[key] > 0)
    .sort((a, b) => counts[b] - counts[a] || REACTION_KEYS.indexOf(a) - REACTION_KEYS.indexOf(b))
    .slice(0, limit);
}

/** İyimser güncelleme: `from` tepkisinden bir azalt, `to` tepkisine bir ekle (`null` = yok). Girdiyi değiştirmez. */
export function shiftCounts(counts: ReactionCounts, from: ReactionKey | null, to: ReactionKey | null): ReactionCounts {
  const next = { ...counts };
  if (from) next[from] = Math.max(0, next[from] - 1);
  if (to) next[to] += 1;
  return next;
}

/** Çağıranın takip ettiği ve bu içeriğe tepki veren biri (`reaction_friends` RPC'si). */
export interface ReactionFriend {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  reaction: ReactionKey;
}

/**
 * "Sen, Zeynep ve 128 kişi tepki verdi" cümlesinin parçaları. `total` benim tepkimi de sayar; adlar önce ben, sonra takip ettiklerim
 * (en çok 2 kişi — ben varsa 1 arkadaş), `rest` adı geçmeyen herkestir. Biçimlendirme (dil, "ve") bileşendedir.
 */
export function summaryParts(total: number, mine: boolean, friends: ReactionFriend[]): { me: boolean; friendNames: string[]; rest: number } {
  const friendNames = friends.slice(0, mine ? 1 : 2).map((friend) => friend.displayName.trim().split(/\s+/)[0] || friend.username);
  const named = (mine ? 1 : 0) + friendNames.length;
  return { me: mine, friendNames, rest: Math.max(0, total - named) };
}
