/**
 * İlişki Haritası service layer — builds the relationship graph around one
 * piece of content by READING the systems that already own the data:
 *
 *  - workflow steps / connections        → `workflow_step`
 *  - prompts.generator_id                → `uses_generator`
 *  - prompts.request_id                  → `request_result`
 *  - accepted prompt_edit_suggestions    → `accepted_suggestion`
 *  - stored Prompt DNA (staged lookup)   → `dna_similar`   (never persisted)
 *  - content_relations (the only new table) → `similar` / `alternative` / `inspired_by`
 *
 * Nothing is copied into a relationship table except the three manual types.
 * Every query runs under the caller's RLS, so private/unpublished content is
 * simply absent (never "hidden by the UI"). A failing source degrades to an
 * empty one — the rest of the graph still renders.
 */

import { supabase } from "./client";
import { withoutBlocked } from "./blocked-users";
import { fetchDnaSections } from "./prompt-dna";
import { fetchSuggestionsForPrompt } from "./prompt-edit-suggestions";
import { fetchVersionsForPrompt } from "./prompt-versions";
import { fetchPromptById, fetchPromptsByAuthor, mapPromptRow, searchPrompts, PROMPT_SELECT, type PromptRow } from "./prompts";
import { fetchGeneratorById, fetchGeneratorsByAuthor, mapGeneratorRow, searchGenerators, GENERATOR_SELECT, type GeneratorRow } from "./generators";
import { fetchWorkflowById, fetchWorkflowsByCreator, mapWorkflowRow, searchWorkflows, WORKFLOW_SELECT, type WorkflowRow } from "./workflows";
import { fetchRequestById, fetchRequestsByAuthor, mapRequestRow, searchRequests, REQUEST_SELECT, type RequestRow } from "./requests";
import { translateForRuntime } from "@/lib/i18n/translations";
import { analyzePromptDna } from "@/lib/prompt-dna/analyzer";
import { itemsToContent } from "@/lib/prompt-dna/merge";
import { DNA_SECTION_TYPES, type DnaSectionType } from "@/lib/prompt-dna/types";
import { compareDna, sectionTokens, type DnaFeatureSection, type DnaFeatureSet } from "@/lib/relations/dna-similarity";
import {
  RELATION_TYPES,
  nodeKey,
  type ManualRelationType,
  type RelatableKind,
  type RelationEdge,
  type RelationNode,
  type RelationNodeKind,
  type RelationReason,
  type RelationType,
} from "@/lib/relations/types";
import { generatorHref, promptHref, requestHref, workflowHref } from "@/lib/utils";
import type { Generator, Prompt, PromptEditSuggestion, PromptRequest, Workflow } from "@/types";

/* ---------------------------------------------------------------------- */
/* Caps — "limit or paginate large graphs". The UI shows when one was hit. */
/* ---------------------------------------------------------------------- */

export const GRAPH_CAPS = {
  manual: 30,
  workflows: 6,
  workflowNeighbors: 8,
  generatorPrompts: 12,
  requestResults: 12,
  suggestions: 8,
  dnaCandidates: 40,
  dnaShown: 10,
} as const;

export type DnaStatus =
  /** Stored, author-accepted DNA was used. */
  | "stored"
  /** The prompt had no stored DNA; it was analyzed on the fly from its own text (local, free). */
  | "analyzed"
  /** No DNA could be derived (empty / too short prompt). */
  | "none"
  /** The map's center is not a prompt — DNA applies to prompts only. */
  | "not_applicable"
  /** The candidate lookup failed (e.g. migration not applied yet). */
  | "unavailable";

export interface RelationGraph {
  center: RelationNode;
  /** Every node including the center. */
  nodes: RelationNode[];
  edges: RelationEdge[];
  dna: DnaStatus;
  /** Which sources hit their cap (so the UI can say "showing the first N"). */
  capped: string[];
}

/* ---------------------------------------------------------------------- */
/* Node adapters                                                           */
/* ---------------------------------------------------------------------- */

function clip(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function promptToNode(p: Prompt): RelationNode {
  return {
    key: nodeKey("prompt", p.id),
    kind: "prompt",
    id: p.id,
    title: p.title,
    description: clip(p.description || p.promptText),
    ownerId: p.author.id,
    ownerName: p.author.displayName,
    ownerUsername: p.author.username,
    imageUrl: p.media[0]?.url ?? null,
    contentType: p.contentType,
    href: promptHref(p),
  };
}

export function generatorToNode(g: Generator): RelationNode {
  return {
    key: nodeKey("generator", g.id),
    kind: "generator",
    id: g.id,
    title: g.title,
    description: clip(g.description),
    ownerId: g.creator.id,
    ownerName: g.creator.displayName,
    ownerUsername: g.creator.username,
    imageUrl: g.coverUrl,
    contentType: g.contentType,
    href: generatorHref(g),
  };
}

export function workflowToNode(w: Workflow): RelationNode {
  return {
    key: nodeKey("workflow", w.id),
    kind: "workflow",
    id: w.id,
    title: w.title,
    description: clip(w.description),
    ownerId: w.creator.id,
    ownerName: w.creator.displayName,
    ownerUsername: w.creator.username,
    imageUrl: w.coverUrl,
    contentType: w.contentTypes[0] ?? null,
    href: workflowHref(w),
  };
}

export function requestToNode(r: PromptRequest): RelationNode {
  return {
    key: nodeKey("request", r.id),
    kind: "request",
    id: r.id,
    title: r.title,
    description: clip(r.description),
    ownerId: r.author.id,
    ownerName: r.author.displayName,
    ownerUsername: r.author.username,
    imageUrl: r.referenceImage?.url ?? null,
    contentType: r.contentType ?? null,
    href: requestHref(r),
  };
}

function suggestionToNode(s: PromptEditSuggestion, prompt: Prompt): RelationNode {
  return {
    key: nodeKey("suggestion", s.id),
    kind: "suggestion",
    id: s.id,
    title: clip(s.suggestionText, 80),
    description: clip(s.suggestionText),
    ownerId: s.proposer.id,
    ownerName: s.proposer.displayName,
    ownerUsername: s.proposer.username,
    imageUrl: null,
    contentType: null,
    // A merged suggestion lives in the prompt's own history; the prompt page is the real destination.
    href: promptHref(prompt),
  };
}

/* ---------------------------------------------------------------------- */
/* Batched node resolution                                                 */
/* ---------------------------------------------------------------------- */

interface Ref {
  kind: RelatableKind;
  id: string;
}

/** Resolves content refs to nodes in at most four batched queries. Missing / invisible / deleted refs are simply absent. */
async function fetchNodesByRefs(refs: Ref[]): Promise<Map<string, RelationNode>> {
  const out = new Map<string, RelationNode>();
  const ids = (kind: RelatableKind) => [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.id))];
  const promptIds = ids("prompt");
  const generatorIds = ids("generator");
  const workflowIds = ids("workflow");
  const requestIds = ids("request");

  const [prompts, generators, workflows, requests] = await Promise.all([
    promptIds.length ? supabase.from("prompts").select(PROMPT_SELECT).in("id", promptIds) : Promise.resolve({ data: [] }),
    generatorIds.length ? supabase.from("generators").select(GENERATOR_SELECT).in("id", generatorIds) : Promise.resolve({ data: [] }),
    workflowIds.length ? supabase.from("workflows").select(WORKFLOW_SELECT).in("id", workflowIds) : Promise.resolve({ data: [] }),
    requestIds.length ? supabase.from("prompt_requests").select(REQUEST_SELECT).in("id", requestIds) : Promise.resolve({ data: [] }),
  ]).catch((err) => {
    console.error("fetchNodesByRefs", err);
    return [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  });

  const blockedFiltered = async <T,>(items: T[], authorId: (item: T) => string) => withoutBlocked(items, authorId);

  for (const p of await blockedFiltered(
    (prompts.data ?? []).map((row) => mapPromptRow(row as unknown as PromptRow)).filter((p) => !p.deletedAt && p.status === "published"),
    (p) => p.author.id,
  )) {
    out.set(nodeKey("prompt", p.id), promptToNode(p));
  }
  for (const g of await blockedFiltered(
    (generators.data ?? []).map((row) => mapGeneratorRow(row as unknown as GeneratorRow)).filter((g) => g.status === "published"),
    (g) => g.creator.id,
  )) {
    out.set(nodeKey("generator", g.id), generatorToNode(g));
  }
  for (const w of await blockedFiltered(
    (workflows.data ?? []).map((row) => mapWorkflowRow(row as unknown as WorkflowRow)).filter((w) => w.status === "published"),
    (w) => w.creator.id,
  )) {
    out.set(nodeKey("workflow", w.id), workflowToNode(w));
  }
  for (const r of await blockedFiltered(
    (requests.data ?? []).map((row) => mapRequestRow(row as unknown as RequestRow)).filter((r) => !r.deletedAt),
    (r) => r.author.id,
  )) {
    out.set(nodeKey("request", r.id), requestToNode(r));
  }
  return out;
}

/* ---------------------------------------------------------------------- */
/* Center                                                                  */
/* ---------------------------------------------------------------------- */

interface CenterLoaded {
  node: RelationNode;
  prompt?: Prompt;
  request?: PromptRequest;
  workflow?: Awaited<ReturnType<typeof fetchWorkflowById>>;
}

async function loadCenter(kind: RelatableKind, id: string): Promise<CenterLoaded | null> {
  if (kind === "prompt") {
    const prompt = await fetchPromptById(id);
    return prompt && !prompt.deletedAt ? { node: promptToNode(prompt), prompt } : null;
  }
  if (kind === "generator") {
    const generator = await fetchGeneratorById(id);
    return generator ? { node: generatorToNode(generator) } : null;
  }
  if (kind === "workflow") {
    const workflow = await fetchWorkflowById(id);
    return workflow ? { node: workflowToNode(workflow.workflow), workflow } : null;
  }
  const request = await fetchRequestById(id);
  return request && !request.deletedAt ? { node: requestToNode(request), request } : null;
}

/* ---------------------------------------------------------------------- */
/* Derived relations                                                       */
/* ---------------------------------------------------------------------- */

interface Partial_ {
  nodes: RelationNode[];
  edges: RelationEdge[];
  capped?: string;
}

const EMPTY: Partial_ = { nodes: [], edges: [] };

function edge(type: RelationType, from: string, to: string, extra: Partial<RelationEdge> & { reasons: RelationReason[] }, suffix = ""): RelationEdge {
  return { id: `${type}:${from}>${to}${suffix ? `:${suffix}` : ""}`, type, from, to, ...extra };
}

interface StepLink {
  id: string;
  workflow_id: string;
  position: number;
}

/**
 * Workflows that contain this content (as a step), plus the contents of the
 * steps directly connected to it — read from `workflow_steps` /
 * `workflow_connections`, never copied.
 */
async function workflowRelations(center: RelationNode): Promise<Partial_> {
  const column = center.kind === "prompt" ? "prompt_id" : center.kind === "generator" ? "generator_id" : center.kind === "request" ? "request_id" : null;
  if (!column) return EMPTY;

  const { data: stepRows, error } = await supabase
    .from("workflow_steps")
    .select("id, workflow_id, position")
    .eq(column, center.id)
    .limit(GRAPH_CAPS.workflows * 3);
  if (error) {
    console.error("workflowRelations steps", error);
    return EMPTY;
  }
  const steps = (stepRows ?? []) as StepLink[];
  if (steps.length === 0) return EMPTY;

  const workflowRefs: Ref[] = [...new Set(steps.map((s) => s.workflow_id))].map((id) => ({ kind: "workflow", id }));
  const workflowNodes = await fetchNodesByRefs(workflowRefs);
  const visibleSteps = steps.filter((s) => workflowNodes.has(nodeKey("workflow", s.workflow_id))).slice(0, GRAPH_CAPS.workflows);
  const capped = steps.length > visibleSteps.length ? "workflows" : undefined;
  if (visibleSteps.length === 0) return EMPTY;

  const nodes: RelationNode[] = [];
  const edges: RelationEdge[] = [];
  for (const step of visibleSteps) {
    const workflow = workflowNodes.get(nodeKey("workflow", step.workflow_id))!;
    if (!nodes.some((n) => n.key === workflow.key)) nodes.push(workflow);
    edges.push(
      edge("workflow_step", workflow.key, center.key, { reasons: [{ kind: "workflow", workflowTitle: workflow.title, position: step.position + 1 }] }, step.id),
    );
  }

  // Steps wired directly to this one (either direction), then the content they point at.
  const stepIds = visibleSteps.map((s) => s.id);
  const { data: connRows, error: connError } = await supabase
    .from("workflow_connections")
    .select("workflow_id, from_step_id, to_step_id")
    .in("workflow_id", [...new Set(visibleSteps.map((s) => s.workflow_id))])
    .or(`from_step_id.in.(${stepIds.join(",")}),to_step_id.in.(${stepIds.join(",")})`);
  if (connError) {
    console.error("workflowRelations connections", connError);
    return { nodes, edges, capped };
  }
  const conns = ((connRows ?? []) as { workflow_id: string; from_step_id: string; to_step_id: string }[]).slice(0, GRAPH_CAPS.workflowNeighbors * 2);
  const neighborStepIds = [...new Set(conns.flatMap((c) => [c.from_step_id, c.to_step_id]).filter((id) => !stepIds.includes(id)))];
  if (neighborStepIds.length === 0) return { nodes, edges, capped };

  const { data: neighborRows } = await supabase
    .from("workflow_steps")
    .select("id, position, step_type, prompt_id, generator_id, request_id")
    .in("id", neighborStepIds);
  type NeighborRow = { id: string; position: number; step_type: string; prompt_id: string | null; generator_id: string | null; request_id: string | null };
  const neighborSteps = (neighborRows ?? []) as NeighborRow[];
  const neighborRefs: Ref[] = neighborSteps.flatMap((s): Ref[] =>
    s.prompt_id ? [{ kind: "prompt", id: s.prompt_id }] : s.generator_id ? [{ kind: "generator", id: s.generator_id }] : s.request_id ? [{ kind: "request", id: s.request_id }] : [],
  );
  const neighborNodes = await fetchNodesByRefs(neighborRefs);
  const ownByStepId = new Map(visibleSteps.map((s) => [s.id, s]));
  let added = 0;
  for (const conn of conns) {
    if (added >= GRAPH_CAPS.workflowNeighbors) break;
    const fromIsOwn = ownByStepId.has(conn.from_step_id);
    const otherStepId = fromIsOwn ? conn.to_step_id : conn.from_step_id;
    const own = ownByStepId.get(fromIsOwn ? conn.from_step_id : conn.to_step_id);
    const otherStep = neighborSteps.find((s) => s.id === otherStepId);
    if (!own || !otherStep) continue;
    const refId = otherStep.prompt_id ?? otherStep.generator_id ?? otherStep.request_id;
    const refKind: RelatableKind = otherStep.prompt_id ? "prompt" : otherStep.generator_id ? "generator" : "request";
    const neighbor = refId ? neighborNodes.get(nodeKey(refKind, refId)) : undefined;
    if (!neighbor || neighbor.key === center.key) continue;
    const workflow = workflowNodes.get(nodeKey("workflow", conn.workflow_id));
    if (!workflow) continue;
    if (!nodes.some((n) => n.key === neighbor.key)) nodes.push(neighbor);
    const from = fromIsOwn ? center.key : neighbor.key;
    const to = fromIsOwn ? neighbor.key : center.key;
    edges.push(
      edge(
        "workflow_step",
        from,
        to,
        { reasons: [{ kind: "workflowNeighbor", workflowTitle: workflow.title, fromPosition: (fromIsOwn ? own.position : otherStep.position) + 1, toPosition: (fromIsOwn ? otherStep.position : own.position) + 1 }] },
        `${conn.from_step_id}-${conn.to_step_id}`,
      ),
    );
    added += 1;
  }
  return { nodes, edges, capped };
}

/** Steps of a workflow that is the map's center: the workflow → each step's content. */
function workflowCenterRelations(center: RelationNode, loaded: NonNullable<CenterLoaded["workflow"]>): Partial_ {
  const nodes: RelationNode[] = [];
  const edges: RelationEdge[] = [];
  for (const step of loaded.steps) {
    const ref = step.content;
    if (!ref || !ref.published) continue;
    const kind: RelatableKind = ref.type;
    const key = nodeKey(kind, ref.id);
    if (!nodes.some((n) => n.key === key)) {
      nodes.push({
        key,
        kind,
        id: ref.id,
        title: ref.title,
        description: "",
        ownerId: null,
        ownerName: ref.authorName,
        ownerUsername: ref.authorUsername,
        imageUrl: ref.thumbnailUrl,
        contentType: ref.contentType,
        href: ref.href,
      });
    }
    edges.push(edge("workflow_step", center.key, key, { reasons: [{ kind: "workflow", workflowTitle: center.title, position: step.id ? loaded.steps.indexOf(step) + 1 : 1 }] }, step.id));
  }
  return { nodes, edges };
}

/** Prompt center: the generator it was made with and the request it answers. */
async function promptProvenance(center: RelationNode, prompt: Prompt): Promise<Partial_> {
  const refs: Ref[] = [];
  if (prompt.generatedFrom) refs.push({ kind: "generator", id: prompt.generatedFrom.generatorId });
  if (prompt.origin.type === "request-response") refs.push({ kind: "request", id: prompt.origin.requestId });
  if (refs.length === 0) return EMPTY;
  const resolved = await fetchNodesByRefs(refs);
  const nodes: RelationNode[] = [];
  const edges: RelationEdge[] = [];
  if (prompt.generatedFrom) {
    const generator = resolved.get(nodeKey("generator", prompt.generatedFrom.generatorId));
    if (generator) {
      nodes.push(generator);
      edges.push(edge("uses_generator", center.key, generator.key, { reasons: [{ kind: "info", key: "relations.reason.madeWithGenerator" }] }));
    }
  }
  if (prompt.origin.type === "request-response") {
    const request = await fetchRequestById(prompt.origin.requestId);
    if (request && !request.deletedAt) {
      const node = requestToNode(request);
      nodes.push(node);
      edges.push(
        edge("request_result", node.key, center.key, {
          reasons: request.selectedResponsePromptId === prompt.id ? [{ kind: "selectedAnswer" }] : [{ kind: "info", key: "relations.reason.answersRequest" }],
        }),
      );
    }
  }
  return { nodes, edges };
}

/** Generator center: prompts that were made with it (published + visible only). */
async function generatorPrompts(center: RelationNode): Promise<Partial_> {
  const { data, error } = await supabase
    .from("prompts")
    .select(PROMPT_SELECT)
    .eq("generator_id", center.id)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(GRAPH_CAPS.generatorPrompts + 1);
  if (error) {
    console.error("generatorPrompts", error);
    return EMPTY;
  }
  const prompts = await withoutBlocked(
    (data ?? []).map((row) => mapPromptRow(row as unknown as PromptRow)).filter((p) => !p.deletedAt),
    (p) => p.author.id,
  );
  const shown = prompts.slice(0, GRAPH_CAPS.generatorPrompts);
  return {
    nodes: shown.map(promptToNode),
    edges: shown.map((p) => edge("uses_generator", nodeKey("prompt", p.id), center.key, { reasons: [{ kind: "info", key: "relations.reason.madeWithGenerator" }] })),
    capped: prompts.length > shown.length ? "generatorPrompts" : undefined,
  };
}

/** Request center: the answers (results) given to it. */
async function requestResults(center: RelationNode, request: PromptRequest): Promise<Partial_> {
  const { data, error } = await supabase
    .from("prompts")
    .select(PROMPT_SELECT)
    .eq("request_id", center.id)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(GRAPH_CAPS.requestResults + 1);
  if (error) {
    console.error("requestResults", error);
    return EMPTY;
  }
  const prompts = await withoutBlocked(
    (data ?? []).map((row) => mapPromptRow(row as unknown as PromptRow)).filter((p) => !p.deletedAt),
    (p) => p.author.id,
  );
  const shown = prompts.slice(0, GRAPH_CAPS.requestResults);
  return {
    nodes: shown.map(promptToNode),
    edges: shown.map((p) =>
      edge("request_result", center.key, nodeKey("prompt", p.id), {
        reasons: request.selectedResponsePromptId === p.id ? [{ kind: "selectedAnswer" }] : [{ kind: "info", key: "relations.reason.answersRequest" }],
      }),
    ),
    capped: prompts.length > shown.length ? "requestResults" : undefined,
  };
}

/** Prompt center: accepted edit suggestions (public credit, RLS 20260919400000). */
async function acceptedSuggestions(center: RelationNode, prompt: Prompt): Promise<Partial_> {
  const [suggestions, versions] = await Promise.all([fetchSuggestionsForPrompt(prompt.id), fetchVersionsForPrompt(prompt.id)]);
  const accepted = suggestions.filter((s) => s.status === "accepted");
  if (accepted.length === 0) return EMPTY;
  const shown = accepted.slice(0, GRAPH_CAPS.suggestions);
  const versionNumber = (s: PromptEditSuggestion) => versions.find((v) => v.id === s.acceptedVersionId || v.suggestionId === s.id)?.versionNumber ?? null;
  return {
    nodes: shown.map((s) => suggestionToNode(s, prompt)),
    edges: shown.map((s) => edge("accepted_suggestion", nodeKey("suggestion", s.id), center.key, { reasons: [{ kind: "suggestion", versionNumber: versionNumber(s) }] })),
    capped: accepted.length > shown.length ? "suggestions" : undefined,
  };
}

/* ---------------------------------------------------------------------- */
/* DNA similarity (suggestions only — never stored)                        */
/* ---------------------------------------------------------------------- */

function isSectionType(value: string): value is DnaSectionType {
  return (DNA_SECTION_TYPES as readonly string[]).includes(value);
}

function featureSet(prompt: Prompt, sections: DnaFeatureSection[]): DnaFeatureSet {
  return { sections, tags: prompt.tags.map((t) => t.slug), category: prompt.category, subcategory: prompt.subcategory };
}

/** Bounded, RLS-filtered candidates that share a category or a tag with the prompt (used when no DNA is stored yet). */
async function structuralCandidateIds(prompt: Prompt): Promise<string[]> {
  const ids = new Set<string>();
  if (prompt.category) {
    const { data } = await supabase
      .from("prompts")
      .select("id")
      .eq("status", "published")
      .eq("content_type", prompt.contentType)
      .eq("category", prompt.category)
      .neq("id", prompt.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(GRAPH_CAPS.dnaCandidates);
    for (const row of (data ?? []) as { id: string }[]) ids.add(row.id);
  }
  const slugs = prompt.tags.map((t) => t.slug);
  if (slugs.length > 0) {
    const { data } = await supabase.from("prompt_tags").select("prompt_id").in("tag_slug", slugs).neq("prompt_id", prompt.id).limit(GRAPH_CAPS.dnaCandidates);
    for (const row of (data ?? []) as { prompt_id: string }[]) ids.add(row.prompt_id);
  }
  return [...ids].slice(0, GRAPH_CAPS.dnaCandidates);
}

async function dnaSuggestions(center: RelationNode, prompt: Prompt): Promise<Partial_ & { status: DnaStatus }> {
  // 1. The center's DNA: stored first (never re-analyze what is already stored); otherwise a local, free, on-the-fly analysis.
  let status: DnaStatus = "stored";
  let sections: DnaFeatureSection[] = (await fetchDnaSections(prompt.id)).map((s) => ({ type: s.type, content: s.content }));
  if (sections.length === 0) {
    sections = analyzePromptDna(prompt.promptText).sections.map((s) => ({ type: s.type, content: itemsToContent(s) }));
    status = sections.length > 0 ? "analyzed" : "none";
  }
  if (sections.length === 0) return { ...EMPTY, status };

  // 2. Indexed candidate lookup — only prompts that share a word in the same section type come back (never "all prompts").
  const { data: candidateRows, error } = await supabase.rpc("dna_similar_candidates", {
    p_exclude: prompt.id,
    p_sections: sectionTokens(sections),
    p_limit: GRAPH_CAPS.dnaCandidates,
  });
  if (error) {
    console.error("dnaSuggestions candidates", error);
    return { ...EMPTY, status: "unavailable" };
  }
  let candidateIds = ((candidateRows ?? []) as { prompt_id: string }[]).map((r) => r.prompt_id);
  // Fallback: no stored DNA exists yet (older posts), so the indexed lookup is empty. Look at a small, bounded set of
  // same-type posts that share a category or a tag; their DNA is analyzed locally below.
  if (candidateIds.length === 0) candidateIds = await structuralCandidateIds(prompt);
  if (candidateIds.length === 0) return { ...EMPTY, status };

  // 3. Only now load what scoring needs for that small set: their DNA and their (RLS-visible) prompt rows.
  const [dnaRows, promptRows] = await Promise.all([
    supabase.from("prompt_dna_sections").select("prompt_id, type, content").in("prompt_id", candidateIds),
    supabase.from("prompts").select(PROMPT_SELECT).in("id", candidateIds),
  ]);
  const sectionsByPrompt = new Map<string, DnaFeatureSection[]>();
  for (const row of (dnaRows.data ?? []) as { prompt_id: string; type: string; content: string }[]) {
    if (!isSectionType(row.type)) continue;
    sectionsByPrompt.set(row.prompt_id, [...(sectionsByPrompt.get(row.prompt_id) ?? []), { type: row.type, content: row.content }]);
  }
  const candidates = await withoutBlocked(
    (promptRows.data ?? []).map((row) => mapPromptRow(row as unknown as PromptRow)).filter((p) => !p.deletedAt && p.status === "published"),
    (p) => p.author.id,
  );

  // 4. Score, keep the best few.
  const mine = featureSet(prompt, sections);
  const sectionsFor = (candidate: Prompt): DnaFeatureSection[] => {
    const stored = sectionsByPrompt.get(candidate.id);
    if (stored && stored.length > 0) return stored;
    return analyzePromptDna(candidate.promptText).sections.map((sec) => ({ type: sec.type, content: itemsToContent(sec) }));
  };
  const scored = candidates
    .map((candidate) => ({ candidate, result: compareDna(mine, featureSet(candidate, sectionsFor(candidate))) }))
    .filter((entry): entry is { candidate: Prompt; result: NonNullable<ReturnType<typeof compareDna>> } => entry.result !== null)
    .sort((a, b) => b.result.score - a.result.score);
  const shown = scored.slice(0, GRAPH_CAPS.dnaShown);

  return {
    status,
    nodes: shown.map((entry) => promptToNode(entry.candidate)),
    edges: shown.map(({ candidate, result }) => {
      const reasons: RelationReason[] = result.shared.map((s) => ({ kind: "sharedSection", section: s.type, pieces: s.pieces }));
      if (result.sharedTags.length > 0) reasons.push({ kind: "sharedTags", tags: result.sharedTags });
      if (result.sameCategory && prompt.category) reasons.push({ kind: "sameCategory", contentType: prompt.contentType, category: prompt.category, subcategory: result.sameSubcategory ? prompt.subcategory : null });
      return edge("dna_similar", center.key, nodeKey("prompt", candidate.id), { reasons, score: result.score, level: result.level });
    }),
    capped: scored.length > shown.length ? "dna" : undefined,
  };
}

/* ---------------------------------------------------------------------- */
/* Manual relations                                                        */
/* ---------------------------------------------------------------------- */

interface RelationRow {
  id: string;
  source_type: RelatableKind;
  source_id: string;
  target_type: RelatableKind;
  target_id: string;
  relation_type: ManualRelationType;
  note: string | null;
  created_by: string;
}

async function manualRelations(center: RelationNode, viewerId: string | null): Promise<Partial_> {
  const { data, error } = await supabase
    .from("content_relations")
    .select("id, source_type, source_id, target_type, target_id, relation_type, note, created_by")
    .or(`and(source_type.eq.${center.kind},source_id.eq.${center.id}),and(target_type.eq.${center.kind},target_id.eq.${center.id})`)
    .order("created_at", { ascending: false })
    .limit(GRAPH_CAPS.manual + 1);
  if (error) {
    console.error("manualRelations", error);
    return EMPTY;
  }
  const rows = (data ?? []) as RelationRow[];
  const shownRows = rows.slice(0, GRAPH_CAPS.manual);
  const refs: Ref[] = shownRows.map((row) =>
    row.source_type === center.kind && row.source_id === center.id ? { kind: row.target_type, id: row.target_id } : { kind: row.source_type, id: row.source_id },
  );
  const resolved = await fetchNodesByRefs(refs);
  const nodes: RelationNode[] = [];
  const edges: RelationEdge[] = [];
  shownRows.forEach((row, index) => {
    const other = resolved.get(nodeKey(refs[index].kind, refs[index].id));
    if (!other) return; // other end is private / deleted / blocked
    if (!nodes.some((n) => n.key === other.key)) nodes.push(other);
    const centerIsSource = row.source_type === center.kind && row.source_id === center.id;
    const reasons: RelationReason[] = row.note ? [{ kind: "note", text: row.note }] : [{ kind: "info", key: "relations.reason.manual" }];
    edges.push(
      edge(row.relation_type, centerIsSource ? center.key : other.key, centerIsSource ? other.key : center.key, {
        reasons,
        relationId: row.id,
        canRemove: Boolean(viewerId) && (row.created_by === viewerId || center.ownerId === viewerId || other.ownerId === viewerId),
      }, row.id),
    );
  });
  return { nodes, edges, capped: rows.length > shownRows.length ? "manual" : undefined };
}

/* ---------------------------------------------------------------------- */
/* The graph                                                               */
/* ---------------------------------------------------------------------- */

async function safe<T extends Partial_>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    console.error("relation source failed", err);
    return fallback;
  }
}

/**
 * The relationship graph around one piece of content, or `null` when the
 * content does not exist / is not visible to the viewer.
 */
export async function fetchRelationGraph(kind: RelatableKind, id: string, viewerId: string | null): Promise<RelationGraph | null> {
  const loaded = await loadCenter(kind, id);
  if (!loaded) return null;
  const center = loaded.node;

  const dnaFallback = { ...EMPTY, status: (kind === "prompt" ? "unavailable" : "not_applicable") as DnaStatus };
  const [manual, workflows, provenance, children, suggestions, dna] = await Promise.all([
    safe(manualRelations(center, viewerId), EMPTY),
    kind === "workflow" ? Promise.resolve(loaded.workflow ? workflowCenterRelations(center, loaded.workflow) : EMPTY) : safe(workflowRelations(center), EMPTY),
    loaded.prompt ? safe(promptProvenance(center, loaded.prompt), EMPTY) : Promise.resolve(EMPTY),
    kind === "generator" ? safe(generatorPrompts(center), EMPTY) : loaded.request ? safe(requestResults(center, loaded.request), EMPTY) : Promise.resolve(EMPTY),
    loaded.prompt ? safe(acceptedSuggestions(center, loaded.prompt), EMPTY) : Promise.resolve(EMPTY),
    loaded.prompt ? safe(dnaSuggestions(center, loaded.prompt), dnaFallback) : Promise.resolve({ ...EMPTY, status: "not_applicable" as DnaStatus }),
  ]);

  const parts: Partial_[] = [manual, workflows, provenance, children, suggestions, dna];
  const nodeMap = new Map<string, RelationNode>([[center.key, center]]);
  for (const part of parts) for (const node of part.nodes) if (!nodeMap.has(node.key)) nodeMap.set(node.key, node);

  // An edge survives only if both ends resolved; identical ids (same relation reached twice) collapse.
  const seen = new Set<string>();
  const edges: RelationEdge[] = [];
  for (const part of parts) {
    for (const e of part.edges) {
      if (seen.has(e.id) || !nodeMap.has(e.from) || !nodeMap.has(e.to)) continue;
      seen.add(e.id);
      edges.push(e);
    }
  }
  // A manual relation to something that is ALSO a DNA suggestion should read as the manual one (more deliberate): drop the duplicate suggestion.
  const manualPairs = new Set(edges.filter((e) => RELATION_TYPES[e.type].origin === "manual").map((e) => [e.from, e.to].sort().join("|")));
  const deduped = edges.filter((e) => e.type !== "dna_similar" || !manualPairs.has([e.from, e.to].sort().join("|")));

  const usedKeys = new Set(deduped.flatMap((e) => [e.from, e.to]));
  usedKeys.add(center.key);
  return {
    center,
    nodes: [...nodeMap.values()].filter((n) => usedKeys.has(n.key)),
    edges: deduped,
    dna: dna.status,
    capped: [...new Set(parts.map((p) => p.capped).filter((c): c is string => Boolean(c)))],
  };
}

/* ---------------------------------------------------------------------- */
/* Manual relation CRUD + search for the "İlişki ekle" flow                */
/* ---------------------------------------------------------------------- */

export interface CreateRelationInput {
  sourceKind: RelatableKind;
  sourceId: string;
  targetKind: RelatableKind;
  targetId: string;
  type: ManualRelationType;
  note: string;
}

export async function createManualRelation(input: CreateRelationInput, userId: string): Promise<void> {
  if (input.sourceKind === input.targetKind && input.sourceId === input.targetId) {
    throw new Error(translateForRuntime("relations.error.self"));
  }
  const { error } = await supabase.from("content_relations").insert({
    source_type: input.sourceKind,
    source_id: input.sourceId,
    target_type: input.targetKind,
    target_id: input.targetId,
    relation_type: input.type,
    note: input.note.trim() ? input.note.trim().slice(0, 200) : null,
    created_by: userId,
  });
  if (!error) return;
  if (error.code === "23505") throw new Error(translateForRuntime("relations.error.duplicate"));
  if (error.code === "23514" && /40/.test(error.message)) throw new Error(translateForRuntime("relations.error.limit"));
  if (error.code === "42501" || /row-level security/i.test(error.message)) throw new Error(translateForRuntime("relations.error.forbidden"));
  throw new Error(error.message);
}

export async function deleteManualRelation(relationId: string): Promise<void> {
  const { data, error } = await supabase.from("content_relations").delete().eq("id", relationId).select("id");
  if (error) throw new Error(error.message);
  // RLS hides rows the caller may not delete (0 rows, no error) — never report that as success.
  if (!data || data.length === 0) throw new Error(translateForRuntime("relations.error.forbidden"));
}

/**
 * Content the viewer may relate to: searched by title/description, or — with
 * an empty query — the viewer's own content (the most common source of a
 * relation). Everything is RLS-visible content; the center is excluded.
 */
export async function searchRelatableContent(query: string, kinds: RelatableKind[], viewerId: string | null, exclude: { kind: RelatableKind; id: string }): Promise<RelationNode[]> {
  const q = query.trim();
  const limit = 10;
  const tasks = kinds.map(async (kind): Promise<RelationNode[]> => {
    try {
      if (kind === "prompt") {
        const list = q ? await searchPrompts(q, {}, limit) : viewerId ? (await fetchPromptsByAuthor(viewerId)).slice(0, limit) : [];
        return list.filter((p) => p.status === "published").map(promptToNode);
      }
      if (kind === "generator") {
        const list = q ? await searchGenerators(q, {}, limit) : viewerId ? (await fetchGeneratorsByAuthor(viewerId)).slice(0, limit) : [];
        return list.filter((g) => g.status === "published").map(generatorToNode);
      }
      if (kind === "workflow") {
        const list = q ? await searchWorkflows(q, {}, limit) : viewerId ? (await fetchWorkflowsByCreator(viewerId)).slice(0, limit) : [];
        return list.filter((w) => w.status === "published").map(workflowToNode);
      }
      const list = q ? await searchRequests(q, {}, limit) : viewerId ? (await fetchRequestsByAuthor(viewerId)).slice(0, limit) : [];
      return list.filter((r) => !r.deletedAt).map(requestToNode);
    } catch (err) {
      console.error("searchRelatableContent", err);
      return [];
    }
  });
  const results = (await Promise.all(tasks)).flat();
  return results.filter((node) => !(node.kind === exclude.kind && node.id === exclude.id));
}

export type { RelationNodeKind };
