/**
 * Kopyalama penceresinin ön izlemesi (docs/history/462-*): hangi öğe ve yorum kopyalanır, hangisi kopyalanmaz. Karar sunucudadır
 * (`space_copy_items` / `space_copy_pin_comments`); bu saf işlev yalnız kullanıcıya kopyalamadan ÖNCE sayıları göstermek içindir ve aynı kuralları izler
 * (testi `space-copy-plan.test.ts`).
 */
export type CopyDestKind = "newSpace" | "space" | "teamNew" | "teamFile";

export interface PlanItem {
  id: string;
  kind: string;
  isPrivate: boolean;
}

export interface PlanPin {
  id: string;
  parentId: string | null;
  itemId: string | null;
}

export interface CopyPlan {
  total: number;
  copyable: number;
  privateNotes: number;
  drawings: number;
  commentsAllowed: boolean;
  commentRoots: number;
  commentReplies: number;
  commentsSkippedPrivate: number;
}

const DRAWING_KINDS = new Set(["frame", "text", "shape"]);

/** Dosyanın ASIL alanı pano değildir: yorum ve çizim yalnız panoya (yeni Space, var olan Space, yeni dosyanın panosu) gider. */
export function commentsAllowedFor(dest: CopyDestKind): boolean {
  return dest !== "teamFile";
}

export function planCopy(items: PlanItem[], pins: PlanPin[], selection: string[] | null, dest: CopyDestKind): CopyPlan {
  const picked = selection && selection.length > 0 ? new Set(selection) : null;
  const scope = picked ? items.filter((item) => picked.has(item.id)) : items;
  const privateNotes = scope.filter((item) => item.isPrivate).length;
  const drawings = dest === "teamFile" ? scope.filter((item) => !item.isPrivate && DRAWING_KINDS.has(item.kind)).length : 0;
  const allowed = commentsAllowedFor(dest);
  const byId = new Map(items.map((item) => [item.id, item] as const));
  let roots = 0;
  let replies = 0;
  let skippedPrivate = 0;
  if (allowed) {
    const counted = new Set<string>();
    const repliesOf = new Map<string, number>();
    for (const pin of pins) if (pin.parentId) repliesOf.set(pin.parentId, (repliesOf.get(pin.parentId) ?? 0) + 1);
    for (const pin of pins) {
      if (pin.parentId) continue;
      const item = pin.itemId ? byId.get(pin.itemId) : null;
      if (pin.itemId && !item) continue; // çağıranın göremediği öğe: yorum da görünmez
      if (item?.isPrivate) {
        if (!picked || picked.has(item.id)) skippedPrivate += 1 + (repliesOf.get(pin.id) ?? 0);
        continue;
      }
      if (picked && (!item || !picked.has(item.id))) continue; // seçimle kopyalamada yalnız seçilen öğelerin yorumları
      counted.add(pin.id);
      roots += 1;
      replies += repliesOf.get(pin.id) ?? 0;
    }
  }
  return {
    total: scope.length,
    copyable: scope.length - privateNotes - drawings,
    privateNotes,
    drawings,
    commentsAllowed: allowed,
    commentRoots: roots,
    commentReplies: replies,
    commentsSkippedPrivate: skippedPrivate,
  };
}
