"use client";

import { Fragment, useState } from "react";
import { ArrowDown, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { StudioSnapshot } from "@/lib/studio-diff";
import { buildComposition, type CompositionKind, type CompositionNode } from "@/lib/studio-v2";
import { cn } from "@/lib/utils";
import { KIND_ICONS } from "./studio-meta";
import type { StudioKind } from "./studio-model";

type Translate = ReturnType<typeof useTranslation>["t"];

function detail(node: CompositionNode, t: Translate): string {
  switch (node.kind) {
    case "prompt":
      return node.excerpt || `${t("studio.sub.variables", { count: node.variables })} · ${t("studio.sub.sections", { count: node.sections })}`;
    case "preset":
      return t("studio.sub.presetApplied", { count: node.applied, total: node.total });
    case "generator":
      return node.locked > 0 ? `${t("studio.sub.parameters", { count: node.parameters })} · ${t("studio.sub.locked", { count: node.locked })}` : t("studio.sub.parameters", { count: node.parameters });
    case "workflow":
      return t("studio.sub.steps", { count: node.steps });
  }
}

/**
 * The recipe: which attached pieces make up the final result, in the order they
 * are actually applied (prompt → preset → generator). It is a plain vertical
 * list with arrows — not a canvas: no branching, conditions or free placement.
 * Selecting a node focuses that source's editor.
 */
export function CompositionView({
  draft,
  active,
  onSelect,
  finalText,
}: {
  draft: StudioSnapshot;
  active: StudioKind | null;
  onSelect: (kind: CompositionKind) => void;
  finalText: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const nodes = buildComposition(draft);
  if (nodes.length === 0) return null;
  const finalFlat = finalText.replace(/\s+/g, " ").trim();

  return (
    <section aria-label={t("studio.composition")} className="min-w-0 rounded-lg border border-border-soft bg-surface p-3 sm:p-4">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md text-caption font-semibold uppercase tracking-[0.08em] text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t("studio.composition")}
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} aria-hidden />
        </button>
      </h2>
      <ol className={cn("mt-3 space-y-0", !open && "hidden")}>
        {nodes.map((node) => {
          const Icon = KIND_ICONS[node.kind];
          const isActive = active === node.kind;
          return (
            <Fragment key={node.kind}>
              <li>
                <button
                  type="button"
                  onClick={() => onSelect(node.kind)}
                  aria-current={isActive}
                  className={cn(
                    "flex min-h-14 w-full min-w-0 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    isActive ? "border-primary bg-primary-soft" : "border-border-soft bg-surface hover:bg-surface-soft",
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-soft text-primary">
                    <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-caption font-semibold uppercase tracking-[0.06em] text-text-muted">{t(`studio.kind.${node.kind}` as const)}</span>
                    <span className="block truncate text-small font-medium text-text">{node.title || t("studio.untitledStep")}</span>
                    <span className="block truncate text-caption text-text-secondary">{detail(node, t)}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
                </button>
              </li>
              <li aria-hidden className="flex h-6 items-center pl-6 text-text-muted">
                <ArrowDown className="h-3.5 w-3.5" />
              </li>
            </Fragment>
          );
        })}
        <li>
          <div className="flex min-h-14 w-full min-w-0 items-center gap-3 rounded-lg border border-dashed border-primary/50 bg-primary-soft/40 px-3 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-caption font-semibold uppercase tracking-[0.06em] text-text-muted">{t("studio.finalComposition")}</span>
              <span className="line-clamp-2 break-words text-small text-text">{finalFlat || t("studio.resultEmpty")}</span>
            </span>
          </div>
        </li>
      </ol>
    </section>
  );
}
