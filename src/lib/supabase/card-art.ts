import { supabase } from "@/lib/supabase/client";
import { compareSemver } from "@/lib/skills/semver";
import { createBatchedLoader, pickArtSteps } from "./card-art-core";

export type { BatchedLoader } from "./card-art-core";

/**
 * Data for the "rich" art of the feed cards (docs/history/479-*): the small response pictures of a request, the output pictures of a
 * workflow's steps and the file list of a Skill's latest package. Each loader reads one table family with ONE query for many
 * cards (a feed page shows 20+ cards: a request per card would be a request storm — docs/history/466-*); a loader never throws
 * (an error or an empty answer = the card keeps its plain art), and every answer is cached for the page's lifetime.
 */

// ---------------------------------------------------------------- requests

/** Up to `REQUEST_RESPONSE_THUMBS` response pictures per request (newest first). */
export const REQUEST_RESPONSE_THUMBS = 3;

interface ResponseRow {
  request_id: string | null;
  created_at: string;
  prompt_media: { url: string; position: number }[] | null;
}

async function fetchRequestResponseThumbs(requestIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const { data, error } = await supabase
    .from("prompts")
    .select("request_id, created_at, prompt_media ( url, position )")
    .in("request_id", requestIds)
    .eq("origin_type", "request_response")
    .eq("status", "published")
    .eq("visibility", "public")
    .is("community_id", null)
    .is("team_file_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(requestIds.length * 12);
  if (error) {
    console.error("fetchRequestResponseThumbs", error);
    return out;
  }
  for (const row of (data ?? []) as unknown as ResponseRow[]) {
    if (!row.request_id) continue;
    const first = [...(row.prompt_media ?? [])].sort((a, b) => a.position - b.position)[0];
    if (!first) continue;
    const list = out.get(row.request_id) ?? [];
    if (list.length < REQUEST_RESPONSE_THUMBS) list.push(first.url);
    out.set(row.request_id, list);
  }
  return out;
}

export const requestResponseThumbs = createBatchedLoader<string[]>(fetchRequestResponseThumbs);

// ---------------------------------------------------------------- workflows

export interface WorkflowArtNode {
  /** 1-based position of the step in the workflow. */
  number: number;
  title: string;
  /** The first picture of the prompt the step points to; `null` for a step without one. */
  image: string | null;
}

export interface WorkflowArt {
  stepCount: number;
  /** Up to three representative steps (first · middle · last), in order. */
  nodes: WorkflowArtNode[];
}

interface StepRow {
  workflow_id: string;
  position: number;
  title: string;
  prompt_id: string | null;
}

async function fetchWorkflowArt(workflowIds: string[]): Promise<Map<string, WorkflowArt>> {
  const out = new Map<string, WorkflowArt>();
  const { data, error } = await supabase
    .from("workflow_steps")
    .select("workflow_id, position, title, prompt_id")
    .in("workflow_id", workflowIds)
    .order("position", { ascending: true })
    .limit(workflowIds.length * 40);
  if (error) {
    console.error("fetchWorkflowArt steps", error);
    return out;
  }
  const byWorkflow = new Map<string, StepRow[]>();
  for (const row of (data ?? []) as StepRow[]) {
    const list = byWorkflow.get(row.workflow_id) ?? [];
    list.push(row);
    byWorkflow.set(row.workflow_id, list);
  }
  const chosen = new Map<string, { step: StepRow; number: number }[]>();
  const promptIds = new Set<string>();
  for (const [workflowId, steps] of byWorkflow) {
    const picked = pickArtSteps(steps);
    chosen.set(workflowId, picked);
    for (const { step } of picked) if (step.prompt_id) promptIds.add(step.prompt_id);
  }
  const images = new Map<string, string>();
  if (promptIds.size > 0) {
    const { data: prompts, error: promptError } = await supabase
      .from("prompts")
      .select("id, prompt_media ( url, position )")
      .in("id", [...promptIds])
      .eq("status", "published")
      .eq("visibility", "public")
      .is("deleted_at", null);
    if (promptError) console.error("fetchWorkflowArt prompts", promptError);
    for (const row of (prompts ?? []) as unknown as { id: string; prompt_media: { url: string; position: number }[] | null }[]) {
      const first = [...(row.prompt_media ?? [])].sort((a, b) => a.position - b.position)[0];
      if (first) images.set(row.id, first.url);
    }
  }
  for (const [workflowId, picked] of chosen) {
    out.set(workflowId, {
      stepCount: byWorkflow.get(workflowId)?.length ?? 0,
      nodes: picked.map(({ step, number }) => ({ number, title: step.title, image: step.prompt_id ? (images.get(step.prompt_id) ?? null) : null })),
    });
  }
  return out;
}

export const workflowArtLoader = createBatchedLoader<WorkflowArt>(fetchWorkflowArt);

// ---------------------------------------------------------------- skills

export interface SkillPackageArt {
  version: string;
  files: { path: string; script: boolean }[];
}

interface SkillVersionArtRow {
  skill_id: string;
  version: string;
  manifest: { files?: { path?: string; script?: boolean }[] } | null;
}

async function fetchSkillPackageArt(skillIds: string[]): Promise<Map<string, SkillPackageArt>> {
  const out = new Map<string, SkillPackageArt>();
  const { data, error } = await supabase.from("skill_versions").select("skill_id, version, manifest").in("skill_id", skillIds).is("deprecated_at", null).limit(skillIds.length * 20);
  if (error) {
    console.error("fetchSkillPackageArt", error);
    return out;
  }
  const latest = new Map<string, SkillVersionArtRow>();
  for (const row of (data ?? []) as unknown as SkillVersionArtRow[]) {
    const current = latest.get(row.skill_id);
    if (!current || compareSemver(row.version, current.version) > 0) latest.set(row.skill_id, row);
  }
  for (const [skillId, row] of latest) {
    const files = (row.manifest?.files ?? []).filter((file): file is { path: string; script?: boolean } => typeof file?.path === "string").map((file) => ({ path: file.path, script: file.script === true }));
    out.set(skillId, { version: row.version, files });
  }
  return out;
}

export const skillPackageArtLoader = createBatchedLoader<SkillPackageArt>(fetchSkillPackageArt);
