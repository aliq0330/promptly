"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeContent } from "@/lib/tag-catalog-matcher";
import type { Tag } from "@/types";

export type TagSource = "manual" | "automatic";

export interface AcceptedTagEntry {
  tag: Tag;
  source: TagSource;
}

const ANALYSIS_DEBOUNCE_MS = 400;

export interface UseTagPickerOptions {
  title: string;
  content: string;
  /** The full, real tag catalog (see `fetchAllTags`) — matched against, never invented from. */
  catalog: Tag[];
  /** Pre-seeded accepted tags (e.g. copied from a remix/duplicate source) — always `manual`, since they weren't detected by this analysis. */
  initialTags?: Tag[];
  /**
   * A request's own tags, when this picker backs a request-ANSWER form
   * (CLAUDE.md §12). Used only as soft context — nudged into the
   * `suggested` tier, NEVER auto-added to `accepted` — so the answer's own
   * content still genuinely drives what gets auto-tagged, and the
   * request's subject never gets blindly copied as the answer's tags.
   */
  contextTags?: Tag[];
}

export interface UseTagPickerResult {
  /** Tags currently attached to this content — both accepted-automatic and manual, always de-duplicated by slug. */
  accepted: AcceptedTagEntry[];
  /** Tags the analyzer thinks might be relevant but isn't confident enough to auto-add — shown for the user to pick. */
  suggested: Tag[];
  /** True while a debounced re-analysis is pending (not a network state — purely local/synchronous, but still worth a subtle "analiz ediliyor…" indicator per CLAUDE.md §23). */
  isAnalyzing: boolean;
  /** Accepts a suggested chip — from this point on it's a manual tag (CLAUDE.md §5). */
  acceptSuggested: (tag: Tag) => void;
  /** Adds a tag directly (autocomplete selection or newly-created tag) — always manual, and un-dismisses it if it had been removed before. */
  addManual: (tag: Tag) => void;
  /** Removes an accepted tag. If it was automatic, it's marked dismissed so it won't be silently re-added while the text is unchanged (CLAUDE.md §5/§8). */
  removeAccepted: (slug: string) => void;
  /** Hides a suggested-but-not-accepted chip without accepting it. */
  dismissSuggested: (slug: string) => void;
}

/**
 * Drives the live, automatic/manual tag state for a single piece of content
 * (a prompt or a request) — the one shared state machine behind both
 * `CreatePromptForm` and `CreateRequestForm` (CLAUDE.md §2's "tüm
 * özellikler aynı tek etiket sistemi üzerinden çalışmalı"). Re-analyzes
 * `title`+`content` together (never title alone — §6), debounced so typing
 * never triggers analysis on every keystroke (§3/§20), and never silently
 * removes an already-accepted tag just because a later pass no longer
 * matches it, and never re-adds a tag the user explicitly dismissed while
 * the text hasn't materially changed (§5/§8's central, "EN ÖNEMLİ" rule).
 */
export function useTagPicker({ title, content, catalog, initialTags, contextTags }: UseTagPickerOptions): UseTagPickerResult {
  const [accepted, setAccepted] = useState<AcceptedTagEntry[]>(() =>
    (initialTags ?? []).map((tag) => ({ tag, source: "manual" as const })),
  );
  const [suggested, setSuggested] = useState<Tag[]>([]);
  const [dismissedSlugs, setDismissedSlugs] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const lastAnalyzedKeyRef = useRef<string | null>(null);
  const acceptedRef = useRef(accepted);
  const dismissedRef = useRef(dismissedSlugs);

  useEffect(() => {
    acceptedRef.current = accepted;
  }, [accepted]);
  useEffect(() => {
    dismissedRef.current = dismissedSlugs;
  }, [dismissedSlugs]);

  useEffect(() => {
    const combinedKey = `${title}\u0000${content}`;
    if (catalog.length === 0) return;
    if (combinedKey === lastAnalyzedKeyRef.current) return;
    if (!title.trim() && !content.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale suggestions the instant both fields are emptied, mirroring SearchView's identical empty-query clear
      setSuggested([]);
      return;
    }

    setIsAnalyzing(true);
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      lastAnalyzedKeyRef.current = combinedKey;
      const result = analyzeContent(title, content, catalog);

      const currentAccepted = acceptedRef.current;
      const currentDismissed = dismissedRef.current;
      const acceptedSlugs = new Set(currentAccepted.map((entry) => entry.tag.slug));

      // Merge newly-matched high-confidence tags in — never drop an
      // already-accepted tag, and never silently re-add a dismissed one.
      const newlyAutomatic = result.automatic.filter(
        (tag) => !acceptedSlugs.has(tag.slug) && !currentDismissed.has(tag.slug),
      );
      if (newlyAutomatic.length > 0) {
        setAccepted((prev) => [...prev, ...newlyAutomatic.map((tag) => ({ tag, source: "automatic" as const }))]);
      }

      const mergedAcceptedSlugs = new Set([...acceptedSlugs, ...newlyAutomatic.map((tag) => tag.slug)]);
      const contextSuggestions = (contextTags ?? []).filter(
        (tag) => !mergedAcceptedSlugs.has(tag.slug) && !currentDismissed.has(tag.slug),
      );
      const suggestedPool = [...result.suggested, ...contextSuggestions];
      const seenSuggested = new Set<string>();
      const nextSuggested = suggestedPool.filter((tag) => {
        if (mergedAcceptedSlugs.has(tag.slug) || currentDismissed.has(tag.slug)) return false;
        if (seenSuggested.has(tag.slug)) return false;
        seenSuggested.add(tag.slug);
        return true;
      });
      setSuggested(nextSuggested);
      setIsAnalyzing(false);
    }, ANALYSIS_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      setIsAnalyzing(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- contextTags is intentionally excluded: it only ever nudges the suggested tier of the *next* natural re-analysis, re-running purely because the request's own tags array identity changed would be pointless churn.
  }, [title, content, catalog]);

  const acceptSuggested = useCallback((tag: Tag) => {
    setSuggested((prev) => prev.filter((entry) => entry.slug !== tag.slug));
    setDismissedSlugs((prev) => {
      if (!prev.has(tag.slug)) return prev;
      const next = new Set(prev);
      next.delete(tag.slug);
      return next;
    });
    setAccepted((prev) => (prev.some((entry) => entry.tag.slug === tag.slug) ? prev : [...prev, { tag, source: "manual" }]));
  }, []);

  const addManual = useCallback((tag: Tag) => {
    setSuggested((prev) => prev.filter((entry) => entry.slug !== tag.slug));
    setDismissedSlugs((prev) => {
      if (!prev.has(tag.slug)) return prev;
      const next = new Set(prev);
      next.delete(tag.slug);
      return next;
    });
    setAccepted((prev) => (prev.some((entry) => entry.tag.slug === tag.slug) ? prev : [...prev, { tag, source: "manual" }]));
  }, []);

  const removeAccepted = useCallback((slug: string) => {
    setAccepted((prev) => prev.filter((entry) => entry.tag.slug !== slug));
    setDismissedSlugs((prev) => {
      if (prev.has(slug)) return prev;
      const next = new Set(prev);
      next.add(slug);
      return next;
    });
  }, []);

  const dismissSuggested = useCallback((slug: string) => {
    setSuggested((prev) => prev.filter((entry) => entry.slug !== slug));
    setDismissedSlugs((prev) => {
      if (prev.has(slug)) return prev;
      const next = new Set(prev);
      next.add(slug);
      return next;
    });
  }, []);

  return useMemo(
    () => ({ accepted, suggested, isAnalyzing, acceptSuggested, addManual, removeAccepted, dismissSuggested }),
    [accepted, suggested, isAnalyzing, acceptSuggested, addManual, removeAccepted, dismissSuggested],
  );
}
