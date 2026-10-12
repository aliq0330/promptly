"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { usePrefersReducedMotion } from "@/lib/motion";
import { assemblyProgress, segmentPromptAssembly } from "@/lib/prompt-variables";

/** A variable's value inside the sentence. When it changes (the viewer picked something else) it flashes in once; the first render never animates. */
function AssembledValue({ text, settled, armed }: { text: string; settled: boolean; armed: boolean }) {
  // A value that drops into an empty slot *after* the page has settled plays the same entrance as a swap.
  const [entersLate] = useState(armed);
  const [state, setState] = useState({ text, seq: 0 });
  if (state.text !== text) setState({ text, seq: state.seq + 1 });
  return (
    <mark
      key={state.seq}
      data-assembled-value
      className={cn(
        "rounded-sm px-1 text-primary transition-[background-color,font-weight] duration-300 ease-soft",
        settled ? "bg-primary-soft/60 font-medium" : "bg-primary-soft font-semibold",
        (entersLate || state.seq > 0) && "animate-value-swap",
      )}
    >
      {text}
    </mark>
  );
}

/**
 * Prompt Assemble: the prompt text as it is put together from the viewer's
 * real choices. Values drop into their `{variable}` slots (a swap flashes the
 * new value), still-empty visible variables show as dashed placeholders so
 * the viewer sees where they land, and the text stays plain selectable text —
 * what is on screen (placeholders aside) is exactly what Kopyala copies.
 */
export function AssembledPromptText({
  template,
  values,
  visible,
  settled,
}: {
  template: string;
  values: Record<string, string>;
  visible: Record<string, boolean>;
  /** Every visible variable has a value: the highlights calm down into one composed prompt. */
  settled: boolean;
}) {
  // False through the first paint, so a prompt that loads already filled never animates.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <>
      {segmentPromptAssembly(template, values, visible).map((segment, index) =>
        segment.kind === "text" ? (
          segment.text
        ) : segment.kind === "value" ? (
          <AssembledValue key={`${segment.name}-${index}`} text={segment.text} settled={settled} armed={armed} />
        ) : (
          <mark
            key={`${segment.name}-${index}`}
            data-assembled-empty
            className="rounded-sm border border-dashed border-primary/50 bg-transparent px-1 font-medium text-primary/70"
          >
            {segment.text}
          </mark>
        ),
      )}
    </>
  );
}

/**
 * "3/4 alan dolu" → "Prompt hazır": a hairline progress bar plus a status
 * pill. Plays one sweep across the prompt block when the viewer *completes*
 * it (incomplete → complete) — never on first load, never in a loop.
 */
export function useAssembleProgress(variables: { name: string }[], values: Record<string, string>, visible: Record<string, boolean>) {
  const progress = assemblyProgress(variables, values, visible);
  const reduced = usePrefersReducedMotion();
  const wasComplete = useRef<boolean | null>(null);
  const [sweepSeq, setSweepSeq] = useState(0);

  useEffect(() => {
    if (variables.length === 0) return;
    // First measurement only records the starting state (a prompt whose defaults already fill every slot is simply "ready").
    if (wasComplete.current === false && progress.complete && !reduced) setSweepSeq((n) => n + 1);
    wasComplete.current = progress.complete;
  }, [progress.complete, variables.length, reduced]);

  return { ...progress, sweepSeq };
}

export function AssembleStatus({ filled, total, complete }: { filled: number; total: number; complete: boolean }) {
  const { t } = useTranslation();
  if (total === 0) return null;
  return (
    <div className="flex items-center gap-2.5 border-b border-border-soft px-4 py-2" data-assemble-status={complete ? "ready" : "pending"}>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-border-soft" aria-hidden>
        <div
          className="h-full origin-left rounded-full bg-primary transition-transform duration-[var(--motion-emphasis)] ease-soft"
          style={{ transform: `scaleX(${total === 0 ? 0 : filled / total})` }}
        />
      </div>
      <p role="status" aria-live="polite" className={cn("inline-flex items-center gap-1 text-caption font-medium tabular-nums", complete ? "text-primary" : "text-text-muted")}>
        {complete ? (
          <>
            <Check size={12} strokeWidth={2.4} className="animate-check-pop" aria-hidden />
            {t("assemble.ready")}
          </>
        ) : (
          t("assemble.progress", { filled, total })
        )}
      </p>
    </div>
  );
}

/** The one-shot sweep layer; remounting it (key = sweepSeq) replays it. */
export function AssembleSweep({ seq }: { seq: number }) {
  if (seq === 0) return null;
  return (
    <span
      key={seq}
      aria-hidden
      className="pointer-events-none absolute inset-0 animate-assemble-sweep"
      style={{
        backgroundImage: "linear-gradient(100deg, transparent 35%, color-mix(in oklab, var(--color-primary) 16%, transparent) 50%, transparent 65%)",
        backgroundSize: "250% 100%",
      }}
    />
  );
}
