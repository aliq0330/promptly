"use client";

import Link from "next/link";
import { ExternalLink, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { StudioSnapshot } from "@/lib/studio-diff";
import { describeSource, KIND_ICONS } from "./studio-meta";
import { sourceHref, STUDIO_KINDS, type StudioKind, type StudioSources } from "./studio-model";

/**
 * The attached sources, rendered two ways from the same data: vertical cards
 * (wide layout's left column) and a horizontal chip strip (everything
 * narrower, incl. phones). Removing only detaches — the original is never touched.
 */
export function SourcePanel({
  layout,
  sources,
  draft,
  active,
  onSelect,
  onRemove,
  onAdd,
}: {
  layout: "cards" | "chips";
  sources: StudioSources;
  draft: StudioSnapshot;
  active: StudioKind | null;
  onSelect: (kind: StudioKind) => void;
  onRemove: (kind: StudioKind) => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const attached = STUDIO_KINDS.filter((kind) => sources[kind]);

  if (layout === "chips") {
    return (
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label={t("studio.sources")}>
        {attached.map((kind) => {
          const Icon = KIND_ICONS[kind];
          const isActive = active === kind;
          return (
            <div
              key={kind}
              className={cn(
                "flex h-[46px] shrink-0 items-center overflow-hidden rounded-full border text-small transition-colors",
                isActive ? "border-primary bg-primary-soft text-text" : "border-border bg-surface text-text-secondary",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelect(kind)}
                className="flex h-full items-center gap-2 pl-3.5 pr-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                {t(`studio.kind.${kind}` as const)}
              </button>
              <button
                type="button"
                onClick={() => onRemove(kind)}
                aria-label={t("studio.removeSource", { name: t(`studio.kind.${kind}` as const) })}
                className="flex h-full w-9 items-center justify-center text-text-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          className="flex h-[46px] shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border-strong px-3.5 text-small font-medium text-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("studio.addSource")}
        </button>
      </div>
    );
  }

  return (
    <aside aria-label={t("studio.sources")} className="min-w-0 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("studio.sources")}</h2>
      </div>
      <ul className="space-y-2">
        {attached.map((kind) => {
          const Icon = KIND_ICONS[kind];
          const isActive = active === kind;
          const meta = describeSource(kind, draft, t);
          const href = sourceHref(kind, sources);
          return (
            <li key={kind} className="animate-fade-in">
              <div className={cn("overflow-hidden rounded-xl border shadow-xs transition-colors duration-200 ease-soft", isActive ? "border-primary bg-primary-soft" : "border-border-soft bg-surface hover:bg-surface-soft")}>
                <button
                  type="button"
                  aria-current={isActive}
                  onClick={() => onSelect(kind)}
                  className="flex min-h-14 w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-soft text-primary">
                    <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-caption font-semibold uppercase tracking-[0.06em] text-text-muted">{t(`studio.kind.${kind}` as const)}</span>
                    <span className="block truncate text-small font-medium text-text">{meta.title}</span>
                    <span className="block truncate text-caption text-text-secondary">{meta.subtitle}</span>
                  </span>
                </button>
                <div className="flex min-h-11 items-center gap-1 border-t border-border-soft px-2">
                  <span className={cn("mr-auto flex items-center gap-1.5 pl-1 text-caption", isActive ? "font-medium text-primary" : "text-text-muted")}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", isActive ? "bg-primary" : "bg-border-strong")} aria-hidden />
                    {isActive ? t("studio.active") : t("studio.attached")}
                  </span>
                  {href && (
                    <Link
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("studio.openOriginal", { name: t(`studio.kind.${kind}` as const) })}
                      className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-caption font-medium text-text-secondary hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      {t("studio.open")}
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(kind)}
                    aria-label={t("studio.removeSource", { name: t(`studio.kind.${kind}` as const) })}
                    className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-caption font-medium text-text-secondary hover:bg-surface-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    {t("studio.remove")}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onAdd}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong text-small font-medium text-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Plus className="h-4 w-4" aria-hidden />
        {t("studio.addSource")}
      </button>
    </aside>
  );
}
