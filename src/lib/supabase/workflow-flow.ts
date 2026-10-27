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
export function fetchWorkflowFlow(id: string): Promise<WorkflowFlowData | null> {
  const cached = flowCache.get(id);
  if (cached && Date.now() - cached.at < FLOW_TTL_MS) return cached.promise;
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
}

interface LinkRow {
  id: string;
  space_id: string;
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

/** Önizleme sırası: önce herkese açık + arşivsiz (en yeni başta), sonra okuyucunun yalnız kendi görebildikleri (en yeni başta). */
export function sortWorkflowSpaceLinks(links: WorkflowSpaceLink[]): WorkflowSpaceLink[] {
  const rank = (link: WorkflowSpaceLink) => (link.visibility === "public" && !link.archived ? 0 : 1);
  return [...links].sort((x, y) => rank(x) - rank(y) || y.updatedAt.localeCompare(x.updatedAt));
}

/**
 * Bu workflow'u çerçeve olarak içeren, OKUYUCUNUN okuyabildiği Space'ler (özel Space ziyaretçi için hiç gelmez).
 * İki ayrı okuma: `space_items` → `spaces` gömmesi (`spaces!inner`) kullanılamaz, çünkü iki tablo arasında iki yabancı anahtar var
 * (`space_items.space_id` ve `spaces.cover_item_id`) ve PostgREST gömmeyi belirsiz bulup hata verir (PGRST201).
 */
export async function fetchWorkflowSpaceLinks(workflowId: string): Promise<WorkflowSpaceLink[]> {
  const { data, error } = await supabase
    .from("space_items")
    .select("id, space_id, flow_show_io, flow_show_links, flow_show_relations")
    .eq("kind", "content")
    .eq("content_type", "workflow")
    .eq("content_id", workflowId)
    .limit(MAX_LINKED_SPACES);
  if (error) {
    console.error("fetchWorkflowSpaceLinks", error);
    return [];
  }
  const items = (data ?? []) as unknown as LinkRow[];
  if (items.length === 0) return [];
  const { data: spaceData, error: spaceError } = await supabase
    .from("spaces")
    .select("id, title, visibility, archived_at, updated_at")
    .in("id", [...new Set(items.map((item) => item.space_id))])
    .limit(MAX_LINKED_SPACES);
  if (spaceError) {
    console.error("fetchWorkflowSpaceLinks spaces", spaceError);
    return [];
  }
  const spaces = new Map(((spaceData ?? []) as unknown as LinkedSpaceRow[]).map((space) => [space.id, space]));
  const links: WorkflowSpaceLink[] = [];
  for (const row of items) {
    const space = spaces.get(row.space_id);
    if (!space) continue;
    links.push({
      itemId: row.id,
      spaceId: row.space_id,
      spaceTitle: space.title,
      visibility: space.visibility,
      archived: Boolean(space.archived_at),
      updatedAt: space.updated_at,
      showIo: row.flow_show_io ?? true,
      showLinks: row.flow_show_links ?? true,
      showRelations: row.flow_show_relations ?? true,
    });
  }
  return sortWorkflowSpaceLinks(links);
}
