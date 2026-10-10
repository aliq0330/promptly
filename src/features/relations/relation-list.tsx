"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { RELATION_TYPES, otherEnd, type RelationEdge, type RelationNode } from "@/lib/relations/types";
import { KIND_ICON, useRelationText } from "./relation-text";

/**
 * Plain-list view of the same graph: the accessible / small-screen
 * alternative to the canvas. Same selection, same data.
 */
export function RelationList({
  center,
  nodes,
  edges,
  selectedKey,
  onSelect,
}: {
  center: RelationNode;
  nodes: RelationNode[];
  edges: RelationEdge[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const { t, kindLabel, typeLabel, levelLabel } = useRelationText();
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const rows = edges
    .map((edge) => ({ edge, node: byKey.get(otherEnd(edge, center.key) ?? "") }))
    .filter((row): row is { edge: RelationEdge; node: RelationNode } => Boolean(row.node))
    .sort((a, b) => (b.edge.score ?? 0) - (a.edge.score ?? 0));

  if (rows.length === 0) return <p className="p-4 text-small text-text-muted">{t("relations.list.empty")}</p>;

  return (
    <ul className="divide-y divide-border-soft" data-relation-list>
      {rows.map(({ edge, node }) => {
        const Icon = KIND_ICON[node.kind];
        const selected = selectedKey === node.key;
        return (
          <li key={edge.id}>
            <button
              type="button"
              onClick={() => onSelect(node.key)}
              aria-pressed={selected}
              className={cn("flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-soft", selected && "bg-primary-soft")}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-surface-soft text-text-muted">
                <Icon size={18} strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-small font-semibold text-text">{node.title}</span>
                <span className="block text-caption text-text-muted">
                  {kindLabel(node.kind)} · {typeLabel(edge.type)}
                  {edge.level ? ` · ${levelLabel(edge.level)}` : ""}
                  {RELATION_TYPES[edge.type].directed ? "" : " ↔"}
                </span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
