"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Crosshair, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RELATION_TYPES, isRelatableKind, otherEnd, type RelationEdge, type RelationNode } from "@/lib/relations/types";
import { KIND_ICON, useRelationText } from "./relation-text";

/**
 * Detail of the selected node and of every relation between it and the
 * map's center: relation type, direction, where the relation came from and
 * WHY it is shown (the real comparison / link data, never a made-up reason).
 */
export function RelationDetailPanel({
  node,
  center,
  edges,
  titleOf,
  onRecenter,
  onRemove,
  onClose,
  className,
}: {
  node: RelationNode | null;
  center: RelationNode;
  /** Every visible edge of the graph. */
  edges: RelationEdge[];
  titleOf: (key: string) => string;
  onRecenter: (node: RelationNode) => void;
  onRemove: (edge: RelationEdge) => Promise<void>;
  /** Mobile drawer only. */
  onClose?: () => void;
  className?: string;
}) {
  const { t, kindLabel, typeLabel, originLabel, reasonText, directionText, levelLabel } = useRelationText();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!node) {
    return (
      <div className={cn("rounded-xl border border-border-soft bg-surface p-4 text-small text-text-muted", className)}>
        {t("relations.panel.hint")}
      </div>
    );
  }

  const isCenter = node.key === center.key;
  const related = isCenter ? [] : edges.filter((edge) => otherEnd(edge, center.key) === node.key);
  const Icon = KIND_ICON[node.kind];
  const canRecenter = !isCenter && isRelatableKind(node.kind);

  const remove = async (edge: RelationEdge) => {
    if (confirmId !== edge.id) {
      setConfirmId(edge.id);
      return;
    }
    setRemovingId(edge.id);
    setError(null);
    try {
      await onRemove(edge);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("relations.error.generic"));
    } finally {
      setRemovingId(null);
      setConfirmId(null);
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col rounded-xl border border-border-soft bg-surface shadow-card", className)} data-relation-panel>
      <div className="flex items-start gap-3 border-b border-border-soft p-4">
        {node.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- small panel thumbnail
          <img src={node.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
        ) : (
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-surface-soft text-text-muted">
            <Icon size={22} strokeWidth={1.75} aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
            <Icon size={12} aria-hidden />
            {kindLabel(node.kind)}
            {isCenter && <Badge variant="accent">{t("relations.panel.isCenter")}</Badge>}
          </p>
          <h2 className="mt-0.5 break-words text-h3 font-semibold text-text">{node.title}</h2>
          {node.ownerName && (
            <p className="text-caption text-text-muted">
              {t("relations.panel.owner")}: {node.ownerName}
              {node.ownerUsername ? ` · @${node.ownerUsername}` : ""}
            </p>
          )}
        </div>
        {onClose && (
          <button type="button" aria-label={t("relations.panel.close")} onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {node.description && <p className="break-words text-small text-text-secondary">{node.description}</p>}

        {related.length > 0 && (
          <section aria-label={t("relations.panel.relations")} className="space-y-3">
            <h3 className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("relations.panel.relations")}</h3>
            <ul className="space-y-3">
              {related.map((edge) => {
                const def = RELATION_TYPES[edge.type];
                return (
                  <li key={edge.id} data-relation-item={edge.type} className="space-y-2 rounded-lg border border-border-soft bg-surface-soft p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="accent">{typeLabel(edge.type)}</Badge>
                      {edge.level && <Badge variant="neutral">{levelLabel(edge.level)}</Badge>}
                    </div>
                    <p className="flex items-start gap-1.5 break-words text-small font-medium text-text">
                      <ArrowRight size={14} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
                      {directionText(edge, titleOf)}
                    </p>
                    <p className="text-caption text-text-muted">{t(def.meaningKey)}</p>
                    <p className="text-caption text-text-secondary">
                      <span className="font-semibold">{t("relations.panel.source")}:</span> {originLabel(edge.type)}
                    </p>
                    <div>
                      <p className="text-caption font-semibold text-text-secondary">{t("relations.panel.reason")}</p>
                      <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-caption text-text-secondary">
                        {edge.reasons.map((reason, index) => (
                          <li key={index} className="break-words">
                            {reasonText(reason)}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {edge.canRemove && edge.relationId && (
                      <Button
                        type="button"
                        size="sm"
                        variant={confirmId === edge.id ? "danger" : "outline"}
                        disabled={removingId === edge.id}
                        onClick={() => remove(edge)}
                      >
                        <Trash2 size={14} />
                        {removingId === edge.id ? t("relations.removing") : confirmId === edge.id ? t("relations.removeConfirm") : t("relations.remove")}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            {error && (
              <p role="alert" className="text-small text-danger">
                {error}
              </p>
            )}
          </section>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border-soft p-3">
        <Link href={node.href} className={buttonClassName({ variant: "primary", size: "sm" })}>
          {t("relations.goToDetail")}
        </Link>
        {canRecenter && (
          <Button type="button" size="sm" variant="outline" onClick={() => onRecenter(node)}>
            <Crosshair size={14} />
            {t("relations.recenter")}
          </Button>
        )}
      </div>
    </div>
  );
}
