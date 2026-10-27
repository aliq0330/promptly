"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  addSpaceConnections,
  addSpaceItems,
  deleteSpaceConnections,
  deleteSpaceItems,
  emptySources,
  fetchSpaceSources,
  saveSpaceLayout,
  updateSpaceItem,
  updateSpaceConnection,
  type LayoutEntry,
  type NewSpaceConnection,
  type NewSpaceItem,
  type Space,
  type SpaceConnection,
  type SpaceConnectionPatch,
  type SpaceGroup,
  type SpaceItem,
  type SpaceItemPatch,
  type SpacePalette,
  type SpaceSources,
} from "@/lib/supabase/spaces";
import { spaceCapabilities, type SpaceCapabilities, type SpaceRole } from "@/lib/spaces";
import { translateForRuntime } from "@/lib/i18n/translations";

/**
 * Bir Space sayfasının ortak durumu (docs/history/213-*): Space satırı, rol, öğeler, gruplar, paletler, kaynak içerik ve pano
 * yerleşiminin BİRLEŞTİRİLEREK kaydı. Kayıt sağlayıcıdadır (panoda değil): sekme değiştirmek bekleyen konumları kaybettirmez.
 *
 * Yerleşim kaydı: her sürükleme/boyutlandırma yerel durumu hemen günceller, sunucuya ~700 ms sessizlikten sonra TEK istekle gider
 * (`space_save_layout`). Başarısız kayıt gizlenmez: durum "Kaydedilemedi" olur, bekleyen değişiklikler korunur, 3 kez artan aralıkla
 * yeniden denenir, sonra "Tekrar dene" beklenir; bekleyen değişiklik varken sayfadan çıkmak tarayıcı uyarısı verir. Sunucu bir öğeyi
 * güncellemediyse (başkası silmiş) öğe yerelden düşer ve kullanıcıya söylenir.
 */

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface SpaceData {
  space: Space;
  role: SpaceRole | null;
  items: SpaceItem[];
  groups: SpaceGroup[];
  palettes: SpacePalette[];
  /** Panodaki oklar (docs/history/262-*). */
  connections: SpaceConnection[];
}

interface SpaceContextValue extends SpaceData {
  caps: SpaceCapabilities;
  userId: string | null;
  sources: SpaceSources;
  sourcesLoading: boolean;
  setSpace: (space: Space) => void;
  setItems: (updater: (items: SpaceItem[]) => SpaceItem[]) => void;
  setGroups: (updater: (groups: SpaceGroup[]) => SpaceGroup[]) => void;
  setPalettes: (updater: (palettes: SpacePalette[]) => SpacePalette[]) => void;
  addItems: (items: NewSpaceItem[]) => Promise<SpaceItem[]>;
  removeItems: (ids: string[]) => Promise<SpaceItem[]>;
  patchItem: (id: string, patch: SpaceItemPatch) => Promise<SpaceItem>;
  setConnections: (updater: (connections: SpaceConnection[]) => SpaceConnection[]) => void;
  addConnections: (connections: NewSpaceConnection[]) => Promise<SpaceConnection[]>;
  removeConnections: (ids: string[]) => Promise<SpaceConnection[]>;
  patchConnection: (id: string, patch: SpaceConnectionPatch) => Promise<SpaceConnection>;
  queueLayout: (entries: LayoutEntry[]) => void;
  flushLayout: () => Promise<void>;
  layoutStatus: SaveStatus;
  layoutNotice: string | null;
  dismissLayoutNotice: () => void;
  readable: (id: string) => boolean;
}

const SpaceContext = createContext<SpaceContextValue | null>(null);

export function useSpaceContext(): SpaceContextValue {
  const ctx = useContext(SpaceContext);
  if (!ctx) throw new Error("useSpaceContext must be used within a SpaceProvider");
  return ctx;
}

const DEBOUNCE_MS = 700;
const RETRY_DELAYS_MS = [2000, 5000, 10000];

function mergeEntry(previous: LayoutEntry | undefined, next: LayoutEntry): LayoutEntry {
  if (!previous) return next;
  const merged: LayoutEntry = { ...previous };
  for (const key of ["x", "y", "w", "h", "z"] as const) if (next[key] !== undefined) merged[key] = next[key];
  if (next.groupId !== undefined) merged.groupId = next.groupId;
  return merged;
}

export function SpaceProvider({ initial, userId, children }: { initial: SpaceData; userId: string | null; children: ReactNode }) {
  const [space, setSpace] = useState(initial.space);
  const [role] = useState(initial.role);
  const [items, setItemsState] = useState(initial.items);
  const [groups, setGroupsState] = useState(initial.groups);
  const [palettes, setPalettesState] = useState(initial.palettes);
  const [connections, setConnectionsState] = useState(initial.connections);
  const [sources, setSources] = useState<SpaceSources>(emptySources);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [layoutStatus, setLayoutStatus] = useState<SaveStatus>("idle");
  const [layoutNotice, setLayoutNotice] = useState<string | null>(null);

  const caps = useMemo(() => spaceCapabilities(role, Boolean(space.archivedAt), space.activityVisibility), [role, space.archivedAt, space.activityVisibility]);

  // ---- kaynak içerik: başta bir kez, sonra yalnız YENİ başvurular için ----
  const loadedRefs = useRef(new Set<string>());
  const loadSources = useCallback(async (list: SpaceItem[]) => {
    const missing = list.filter((item) => {
      const ref = item.promptId ?? item.sourcePromptId ?? item.contentId;
      return ref && !loadedRefs.current.has(ref);
    });
    if (missing.length === 0) return;
    for (const item of missing) loadedRefs.current.add((item.promptId ?? item.sourcePromptId ?? item.contentId)!);
    try {
      const next = await fetchSpaceSources(missing);
      setSources((prev) => ({
        prompts: new Map([...prev.prompts, ...next.prompts]),
        requests: new Map([...prev.requests, ...next.requests]),
        workflows: new Map([...prev.workflows, ...next.workflows]),
        presets: new Map([...prev.presets, ...next.presets]),
      }));
    } catch {
      // Kaynaklar okunamadıysa öğeler "erişilemiyor" görünür; bir sonraki eklemede yeniden denenir.
      for (const item of missing) loadedRefs.current.delete((item.promptId ?? item.sourcePromptId ?? item.contentId)!);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void loadSources(initial.items).finally(() => {
      if (alive) setSourcesLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [initial.items, loadSources]);

  const readable = useCallback(
    (id: string) => sources.prompts.has(id) || sources.requests.has(id) || sources.workflows.has(id) || sources.presets.has(id),
    [sources],
  );

  // ---- yerleşim kaydı ----
  const pending = useRef(new Map<string, LayoutEntry>());
  const version = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retries = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  // Zamanlayıcıların çağırdığı güncel `flushLayout` (kendini yeniden planlar).
  const flushRef = useRef<() => Promise<void>>(async () => undefined);

  const flushLayout = useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inFlight.current) await inFlight.current;
    if (pending.current.size === 0) return;
    const batch = new Map(pending.current);
    const batchVersion = version.current;
    setLayoutStatus("saving");
    const run = (async () => {
      try {
        const updated = new Set(await saveSpaceLayout(space.id, [...batch.values()]));
        // Bu kayıt sırasında yeniden değişmeyen girdiler düşer; değişenler sonraki kayda kalır.
        for (const [id, entry] of batch) {
          if (pending.current.get(id) === entry || version.current === batchVersion) pending.current.delete(id);
        }
        const gone = [...batch.keys()].filter((id) => !updated.has(id));
        if (gone.length > 0) {
          setItemsState((list) => list.filter((item) => !gone.includes(item.id)));
          setLayoutNotice(translateForRuntime("spaces.board.itemsGone", { count: gone.length }));
        }
        retries.current = 0;
        setLayoutStatus(pending.current.size > 0 ? "saving" : "saved");
        if (pending.current.size > 0) timer.current = setTimeout(() => void flushRef.current(), DEBOUNCE_MS);
      } catch {
        setLayoutStatus("error");
        const delay = RETRY_DELAYS_MS[retries.current];
        retries.current += 1;
        if (delay !== undefined) timer.current = setTimeout(() => void flushRef.current(), delay);
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    await run;
  }, [space.id]);

  useEffect(() => {
    flushRef.current = flushLayout;
  }, [flushLayout]);

  const queueLayout = useCallback(
    (entries: LayoutEntry[]) => {
      if (entries.length === 0) return;
      version.current += 1;
      for (const entry of entries) pending.current.set(entry.id, mergeEntry(pending.current.get(entry.id), entry));
      retries.current = 0;
      setLayoutStatus("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flushRef.current(), DEBOUNCE_MS);
    },
    [],
  );

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (pending.current.size === 0) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Sayfadan (Space'ten) çıkarken bekleyen yerleşimi gönder.
  useEffect(() => {
    const queue = pending.current;
    return () => {
      if (queue.size > 0) void flushRef.current();
    };
  }, []);

  // ---- içerik yazımları ----
  const addItems = useCallback(
    async (newItems: NewSpaceItem[]) => {
      if (!userId) throw new Error(translateForRuntime("spaces.error.notAuthenticated"));
      const created = await addSpaceItems(newItems, userId);
      setItemsState((list) => [...list.filter((item) => !created.some((c) => c.id === item.id)), ...created]);
      void loadSources(created);
      return created;
    },
    [userId, loadSources],
  );

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  /** Kaldırılan öğeleri döner (geri al için); sunucuda zaten olmayanlar (başkası silmiş) da yerelden düşer. */
  const removeItems = useCallback(async (ids: string[]) => {
    const removed = itemsRef.current.filter((item) => ids.includes(item.id));
    await deleteSpaceItems(ids);
    // Sunucuda uçlarından biri silinen oklar kendiliğinden gider (cascade); yerelde de düşer.
    setConnectionsState((list) => list.filter((c) => !ids.includes(c.fromItemId) && !ids.includes(c.toItemId)));
    setItemsState((list) =>
      list
        .filter((item) => !ids.includes(item.id))
        .map((item) => (item.attachedItemId && ids.includes(item.attachedItemId) ? { ...item, attachedItemId: null } : item)),
    );
    for (const id of ids) pending.current.delete(id);
    setSpace((current) => (current.coverItemId && ids.includes(current.coverItemId) ? { ...current, coverItemId: null } : current));
    return removed;
  }, []);

  const patchItem = useCallback(async (id: string, patch: SpaceItemPatch) => {
    const updated = await updateSpaceItem(id, patch);
    setItemsState((list) => list.map((item) => (item.id === id ? { ...updated, x: item.x, y: item.y, w: item.w, h: item.h, z: item.z } : item)));
    return updated;
  }, []);

  // ---- oklar ----
  const addConnections = useCallback(
    async (list: NewSpaceConnection[]) => {
      if (!userId) throw new Error(translateForRuntime("spaces.error.notAuthenticated"));
      const created = await addSpaceConnections(list, userId);
      setConnectionsState((current) => [...current.filter((c) => !created.some((n) => n.id === c.id)), ...created]);
      return created;
    },
    [userId],
  );

  const connectionsRef = useRef(connections);
  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);

  /** Kaldırılanları döner (geri al için). */
  const removeConnections = useCallback(async (ids: string[]) => {
    const removed = connectionsRef.current.filter((c) => ids.includes(c.id));
    await deleteSpaceConnections(ids);
    setConnectionsState((current) => current.filter((c) => !ids.includes(c.id)));
    return removed;
  }, []);

  const patchConnection = useCallback(async (id: string, patch: SpaceConnectionPatch) => {
    const updated = await updateSpaceConnection(id, patch);
    setConnectionsState((current) => current.map((c) => (c.id === id ? updated : c)));
    return updated;
  }, []);

  const value = useMemo<SpaceContextValue>(
    () => ({
      space,
      role,
      items,
      groups,
      palettes,
      connections,
      caps,
      userId,
      sources,
      sourcesLoading,
      setSpace,
      setItems: setItemsState,
      setGroups: setGroupsState,
      setPalettes: setPalettesState,
      addItems,
      removeItems,
      patchItem,
      setConnections: setConnectionsState,
      addConnections,
      removeConnections,
      patchConnection,
      queueLayout,
      flushLayout,
      layoutStatus,
      layoutNotice,
      dismissLayoutNotice: () => setLayoutNotice(null),
      readable,
    }),
    [space, role, items, groups, palettes, connections, caps, userId, sources, sourcesLoading, addItems, removeItems, patchItem, addConnections, removeConnections, patchConnection, queueLayout, flushLayout, layoutStatus, layoutNotice, readable],
  );

  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}
