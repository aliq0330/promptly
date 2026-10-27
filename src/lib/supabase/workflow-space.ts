import { boundsOf, placeMany, topZ } from "@/lib/space-board";
import { computeFlowLayout, flowItemSize } from "@/lib/workflow-flow-layout";
import { addSpaceItems, createSpace, deleteSpaceItems, fetchSpaceItems, updateSpaceItem } from "./spaces";
import { fetchWorkflowFlow, invalidateWorkflowFlow } from "./workflow-flow";

/**
 * Workflow formundaki "Space'te göster" kararını uygular (docs/history/261-*). Bağ = Space'teki `space_items` satırı (kopya değil); bu
 * dosya yalnız o satırı ekler / günceller / siler. Space'te yer açmak panonun kendi yerleştiricisini (`placeMany`) kullanır.
 */

export interface WorkflowSpaceChoice {
  enabled: boolean;
  /** Var olan Space'in kimliği, ya da `"new"` (workflow adıyla özel yeni bir Space). */
  spaceId: string | "new" | null;
  showIo: boolean;
  showLinks: boolean;
  showRelations: boolean;
  /** Form açıldığında bu workflow'un seçili Space'te zaten olan öğesi (varsa güncellenir / seçim değişirse kaldırılır). */
  existing: { itemId: string; spaceId: string } | null;
}

export const EMPTY_SPACE_CHOICE: WorkflowSpaceChoice = {
  enabled: false,
  spaceId: null,
  showIo: true,
  showLinks: true,
  showRelations: true,
  existing: null,
};

/** Kaydedildikten SONRA çağrılır (workflow kimliği artık var). Dönen değer: workflow'un şimdi bağlı olduğu öğe (ya da bağ yok). */
export async function applyWorkflowSpaceChoice({
  workflowId,
  title,
  userId,
  choice,
}: {
  workflowId: string;
  title: string;
  userId: string;
  choice: WorkflowSpaceChoice;
}): Promise<{ itemId: string; spaceId: string } | null> {
  const { existing } = choice;
  const targetSpace = choice.enabled ? choice.spaceId : null;

  // Aynı Space'te zaten varsa yalnız katmanlar güncellenir.
  if (existing && targetSpace === existing.spaceId) {
    await updateSpaceItem(existing.itemId, { flowShowIo: choice.showIo, flowShowLinks: choice.showLinks, flowShowRelations: choice.showRelations });
    invalidateWorkflowFlow(workflowId);
    return existing;
  }

  // Yeni öğe ÖNCE eklenir, eski bağ sonra kalkar: ekleme başarısız olursa eski bağ yerinde kalır.
  let linked: { itemId: string; spaceId: string } | null = null;
  if (targetSpace) {
    const spaceId = targetSpace === "new" ? await createSpace({ title: title.trim().slice(0, 80) || "Workflow", description: "", kind: "free", visibility: "private", groups: [] }) : targetSpace;
    invalidateWorkflowFlow(workflowId);
    const [items, flow] = await Promise.all([fetchSpaceItems(spaceId), fetchWorkflowFlow(workflowId)]);
    // Workflow bu Space'in panosunda zaten varsa (panodan aktarılmış) ikinci bir öğe açılmaz; yalnız katmanlar güncellenir.
    const already = items.find((item) => item.kind === "content" && item.contentType === "workflow" && item.contentId === workflowId);
    if (already) {
      await updateSpaceItem(already.id, { flowShowIo: choice.showIo, flowShowLinks: choice.showLinks, flowShowRelations: choice.showRelations });
      if (existing && existing.itemId !== already.id) await deleteSpaceItems([existing.itemId]);
      return { itemId: already.id, spaceId };
    }
    const size = flow ? flowItemSize(computeFlowLayout(flow.steps, choice, flow.relations)) : { w: 900, h: 420 };
    const bounds = boundsOf(items);
    const spot = placeMany(items, [size], bounds ? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 } : { x: 0, y: 0 })[0];
    const [created] = await addSpaceItems(
      [
        {
          spaceId,
          kind: "content",
          contentType: "workflow",
          contentId: workflowId,
          title: "",
          ...spot,
          ...size,
          z: topZ(items) + 1,
          flowShowIo: choice.showIo,
          flowShowLinks: choice.showLinks,
          flowShowRelations: choice.showRelations,
        },
      ],
      userId,
    );
    linked = { itemId: created.id, spaceId };
  }
  // Kapatıldı ya da başka Space seçildi: eski öğe silinir (workflow'a dokunulmaz).
  if (existing) await deleteSpaceItems([existing.itemId]);
  return linked;
}
