"use client";

import { useMemo, useState } from "react";
import { Plus, Sparkles, X } from "lucide-react";
import { useTagCatalog } from "@/features/tags/use-tag-catalog";
import { findExistingTagByLabel, getOrCreateTag } from "@/lib/supabase/tags";
import { normalizeTagLabel } from "@/lib/tag-normalize";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { UseTagPickerResult } from "./use-tag-picker";
import type { Tag } from "@/types";

interface TagPickerProps {
  picker: UseTagPickerResult;
  /** True while the caller can't publish anyway (e.g. not signed in) — hides every interactive control, leaving only the read-only chip list. */
  disabled?: boolean;
}

/**
 * The one shared tag UI behind both the prompt and request forms (CLAUDE.md
 * Bölüm 9.23 §2's "tüm özellikler aynı tek etiket sistemi üzerinden
 * çalışmalı"): accepted chips (automatic ones visually marked with a
 * Sparkles badge + "Otomatik" label + a hover/accessible explanation,
 * manual ones plain — §4), a row of lower-confidence suggestions the user
 * can accept with one tap (§7), and a real-catalog-backed autocomplete that
 * offers an existing tag first and only shows "create new" when no
 * normalized match exists (§9/§10).
 */
export function TagPicker({ picker, disabled }: TagPickerProps) {
  const { t } = useTranslation();
  const { catalog, refresh } = useTagCatalog();
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const acceptedSlugs = useMemo(() => new Set(picker.accepted.map((entry) => entry.tag.slug)), [picker.accepted]);

  const normalizedQuery = normalizeTagLabel(query);
  const matches = useMemo(() => {
    if (!normalizedQuery) return [];
    return catalog
      .filter((tag) => !acceptedSlugs.has(tag.slug) && normalizeTagLabel(tag.label).includes(normalizedQuery))
      .slice(0, 8);
  }, [catalog, normalizedQuery, acceptedSlugs]);
  const exactMatch = normalizedQuery ? findExistingTagByLabel(catalog, query) : null;
  const canCreateNew = Boolean(normalizedQuery) && !exactMatch;

  async function handleCreate() {
    const trimmed = query.trim();
    if (!trimmed || isCreating) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const tag = await getOrCreateTag(trimmed);
      picker.addManual(tag);
      refresh();
      setQuery("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t("tagPicker.createFailed"));
    } finally {
      setIsCreating(false);
    }
  }

  function handleSelectExisting(tag: Tag) {
    picker.addManual(tag);
    setQuery("");
    setCreateError(null);
  }

  return (
    <div className="space-y-3">
      {picker.accepted.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picker.accepted.map(({ tag, source }) => (
            <span
              key={tag.slug}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                source === "automatic"
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-surface text-text",
              )}
            >
              {source === "automatic" && (
                <span title={t("tagPicker.autoSuggestedTitle")} className="inline-flex shrink-0">
                  <Sparkles size={11} aria-hidden="true" />
                  <span className="sr-only">{t("tagPicker.autoSuggestedSr")}</span>
                </span>
              )}
              <span>{tag.label}</span>
              {source === "automatic" && <span className="text-[10px] font-normal opacity-80">· {t("tagPicker.automatic")}</span>}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => picker.removeAccepted(tag.slug)}
                  aria-label={t("tagPicker.removeTagAriaLabel", { label: tag.label })}
                  className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-black/10"
                >
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {picker.isAnalyzing && <p className="text-xs text-text-muted">{t("tagPicker.analyzing")}</p>}

      {!disabled && picker.suggested.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-text-muted">{t("tagPicker.moreSuggestions")}</p>
          <div className="flex flex-wrap gap-1.5">
            {picker.suggested.map((tag) => {
              const isAccepting = picker.acceptingSlug === tag.slug;
              return (
                <span key={tag.slug} className="inline-flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      const promise = picker.acceptSuggested(tag);
                      // Only a freshly-promoted candidate needs the shared
                      // catalog cache refreshed — accepting an already-real
                      // suggestion is instant and changes nothing server-side.
                      if (tag.isCandidate) void promise.then(() => refresh());
                    }}
                    disabled={isAccepting}
                    title={tag.isCandidate ? t("tagPicker.candidateHint") : undefined}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
                  >
                    <Plus size={11} />
                    {tag.label}
                    {isAccepting && <span className="text-[10px] font-normal">{t("tagPicker.creating")}</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => picker.dismissSuggested(tag.slug)}
                    aria-label={t("tagPicker.dismissSuggestionAriaLabel", { label: tag.label })}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-accent-surface hover:text-text"
                  >
                    <X size={10} />
                  </button>
                </span>
              );
            })}
          </div>
          {picker.acceptError && <p className="text-xs text-danger">{picker.acceptError}</p>}
        </div>
      )}

      {!disabled && (
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCreateError(null);
            }}
            placeholder={t("tagPicker.searchOrCreatePlaceholder")}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
          />
          {normalizedQuery && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
              {matches.map((tag) => (
                <button
                  key={tag.slug}
                  type="button"
                  onClick={() => handleSelectExisting(tag)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-text hover:bg-accent-surface"
                >
                  <span>{tag.label}</span>
                  {typeof tag.usageCount === "number" && (
                    <span className="shrink-0 text-xs text-text-muted">{t("tagPicker.usageCount", { count: tag.usageCount })}</span>
                  )}
                </button>
              ))}
              {canCreateNew && (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={isCreating}
                  className="flex w-full items-center gap-1.5 border-t border-border px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent-surface disabled:opacity-60"
                >
                  <Plus size={13} />
                  {isCreating ? t("tagPicker.creating") : t("tagPicker.createTagAction", { label: query.trim() })}
                </button>
              )}
              {matches.length === 0 && !canCreateNew && (
                <p className="px-3 py-2 text-sm text-text-muted">{t("tagPicker.noMatch")}</p>
              )}
            </div>
          )}
          {createError && <p className="mt-1 text-xs text-danger">{createError}</p>}
        </div>
      )}

      <p className="text-xs text-text-muted">
        {t("tagPicker.autoHint")}
      </p>
    </div>
  );
}
