import { supabase } from "./client";
import { PROFILE_SELECT } from "./profiles";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { PROMPT_SELECT, mapPromptRow, type PromptRow } from "./prompts";
import { GENERATOR_SELECT, mapGeneratorRow, type GeneratorRow } from "./generators";
import { REQUEST_SELECT, mapRequestRow, type RequestRow } from "./requests";
import { connectionsFromSteps } from "@/lib/workflow-logic";
import { normalizeToolRefs } from "@/lib/ai-tool-catalog";
import { generatorHref, promptHref, requestHref } from "@/lib/utils";
import { translateForRuntime } from "@/lib/i18n/translations";
import type { Generator, Prompt, PromptContentType, PromptRequest, Workflow, WorkflowContentRef, WorkflowInput, WorkflowIO, WorkflowStep, WorkflowStepType } from "@/types";

interface WorkflowRow {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  cover_url: string | null;
  content_types: string[] | null;
  category: string | null;
  tools: string[] | null;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
  profiles: ProfileRow;
  workflow_steps: { count: number }[] | null;
}

const WORKFLOW_SELECT = `
  id, creator_id, title, description, cover_url, content_types, category, tools, status, created_at, updated_at,
  profiles:creator_id ( ${PROFILE_SELECT} ),
  workflow_steps ( count )
`;

function mapWorkflowRow(row: WorkflowRow): Workflow {
  return {
    id: row.id,
    creator: mapProfileRow(row.profiles),
    title: row.title,
    description: row.description,
    coverUrl: row.cover_url,
    contentTypes: (row.content_types ?? []) as PromptContentType[],
    category: row.category,
    tools: normalizeToolRefs(row.tools),
    status: row.status,
    stepCount: row.workflow_steps?.[0]?.count ?? 0,
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

/** Recent published workflows (RLS: plus the caller's own drafts — filtered out here). */
export async function fetchRecentWorkflows(limit = 40): Promise<Workflow[]> {
  try {
    const { data, error } = await supabase
      .from("workflows")
      .select(WORKFLOW_SELECT)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("fetchRecentWorkflows", error);
      return [];
    }
    return (data ?? []).map((row) => mapWorkflowRow(row as unknown as WorkflowRow));
  } catch (err) {
    console.error("fetchRecentWorkflows", err);
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
  coverUrl: string | null;
  contentTypes: PromptContentType[];
  category: string | null;
  tools: string[];
  status: "draft" | "published";
  steps: WorkflowStep[];
}

/** Creates or updates the workflow row, then replaces its whole step graph in one RPC transaction. Returns the id. */
export async function saveWorkflow(input: SaveWorkflowInput, creatorId: string): Promise<string> {
  const columns = {
    title: input.title.trim(),
    description: input.description.trim(),
    cover_url: input.coverUrl,
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
