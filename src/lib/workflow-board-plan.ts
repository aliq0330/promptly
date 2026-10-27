/**
 * Bir workflow'un Space panosuna AYRI NESNELER olarak aktarılması için SAF plan (docs/history/262-*): her adım bir adım kartı
 * (`note` + `source_role='step'`), kullandığı prompt ve prompt'un görselleri ayrı öğeler, aralarında oklar. Ayrıca workflow
 * değişince panonun nasıl güncelleneceğini ("Güncelle") hesaplar. React yok, ağ yok — `workflow-board-plan.test.ts`.
 *
 * Plan koordinatları GÖRELİDİR ((0,0) = ilk adımın sol üstü); çalıştıran, panoda boş bir yere kaydırır. Kimlikler planda üretilir ki
 * oklar öğelere daha eklenmeden başvurabilsin.
 */

export const STEP_W = 260;
export const STEP_H_IO = 150;
export const STEP_H_PLAIN = 108;
export const PROMPT_W = 260;
export const PROMPT_H = 170;
export const IMAGE_SIZE = 124;
export const IMAGE_GAP = 12;
export const GAP_X = 110;
export const GAP_STEP_PROMPT = 56;
export const GAP_PROMPT_IMAGE = 28;
export const ROW_GAP = 120;
export const PER_ROW = 4;
/** Prompt başına panoya getirilen en çok görsel. */
export const MAX_IMAGES = 4;
export const MAX_ITEMS = 500;

export interface PlanStep {
  id: string;
  title: string;
  inputs: { label: string; from: { stepId: string; outputId: string } | null }[];
  outputs: { id: string; label: string }[];
  /** Adımın içeriği: prompt ya da (eski workflow'larda) istek. */
  content: { type: "prompt" | "request"; id: string; title: string } | null;
  /** İçeriğin görselleri (yalnız prompt); sırayla ilk `MAX_IMAGES` kullanılır. */
  images: { url: string; width: number; height: number }[];
}

export interface PlanOptions {
  io: boolean;
  prompts: boolean;
  images: boolean;
  relations: boolean;
}

export interface PlanRelation {
  a: number;
  b: number;
  type: string;
}

export interface ExistingBoard {
  /** Panoda zaten olan (taslak olmayan) prompt öğeleri: promptId → öğe kimliği. */
  promptItems: ReadonlyMap<string, string>;
  /** Panoda zaten olan görseller: görsel kimliği (URL) → öğe kimliği. */
  imageItems: ReadonlyMap<string, string>;
}

export interface PlannedItem {
  id: string;
  kind: "note" | "prompt" | "image" | "content";
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  body: string;
  color: "primary" | "neutral";
  promptId?: string;
  mediaUrl?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  contentType?: "request";
  contentId?: string;
  sourceRole?: "step" | "prompt" | "image";
  sourceStepId?: string;
  sourceStepNo?: number;
}

export interface PlannedConnection {
  id: string;
  fromItemId: string;
  toItemId: string;
  label: string;
  lineStyle: "solid" | "dashed" | "dotted";
  arrow: "end" | "start" | "both" | "none";
  route: "curve" | "straight" | "elbow";
  color: "primary" | "secondary" | "neutral";
  role: "flow" | "link" | "relation";
}

export interface WorkflowImportPlan {
  items: PlannedItem[];
  connections: PlannedConnection[];
  /** Planın kapladığı alan (yerleştirme için). */
  size: { w: number; h: number };
  counts: { steps: number; prompts: number; images: number; arrows: number };
  /** Panoda zaten olduğu için yeniden açılmayan prompt/görsel sayısı (okla mevcut olana bağlanır). */
  reused: number;
}

export interface PlanLabels {
  relation: (type: string) => string;
}

/** Adım kartı gövdesi: her girdi `>> `, her çıktı `<< ` ile başlayan ayrı satırdır (dilden bağımsız; kart kendi etiketlerini çevirir). */
export function stepBody(step: Pick<PlanStep, "inputs" | "outputs">): string {
  const lines = [...step.inputs.map((input) => `>> ${input.label.trim()}`), ...step.outputs.map((output) => `<< ${output.label.trim()}`)];
  return lines.filter((line) => line.length > 3).join("\n");
}

export function parseStepBody(body: string): { inputs: string[]; outputs: string[]; text: string } {
  const inputs: string[] = [];
  const outputs: string[] = [];
  const rest: string[] = [];
  for (const line of body.split("\n")) {
    if (line.startsWith(">> ")) inputs.push(line.slice(3));
    else if (line.startsWith("<< ")) outputs.push(line.slice(3));
    else if (line.trim()) rest.push(line);
  }
  return { inputs, outputs, text: rest.join("\n") };
}

export function hasStepIo(body: string): boolean {
  return /^(>>|<<) /m.test(body);
}

function stepHeight(io: boolean): number {
  return io ? STEP_H_IO : STEP_H_PLAIN;
}

/** Oku taşıyan çıktının adı: sonraki adımın bağlı girdisinin kaynağı olan çıktı; yoksa önceki adımın ilk çıktısı. */
export function flowLabel(from: PlanStep, to: PlanStep): string {
  const wired = to.inputs.find((input) => input.from?.stepId === from.id);
  const output = wired ? from.outputs.find((o) => o.id === wired.from!.outputId) : from.outputs[0];
  return output?.label.trim() ?? "";
}

function rowStride(options: PlanOptions): number {
  let h = stepHeight(options.io);
  if (options.prompts) h += GAP_STEP_PROMPT + PROMPT_H;
  if (options.prompts && options.images) h += GAP_PROMPT_IMAGE + IMAGE_SIZE * 2 + IMAGE_GAP;
  return h + ROW_GAP;
}

type IdFactory = () => string;
const defaultId: IdFactory = () => crypto.randomUUID();

interface Placed {
  stepItem: PlannedItem;
  items: PlannedItem[];
  connections: PlannedConnection[];
}

/** Tek bir adımın nesneleri ve (adım→prompt, prompt→görsel) çizgileri; `col`/`row` plan içindeki konumdur. */
function planOneStep(
  step: PlanStep,
  stepNo: number,
  col: number,
  row: number,
  options: PlanOptions,
  existing: ExistingBoard,
  promptItemFor: Map<string, string>,
  makeId: IdFactory,
  origin: { x: number; y: number },
): Placed {
  const x = origin.x + col * (STEP_W + GAP_X);
  const y = origin.y + row * rowStride(options);
  const h = stepHeight(options.io);
  const stepItem: PlannedItem = {
    id: makeId(),
    kind: "note",
    x,
    y,
    w: STEP_W,
    h,
    title: step.title.trim().slice(0, 120),
    body: options.io ? stepBody(step) : "",
    color: "primary",
    sourceRole: "step",
    sourceStepId: step.id,
    sourceStepNo: stepNo,
  };
  const items: PlannedItem[] = [];
  const connections: PlannedConnection[] = [];
  if (!options.prompts || !step.content) return { stepItem, items, connections };

  const content = step.content;
  let promptItemId = promptItemFor.get(content.id) ?? (content.type === "prompt" ? existing.promptItems.get(content.id) : undefined);
  if (!promptItemId) {
    const promptY = y + h + GAP_STEP_PROMPT;
    promptItemId = makeId();
    promptItemFor.set(content.id, promptItemId);
    items.push(
      content.type === "prompt"
        ? { id: promptItemId, kind: "prompt", x, y: promptY, w: PROMPT_W, h: PROMPT_H, title: "", body: "", color: "neutral", promptId: content.id, sourceRole: "prompt", sourceStepId: step.id, sourceStepNo: stepNo }
        : { id: promptItemId, kind: "content", x, y: promptY, w: PROMPT_W, h: PROMPT_H, title: "", body: "", color: "neutral", contentType: "request", contentId: content.id },
    );
    if (options.images && content.type === "prompt") {
      const imageY = promptY + PROMPT_H + GAP_PROMPT_IMAGE;
      step.images.slice(0, MAX_IMAGES).forEach((image, index) => {
        if (existing.imageItems.has(image.url)) return;
        const imageId = makeId();
        items.push({
          id: imageId,
          kind: "image",
          x: x + (index % 2) * (IMAGE_SIZE + IMAGE_GAP),
          y: imageY + Math.floor(index / 2) * (IMAGE_SIZE + IMAGE_GAP),
          w: IMAGE_SIZE,
          h: IMAGE_SIZE,
          title: "",
          body: "",
          color: "neutral",
          promptId: content.id,
          mediaUrl: image.url,
          mediaWidth: image.width,
          mediaHeight: image.height,
          sourceRole: "image",
          sourceStepId: step.id,
          sourceStepNo: stepNo,
        });
        connections.push({ id: makeId(), fromItemId: promptItemId!, toItemId: imageId, label: "", lineStyle: "dotted", arrow: "none", route: "straight", color: "neutral", role: "link" });
      });
      // Panoda zaten olan görseller yeniden açılmaz; prompt'tan mevcut olana çizgi çekilir.
      step.images.slice(0, MAX_IMAGES).forEach((image) => {
        const existingId = existing.imageItems.get(image.url);
        if (existingId) connections.push({ id: makeId(), fromItemId: promptItemId!, toItemId: existingId, label: "", lineStyle: "dotted", arrow: "none", route: "curve", color: "neutral", role: "link" });
      });
    }
  }
  connections.push({ id: makeId(), fromItemId: stepItem.id, toItemId: promptItemId, label: "", lineStyle: "dotted", arrow: "end", route: "straight", color: "neutral", role: "link" });
  return { stepItem, items, connections };
}

export function planWorkflowImport(
  steps: readonly PlanStep[],
  relations: readonly PlanRelation[],
  options: PlanOptions,
  existing: ExistingBoard,
  labels: PlanLabels,
  makeId: IdFactory = defaultId,
): WorkflowImportPlan {
  const columns = Math.max(1, Math.min(steps.length, PER_ROW));
  const items: PlannedItem[] = [];
  const connections: PlannedConnection[] = [];
  const stepItems: PlannedItem[] = [];
  const promptItemFor = new Map<string, string>();
  steps.forEach((step, index) => {
    const placed = planOneStep(step, index + 1, index % columns, Math.floor(index / columns), options, existing, promptItemFor, makeId, { x: 0, y: 0 });
    stepItems.push(placed.stepItem);
    items.push(placed.stepItem, ...placed.items);
    connections.push(...placed.connections);
  });
  for (let i = 0; i < steps.length - 1; i += 1) {
    connections.push({ id: makeId(), fromItemId: stepItems[i].id, toItemId: stepItems[i + 1].id, label: flowLabel(steps[i], steps[i + 1]).slice(0, 80), lineStyle: "solid", arrow: "end", route: "curve", color: "primary", role: "flow" });
  }
  if (options.relations && options.prompts) {
    const seen = new Set<string>();
    for (const rel of relations) {
      const a = steps[rel.a]?.content;
      const b = steps[rel.b]?.content;
      if (!a || !b || a.id === b.id) continue;
      const fromId = promptItemFor.get(a.id) ?? existing.promptItems.get(a.id);
      const toId = promptItemFor.get(b.id) ?? existing.promptItems.get(b.id);
      if (!fromId || !toId || fromId === toId) continue;
      const key = [fromId, toId].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      connections.push({ id: makeId(), fromItemId: fromId, toItemId: toId, label: labels.relation(rel.type).slice(0, 80), lineStyle: "dashed", arrow: "none", route: "curve", color: "secondary", role: "relation" });
    }
  }
  const rows = Math.max(1, Math.ceil(steps.length / columns));
  const size = { w: columns * STEP_W + (columns - 1) * GAP_X, h: rows * rowStride(options) - ROW_GAP };
  const reusedPrompts = options.prompts ? new Set(steps.map((s) => s.content?.id).filter((id): id is string => Boolean(id) && existing.promptItems.has(id!))).size : 0;
  const reusedImages = options.prompts && options.images ? steps.reduce((n, s) => n + s.images.slice(0, MAX_IMAGES).filter((img) => existing.imageItems.has(img.url)).length, 0) : 0;
  return {
    items,
    connections,
    size,
    counts: {
      steps: items.filter((i) => i.sourceRole === "step").length,
      prompts: items.filter((i) => i.kind === "prompt" || i.kind === "content").length,
      images: items.filter((i) => i.kind === "image").length,
      arrows: connections.length,
    },
    reused: reusedPrompts + reusedImages,
  };
}

// ---------------------------------------------------------------------------------------------
// Güncelle: workflow değişince panonun farkı
// ---------------------------------------------------------------------------------------------

export interface BoardStepItem {
  id: string;
  stepId: string;
  title: string;
  body: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardObject {
  id: string;
  role: "prompt" | "image";
  stepId: string | null;
  promptId: string | null;
  mediaUrl: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardConnection {
  id: string;
  fromItemId: string;
  toItemId: string;
  role: "flow" | "link" | "relation" | null;
  /** Bu workflow'un çizdiği bağlantı mı (kaynak workflow). */
  ownedByWorkflow: boolean;
}

export interface WorkflowSyncPlan {
  addItems: PlannedItem[];
  addConnections: PlannedConnection[];
  patchItems: { id: string; title?: string; body?: string }[];
  removeItemIds: string[];
  removeConnectionIds: string[];
  counts: { added: number; removed: number; changed: number };
  isEmpty: boolean;
}

export function planWorkflowSync(
  steps: readonly PlanStep[],
  board: {
    stepItems: readonly BoardStepItem[];
    objects: readonly BoardObject[];
    connections: readonly BoardConnection[];
    existing: ExistingBoard;
  },
  makeId: IdFactory = defaultId,
): WorkflowSyncPlan {
  const stepItemByStepId = new Map(board.stepItems.map((item) => [item.stepId, item]));
  const options: PlanOptions = {
    io: board.stepItems.some((item) => hasStepIo(item.body)),
    prompts: board.objects.some((o) => o.role === "prompt") || board.connections.some((c) => c.role === "link"),
    images: board.objects.some((o) => o.role === "image"),
    relations: false,
  };
  const addItems: PlannedItem[] = [];
  const addConnections: PlannedConnection[] = [];
  const patchItems: WorkflowSyncPlan["patchItems"] = [];
  const removeItemIds = new Set<string>();
  const removeConnectionIds = new Set<string>();
  const changedSteps = new Set<string>();
  const addedSteps = new Set<string>();
  const currentIds = new Set(steps.map((s) => s.id));

  // Kaldırılan adımlar: kartı ve o adım için AÇILMIŞ prompt/görsel nesneleri gider (başkasından yeniden kullanılanlara dokunulmaz).
  const removedSteps = board.stepItems.filter((item) => !currentIds.has(item.stepId));
  for (const item of removedSteps) {
    removeItemIds.add(item.id);
    for (const object of board.objects) if (object.stepId === item.stepId) removeItemIds.add(object.id);
  }

  // Yeni adımların yeri: mevcut nesnelerin altında yeni bir satır.
  const all = [...board.stepItems, ...board.objects];
  const minX = all.length ? Math.min(...all.map((o) => o.x)) : 0;
  const maxY = all.length ? Math.max(...all.map((o) => o.y + o.h)) : 0;
  const newSteps = steps.filter((s) => !stepItemByStepId.has(s.id));
  const columns = Math.max(1, Math.min(newSteps.length, PER_ROW));
  const promptItemFor = new Map<string, string>();
  const newStepItemId = new Map<string, string>();
  newSteps.forEach((step, index) => {
    const stepNo = steps.findIndex((s) => s.id === step.id) + 1;
    const placed = planOneStep(step, stepNo, index % columns, Math.floor(index / columns), options, board.existing, promptItemFor, makeId, { x: minX, y: maxY + ROW_GAP });
    newStepItemId.set(step.id, placed.stepItem.id);
    addItems.push(placed.stepItem, ...placed.items);
    addConnections.push(...placed.connections);
    addedSteps.add(step.id);
  });

  // Var olan adımlar: başlık / girdi-çıktı metni, prompt değişimi.
  for (const step of steps) {
    const item = stepItemByStepId.get(step.id);
    if (!item) continue;
    const patch: { id: string; title?: string; body?: string } = { id: item.id };
    const title = step.title.trim().slice(0, 120);
    if (title !== item.title) patch.title = title;
    if (hasStepIo(item.body) || (options.io && !item.body.trim())) {
      const body = stepBody(step);
      if (body !== item.body.trim()) patch.body = body;
    }
    if (patch.title !== undefined || patch.body !== undefined) {
      patchItems.push(patch);
      changedSteps.add(step.id);
    }
    if (!options.prompts) continue;
    const linkOut = board.connections.filter((c) => c.role === "link" && c.fromItemId === item.id && c.ownedByWorkflow);
    const linkedPromptIds = new Set(
      linkOut.map((c) => board.objects.find((o) => o.id === c.toItemId)?.promptId ?? [...board.existing.promptItems.entries()].find(([, id]) => id === c.toItemId)?.[0] ?? null).filter((id): id is string => Boolean(id)),
    );
    const wanted = step.content?.id ?? null;
    if ((wanted && !linkedPromptIds.has(wanted)) || (!wanted && linkedPromptIds.size > 0)) {
      changedSteps.add(step.id);
      // Eski bağ ve bu adım için açılmış eski prompt/görsel nesneleri kalkar; yenisi adım kartının altına gelir.
      for (const c of linkOut) removeConnectionIds.add(c.id);
      for (const object of board.objects) if (object.stepId === step.id) removeItemIds.add(object.id);
      if (step.content) {
        const stepNo = steps.findIndex((s) => s.id === step.id) + 1;
        const placed = planOneStep(step, stepNo, 0, 0, options, board.existing, promptItemFor, makeId, { x: item.x, y: item.y });
        // Adım kartı zaten var: yalnız prompt/görsel nesneleri ve çizgiler alınır; çizgilerdeki kart kimliği mevcut karta çevrilir.
        const remap = (id: string) => (id === placed.stepItem.id ? item.id : id);
        addItems.push(...placed.items.map((o) => ({ ...o, x: o.x, y: item.y + item.h + (o.y - item.y - stepHeight(options.io)) })));
        addConnections.push(...placed.connections.map((c) => ({ ...c, fromItemId: remap(c.fromItemId), toItemId: remap(c.toItemId) })));
      }
    }
  }

  // Akış okları: ardışık adımlar bağlı olmalı; fazlalar kalkar, eksikler eklenir.
  const itemIdFor = (stepId: string) => stepItemByStepId.get(stepId)?.id ?? newStepItemId.get(stepId) ?? null;
  const desired: [string, string, PlanStep, PlanStep][] = [];
  for (let i = 0; i < steps.length - 1; i += 1) {
    const a = itemIdFor(steps[i].id);
    const b = itemIdFor(steps[i + 1].id);
    if (a && b) desired.push([a, b, steps[i], steps[i + 1]]);
  }
  const flowConnections = board.connections.filter((c) => c.role === "flow" && c.ownedByWorkflow);
  const wantedKey = new Set(desired.map(([a, b]) => `${a}>${b}`));
  for (const c of flowConnections) {
    if (!wantedKey.has(`${c.fromItemId}>${c.toItemId}`) || removeItemIds.has(c.fromItemId) || removeItemIds.has(c.toItemId)) removeConnectionIds.add(c.id);
  }
  const haveKey = new Set(flowConnections.filter((c) => !removeConnectionIds.has(c.id)).map((c) => `${c.fromItemId}>${c.toItemId}`));
  const reverseExists = (a: string, b: string) => board.connections.some((c) => c.fromItemId === b && c.toItemId === a && !removeConnectionIds.has(c.id));
  for (const [a, b, from, to] of desired) {
    if (haveKey.has(`${a}>${b}`) || reverseExists(a, b)) continue;
    addConnections.push({ id: makeId(), fromItemId: a, toItemId: b, label: flowLabel(from, to).slice(0, 80), lineStyle: "solid", arrow: "end", route: "curve", color: "primary", role: "flow" });
  }

  const counts = { added: addedSteps.size, removed: removedSteps.length, changed: changedSteps.size - [...changedSteps].filter((id) => addedSteps.has(id)).length };
  const isEmpty = addItems.length === 0 && addConnections.length === 0 && patchItems.length === 0 && removeItemIds.size === 0 && removeConnectionIds.size === 0;
  return { addItems, addConnections, patchItems, removeItemIds: [...removeItemIds], removeConnectionIds: [...removeConnectionIds], counts, isEmpty };
}
