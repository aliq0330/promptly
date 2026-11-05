/**
 * Pure rules behind the collection picker. Saving and collections are separate
 * (docs/history/336-*): a work is "saved" when it is in the viewer's system
 * collection ("Kaydedilenlerin tümü"); collections are an extra layer on top
 * and leaving them never unsaves anything. These helpers hold the parts of the
 * picker's rules that don't need a network.
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

/**
 * Whether a commit flips the bookmark. Only an ADD can save an unsaved work (the database saves it along with the
 * collection); removing from collections never changes the saved state. `null` = no change.
 */
export function savedAfterCommit(wasSaved: boolean, appliedAddCount: number): "saved" | null {
  return !wasSaved && appliedAddCount > 0 ? "saved" : null;
}
