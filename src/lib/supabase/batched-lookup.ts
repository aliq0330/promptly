/**
 * Coalesces many "does <viewer> have a relationship with <id>?" questions
 * asked within a few milliseconds of each other (one per card's Like/Save/
 * Follow button on a feed page) into a SINGLE `.in(...)` query, instead of
 * one request per button. Callers keep a plain `(id) => Promise<boolean>`
 * shape — only the transport changes. Results are NOT cached: every call
 * still reflects the database at the moment of its batch, so toggles and
 * refetches stay correct.
 */
const FLUSH_DELAY_MS = 12;
const MAX_IDS_PER_QUERY = 150;

type Resolver = (value: boolean) => void;

export function createBatchedLookup(fetchMany: (ids: string[]) => Promise<Set<string>>): (id: string) => Promise<boolean> {
  let pending = new Map<string, Resolver[]>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function flush() {
    const batch = pending;
    pending = new Map();
    timer = null;
    const ids = [...batch.keys()];
    for (let i = 0; i < ids.length; i += MAX_IDS_PER_QUERY) {
      const chunk = ids.slice(i, i + MAX_IDS_PER_QUERY);
      let found = new Set<string>();
      try {
        found = await fetchMany(chunk);
      } catch (err) {
        console.error("batched lookup", err);
      }
      for (const id of chunk) {
        for (const resolve of batch.get(id) ?? []) resolve(found.has(id));
      }
    }
  }

  return (id: string) =>
    new Promise<boolean>((resolve) => {
      const list = pending.get(id);
      if (list) list.push(resolve);
      else pending.set(id, [resolve]);
      if (!timer) timer = setTimeout(flush, FLUSH_DELAY_MS);
    });
}

/** One batcher per (viewer, kind) — a different viewer or content kind never shares a query. */
export function batcherRegistry(makeFetchMany: (key: string) => (ids: string[]) => Promise<Set<string>>) {
  const registry = new Map<string, (id: string) => Promise<boolean>>();
  return (key: string) => {
    let lookup = registry.get(key);
    if (!lookup) {
      lookup = createBatchedLookup(makeFetchMany(key));
      registry.set(key, lookup);
    }
    return lookup;
  };
}

/**
 * `createBatchedLookup`'s sibling for answers that carry a value (the viewer's own reaction, a card's reaction counts): the same
 * "one query per few milliseconds" coalescing, `fetchMany` returns a value per id that has one, a missing id resolves to `undefined`.
 * `maxIds` is the per-query cap (an RPC may take fewer ids than a `.in(...)` filter does).
 */
export function createBatchedValueLookup<T>(fetchMany: (ids: string[]) => Promise<Map<string, T>>, maxIds = MAX_IDS_PER_QUERY): (id: string) => Promise<T | undefined> {
  let pending = new Map<string, ((value: T | undefined) => void)[]>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function flush() {
    const batch = pending;
    pending = new Map();
    timer = null;
    const ids = [...batch.keys()];
    for (let i = 0; i < ids.length; i += maxIds) {
      const part = ids.slice(i, i + maxIds);
      let found = new Map<string, T>();
      try {
        found = await fetchMany(part);
      } catch (err) {
        console.error("batched value lookup", err);
      }
      for (const id of part) {
        for (const resolve of batch.get(id) ?? []) resolve(found.get(id));
      }
    }
  }

  return (id: string) =>
    new Promise<T | undefined>((resolve) => {
      const list = pending.get(id);
      if (list) list.push(resolve);
      else pending.set(id, [resolve]);
      if (!timer) timer = setTimeout(flush, FLUSH_DELAY_MS);
    });
}

/** One value batcher per key (viewer + content kind), like `batcherRegistry`. */
export function valueBatcherRegistry<T>(makeFetchMany: (key: string) => (ids: string[]) => Promise<Map<string, T>>, maxIds = MAX_IDS_PER_QUERY) {
  const registry = new Map<string, (id: string) => Promise<T | undefined>>();
  return (key: string) => {
    let lookup = registry.get(key);
    if (!lookup) {
      lookup = createBatchedValueLookup(makeFetchMany(key), maxIds);
      registry.set(key, lookup);
    }
    return lookup;
  };
}
