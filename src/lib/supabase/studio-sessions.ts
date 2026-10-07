import { supabase } from "./client";
import { normalizeSnapshot } from "@/lib/studio-v2";
import type { StudioSnapshot } from "@/lib/studio-diff";

/**
 * Stored Studio sessions (tables `studio_sessions` / `studio_session_versions`,
 * owner-only RLS). A session keeps REFERENCES to the library items plus the
 * working draft and its versions — never a copy that could overwrite an original.
 */

export type StoredKind = "prompt" | "generator" | "preset" | "workflow";
export type StoredVersionKind = "original" | "version" | "variation";

export interface StoredVersion {
  id: string;
  number: number;
  label: string;
  kind: StoredVersionKind;
  parentId: string | null;
  snapshot: StudioSnapshot;
  createdAt: string;
}

export interface StoredSession {
  id: string;
  title: string;
  description: string;
  refs: Partial<Record<StoredKind, string>>;
  baseline: StudioSnapshot;
  draft: StudioSnapshot;
  active: StoredKind | null;
  versions: StoredVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface StudioSessionSummary {
  id: string;
  title: string;
  refs: Partial<Record<StoredKind, string>>;
  versionCount: number;
  updatedAt: string;
}

const KINDS: StoredKind[] = ["prompt", "generator", "preset", "workflow"];

function cleanRefs(value: unknown): Partial<Record<StoredKind, string>> {
  const out: Partial<Record<StoredKind, string>> = {};
  if (typeof value !== "object" || value === null) return out;
  for (const kind of KINDS) {
    const id = (value as Record<string, unknown>)[kind];
    if (typeof id === "string" && id) out[kind] = id;
  }
  return out;
}

function cleanKind(value: unknown): StoredVersionKind {
  return value === "original" || value === "variation" ? value : "version";
}

/** The current user's sessions, most recently edited first. Soft-fails to [] so Studio Home still renders. */
export async function listStudioSessions(userId: string): Promise<StudioSessionSummary[]> {
  try {
    const { data, error } = await supabase
      .from("studio_sessions")
      .select("id, title, refs, updated_at, studio_session_versions(count)")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (error) {
      console.error("listStudioSessions", error);
      return [];
    }
    return (data ?? []).map((row) => {
      const counts = (row as { studio_session_versions?: { count: number }[] }).studio_session_versions;
      return {
        id: row.id as string,
        title: (row.title as string) ?? "",
        refs: cleanRefs(row.refs),
        versionCount: counts?.[0]?.count ?? 0,
        updatedAt: row.updated_at as string,
      };
    });
  } catch (err) {
    console.error("listStudioSessions", err);
    return [];
  }
}

/** One session with its versions, or null when it doesn't exist / isn't the viewer's (RLS). */
export async function fetchStudioSession(id: string): Promise<StoredSession | null> {
  try {
    const [sessionResult, versionsResult] = await Promise.all([
      supabase.from("studio_sessions").select("id, title, description, refs, baseline, draft, active_kind, created_at, updated_at").eq("id", id).maybeSingle(),
      supabase.from("studio_session_versions").select("id, version_number, label, kind, parent_id, snapshot, created_at").eq("session_id", id).order("version_number", { ascending: true }),
    ]);
    if (sessionResult.error || !sessionResult.data) return null;
    const row = sessionResult.data;
    return {
      id: row.id as string,
      title: (row.title as string) ?? "",
      description: (row.description as string) ?? "",
      refs: cleanRefs(row.refs),
      baseline: normalizeSnapshot(row.baseline),
      draft: normalizeSnapshot(row.draft),
      active: KINDS.includes(row.active_kind as StoredKind) ? (row.active_kind as StoredKind) : null,
      versions: (versionsResult.data ?? []).map((v) => ({
        id: v.id as string,
        number: v.version_number as number,
        label: (v.label as string) ?? "",
        kind: cleanKind(v.kind),
        parentId: (v.parent_id as string | null) ?? null,
        snapshot: normalizeSnapshot(v.snapshot),
        createdAt: v.created_at as string,
      })),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  } catch (err) {
    console.error("fetchStudioSession", err);
    return null;
  }
}

export interface SaveSessionInput {
  id: string;
  userId: string;
  title: string;
  refs: Partial<Record<StoredKind, string>>;
  baseline: StudioSnapshot;
  draft: StudioSnapshot;
  active: StoredKind | null;
  /** Only the versions that are new or changed since the last save. */
  versions: StoredVersion[];
}

/** Upserts the session row and the given versions. Throws on failure so the caller can show "retry". */
export async function saveStudioSession(input: SaveSessionInput): Promise<void> {
  const { error } = await supabase.from("studio_sessions").upsert(
    {
      id: input.id,
      user_id: input.userId,
      title: input.title.slice(0, 120),
      refs: input.refs,
      baseline: input.baseline,
      draft: input.draft,
      active_kind: input.active,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(error.message);
  if (input.versions.length === 0) return;
  const { error: versionError } = await supabase.from("studio_session_versions").upsert(
    input.versions.map((v) => ({
      id: v.id,
      session_id: input.id,
      version_number: v.number,
      label: v.label.slice(0, 80),
      kind: v.kind,
      parent_id: v.parentId,
      snapshot: v.snapshot,
      created_at: v.createdAt,
    })),
    { onConflict: "id" },
  );
  if (versionError) throw new Error(versionError.message);
}

export async function deleteStudioSession(id: string): Promise<void> {
  const { error } = await supabase.from("studio_sessions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
