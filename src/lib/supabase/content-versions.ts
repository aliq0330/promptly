import { supabase } from "./client";
import { translateForRuntime } from "@/lib/i18n/translations";
import type { PresetSnapshot, WorkflowSnapshot } from "@/lib/version-history";
import type { PresetVersion, PromptVersion, RequestVersion, WorkflowVersion } from "@/types";

/**
 * Version history of the three content types besides prompts (prompts: `prompt-versions.ts`): readable wherever
 * the parent content is readable (RLS inherits the parent's own SELECT rule); never writable from here — rows
 * are written only by the database (`record_request_version` trigger, `save_*_content` / `restore_*_version`
 * RPCs). Every fetch resolves to `[]` on failure: "no history" simply hides the Geçmiş tab, it is never an error screen.
 */

interface RequestVersionRow {
  id: string;
  request_id: string;
  version_number: number;
  title: string;
  description: string;
  creative_direction: string | null;
  preferred_tool: string | null;
  source: RequestVersion["source"];
  created_by: string;
  created_at: string;
}

const REQUEST_VERSION_SELECT = "id, request_id, version_number, title, description, creative_direction, preferred_tool, source, created_by, created_at";

export async function fetchVersionsForRequest(requestId: string): Promise<RequestVersion[]> {
  try {
    const { data, error } = await supabase
      .from("request_versions")
      .select(REQUEST_VERSION_SELECT)
      .eq("request_id", requestId)
      .order("version_number", { ascending: false });
    if (error) {
      console.error("fetchVersionsForRequest", error);
      return [];
    }
    return ((data ?? []) as RequestVersionRow[]).map((row) => ({
      id: row.id,
      requestId: row.request_id,
      versionNumber: row.version_number,
      title: row.title,
      description: row.description,
      creativeDirection: row.creative_direction,
      preferredTool: row.preferred_tool,
      source: row.source,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }));
  } catch (err) {
    console.error("fetchVersionsForRequest", err);
    return [];
  }
}

interface WorkflowVersionRow {
  id: string;
  workflow_id: string;
  version_number: number;
  title: string;
  description: string;
  snapshot: WorkflowSnapshot | null;
  source: WorkflowVersion["source"];
  created_by: string;
  created_at: string;
}

const WORKFLOW_VERSION_SELECT = "id, workflow_id, version_number, title, description, snapshot, source, created_by, created_at";

export async function fetchVersionsForWorkflow(workflowId: string): Promise<WorkflowVersion[]> {
  try {
    const { data, error } = await supabase
      .from("workflow_versions")
      .select(WORKFLOW_VERSION_SELECT)
      .eq("workflow_id", workflowId)
      .order("version_number", { ascending: false });
    if (error) {
      console.error("fetchVersionsForWorkflow", error);
      return [];
    }
    return ((data ?? []) as WorkflowVersionRow[]).map((row) => ({
      id: row.id,
      workflowId: row.workflow_id,
      versionNumber: row.version_number,
      title: row.title,
      description: row.description,
      snapshot: { steps: row.snapshot?.steps ?? [], connections: row.snapshot?.connections ?? [] },
      source: row.source,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }));
  } catch (err) {
    console.error("fetchVersionsForWorkflow", err);
    return [];
  }
}

interface PresetVersionRow {
  id: string;
  preset_id: string;
  version_number: number;
  title: string;
  description: string;
  snapshot: PresetSnapshot | null;
  source: PresetVersion["source"];
  created_by: string;
  created_at: string;
}

const PRESET_VERSION_SELECT = "id, preset_id, version_number, title, description, snapshot, source, created_by, created_at";

export async function fetchVersionsForPreset(presetId: string): Promise<PresetVersion[]> {
  try {
    const { data, error } = await supabase
      .from("preset_versions")
      .select(PRESET_VERSION_SELECT)
      .eq("preset_id", presetId)
      .order("version_number", { ascending: false });
    if (error) {
      console.error("fetchVersionsForPreset", error);
      return [];
    }
    return ((data ?? []) as PresetVersionRow[]).map((row) => ({
      id: row.id,
      presetId: row.preset_id,
      versionNumber: row.version_number,
      title: row.title,
      description: row.description,
      snapshot: { selection: row.snapshot?.selection ?? {}, fields: row.snapshot?.fields ?? [] },
      source: row.source,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }));
  } catch (err) {
    console.error("fetchVersionsForPreset", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Restore (owner only; the database re-checks ownership and that the version belongs to the content)
// ---------------------------------------------------------------------------

/**
 * `restored`: the live content was changed and a new version now exists. `unchanged`: the chosen version is
 * already identical to the live content, nothing was written (so no success must be claimed).
 */
export type RestoreOutcome = "restored" | "unchanged";

/** Workflow / Hazır Ayar: one SECURITY DEFINER RPC, one transaction. A thrown Error means NOTHING was changed. */
export async function restoreWorkflowVersion(version: Pick<WorkflowVersion, "id" | "workflowId">): Promise<RestoreOutcome> {
  const { data, error } = await supabase.rpc("restore_workflow_version", { p_version_id: version.id, p_workflow_id: version.workflowId });
  if (error) throw new Error(error.message || translateForRuntime("history.restoreFailed"));
  return data === true ? "restored" : "unchanged";
}

export async function restorePresetVersion(version: Pick<PresetVersion, "id" | "presetId">): Promise<RestoreOutcome> {
  const { data, error } = await supabase.rpc("restore_preset_version", { p_version_id: version.id, p_preset_id: version.presetId });
  if (error) throw new Error(error.message || translateForRuntime("history.restoreFailed"));
  return data === true ? "restored" : "unchanged";
}

/**
 * Prompt / İstek: a restore is the owner's ordinary UPDATE of the snapshot fields — the existing trigger writes
 * the new version. The update must report the row back (RLS hides a foreign row as "0 rows", which is a failure,
 * never a silent success), and the outcome is decided by whether the trigger really opened a new version.
 */
async function restoreByUpdate(
  table: "prompts" | "prompt_requests",
  versionTable: "prompt_versions" | "request_versions",
  versionColumn: "prompt_id" | "request_id",
  contentId: string,
  patch: Record<string, unknown>,
): Promise<RestoreOutcome> {
  const latest = async (): Promise<number> => {
    const { data, error } = await supabase
      .from(versionTable)
      .select("version_number")
      .eq(versionColumn, contentId)
      .order("version_number", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message || translateForRuntime("history.restoreFailed"));
    return (data?.[0]?.version_number as number | undefined) ?? 0;
  };
  const before = await latest();
  const { data, error } = await supabase.from(table).update(patch).eq("id", contentId).select("id").maybeSingle();
  if (error) throw new Error(error.message || translateForRuntime("history.restoreFailed"));
  if (!data) throw new Error(translateForRuntime("history.restoreFailed"));
  return (await latest()) > before ? "restored" : "unchanged";
}

export async function restorePromptVersion(
  version: Pick<PromptVersion, "promptId" | "title" | "description" | "promptText" | "tool">,
): Promise<RestoreOutcome> {
  return restoreByUpdate("prompts", "prompt_versions", "prompt_id", version.promptId, {
    title: version.title,
    description: version.description,
    prompt_text: version.promptText,
    tool: version.tool,
  });
}

export async function restoreRequestVersion(
  version: Pick<RequestVersion, "requestId" | "title" | "description" | "creativeDirection" | "preferredTool">,
): Promise<RestoreOutcome> {
  return restoreByUpdate("prompt_requests", "request_versions", "request_id", version.requestId, {
    title: version.title,
    description: version.description,
    creative_direction: version.creativeDirection,
    preferred_tool: version.preferredTool,
  });
}
