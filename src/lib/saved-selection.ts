/**
 * Pure rules behind "Kaydedilenler" and the collection picker. A work counts
 * as saved while it sits in at least one of the viewer's own collections;
 * these helpers hold the parts of that rule that don't need a network.
 */

/** Which collections to add the work to / remove it from so that `initial` becomes `selected`. */
export function diffMembership(
  initial: ReadonlySet<string>,
  selected: ReadonlySet<string>,
): { add: string[]; remove: string[] } {
  return {
    add: [...selected].filter((id) => !initial.has(id)),
    remove: [...initial].filter((id) => !selected.has(id)),
  };
}

/** The membership after a commit: `initial`, plus the adds that went through, minus the removals that went through. */
export function applyMembershipResult(
  initial: ReadonlySet<string>,
  appliedAdd: readonly string[],
  appliedRemove: readonly string[],
): Set<string> {
  const next = new Set(initial);
  for (const id of appliedAdd) next.add(id);
  for (const id of appliedRemove) next.delete(id);
  return next;
}

/** Whether the bookmark flips: saved = member of at least one collection. `null` = no change. */
export function savedTransition(wasSaved: boolean, memberCount: number): "saved" | "unsaved" | null {
  const isSaved = memberCount > 0;
  if (isSaved === wasSaved) return null;
  return isSaved ? "saved" : "unsaved";
}

/**
 * One entry per distinct work, keeping the first occurrence. The input is
 * newest-membership-first, so a work in several collections shows up once, at
 * the position of its most recent save.
 */
export function dedupeSavedEntries<T extends { type: string; data: { id: string } }>(entries: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const entry of entries) {
    const key = `${entry.type}:${entry.data.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}
