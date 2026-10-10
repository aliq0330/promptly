/**
 * İlişki Haritası (Relationship Map) — shared, framework-free types + the
 * single table that defines every relation type. Pure TypeScript (no React,
 * no `@/` aliases) so the logic around it runs under plain `node --test`.
 *
 * Product principle: the map UNIFIES several independent systems, it does not
 * merge their data models. Every edge says where it came from (`origin`):
 *  - `dna`      → computed on the fly from stored Prompt DNA, never persisted
 *  - `manual`   → a row in `content_relations` (the only new table)
 *  - `derived`  → read straight from workflow steps / prompts.generator_id /
 *                 prompts.request_id / accepted edit suggestions, never copied
 */

import type { TranslationKey } from "../i18n/translations.ts";
import type { DnaSectionType } from "../prompt-dna/types.ts";

/** What a node can be. `suggestion` only ever appears as an accepted edit suggestion. */
export type RelationNodeKind = "prompt" | "generator" | "workflow" | "request" | "suggestion";

/** Node kinds that can be the CENTER of a map (and the ends of a manual relation). */
export type RelatableKind = "prompt" | "generator" | "workflow" | "request";

export const RELATABLE_KINDS: readonly RelatableKind[] = ["prompt", "generator", "workflow", "request"];

export type RelationType =
  | "dna_similar"
  | "similar"
  | "alternative"
  | "inspired_by"
  | "workflow_step"
  | "uses_generator"
  | "request_result"
  | "accepted_suggestion";

/** Relation types a user may create by hand (the only ones stored in `content_relations`). */
export type ManualRelationType = "similar" | "alternative" | "inspired_by";

export const MANUAL_RELATION_TYPES: readonly ManualRelationType[] = ["similar", "alternative", "inspired_by"];

export type RelationOrigin = "dna" | "manual" | "derived";

/** The filter chips on the map. `all` is always offered; the rest only when the data has them. */
export type RelationFilter = "all" | "dna" | "manual" | "workflow" | "generator" | "request";

export interface RelationTypeDef {
  /** Directed: the arrow runs from `from` to `to`. Undirected relations draw no arrowhead. */
  directed: boolean;
  origin: RelationOrigin;
  filter: Exclude<RelationFilter, "all">;
  labelKey: TranslationKey;
  /** One sentence shown in the detail panel / add-relation flow. */
  meaningKey: TranslationKey;
}

export const RELATION_TYPES: Record<RelationType, RelationTypeDef> = {
  dna_similar: { directed: false, origin: "dna", filter: "dna", labelKey: "relations.type.dna_similar", meaningKey: "relations.meaning.dna_similar" },
  similar: { directed: false, origin: "manual", filter: "manual", labelKey: "relations.type.similar", meaningKey: "relations.meaning.similar" },
  alternative: { directed: false, origin: "manual", filter: "manual", labelKey: "relations.type.alternative", meaningKey: "relations.meaning.alternative" },
  inspired_by: { directed: true, origin: "manual", filter: "manual", labelKey: "relations.type.inspired_by", meaningKey: "relations.meaning.inspired_by" },
  workflow_step: { directed: true, origin: "derived", filter: "workflow", labelKey: "relations.type.workflow_step", meaningKey: "relations.meaning.workflow_step" },
  uses_generator: { directed: true, origin: "derived", filter: "generator", labelKey: "relations.type.uses_generator", meaningKey: "relations.meaning.uses_generator" },
  request_result: { directed: true, origin: "derived", filter: "request", labelKey: "relations.type.request_result", meaningKey: "relations.meaning.request_result" },
  accepted_suggestion: { directed: true, origin: "derived", filter: "request", labelKey: "relations.type.accepted_suggestion", meaningKey: "relations.meaning.accepted_suggestion" },
};

export const FILTER_ORDER: readonly Exclude<RelationFilter, "all">[] = ["dna", "manual", "workflow", "generator", "request"];

export function isManualRelationType(value: string): value is ManualRelationType {
  return (MANUAL_RELATION_TYPES as readonly string[]).includes(value);
}

export function isRelatableKind(value: string): value is RelatableKind {
  return (RELATABLE_KINDS as readonly string[]).includes(value);
}

/** One node of the map: a light summary, never the full content. */
export interface RelationNode {
  /** `${kind}:${id}` — unique across kinds. */
  key: string;
  kind: RelationNodeKind;
  id: string;
  title: string;
  description: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerUsername: string | null;
  imageUrl: string | null;
  /** image / text / audio / video for prompts, generators, requests; null otherwise. */
  contentType: string | null;
  /** Where "Go to detail" leads. */
  href: string;
}

export function nodeKey(kind: RelationNodeKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * Why an edge exists — structured (not pre-translated strings) so the UI can
 * render it in either language, and so every explanation is traceable to a
 * real comparison / real database link.
 */
export type RelationReason =
  | { kind: "sharedSection"; section: DnaSectionType; pieces: string[] }
  | { kind: "sharedTags"; tags: string[] }
  | { kind: "sameCategory"; contentType: string; category: string; subcategory: string | null }
  | { kind: "workflow"; workflowTitle: string; position: number }
  | { kind: "workflowNeighbor"; workflowTitle: string; fromPosition: number; toPosition: number }
  | { kind: "selectedAnswer" }
  | { kind: "suggestion"; versionNumber: number | null }
  | { kind: "note"; text: string }
  | { kind: "info"; key: TranslationKey };

export type DnaSimilarityLevel = "high" | "medium" | "low";

export interface RelationEdge {
  /** Unique within a graph. */
  id: string;
  type: RelationType;
  /** Node keys. For directed relations the arrow runs from → to. */
  from: string;
  to: string;
  reasons: RelationReason[];
  /** DNA similarity only. 0..1 — a "looks similar" signal, never a quality or accuracy claim. */
  score?: number;
  level?: DnaSimilarityLevel;
  /** Manual relations only: the `content_relations.id`, and whether the viewer may remove it. */
  relationId?: string;
  canRemove?: boolean;
}

export function edgeDef(edge: Pick<RelationEdge, "type">): RelationTypeDef {
  return RELATION_TYPES[edge.type];
}

/** The other end of an edge as seen from `nodeKeyValue`, or null if the edge does not touch it. */
export function otherEnd(edge: Pick<RelationEdge, "from" | "to">, nodeKeyValue: string): string | null {
  if (edge.from === nodeKeyValue) return edge.to;
  if (edge.to === nodeKeyValue) return edge.from;
  return null;
}

/** Filters that actually have data (so the UI never shows an empty chip). Order is stable. */
export function availableFilters(edges: readonly Pick<RelationEdge, "type">[]): Exclude<RelationFilter, "all">[] {
  const present = new Set(edges.map((edge) => RELATION_TYPES[edge.type].filter));
  return FILTER_ORDER.filter((filter) => present.has(filter));
}

export function edgeMatchesFilter(edge: Pick<RelationEdge, "type">, filter: RelationFilter): boolean {
  return filter === "all" || RELATION_TYPES[edge.type].filter === filter;
}
