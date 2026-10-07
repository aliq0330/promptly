"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { type StudioSnapshot } from "@/lib/studio-diff";
import { locateDnaInPrompt, markSegments, reflectDnaChange, type ReflectStatus } from "@/lib/studio-v2";
import type { DnaSection } from "@/lib/prompt-dna/types";
import { PromptDnaEditor } from "@/features/prompts/prompt-dna-editor";

type Update = (fn: (draft: StudioSnapshot) => StudioSnapshot, key?: string | null) => void;

/**
 * The existing Prompt DNA editor (the "DNA" tab of the prompt editor), bound to the Studio draft.
 *  - Selecting a section highlights its words in a read-only mirror of the draft prompt (or says plainly that they aren't there).
 *  - When a section's text changes and its old text appears in the DRAFT prompt, the draft prompt follows; a status line says
 *    whether that happened, so nothing changes (or fails to change) silently. The original prompt is never written.
 */
export function DnaEditor({ draft, contentType, edit }: { draft: StudioSnapshot; contentType: string; edit: Update }) {
  const { t } = useTranslation();
  const sections = draft.dna ?? [];
  const promptText = draft.prompt?.text ?? sections.map((s) => s.content).join(", ");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<ReflectStatus | "mixed" | null>(null);
  const markRef = useRef<HTMLElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);

  const selected = sections.find((s) => s.id === selectedId) ?? null;
  const located = useMemo(() => (selected ? locateDnaInPrompt(promptText, selected.content) : null), [selected, promptText]);
  const segments = useMemo(() => (draft.prompt ? markSegments(promptText, located?.ranges ?? []) : []), [draft.prompt, promptText, located]);
  const firstMark = segments.findIndex((segment) => segment.mark);

  // Bring the first highlighted phrase into view inside the mirror (never scrolls the page).
  useEffect(() => {
    const mirror = mirrorRef.current;
    const mark = markRef.current;
    if (!mirror || !mark) return;
    mirror.scrollTo({ top: Math.max(0, mark.offsetTop - mirror.clientHeight / 3), behavior: "smooth" });
  }, [selectedId, located]);

  function handleChange(next: DnaSection[]) {
    edit((d) => {
      const reflection = d.prompt ? reflectDnaChange(d.prompt.text, d.dna ?? [], next) : null;
      return { ...d, dna: next, prompt: d.prompt && reflection ? { ...d.prompt, text: reflection.text } : d.prompt };
    }, "dna");
    // The reducer applies the updater later, so derive the status line from the same inputs (this render's draft).
    const result = draft.prompt ? reflectDnaChange(draft.prompt.text, sections, next) : null;
    if (!result || result.results.length === 0) {
      setStatus(null);
    } else {
      const hasReflected = result.results.some((r) => r.status === "reflected");
      const hasUnmatched = result.results.some((r) => r.status === "unmatched");
      setStatus(hasReflected && hasUnmatched ? "mixed" : hasReflected ? "reflected" : "unmatched");
    }
    if (selectedId && !next.some((s) => s.id === selectedId)) setSelectedId(null);
  }

  return (
    <div className="space-y-3">
      <p className="rounded-md bg-surface-soft p-3 text-caption text-text-secondary">{t("studio.dnaHint")}</p>

      {status && (
        <p
          role="status"
          className={
            status === "reflected"
              ? "flex items-start gap-2 rounded-md border border-success/40 bg-surface-soft p-3 text-small text-text"
              : "flex items-start gap-2 rounded-md border border-warning/40 bg-surface-soft p-3 text-small text-text"
          }
        >
          {status === "reflected" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />}
          {status === "reflected" ? t("studio.dnaReflected") : status === "unmatched" ? t("studio.dnaUnmatched") : t("studio.dnaMixed")}
        </p>
      )}

      {draft.prompt && sections.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("studio.promptMirror")}</p>
          <div ref={mirrorRef} tabIndex={0} aria-label={t("studio.promptMirror")} className="prompt-text max-h-48 min-w-0 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border-soft bg-background p-3 text-small text-text">
            {segments.map((segment, index) =>
              segment.mark ? (
                <mark
                  key={index}
                  ref={index === firstMark ? markRef : undefined}
                  className="rounded-sm bg-primary-soft px-0.5 text-text underline decoration-primary decoration-2 underline-offset-2"
                >
                  {segment.text}
                </mark>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )}
          </div>
          {selected && located && !located.matched && (
            <p role="status" className="flex items-start gap-1.5 text-caption text-text-secondary">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              {t("studio.dnaNotInPrompt")}
            </p>
          )}
          {!selected && <p className="text-caption text-text-muted">{t("studio.dnaSelectHint")}</p>}
        </div>
      )}

      <PromptDnaEditor promptText={promptText} contentType={contentType} sections={sections} onChange={handleChange} selectedId={selectedId} onSelectSection={(section) => setSelectedId(section?.id ?? null)} />
    </div>
  );
}
