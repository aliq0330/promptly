"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveStudioSession, type StoredVersion } from "@/lib/supabase/studio-sessions";
import type { StudioSnapshot } from "@/lib/studio-diff";
import { refsOf, type StudioKind, type StudioSources, type StudioVersion } from "./studio-model";
import type { HydratePayload, StudioState } from "./use-studio";

export type SessionSaveStatus = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_MS = 1500;

function versionKey(v: StudioVersion): string {
  return JSON.stringify([v.number, v.label, v.kind, v.parentId, v.snapshot]);
}

/** One string that changes whenever anything worth persisting changes. */
function fingerprintOf(parts: { title: string; sources: StudioSources; baseline: StudioSnapshot; draft: StudioSnapshot; active: StudioKind | null; versions: StudioVersion[] }): string {
  return JSON.stringify([parts.title, refsOf(parts.sources), parts.baseline, parts.draft, parts.active, parts.versions.map((v) => `${v.id}:${v.label}:${v.kind}`)]);
}

function toStored(v: StudioVersion): StoredVersion {
  return { id: v.id, number: v.number, label: v.label, kind: v.kind, parentId: v.parentId, snapshot: v.snapshot, createdAt: v.createdAt };
}

/**
 * Persists the Studio session (sources by reference, baseline, draft, versions)
 * for a signed-in user. The first save is explicit (the "Kaydet" button, which
 * also asks guests to sign in); once a session exists, changes autosave after a
 * short pause. Only new/changed versions are written. A failed save never
 * loops: it stops and surfaces "retry" until the draft changes again.
 */
export function useStudioSession({
  state,
  userId,
  defaultTitle,
  onCreated,
}: {
  state: StudioState;
  userId: string | null;
  defaultTitle: string;
  onCreated: (id: string) => void;
}) {
  const [status, setStatus] = useState<SessionSaveStatus>("idle");
  const [errorFingerprint, setErrorFingerprint] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const persistedVersions = useRef<Map<string, string>>(new Map());
  const saving = useRef(false);

  const fingerprint = useMemo(
    () => fingerprintOf({ title: state.title, sources: state.sources, baseline: state.baseline, draft: state.draft, active: state.active, versions: state.versions }),
    [state.title, state.sources, state.baseline, state.draft, state.active, state.versions],
  );

  /** Call with the payload you are about to load into the workspace: that exact state counts as already saved. */
  const markLoaded = useCallback((payload: HydratePayload) => {
    persistedVersions.current = new Map(payload.versions.map((v) => [v.id, versionKey(v)]));
    setLastSaved(fingerprintOf(payload));
    setStatus("saved");
  }, []);

  const edited = useMemo(() => JSON.stringify(state.draft) !== JSON.stringify(state.baseline), [state.draft, state.baseline]);
  const hasWork = state.sessionId !== null || state.versions.length > 1 || edited;
  const dirty = fingerprint !== lastSaved && hasWork && Object.keys(refsOf(state.sources)).length > 0;

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!userId || saving.current) return false;
    if (Object.keys(refsOf(state.sources)).length === 0) return false;
    saving.current = true;
    setStatus("saving");
    const id = state.sessionId ?? crypto.randomUUID();
    const snapshotFingerprint = fingerprint;
    try {
      const changed = state.versions.filter((v) => persistedVersions.current.get(v.id) !== versionKey(v));
      await saveStudioSession({
        id,
        userId,
        title: state.title.trim() || defaultTitle,
        refs: refsOf(state.sources),
        baseline: state.baseline,
        draft: state.draft,
        active: state.active,
        versions: changed.map(toStored),
      });
      for (const v of changed) persistedVersions.current.set(v.id, versionKey(v));
      setLastSaved(snapshotFingerprint);
      setErrorFingerprint(null);
      setStatus("saved");
      if (!state.sessionId) onCreated(id);
      return true;
    } catch (err) {
      console.error("studio session save", err);
      setErrorFingerprint(snapshotFingerprint);
      setStatus("error");
      return false;
    } finally {
      saving.current = false;
    }
  }, [userId, state, fingerprint, defaultTitle, onCreated]);

  // Autosave once the session exists.
  useEffect(() => {
    if (!userId || !state.sessionId || !dirty || errorFingerprint === fingerprint || status === "saving") return;
    const timer = window.setTimeout(() => void saveNow(), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [userId, state.sessionId, dirty, errorFingerprint, fingerprint, status, saveNow]);

  const effectiveStatus: SessionSaveStatus = status === "saving" ? "saving" : status === "error" && errorFingerprint === fingerprint ? "error" : dirty ? "idle" : status === "saved" ? "saved" : "idle";

  return { status: effectiveStatus, dirty, saveNow, markLoaded };
}
