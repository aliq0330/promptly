import type { RemixGraphNode } from "@/types";

export interface TreeNodePosition {
  id: string;
  x: number;
  y: number;
  depth: number;
}

export const NODE_WIDTH = 176;
export const NODE_HEIGHT = 92;
const H_GAP = 28;
const V_GAP = 56;

/**
 * Deterministic, dependency-free tree layout — a simplified Reingold-
 * Tilford: each leaf gets the next free horizontal slot, each parent is
 * centered over the horizontal span of its own children (computed
 * bottom-up via the recursion's return value), and depth maps straight to
 * a vertical row. No manual repositioning/dragging is offered (Aşama 3's
 * "sürüklenebiliyorsa konumların saklanıp saklanmayacağını... belirle" —
 * product decision, documented in CLAUDE.md: a remix tree here is
 * expected to stay small enough that a clean, always-reproducible
 * auto-layout is more useful than a manually-arranged one that would
 * need its own storage and "layout yeniden yüklendiğinde zıplamamalı"
 * guarantee). Purely a function of the (id, sourcePromptId) shape, so the
 * same tree always lays out identically — nothing to persist.
 */
export function layoutRemixTree(nodes: RemixGraphNode[], rootId: string): Map<string, TreeNodePosition> {
  const childrenByParent = new Map<string, RemixGraphNode[]>();
  for (const node of nodes) {
    if (!node.sourcePromptId) continue;
    const siblings = childrenByParent.get(node.sourcePromptId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.sourcePromptId, siblings);
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  const positions = new Map<string, TreeNodePosition>();
  let nextSlot = 0;
  const visited = new Set<string>();

  function place(id: string, depth: number): number {
    if (visited.has(id)) {
      // A cycle should be structurally impossible (RPC/RLS-enforced,
      // see `create_merge_request`'s ancestor-chain check) — this guard
      // only prevents an infinite recursion from ever hanging the map if
      // that guarantee is ever violated by a future bug.
      return positions.get(id)?.x ?? 0;
    }
    visited.add(id);

    const children = childrenByParent.get(id) ?? [];
    let x: number;
    if (children.length === 0) {
      x = nextSlot * (NODE_WIDTH + H_GAP);
      nextSlot += 1;
    } else {
      const childXs = children.map((child) => place(child.id, depth + 1));
      x = (childXs[0] + childXs[childXs.length - 1]) / 2;
    }
    positions.set(id, { id, x, y: depth * (NODE_HEIGHT + V_GAP), depth });
    return x;
  }

  if (nodes.some((n) => n.id === rootId)) {
    place(rootId, 0);
  }

  // Any node the recursion never reached from the root (shouldn't happen
  // for a well-formed tree, but a dangling/inaccessible ancestor could in
  // principle leave an orphan) still gets a slot instead of being
  // silently dropped from the map.
  for (const node of nodes) {
    if (!positions.has(node.id)) {
      positions.set(node.id, { id: node.id, x: nextSlot * (NODE_WIDTH + H_GAP), y: 0, depth: 0 });
      nextSlot += 1;
    }
  }

  return positions;
}

/** The full pixel bounding box a laid-out tree occupies — used to size the SVG canvas and to compute a "fit to view" zoom/pan. */
export function computeTreeBounds(positions: Map<string, TreeNodePosition>) {
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = 0;
  for (const pos of positions.values()) {
    minX = Math.min(minX, pos.x);
    maxX = Math.max(maxX, pos.x + NODE_WIDTH);
    maxY = Math.max(maxY, pos.y + NODE_HEIGHT);
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: NODE_WIDTH, maxY: NODE_HEIGHT, width: NODE_WIDTH, height: NODE_HEIGHT };
  return { minX, maxX, maxY, width: maxX - minX, height: maxY };
}
