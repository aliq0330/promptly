"use client";

import { useCallback, useMemo, useReducer } from "react";
import { cloneSnapshot, diffSnapshots, EMPTY_SNAPSHOT, snapshotsEqual, type StudioSnapshot } from "@/lib/studio-diff";
import type { LoadedSource, StudioKind, StudioSources, StudioVersion } from "./studio-model";

const HISTORY_LIMIT = 100;
const COALESCE_MS = 900;

interface HistoryEntry {
  snapshot: StudioSnapshot;
  key: string | null;
  at: number;
}

export interface StudioState {
  sources: StudioSources;
  baseline: StudioSnapshot;
  draft: StudioSnapshot;
  versions: StudioVersion[];
  active: StudioKind | null;
  past: HistoryEntry[];
  future: StudioSnapshot[];
}

type Action =
  | { type: "attach"; loaded: LoadedSource[]; now: string }
  | { type: "detach"; kind: StudioKind }
  | { type: "edit"; update: (draft: StudioSnapshot) => StudioSnapshot; key: string | null; at: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset" }
  | { type: "clear" }
  | { type: "saveVersion"; label: string; id: string; now: string }
  | { type: "restoreVersion"; id: string }
  | { type: "setActive"; kind: StudioKind };

const INITIAL: StudioState = { sources: {}, baseline: EMPTY_SNAPSHOT, draft: EMPTY_SNAPSHOT, versions: [], active: null, past: [], future: [] };

function pieceOf(loaded: LoadedSource): Partial<StudioSnapshot> {
  switch (loaded.kind) {
    case "prompt":
      return { prompt: loaded.piece };
    case "dna":
      return { dna: loaded.piece };
    case "generator":
      return { generator: loaded.piece };
    case "preset":
      return { preset: loaded.piece };
    case "workflow":
      return { workflow: loaded.piece };
  }
}

function clearPiece(snapshot: StudioSnapshot, kind: StudioKind): StudioSnapshot {
  return { ...snapshot, [kind]: null };
}

function pushHistory(state: StudioState, key: string | null, at: number): HistoryEntry[] {
  const top = state.past[state.past.length - 1];
  if (key && top && top.key === key && at - top.at < COALESCE_MS) return [...state.past.slice(0, -1), { ...top, at }];
  const next = [...state.past, { snapshot: state.draft, key, at }];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

function reducer(state: StudioState, action: Action): StudioState {
  switch (action.type) {
    case "attach": {
      if (action.loaded.length === 0) return state;
      let sources = { ...state.sources };
      let baseline = state.baseline;
      let draft = state.draft;
      let versions = state.versions;
      for (const loaded of action.loaded) {
        sources = { ...sources, [loaded.kind]: loaded.source };
        const piece = cloneSnapshot({ ...EMPTY_SNAPSHOT, ...pieceOf(loaded) });
        const apply = (snapshot: StudioSnapshot) => ({ ...snapshot, [loaded.kind]: piece[loaded.kind] });
        baseline = apply(baseline);
        draft = apply(draft);
        // The untouched "Orijinal" version keeps tracking what was attached before any edit.
        versions = versions.map((v) => (v.original ? { ...v, snapshot: apply(v.snapshot) } : v));
      }
      if (versions.length === 0) {
        versions = [{ id: "v-original", number: 1, label: "", snapshot: cloneSnapshot(draft), createdAt: action.now, original: true }];
      }
      return {
        ...state,
        sources,
        baseline,
        draft,
        versions,
        active: action.loaded[0].kind,
        past: [],
        future: [],
      };
    }
    case "detach": {
      const sources = { ...state.sources };
      delete sources[action.kind];
      const remaining = (["prompt", "dna", "generator", "preset", "workflow"] as StudioKind[]).filter((k) => sources[k]);
      return {
        ...state,
        sources,
        baseline: clearPiece(state.baseline, action.kind),
        draft: clearPiece(state.draft, action.kind),
        versions: state.versions.map((v) => (v.original ? { ...v, snapshot: clearPiece(v.snapshot, action.kind) } : v)),
        active: state.active === action.kind ? (remaining[0] ?? null) : state.active,
        past: [],
        future: [],
      };
    }
    case "edit": {
      const next = action.update(state.draft);
      if (next === state.draft || snapshotsEqual(next, state.draft)) return state;
      return { ...state, draft: next, past: pushHistory(state, action.key, action.at), future: [] };
    }
    case "undo": {
      const top = state.past[state.past.length - 1];
      if (!top) return state;
      return { ...state, draft: top.snapshot, past: state.past.slice(0, -1), future: [state.draft, ...state.future] };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return { ...state, draft: next, past: [...state.past, { snapshot: state.draft, key: null, at: 0 }], future: rest };
    }
    case "clear":
      return INITIAL;
    case "reset": {
      if (snapshotsEqual(state.draft, state.baseline)) return state;
      return { ...state, draft: cloneSnapshot(state.baseline), past: [...state.past, { snapshot: state.draft, key: null, at: 0 }], future: [] };
    }
    case "saveVersion": {
      const number = (state.versions[state.versions.length - 1]?.number ?? 0) + 1;
      return {
        ...state,
        versions: [...state.versions, { id: action.id, number, label: action.label, snapshot: cloneSnapshot(state.draft), createdAt: action.now, original: false }],
      };
    }
    case "restoreVersion": {
      const version = state.versions.find((v) => v.id === action.id);
      if (!version) return state;
      // Restoring only replaces pieces whose source is still attached.
      const restored = cloneSnapshot(version.snapshot);
      const next: StudioSnapshot = {
        prompt: state.sources.prompt ? restored.prompt : null,
        dna: state.sources.dna ? restored.dna : null,
        generator: state.sources.generator ? restored.generator : null,
        preset: state.sources.preset ? restored.preset : null,
        workflow: state.sources.workflow ? restored.workflow : null,
      };
      return { ...state, draft: next, past: [...state.past, { snapshot: state.draft, key: null, at: 0 }], future: [] };
    }
    case "setActive":
      return { ...state, active: action.kind };
  }
}

export function useStudio() {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const attach = useCallback((loaded: LoadedSource[]) => dispatch({ type: "attach", loaded, now: new Date().toISOString() }), []);
  const detach = useCallback((kind: StudioKind) => dispatch({ type: "detach", kind }), []);
  const edit = useCallback(
    (update: (draft: StudioSnapshot) => StudioSnapshot, key: string | null = null) => dispatch({ type: "edit", update, key, at: Date.now() }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  const clear = useCallback(() => dispatch({ type: "clear" }), []);
  const saveVersion = useCallback(
    (label: string) => dispatch({ type: "saveVersion", label, id: `v-${Date.now().toString(36)}`, now: new Date().toISOString() }),
    [],
  );
  const restoreVersion = useCallback((id: string) => dispatch({ type: "restoreVersion", id }), []);
  const setActive = useCallback((kind: StudioKind) => dispatch({ type: "setActive", kind }), []);

  const changes = useMemo(() => diffSnapshots(state.baseline, state.draft), [state.baseline, state.draft]);
  const lastVersion = state.versions[state.versions.length - 1] ?? null;
  const unsaved = useMemo(() => (lastVersion ? !snapshotsEqual(lastVersion.snapshot, state.draft) : false), [lastVersion, state.draft]);

  return {
    state,
    changes,
    unsaved,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    attach,
    detach,
    edit,
    undo,
    redo,
    reset,
    clear,
    saveVersion,
    restoreVersion,
    setActive,
  };
}
