"use client";

import { AlertTriangle, GitMerge } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { NODE_HEIGHT, NODE_WIDTH } from "./remix-tree-layout";
import type { RemixGraphNode } from "@/types";

export interface NodeMergeStatus {
  hasPending: boolean;
  hasAccepted: boolean;
}

/**
 * One real focusable node card in the Remix Dallanma Haritası — a plain
 * `<button>` positioned absolutely by the caller (`left`/`top` come from
 * `layoutRemixTree`), so native Tab order and Enter/Space activation work
 * for free (Aşama 2's "erişilebilir klavye etkileşimleri" requirement)
 * without any custom key handling here.
 */
export function RemixMapNodeCard({
  node,
  x,
  y,
  isSelected,
  isCurrent,
  mergeStatus,
  onSelect,
}: {
  node: RemixGraphNode;
  x: number;
  y: number;
  isSelected: boolean;
  /** The prompt whose detail page this map is embedded in — visually distinguished so "where am I" is always obvious. */
  isCurrent: boolean;
  mergeStatus: NodeMergeStatus;
  onSelect: (id: string) => void;
}) {
  const label = node.isDeleted
    ? `${node.originType === "original" ? "Orijinal" : "Remix"}, silinmiş — ${node.author.displayName}`
    : `${node.originType === "original" ? "Orijinal" : "Remix"}: ${node.title}, ${node.author.displayName}`;

  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      aria-label={label}
      aria-pressed={isSelected}
      style={{ left: x, top: y, width: NODE_WIDTH, height: NODE_HEIGHT }}
      className={cn(
        "absolute flex flex-col justify-between gap-1 rounded-lg border bg-surface p-2.5 text-left shadow-sm transition-colors",
        "hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isSelected ? "border-primary ring-1 ring-primary" : "border-border",
        isCurrent && !isSelected && "border-primary/40",
        node.isDeleted && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            "rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
            node.originType === "original" ? "bg-accent-surface text-primary" : "bg-accent-surface/60 text-text-muted",
          )}
        >
          {node.originType === "original" ? "Orijinal" : "Remix"}
        </span>
        {mergeStatus.hasPending && (
          <span title="Bekleyen merge talebi" aria-label="Bekleyen merge talebi var">
            <GitMerge size={13} className="shrink-0 text-primary" />
          </span>
        )}
      </div>

      {node.isDeleted ? (
        <p className="flex items-center gap-1 text-xs italic text-text-muted">
          <AlertTriangle size={12} className="shrink-0" />
          Silinmiş içerik
        </p>
      ) : (
        <p className="line-clamp-2 text-xs font-medium text-text">{node.title}</p>
      )}

      <div className="flex items-center gap-1.5">
        <Avatar src={node.author.avatarUrl} alt={node.author.displayName} size={16} />
        <span className="truncate text-[11px] text-text-muted">{node.author.displayName}</span>
      </div>
    </button>
  );
}
