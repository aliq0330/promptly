"use client";

import { useEffect, useRef, useState } from "react";
import { fetchGeneratorVersion } from "@/lib/supabase/generators";
import { fetchWorkflowById } from "@/lib/supabase/workflows";
import type { GeneratorField, WorkflowStep } from "@/types";

/**
 * Focus View shows a generator's real parameters and a workflow's real step
 * chain, but the list payloads only carry counts — the schema / steps live in
 * `generator_versions` / `workflow_steps`. They are fetched lazily: only once
 * a card nears the viewport, once per id for the whole session (module
 * cache + in-flight de-dup), never for cards the visitor doesn't scroll to.
 * While loading (or on failure) the cards fall back to the counts they
 * already have — nothing is ever invented.
 */

/** True from the first moment the element is within `rootMargin` of the viewport (and stays true). */
export function useInViewOnce<T extends Element>(rootMargin = "320px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (seen) return;
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = setTimeout(() => setSeen(true), 0);
      return () => clearTimeout(id);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [seen, rootMargin]);

  return [ref, seen] as const;
}

const resolved = new Map<string, unknown>();
const inFlight = new Map<string, Promise<unknown>>();

function useLazy<T>(key: string | null, enabled: boolean, load: () => Promise<T | null>): { data: T | null; loading: boolean } {
  const [, force] = useState(0);

  useEffect(() => {
    if (!enabled || !key || resolved.has(key)) return;
    let cancelled = false;
    let pending = inFlight.get(key) as Promise<T | null> | undefined;
    if (!pending) {
      pending = load().then(
        (value) => {
          resolved.set(key, value);
          inFlight.delete(key);
          return value;
        },
        () => {
          resolved.set(key, null);
          inFlight.delete(key);
          return null;
        },
      );
      inFlight.set(key, pending);
    }
    void pending.then(() => {
      if (!cancelled) force((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifies the resource; `load` is a fresh closure every render
  }, [key, enabled]);

  if (!key) return { data: null, loading: false };
  if (resolved.has(key)) return { data: (resolved.get(key) as T | null) ?? null, loading: false };
  return { data: null, loading: enabled };
}

export interface GeneratorFocusFields {
  /** Field labels in the creator's own order. */
  labels: string[];
  count: number;
}

export function useGeneratorFocusFields(versionId: string | null, enabled: boolean) {
  return useLazy<GeneratorFocusFields>(versionId ? `gen:${versionId}` : null, enabled, async () => {
    const version = await fetchGeneratorVersion(versionId!);
    if (!version) return null;
    const fields: GeneratorField[] = [...version.schema.fields].sort((a, b) => a.order - b.order);
    return { labels: fields.map((field) => field.label).filter(Boolean), count: fields.length };
  });
}

export function useWorkflowFocusSteps(workflowId: string, enabled: boolean) {
  return useLazy<WorkflowStep[]>(`wf:${workflowId}`, enabled, async () => {
    const result = await fetchWorkflowById(workflowId);
    return result ? result.steps : null;
  });
}
