import { findFreeSpot, topZ } from "@/lib/space-board";
import { translateForRuntime } from "@/lib/i18n/translations";
import { RELATION_TYPES } from "@/lib/relations/types";
import {
  MAX_ITEMS,
  planWorkflowImport,
  planWorkflowSync,
  type BoardConnection,
  type BoardObject,
  type BoardStepItem,
  type ExistingBoard,
  type PlanOptions,
  type PlanStep,
  type PlannedConnection,
  type PlannedItem,
  type WorkflowImportPlan,
  type WorkflowSyncPlan,
} from "@/lib/workflow-board-plan";
import {
  addSpaceConnections,
  addSpaceItems,
  createSpaceGroup,
  deleteSpaceConnections,
  deleteSpaceItems,
  fetchSpaceConnections,
  fetchSpaceItems,
  SpaceError,
  updateSpaceItem,
  type NewSpaceConnection,
  type NewSpaceItem,
  type SpaceConnection,
  type SpaceGroup,
  type SpaceItem,
} from "./spaces";
import { fetchPromptImages, fetchWorkflowFlow, type WorkflowFlowData } from "./workflow-flow";

/**
 * Workflow'u panoya AYRI NESNELER olarak aktarmanın veri tarafı (docs/history/262-*): workflow + prompt görsellerini okur, saf planı
 * (`workflow-board-plan.ts`) kurar ve çalıştırır. Çalıştırma `PlanIO` arkasındadır: Space sayfası kendi sağlayıcısının işlevlerini
 * (yerel durum güncel kalsın), workflow formu doğrudan veri katmanını verir — plan ve yerleştirme tek yerde.
 */

export interface PlanInput {
  flow: WorkflowFlowData;
  steps: PlanStep[];
}

/** Workflow'u (taze) ve adımlarındaki prompt görsellerini okuyup planın girdisine çevirir. Okunamayan workflow için `null`. */
export async function loadPlanInput(workflowId: string, { fresh = false }: { fresh?: boolean } = {}): Promise<PlanInput | null> {
  const flow = await fetchWorkflowFlow(workflowId, { fresh });
  if (!flow) return null;
  const promptIds = flow.steps.map((step) => (step.content?.type === "prompt" ? step.content.id : null)).filter((id): id is string => Boolean(id));
  const images = await fetchPromptImages(promptIds);
  return { flow, steps: flow.steps.map((step) => toPlanStep(step, images)) };
}

export function toPlanStep(step: WorkflowFlowData["steps"][number], images: Map<string, { url: string; width: number; height: number }[]>): PlanStep {
  return {
    id: step.id,
    title: step.title,
    inputs: step.inputs.map((input) => ({ label: input.label, from: input.source ? { stepId: input.source.stepId, outputId: input.source.outputId } : null })),
    outputs: step.outputs.map((output) => ({ id: output.id, label: output.label })),
    content: step.content ? { type: step.content.type, id: step.content.id, title: step.content.title } : null,
    images: step.content?.type === "prompt" ? (images.get(step.content.id) ?? []) : [],
  };
}

export function relationPairs(flow: WorkflowFlowData): { a: number; b: number; type: string }[] {
  return flow.relations.map((relation) => ({ a: relation.a, b: relation.b, type: relation.type }));
}

/** Panodaki mevcut prompt / görsel öğeleri: tekrar açılmasın, mevcut olana ok bağlansın. */
export function existingBoardOf(items: readonly Pick<SpaceItem, "id" | "kind" | "promptId" | "isDraft" | "mediaUrl">[]): ExistingBoard {
  const promptItems = new Map<string, string>();
  const imageItems = new Map<string, string>();
  for (const item of items) {
    if (item.kind === "prompt" && !item.isDraft && item.promptId) promptItems.set(item.promptId, item.id);
    if (item.kind === "image" && item.mediaUrl) imageItems.set(item.mediaUrl, item.id);
  }
  return { promptItems, imageItems };
}

export function planLabels() {
  return { relation: (type: string) => (type in RELATION_TYPES ? translateForRuntime(RELATION_TYPES[type as keyof typeof RELATION_TYPES].labelKey) : type) };
}

export function importPlan(input: PlanInput, options: PlanOptions, items: readonly SpaceItem[]): WorkflowImportPlan {
  return planWorkflowImport(input.steps, relationPairs(input.flow), options, existingBoardOf(items), planLabels());
}

/** Bu workflow'dan aktarılmış nesneler panoda var mı (varsa yeniden aktarılmaz, "Güncelle" kullanılır). */
export function workflowObjectsOn(items: readonly SpaceItem[], workflowId: string): SpaceItem[] {
  return items.filter((item) => item.sourceWorkflowId === workflowId);
}

/** Pano durumundan "Güncelle" planının girdisi. */
export function boardSnapshot(items: readonly SpaceItem[], connections: readonly SpaceConnection[], workflowId: string) {
  const own = workflowObjectsOn(items, workflowId);
  const stepItems: BoardStepItem[] = own
    .filter((item) => item.sourceRole === "step" && item.sourceStepId)
    .map((item) => ({ id: item.id, stepId: item.sourceStepId!, title: item.title, body: item.body, x: item.x, y: item.y, w: item.w, h: item.h }));
  const objects: BoardObject[] = own
    .filter((item) => (item.sourceRole === "prompt" || item.sourceRole === "image") && item.kind !== "note")
    .map((item) => ({ id: item.id, role: item.sourceRole as "prompt" | "image", stepId: item.sourceStepId, promptId: item.promptId, mediaUrl: item.mediaUrl, x: item.x, y: item.y, w: item.w, h: item.h }));
  const ownIds = new Set(own.map((item) => item.id));
  const boardConnections: BoardConnection[] = connections
    .filter((c) => c.sourceWorkflowId === workflowId || ownIds.has(c.fromItemId) || ownIds.has(c.toItemId))
    .map((c) => ({ id: c.id, fromItemId: c.fromItemId, toItemId: c.toItemId, role: c.sourceWorkflowId === workflowId ? c.sourceRole : null, ownedByWorkflow: c.sourceWorkflowId === workflowId }));
  return { stepItems, objects, connections: boardConnections, existing: existingBoardOf(items) };
}

export function syncPlan(input: PlanInput, items: readonly SpaceItem[], connections: readonly SpaceConnection[], workflowId: string): WorkflowSyncPlan {
  return planWorkflowSync(input.steps, boardSnapshot(items, connections, workflowId));
}

// ---------------------------------------------------------------------------------------------
// Çalıştırma
// ---------------------------------------------------------------------------------------------

export interface PlanIO {
  addItems: (items: NewSpaceItem[]) => Promise<SpaceItem[]>;
  addConnections: (connections: NewSpaceConnection[]) => Promise<SpaceConnection[]>;
  patchItem: (id: string, patch: { title?: string; body?: string }) => Promise<unknown>;
  removeItems: (ids: string[]) => Promise<unknown>;
  removeConnections: (ids: string[]) => Promise<unknown>;
  /** Çerçeve (grup) oluşturur; olmazsa (sınır/yetki) `null` — aktarım çerçevesiz sürer. */
  createGroup: (name: string) => Promise<SpaceGroup | null>;
}

export interface ImportResult {
  items: SpaceItem[];
  connections: SpaceConnection[];
  group: SpaceGroup | null;
  /** Prompt/görseller eklenemediği için yalnız adım kartları getirildi. */
  degraded: boolean;
}

function itemDraft(planned: PlannedItem, spaceId: string, workflowId: string, offset: { x: number; y: number }, z: number, groupId: string | null): NewSpaceItem {
  const isOrigin = Boolean(planned.sourceRole);
  return {
    id: planned.id,
    spaceId,
    kind: planned.kind,
    x: planned.x + offset.x,
    y: planned.y + offset.y,
    w: planned.w,
    h: planned.h,
    z,
    groupId,
    title: planned.title,
    body: planned.body,
    color: planned.color,
    promptId: planned.promptId ?? null,
    mediaUrl: planned.mediaUrl ?? null,
    mediaWidth: planned.mediaWidth ?? null,
    mediaHeight: planned.mediaHeight ?? null,
    contentType: planned.contentType ?? null,
    contentId: planned.contentId ?? null,
    ...(isOrigin ? { sourceWorkflowId: workflowId, sourceStepId: planned.sourceStepId ?? null, sourceRole: planned.sourceRole, sourceStepNo: planned.sourceStepNo ?? null } : {}),
  };
}

function connectionDraft(planned: PlannedConnection, spaceId: string, workflowId: string): NewSpaceConnection {
  return {
    id: planned.id,
    spaceId,
    fromItemId: planned.fromItemId,
    toItemId: planned.toItemId,
    label: planned.label,
    lineStyle: planned.lineStyle,
    arrow: planned.arrow,
    route: planned.route,
    color: planned.color,
    sourceWorkflowId: workflowId,
    sourceRole: planned.role,
  };
}

/**
 * Planı panoya yazar: çerçeve (grup) → nesneler (tek istek) → oklar (tek istek). Prompt/görsel eklenemezse (kaynak okunamıyor)
 * yalnız adım kartlarıyla yeniden dener ve bunu `degraded` ile bildirir. Panoda 500 öğe sınırı baştan denetlenir.
 */
export async function runImport({
  io,
  spaceId,
  workflowId,
  workflowTitle,
  input,
  options,
  existingItems,
  near,
}: {
  io: PlanIO;
  spaceId: string;
  workflowId: string;
  workflowTitle: string;
  input: PlanInput;
  options: PlanOptions;
  existingItems: readonly SpaceItem[];
  near: { x: number; y: number };
}): Promise<ImportResult> {
  let plan = importPlan(input, options, existingItems);
  if (existingItems.length + plan.items.length > MAX_ITEMS) throw new SpaceError("space_item_limit", translateForRuntime("spaces.error.itemLimit"));
  let degraded = false;
  // Çerçeve bir kez açılır (kaynak okunamayıp yeniden denenirse ikinci bir boş grup kalmasın).
  const group = await io.createGroup(translateForRuntime("wfSpace.objects.frame", { title: workflowTitle }).slice(0, 40));
  const run = async (current: WorkflowImportPlan): Promise<ImportResult> => {
    const spot = findFreeSpot(existingItems, current.size, near);
    const z = topZ(existingItems);
    const items = await io.addItems(current.items.map((planned, index) => itemDraft(planned, spaceId, workflowId, spot, z + index + 1, group?.id ?? null)));
    const connections = await io.addConnections(current.connections.map((planned) => connectionDraft(planned, spaceId, workflowId)));
    return { items, connections, group, degraded };
  };
  try {
    return await run(plan);
  } catch (error) {
    if (!(error instanceof SpaceError) || error.code !== "space_source_unavailable" || !options.prompts) throw error;
    degraded = true;
    plan = importPlan(input, { ...options, prompts: false, images: false, relations: false }, existingItems);
    return await run(plan);
  }
}

/** "Güncelle" planını uygular (kaldır → ekle → güncelle → oklar). */
export async function runSync({ io, spaceId, workflowId, plan, existingItems }: { io: PlanIO; spaceId: string; workflowId: string; plan: WorkflowSyncPlan; existingItems: readonly SpaceItem[] }): Promise<void> {
  if (existingItems.length - plan.removeItemIds.length + plan.addItems.length > MAX_ITEMS) throw new SpaceError("space_item_limit", translateForRuntime("spaces.error.itemLimit"));
  if (plan.removeConnectionIds.length) await io.removeConnections(plan.removeConnectionIds);
  if (plan.removeItemIds.length) await io.removeItems(plan.removeItemIds);
  if (plan.addItems.length) {
    const z = topZ(existingItems);
    // Yeni adımlar eski çerçeveye (grup) girer: mevcut adım kartlarından birinin grubunu alır.
    const groupId = existingItems.find((item) => item.sourceWorkflowId === workflowId && item.groupId)?.groupId ?? null;
    await io.addItems(plan.addItems.map((planned, index) => itemDraft(planned, spaceId, workflowId, { x: 0, y: 0 }, z + index + 1, groupId)));
  }
  for (const patch of plan.patchItems) await io.patchItem(patch.id, { title: patch.title, body: patch.body });
  if (plan.addConnections.length) await io.addConnections(plan.addConnections.map((planned) => connectionDraft(planned, spaceId, workflowId)));
}

/** Doğrudan veri katmanı (workflow formu): sağlayıcı yok, yerel durum yok. */
export function directIO(spaceId: string, userId: string): PlanIO {
  return {
    addItems: (items) => addSpaceItems(items, userId),
    addConnections: (connections) => addSpaceConnections(connections, userId),
    patchItem: (id, patch) => updateSpaceItem(id, patch),
    removeItems: (ids) => deleteSpaceItems(ids),
    removeConnections: (ids) => deleteSpaceConnections(ids),
    createGroup: async (name) => {
      try {
        return await createSpaceGroup(spaceId, name, userId);
      } catch {
        return null;
      }
    },
  };
}

/** Workflow formundan: Space'e göster (yoksa aktar, varsa güncelle). Dönen değer: bağın kurulduğu Space'teki adım kartı (ilk). */
export async function importOrSyncDirect({
  spaceId,
  workflowId,
  workflowTitle,
  userId,
  options,
}: {
  spaceId: string;
  workflowId: string;
  workflowTitle: string;
  userId: string;
  options: PlanOptions;
}): Promise<{ itemId: string | null; degraded: boolean }> {
  const input = await loadPlanInput(workflowId, { fresh: true });
  if (!input) throw new SpaceError("generic", translateForRuntime("wfSpace.import.loadFailed"));
  const [items, connections] = await Promise.all([fetchSpaceItems(spaceId), fetchSpaceConnections(spaceId)]);
  const io = directIO(spaceId, userId);
  if (workflowObjectsOn(items, workflowId).some((item) => item.sourceRole === "step")) {
    const plan = syncPlan(input, items, connections, workflowId);
    if (!plan.isEmpty) await runSync({ io, spaceId, workflowId, plan, existingItems: items });
    return { itemId: workflowObjectsOn(items, workflowId).find((item) => item.sourceRole === "step")?.id ?? null, degraded: false };
  }
  const bounds = items.length ? { x: Math.min(...items.map((i) => i.x)), y: Math.max(...items.map((i) => i.y + i.h)) + 120 } : { x: 0, y: 0 };
  const result = await runImport({ io, spaceId, workflowId, workflowTitle, input, options, existingItems: items, near: { x: bounds.x + 500, y: bounds.y + 300 } });
  return { itemId: result.items.find((item) => item.sourceRole === "step")?.id ?? null, degraded: result.degraded };
}
