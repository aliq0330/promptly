/** Pure pieces of the card art (docs/history/479-*): the batching loader and the workflow graph layout — no browser/Supabase imports, unit tested. */

export interface BatchedLoader<V> {
  /** Resolves with the value for `key` (`null` = nothing to show). Never rejects. */
  load(key: string): Promise<V | null>;
}

/** Collects the keys asked for within one tick window into a single `fetchMany` call; answers are cached per key. */
export function createBatchedLoader<V>(fetchMany: (keys: string[]) => Promise<Map<string, V>>, windowMs = 30, maxBatch = 40): BatchedLoader<V> {
  const cache = new Map<string, Promise<V | null>>();
  let queue: { key: string; resolve: (value: V | null) => void }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function flush() {
    timer = null;
    const batch = queue;
    queue = [];
    for (let start = 0; start < batch.length; start += maxBatch) {
      const part = batch.slice(start, start + maxBatch);
      let answer = new Map<string, V>();
      try {
        answer = await fetchMany(part.map((entry) => entry.key));
      } catch (err) {
        console.error("card-art batch", err);
      }
      for (const entry of part) entry.resolve(answer.get(entry.key) ?? null);
    }
  }

  return {
    load(key) {
      const hit = cache.get(key);
      if (hit) return hit;
      const promise = new Promise<V | null>((resolve) => {
        queue.push({ key, resolve });
        if (!timer) timer = setTimeout(() => void flush(), windowMs);
      });
      cache.set(key, promise);
      return promise;
    },
  };
}

/** First, middle and last of `count` positions (fewer when the workflow is shorter). */
export function pickArtSteps<T>(steps: T[]): { step: T; number: number }[] {
  if (steps.length === 0) return [];
  const indexes = Array.from(new Set([0, Math.floor((steps.length - 1) / 2), steps.length - 1])).sort((a, b) => a - b);
  return indexes.map((index) => ({ step: steps[index], number: index + 1 }));
}


export const NODE_W = 26; // node width in cqw
export const NODE_H = 19.5; // 4:3

/** Node left offsets (cqw) for 1–3 nodes, spread like the mockup: [6, 50 − w/2, 94 − w]. */
function nodeXs(count: number): number[] {
  if (count <= 1) return [50 - NODE_W / 2];
  if (count === 2) return [12, 88 - NODE_W];
  return [6, 50 - NODE_W / 2, 94 - NODE_W];
}

/** Pure layout of the graph: node boxes and the arrows between them in the `100 × height` drawing space. */
export function workflowGraphLayout(count: number, height: number): { nodes: { x: number; y: number }[]; arrows: { d: string; head: string }[] } {
  const xs = nodeXs(count);
  const spare = Math.max(0, height - NODE_H);
  const nodes = xs.slice(0, count).map((x, index) => ({ x, y: index % 2 === 0 ? spare * 0.18 : spare * 0.82 }));
  const arrows = nodes.slice(0, -1).map((from, index) => {
    const to = nodes[index + 1];
    const x1 = from.x + NODE_W + 0.6;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x - 0.6;
    const y2 = to.y + NODE_H / 2;
    const mid = (x1 + x2) / 2;
    return {
      d: `M${x1.toFixed(2)} ${y1.toFixed(2)} C${mid.toFixed(2)} ${y1.toFixed(2)} ${mid.toFixed(2)} ${y2.toFixed(2)} ${(x2 - 2.2).toFixed(2)} ${y2.toFixed(2)}`,
      head: `${x2.toFixed(2)},${y2.toFixed(2)} ${(x2 - 3).toFixed(2)},${(y2 - 1.8).toFixed(2)} ${(x2 - 3).toFixed(2)},${(y2 + 1.8).toFixed(2)}`,
    };
  });
  return { nodes, arrows };
}

