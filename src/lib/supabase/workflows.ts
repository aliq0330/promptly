import { supabase } from "./client";
import { withoutBlocked } from "./blocked-users";
import { applyKeysetCursor, nextCursorFrom, type KeysetCursor } from "./pagination";
import { PROFILE_SELECT } from "./profiles";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { PROMPT_SELECT, mapPromptRow, type PromptRow } from "./prompts";
import { GENERATOR_SELECT, mapGeneratorRow, type GeneratorRow } from "./generators";
import { REQUEST_SELECT, mapRequestRow, type RequestRow } from "./requests";
import { connectionsFromSteps } from "@/lib/workflow-logic";
import { normalizeToolRefs } from "@/lib/ai-tool-catalog";
import { applyAdvancedFilters, hasSearchFilter, sanitizeSearchText, tagJoinSelect, type ContentSearchFilters } from "./taxonomy-query";
import { generatorHref, promptHref, requestHref } from "@/lib/utils";
import { translateForRuntime } from "@/lib/i18n/translations";
import type { MultiImageItem } from "./media-input";
import type { Generator, Prompt, PromptContentType, PromptMedia, Tag, PromptRequest, Workflow, WorkflowContentRef, WorkflowInput, WorkflowIO, WorkflowStep, WorkflowStepType } from "@/types";

export interface WorkflowRow {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  cover_url: string | null;
  content_types: string[] | null;
  category: string | null;
  tools: string[] | null;
  status: "draft" | "published";
  like_count: number | null;
  save_count: number | null;
  comment_count: number | null;
  created_at: string;
  updated_at: string;
  profiles: ProfileRow;
  workflow_steps: { count: number }[] | null;
  workflow_tags: { tags: { slug: string; label: string } }[] | null;
  workflow_media: { id: string; url: string; width: number; height: number; alt: string | null; position: number }[] | null;
}

export const WORKFLOW_SELECT = `
  id, creator_id, title, description, cover_url, content_types, category, tools, status, like_count, save_count, comment_count, created_at, updated_at,
  profiles:creator_id ( ${PROFILE_SELECT} ),
  workflow_steps ( count ),
  workflow_tags ( tags ( slug, label ) ),
  workflow_media ( id, url, width, height, alt, position )
`;

export function mapWorkflowRow(row: WorkflowRow): Workflow {
  const media: PromptMedia[] =
    (row.workflow_media ?? []).length > 0
      ? row.workflow_media!
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((m) => ({ id: m.id, url: m.url, width: m.width, height: m.height, alt: m.alt ?? row.title }))
      : row.cover_url
        ? [{ id: `${row.id}-cover`, url: row.cover_url, width: 0, height: 0, alt: row.title }]
        : [];
  return {
    id: row.id,
    creator: mapProfileRow(row.profiles),
    title: row.title,
    description: row.description,
    media,
    coverUrl: media[0]?.url ?? null,
    contentTypes: (row.content_types ?? []) as PromptContentType[],
    category: row.category,
    tools: normalizeToolRefs(row.tools),
    status: row.status,
    stepCount: row.workflow_steps?.[0]?.count ?? 0,
    likeCount: row.like_count ?? 0,
    saveCount: row.save_count ?? 0,
    commentCount: row.comment_count ?? 0,
    tags: (row.workflow_tags ?? []).map((wt): Tag => ({ slug: wt.tags.slug, label: wt.tags.label })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface StepRow {
  id: string;
  position: number;
  title: string;
  description: string;
  instructions: string;
  step_type: WorkflowStepType;
  prompt_id: string | null;
  generator_id: string | null;
  request_id: string | null;
  inputs: WorkflowInput[] | null;
  outputs: WorkflowIO[] | null;
}

export interface WorkflowsPage {
  items: Workflow[];
  nextCursor: KeysetCursor | null;
}

/**
 * Recent published workflows (RLS: plus the caller's own drafts — filtered
 * out here), keyset-paginated by `created_at`/`id` — the real "Daha fazla
 * yükle" source behind `/workflows`'s browse view.
 */
export async function fetchRecentWorkflows(limit = 24, cursor?: KeysetCursor): Promise<WorkflowsPage> {
  try {
    const request = applyKeysetCursor(
      supabase
        .from("workflows")
        .select(WORKFLOW_SELECT)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit),
      "created_at",
      cursor,
    );
    const { data, error } = await request;
    if (error) {
      console.error("fetchRecentWorkflows", error);
      return { items: [], nextCursor: null };
    }
    const rows = (data ?? []) as unknown as WorkflowRow[];
    const items = await withoutBlocked(rows.map(mapWorkflowRow), (w) => w.creator.id);
    return { items, nextCursor: nextCursorFrom(rows, limit, (row) => row.created_at) };
  } catch (err) {
    console.error("fetchRecentWorkflows", err);
    return { items: [], nextCursor: null };
  }
}

/**
 * Workflow search — same shared advanced-search filters as prompts/
 * generators/requests. A workflow chains several content types instead of
 * having one, so a media-type chip matches when the workflow chains that
 * type; a workflow has no tags and no shared-taxonomy category/subcategory,
 * so only a category/subcategory filter can never match it; tag chips match its own tags.
 */
export async function searchWorkflows(query: string, filters: ContentSearchFilters = {}, limit = 20): Promise<Workflow[]> {
  const escaped = sanitizeSearchText(query);
  if (!escaped && !hasSearchFilter(filters)) return [];
  if (filters.taxonomy?.category || filters.taxonomy?.subcategory) return [];
  try {
    let request = supabase.from("workflows").select(WORKFLOW_SELECT + tagJoinSelect("workflow_tags", filters.tagSlugs)).eq("status", "published");
    if (escaped) request = request.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`);
    if (filters.authorId) request = request.eq("creator_id", filters.authorId);
    const mediaTypes = [...(filters.contentTypes ?? []), ...(filters.taxonomy?.contentType ? [filters.taxonomy.contentType] : [])];
    if (mediaTypes.length) request = request.overlaps("content_types", mediaTypes);
    request = applyAdvancedFilters(request, { authorIds: filters.authorIds, toolRefs: filters.toolRefs, tagSlugs: filters.tagSlugs }, "creator_id");
    const order = filters.sort === "popular" ? "like_count" : "created_at";
    const { data, error } = await request.order(order, { ascending: false }).limit(limit);
    if (error) {
      console.error("searchWorkflows", error);
      return [];
    }
    return withoutBlocked((data ?? []).map((row) => mapWorkflowRow(row as unknown as WorkflowRow)), (w) => w.creator.id);
  } catch (err) {
    console.error("searchWorkflows", err);
    return [];
  }
}

/** A creator's workflows — RLS gives a visitor only published ones, the owner their drafts too. */
export async function fetchWorkflowsByCreator(creatorId: string): Promise<Workflow[]> {
  try {
    const { data, error } = await supabase
      .from("workflows")
      .select(WORKFLOW_SELECT)
      .eq("creator_id", creatorId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetchWorkflowsByCreator", error);
      return [];
    }
    return (data ?? []).map((row) => mapWorkflowRow(row as unknown as WorkflowRow));
  } catch (err) {
    console.error("fetchWorkflowsByCreator", err);
    return [];
  }
}

export function promptRef(p: Prompt): WorkflowContentRef {
  return {
    type: "prompt",
    id: p.id,
    title: p.title,
    contentType: p.contentType,
    category: p.category,
    authorName: p.author.displayName,
    authorUsername: p.author.username,
    thumbnailUrl: p.media[0]?.url ?? null,
    published: true,
    href: promptHref(p),
  };
}

export function generatorRef(g: Generator): WorkflowContentRef {
  return {
    type: "generator",
    id: g.id,
    title: g.title,
    contentType: g.contentType,
    category: g.category,
    authorName: g.creator.displayName,
    authorUsername: g.creator.username,
    thumbnailUrl: g.coverUrl,
    published: g.status === "published",
    href: generatorHref(g),
  };
}

export function requestRef(r: PromptRequest): WorkflowContentRef {
  return {
    type: "request",
    id: r.id,
    title: r.title,
    contentType: r.contentType ?? null,
    category: r.category ?? null,
    authorName: r.author.displayName,
    authorUsername: r.author.username,
    thumbnailUrl: r.referenceImage?.url ?? null,
    published: true,
    href: requestHref(r),
  };
}

/** Resolves the content each step points to in three batched queries (never per step). */
async function resolveContent(rows: StepRow[]): Promise<Map<string, WorkflowContentRef>> {
  const map = new Map<string, WorkflowContentRef>();
  const promptIds = rows.map((r) => r.prompt_id).filter((id): id is string => Boolean(id));
  const generatorIds = rows.map((r) => r.generator_id).filter((id): id is string => Boolean(id));
  const requestIds = rows.map((r) => r.request_id).filter((id): id is string => Boolean(id));
  const [prompts, generators, requests] = await Promise.all([
    promptIds.length ? supabase.from("prompts").select(PROMPT_SELECT).in("id", promptIds) : Promise.resolve({ data: [] }),
    generatorIds.length ? supabase.from("generators").select(GENERATOR_SELECT).in("id", generatorIds) : Promise.resolve({ data: [] }),
    requestIds.length ? supabase.from("prompt_requests").select(REQUEST_SELECT).in("id", requestIds) : Promise.resolve({ data: [] }),
  ]);
  for (const raw of prompts.data ?? []) {
    const p = mapPromptRow(raw as unknown as PromptRow);
    if (!p.deletedAt) map.set(`prompt:${p.id}`, promptRef(p));
  }
  for (const raw of generators.data ?? []) {
    const g = mapGeneratorRow(raw as unknown as GeneratorRow);
    map.set(`generator:${g.id}`, generatorRef(g));
  }
  for (const raw of requests.data ?? []) {
    const r = mapRequestRow(raw as unknown as RequestRow);
    if (!r.deletedAt) map.set(`request:${r.id}`, requestRef(r));
  }
  return map;
}

/** One workflow plus its ordered steps with resolved content. `null` when missing / not visible. */
export async function fetchWorkflowById(id: string): Promise<{ workflow: Workflow; steps: WorkflowStep[] } | null> {
  try {
    const { data, error } = await supabase.from("workflows").select(WORKFLOW_SELECT).eq("id", id).maybeSingle();
    if (error || !data) {
      if (error) console.error("fetchWorkflowById", error);
      return null;
    }
    const { data: stepRows, error: stepsError } = await supabase
      .from("workflow_steps")
      .select("id, position, title, description, instructions, step_type, prompt_id, generator_id, request_id, inputs, outputs")
      .eq("workflow_id", id)
      .order("position", { ascending: true });
    if (stepsError) {
      console.error("fetchWorkflowById steps", stepsError);
      return null;
    }
    const rows = (stepRows ?? []) as unknown as StepRow[];
    const content = await resolveContent(rows);
    const steps: WorkflowStep[] = rows.map((row) => {
      const refId = row.prompt_id ?? row.generator_id ?? row.request_id;
      const ref = refId ? (content.get(`${row.step_type}:${refId}`) ?? null) : null;
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        instructions: row.instructions,
        stepType: row.step_type,
        content: ref,
        // A reference that resolves to nothing: deleted, or not visible to this viewer.
        contentMissing: !ref && Boolean(refId),
        inputs: (row.inputs ?? []).map((i) => ({ id: i.id, label: i.label, source: i.source ?? null })),
        outputs: (row.outputs ?? []).map((o) => ({ id: o.id, label: o.label })),
      };
    });
    return { workflow: mapWorkflowRow(data as unknown as WorkflowRow), steps };
  } catch (err) {
    console.error("fetchWorkflowById", err);
    return null;
  }
}

export interface SaveWorkflowInput {
  id: string | null;
  title: string;
  description: string;
  /** Zero or more cover images, in order — already fully-resolved local data URLs (`MultiImagePicker`'s own preview IS the final value, same "no Storage bucket" decision as Generator, Bölüm 9.27). */
  media: MultiImageItem[];
  contentTypes: PromptContentType[];
  category: string | null;
  tools: string[];
  tags: Tag[];
  status: "draft" | "published";
  steps: WorkflowStep[];
}

/** Creates or updates the workflow row, then replaces its whole step graph in one RPC transaction. Returns the id. */
export async function saveWorkflow(input: SaveWorkflowInput, creatorId: string): Promise<string> {
  const resolvedMedia = input.media.map((item) => ({ url: item.url, width: item.width, height: item.height, alt: input.title }));
  const columns = {
    title: input.title.trim(),
    description: input.description.trim(),
    cover_url: resolvedMedia[0]?.url ?? null,
    content_types: input.contentTypes,
    category: input.category,
    tools: input.tools,
    status: input.status,
  };
  let id = input.id;
  if (id) {
    const { data, error } = await supabase.from("workflows").update(columns).eq("id", id).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(translateForRuntime("workflow.errorSave"));
  } else {
    const { data, error } = await supabase.from("workflows").insert({ ...columns, creator_id: creatorId }).select("id").single();
    if (error) throw new Error(error.message);
    id = data.id as string;
  }

  await supabase.from("workflow_media").delete().eq("workflow_id", id as string);
  if (resolvedMedia.length > 0) {
    await supabase.from("workflow_media").insert(
      resolvedMedia.map((d, index) => ({ workflow_id: id as string, url: d.url, width: d.width, height: d.height, alt: d.alt, position: index })),
    );
  }

  const stepsPayload = input.steps.map((step, position) => ({
    id: step.id,
    position,
    title: step.title.trim(),
    description: step.description.trim(),
    instructions: step.instructions.trim(),
    step_type: step.stepType,
    prompt_id: step.stepType === "prompt" ? (step.content?.id ?? null) : null,
    generator_id: step.stepType === "generator" ? (step.content?.id ?? null) : null,
    request_id: step.stepType === "request" ? (step.content?.id ?? null) : null,
    inputs: step.inputs,
    outputs: step.outputs,
  }));
  await supabase.from("workflow_tags").delete().eq("workflow_id", id as string);
  if (input.tags.length > 0) {
    const { error: tagError } = await supabase
      .from("workflow_tags")
      .insert(input.tags.map((tag) => ({ workflow_id: id, tag_slug: tag.slug })));
    if (tagError) throw new Error(tagError.message);
  }
  const { error: rpcError } = await supabase.rpc("save_workflow_graph", {
    p_workflow_id: id,
    p_steps: stepsPayload,
    p_connections: connectionsFromSteps(input.steps),
  });
  if (rpcError) throw new Error(rpcError.message);
  return id as string;
}

export async function deleteWorkflow(id: string): Promise<void> {
  const { error } = await supabase.from("workflows").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
