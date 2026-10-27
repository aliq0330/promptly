import type { NewSpaceConnection, NewSpaceItem, SpaceConnection, SpaceItem } from "./supabase/spaces.ts";

/**
 * Pano çoğaltma / kopyala-yapıştır (docs/history/263-*): seçilen nesnelerin kopyasını ve kendi aralarındaki okları üretir. Saf hesaptır.
 * Yalnız not ve taslak prompt çoğaltılır: görsel (aynı dosya), yayınlanmış prompt, içerik başvurusu ve palet Space'te TEK olabilir
 * (veritabanında tekil dizin) — bunlar atlanır ve sayısı bildirilir. Workflow'dan gelen nesnelerin kaynak işareti kopyaya geçmez
 * (kopya "Güncelle"nin yönettiği nesne olmaz); kopya gruba girmez, en üste konur.
 */
export function isDuplicable(item: SpaceItem): boolean {
  return item.kind === "note" || (item.kind === "prompt" && item.isDraft);
}

export interface DuplicatePlan {
  items: NewSpaceItem[];
  connections: NewSpaceConnection[];
  skipped: number;
}

export function planDuplicate(
  items: readonly SpaceItem[],
  connections: readonly SpaceConnection[],
  ids: readonly string[],
  options: { offset: { x: number; y: number }; z: number; makeId: () => string },
): DuplicatePlan {
  const chosen = items.filter((item) => ids.includes(item.id));
  const copyable = chosen.filter(isDuplicable);
  const idMap = new Map(copyable.map((item) => [item.id, options.makeId()]));
  const out: NewSpaceItem[] = copyable
    .sort((a, b) => a.z - b.z)
    .map((item, index) => ({
      id: idMap.get(item.id)!,
      spaceId: item.spaceId,
      kind: item.kind,
      x: item.x + options.offset.x,
      y: item.y + options.offset.y,
      w: item.w,
      h: item.h,
      z: options.z + index + 1,
      groupId: null,
      promptId: item.promptId,
      isDraft: item.isDraft,
      sourcePromptId: item.sourcePromptId,
      title: item.title,
      body: item.body,
      note: item.note,
      color: item.color,
      attachedItemId: item.attachedItemId && idMap.has(item.attachedItemId) ? idMap.get(item.attachedItemId)! : null,
      isPrivate: item.isPrivate,
    }));
  const arrows: NewSpaceConnection[] = connections
    .filter((c) => idMap.has(c.fromItemId) && idMap.has(c.toItemId))
    .map((c) => ({
      id: options.makeId(),
      spaceId: c.spaceId,
      fromItemId: idMap.get(c.fromItemId)!,
      toItemId: idMap.get(c.toItemId)!,
      label: c.label,
      lineStyle: c.lineStyle,
      arrow: c.arrow,
      route: c.route,
      color: c.color,
    }));
  return { items: out, connections: arrows, skipped: chosen.length - copyable.length };
}
