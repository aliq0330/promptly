import { supabase } from "./client";
import { fetchWorkflowById } from "./workflows";
import type { SpaceVisibility } from "@/lib/spaces";
import type { ManualRelationType } from "@/lib/relations/types";
import type { Workflow, WorkflowStep } from "@/types";

/**
 * Workflow ↔ Space bağı (docs/history/261-*). Bağ ayrı bir tablo değil, Space'teki `space_items` satırıdır (`kind='content'`,
 * `content_type='workflow'`); pano ve workflow sayfası adımları workflow'dan CANLI okur (kopya yok), yani workflow değişince
 * çerçeve de değişir. Okuma tamamen RLS'e dayanır: okuyucu yalnız kendi görebildiği Space'leri ve workflow'u görür.
 */

/** İki adımın içeriği arasındaki elle kurulmuş ilişki (`content_relations`); `a`/`b` adım sırasıdır. */
export interface FlowRelation {
  a: number;
  b: number;
  type: ManualRelationType;
}

export interface WorkflowFlowData {
  workflow: Workflow;
  steps: WorkflowStep[];
  relations: FlowRelation[];
}

interface RelationRow {
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  relation_type: ManualRelationType;
}

const MAX_RELATION_ROWS = 60;

async function fetchStepRelations(steps: WorkflowStep[]): Promise<FlowRelation[]> {
  const indexByKey = new Map<string, number>();
  steps.forEach((step, index) => {
    if (step.content && !indexByKey.has(`${step.content.type}:${step.content.id}`)) indexByKey.set(`${step.content.type}:${step.content.id}`, index);
  });
  if (indexByKey.size < 2) return [];
  const ids = [...new Set([...indexByKey.keys()].map((key) => key.split(":")[1]))];
  const { data, error } = await supabase
    .from("content_relations")
    .select("source_type, source_id, target_type, target_id, relation_type")
    .in("source_id", ids)
    .in("target_id", ids)
    .limit(MAX_RELATION_ROWS);
  // İlişkiler tamamlayıcıdır: okunamazsa akış yine çizilir.
  if (error) {
    console.error("fetchStepRelations", error);
    return [];
  }
  const relations: FlowRelation[] = [];
  for (const row of (data ?? []) as RelationRow[]) {
    const a = indexByKey.get(`${row.source_type === "generator" ? "prompt" : row.source_type}:${row.source_id}`);
    const b = indexByKey.get(`${row.target_type === "generator" ? "prompt" : row.target_type}:${row.target_id}`);
    if (a === undefined || b === undefined || a === b) continue;
    relations.push({ a, b, type: row.relation_type });
  }
  return relations;
}

const FLOW_TTL_MS = 2 * 60 * 1000;
const flowCache = new Map<string, { at: number; promise: Promise<WorkflowFlowData | null> }>();

/** Workflow + adımlar + adımlar arası ilişkiler. Pano öğeleri ve önizleme aynı workflow'u tekrar tekrar istemesin diye kısa süre önbelleğe alınır. */
export function fetchWorkflowFlow(id: string, { fresh = false }: { fresh?: boolean } = {}): Promise<WorkflowFlowData | null> {
  const cached = flowCache.get(id);
  if (!fresh && cached && Date.now() - cached.at < FLOW_TTL_MS) return cached.promise;
  const promise = (async () => {
    const base = await fetchWorkflowById(id);
    if (!base) return null;
    return { ...base, relations: await fetchStepRelations(base.steps) };
  })();
  flowCache.set(id, { at: Date.now(), promise });
  void promise.then((value) => {
    if (!value) flowCache.delete(id);
  }, () => flowCache.delete(id));
  return promise;
}

/** Workflow düzenlenince (kaydedilince) çerçeveler yeniden okunsun. */
export function invalidateWorkflowFlow(id: string): void {
  flowCache.delete(id);
}

export interface WorkflowSpaceLink {
  itemId: string;
  spaceId: string;
  spaceTitle: string;
  visibility: SpaceVisibility;
  archived: boolean;
  updatedAt: string;
  showIo: boolean;
  showLinks: boolean;
  showRelations: boolean;
  /** Workflow bu Space'te ayrı nesneler olarak mı (yeni), yoksa eski tek parça çerçeve olarak mı duruyor. */
  objects: boolean;
}

interface LinkRow {
  id: string;
  space_id: string;
  kind?: string;
  source_role?: string | null;
  flow_show_io?: boolean;
  flow_show_links?: boolean;
  flow_show_relations?: boolean;
}

interface LinkedSpaceRow {
  id: string;
  title: string;
  visibility: SpaceVisibility;
  archived_at: string | null;
  updated_at: string;
}

const MAX_LINKED_SPACES = 24;
const MAX_LINK_ROWS = 400;

/** Önizleme sırası: önce herkese açık + arşivsiz (en yeni başta), sonra okuyucunun yalnız kendi görebildikleri (en yeni başta). */
export function sortWorkflowSpaceLinks(links: WorkflowSpaceLink[]): WorkflowSpaceLink[] {
  const rank = (link: WorkflowSpaceLink) => (link.visibility === "public" && !link.archived ? 0 : 1);
  return [...links].sort((x, y) => rank(x) - rank(y) || y.updatedAt.localeCompare(x.updatedAt));
}

/**
 * Bu workflow'u panosunda gösteren, OKUYUCUNUN okuyabildiği Space'ler (özel Space ziyaretçi için hiç gelmez). İki bağ biçimi vardır:
 * workflow'dan aktarılan AYRI NESNELER (`source_workflow_id` + adım kartı rolü; docs/history/262-*) ve eski tek parça çerçeve öğesi
 * (`content`/`workflow`, docs/history/261-*). Her Space bir kez döner; nesneli biçim öncelikli.
 */
export async function fetchWorkflowSpaceLinks(workflowId: string): Promise<WorkflowSpaceLink[]> {
  const { data, error } = await supabase
    .from("space_items")
    .select("id, space_id, kind, source_role, flow_show_io, flow_show_links, flow_show_relations")
    .or(`and(source_workflow_id.eq.${workflowId},source_role.eq.step),and(kind.eq.content,content_type.eq.workflow,content_id.eq.${workflowId})`)
    .limit(MAX_LINK_ROWS);
  if (error) {
    console.error("fetchWorkflowSpaceLinks", error);
    return [];
  }
  const items = (data ?? []) as unknown as LinkRow[];
  if (items.length === 0) return [];
  const spaceIds = [...new Set(items.map((item) => item.space_id))].slice(0, MAX_LINKED_SPACES);
  const { data: spaceData, error: spaceError } = await supabase
    .from("spaces")
    .select("id, title, visibility, archived_at, updated_at")
    .in("id", spaceIds)
    .limit(MAX_LINKED_SPACES);
  if (spaceError) {
    console.error("fetchWorkflowSpaceLinks spaces", spaceError);
    return [];
  }
  const spaces = new Map(((spaceData ?? []) as unknown as LinkedSpaceRow[]).map((space) => [space.id, space]));
  const bySpace = new Map<string, WorkflowSpaceLink>();
  for (const row of items) {
    const space = spaces.get(row.space_id);
    if (!space) continue;
    const isObject = row.source_role === "step";
    const existing = bySpace.get(row.space_id);
    // Nesneli biçim öncelikli; aynı biçimde en küçük adım numarasına değil ilk bulunana odaklanılır.
    if (existing && (existing.objects || !isObject)) continue;
    bySpace.set(row.space_id, {
      itemId: row.id,
      spaceId: row.space_id,
      spaceTitle: space.title,
      visibility: space.visibility,
      archived: Boolean(space.archived_at),
      updatedAt: space.updated_at,
      showIo: row.flow_show_io ?? true,
      showLinks: row.flow_show_links ?? true,
      showRelations: row.flow_show_relations ?? true,
      objects: isObject,
    });
  }
  return sortWorkflowSpaceLinks([...bySpace.values()]);
}

/** Prompt'ların görselleri (panoya getirilirken): her prompt için en çok `perPrompt`, kayıt sırasıyla. RLS: okuyucunun göremediği prompt'un görseli gelmez. */
export async function fetchPromptImages(promptIds: string[], perPrompt = 4): Promise<Map<string, { url: string; width: number; height: number }[]>> {
  const out = new Map<string, { url: string; width: number; height: number }[]>();
  if (promptIds.length === 0) return out;
  const { data, error } = await supabase
    .from("prompt_media")
    .select("prompt_id, url, width, height, position")
    .in("prompt_id", [...new Set(promptIds)])
    .order("position", { ascending: true })
    .limit(500);
  if (error) {
    console.error("fetchPromptImages", error);
    return out;
  }
  for (const row of (data ?? []) as { prompt_id: string; url: string; width: number | null; height: number | null }[]) {
    const list = out.get(row.prompt_id) ?? [];
    if (list.length < perPrompt) list.push({ url: row.url, width: row.width ?? 0, height: row.height ?? 0 });
    out.set(row.prompt_id, list);
  }
  return out;
}
