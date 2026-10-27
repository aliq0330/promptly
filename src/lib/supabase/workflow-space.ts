import { createSpace, deleteSpaceItems, fetchSpaceItems } from "./spaces";
import { importOrSyncDirect } from "./workflow-board";
import type { PlanOptions } from "@/lib/workflow-board-plan";

/**
 * Workflow formundaki "Space'te göster" kararını uygular (docs/history/262-*). Workflow Space'e AYRI NESNELER olarak aktarılır (adım
 * kartları, prompt'lar, görseller, oklar); zaten aktarılmışsa farklar güncellenir. Kapatılırsa ya da başka Space seçilirse eski Space'teki
 * workflow nesneleri kaldırılır (workflow'a dokunulmaz). Eski tek parça çerçeve öğesi (docs/history/261-*) güncellenirken nesnelere çevrilir.
 */

export interface WorkflowSpaceChoice {
  enabled: boolean;
  /** Var olan Space'in kimliği, ya da `"new"` (workflow adıyla özel yeni bir Space). */
  spaceId: string | "new" | null;
  /** Girdi / çıktılar adım kartlarında görünsün. */
  showIo: boolean;
  /** Adımlarda kullanılan promptlar ayrı nesneler olarak gelsin. */
  showLinks: boolean;
  /** Prompt görselleri ayrı nesneler olarak gelsin (promptlar açıkken). */
  showImages: boolean;
  /** Promptlar arasındaki ilişkiler kesikli okla çizilsin (promptlar açıkken). */
  showRelations: boolean;
  /** Form açıldığında bu workflow'un Space'teki mevcut bağı: `objects` = ayrı nesneler, değilse eski tek parça çerçeve öğesi. */
  existing: { itemId: string; spaceId: string; objects: boolean } | null;
}

export const EMPTY_SPACE_CHOICE: WorkflowSpaceChoice = {
  enabled: false,
  spaceId: null,
  showIo: true,
  showLinks: true,
  showImages: true,
  showRelations: true,
  existing: null,
};

export function choiceOptions(choice: Pick<WorkflowSpaceChoice, "showIo" | "showLinks" | "showImages" | "showRelations">): PlanOptions {
  return { io: choice.showIo, prompts: choice.showLinks, images: choice.showLinks && choice.showImages, relations: choice.showLinks && choice.showRelations };
}

const CHUNK = 100;

/** Bu Space'ten workflow'un bağını kaldırır: ayrı nesneler (ve okları, cascade) ya da eski çerçeve öğesi. */
async function removeFromSpace(existing: NonNullable<WorkflowSpaceChoice["existing"]>, workflowId: string): Promise<void> {
  if (!existing.objects) {
    await deleteSpaceItems([existing.itemId]);
    return;
  }
  const items = await fetchSpaceItems(existing.spaceId);
  const ids = items.filter((item) => item.sourceWorkflowId === workflowId).map((item) => item.id);
  for (let i = 0; i < ids.length; i += CHUNK) await deleteSpaceItems(ids.slice(i, i + CHUNK));
}

/** Kaydedildikten SONRA çağrılır (workflow kimliği artık var). Dönen değer: workflow'un şimdi bağlı olduğu Space (ya da bağ yok). */
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
}): Promise<{ itemId: string; spaceId: string; objects: true } | null> {
  const { existing } = choice;
  const targetSpace = choice.enabled ? choice.spaceId : null;
  const options = choiceOptions(choice);

  // Aynı Space: yoksa aktar, varsa güncelle; eski tek parça çerçeve nesnelere çevrilir.
  if (existing && targetSpace === existing.spaceId) {
    const result = await importOrSyncDirect({ spaceId: existing.spaceId, workflowId, workflowTitle: title, userId, options });
    if (!existing.objects) await deleteSpaceItems([existing.itemId]);
    return { itemId: result.itemId ?? existing.itemId, spaceId: existing.spaceId, objects: true };
  }

  // Yeni nesneler ÖNCE eklenir, eski bağ sonra kalkar: ekleme başarısız olursa eski bağ yerinde kalır.
  let linked: { itemId: string; spaceId: string; objects: true } | null = null;
  if (targetSpace) {
    const spaceId = targetSpace === "new" ? await createSpace({ title: title.trim().slice(0, 80) || "Workflow", description: "", kind: "free", visibility: "private", groups: [] }) : targetSpace;
    const result = await importOrSyncDirect({ spaceId, workflowId, workflowTitle: title, userId, options });
    linked = { itemId: result.itemId ?? "", spaceId, objects: true };
  }
  if (existing) await removeFromSpace(existing, workflowId);
  return linked;
}
