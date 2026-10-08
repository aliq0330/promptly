"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ExternalLink, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { buildRunToolList, getPreferredRunTool, runWithAI, type RunToolOption, type RunWithAIResult } from "@/lib/run-with-ai";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * The one "Çalıştır" surface — a button plus the tool-picker modal behind it,
 * shared by every place that can hand text to an AI tool (prompt detail,
 * personalize modal, generator runtime; later workflows/presets). All the
 * real work lives in `lib/run-with-ai.ts`; this only renders the menu.
 *
 * - Without `preview`: tapping a tool runs immediately (a compact menu).
 * - With `preview` (generators): the built prompt is shown, a tool is
 *   preselected and a "Çalıştır" button confirms.
 * After running, the modal shows what happened (opened with the prompt /
 * copied to paste / copy failed / popup blocked) — never a blank state.
 */
export function RunButton({
  text,
  recommendedRefs,
  preview = false,
  size = "md",
  className,
  disabled,
}: {
  /** The exact text to hand to the tool — read when the user confirms, so live-updating callers stay current. */
  text: string;
  /** The content's "recommended tools" (`tools` refs) — runnable ones are surfaced first. */
  recommendedRefs?: string[] | null;
  preview?: boolean;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={disabled || !text.trim()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "relative z-10 inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-primary/30 bg-primary-soft font-medium text-primary transition-colors duration-200 ease-soft hover:border-primary/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
          size === "sm" ? "h-7 px-2 text-caption" : "h-9 px-3 text-label",
          className,
        )}
      >
        <Play size={size === "sm" ? 12 : 14} aria-hidden />
        {t("run.button")}
      </button>
      {open && <RunModal text={text} recommendedRefs={recommendedRefs} preview={preview} onClose={() => setOpen(false)} />}
    </>
  );
}

function RunModal({
  text,
  recommendedRefs,
  preview,
  onClose,
}: {
  text: string;
  recommendedRefs?: string[] | null;
  preview: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // Read once on open: the saved choice only decides ordering/preselection.
  const [lastUsedId] = useState(() => getPreferredRunTool());
  const list = useMemo(() => buildRunToolList(recommendedRefs, lastUsedId), [recommendedRefs, lastUsedId]);
  const [showMore, setShowMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const all = [...list.primary, ...list.more];
    return all.find((o) => o.tool.id === lastUsedId)?.tool.id ?? all.find((o) => o.recommended)?.tool.id ?? list.primary[0]?.tool.id ?? null;
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunWithAIResult | null>(null);
  const manualRef = useRef<HTMLTextAreaElement>(null);

  async function run(toolId: string) {
    if (running) return;
    setRunning(true);
    const outcome = await runWithAI({ content: text, toolId });
    setRunning(false);
    setResult(outcome);
  }

  function handleToolClick(toolId: string) {
    setSelectedId(toolId);
    if (!preview) void run(toolId);
  }

  const visible: RunToolOption[] = showMore ? [...list.primary, ...list.more] : list.primary;

  return (
    <Modal onClose={onClose} labelledBy="run-modal-title">
      <div
        className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="run-modal-title" className="text-base font-semibold text-text">
            {t("run.button")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        {result ? (
          <RunOutcome result={result} text={text} manualRef={manualRef} onClose={onClose} />
        ) : (
          <>
            {preview ? (
              <div>
                <p className="mb-1.5 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("run.generatedPrompt")}</p>
                <div className="prompt-text max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border-soft bg-surface-soft px-3 py-2 text-text-secondary">
                  {text}
                </div>
              </div>
            ) : (
              <p className="text-small text-text-secondary">{t("run.hint")}</p>
            )}

            <div>
              {preview && <p className="mb-1.5 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("run.pickTool")}</p>}
              <ul className="space-y-1.5">
                {visible.map(({ tool, recommended }) => {
                  const selected = preview && selectedId === tool.id;
                  return (
                    <li key={tool.id}>
                      <button
                        type="button"
                        disabled={running}
                        aria-pressed={preview ? selected : undefined}
                        onClick={() => handleToolClick(tool.id)}
                        className={cn(
                          "flex min-h-11 w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors duration-200 ease-soft disabled:opacity-60",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                          selected ? "border-primary bg-primary-soft" : "border-border-soft bg-surface hover:border-border hover:bg-surface-soft",
                        )}
                      >
                        <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-label font-semibold text-primary">
                          {tool.name.charAt(0)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-small font-medium text-text">{tool.name}</span>
                          {(recommended || tool.id === lastUsedId) && (
                            <span className="block text-caption text-text-muted">
                              {recommended ? t("run.recommended") : t("run.lastUsed")}
                            </span>
                          )}
                        </span>
                        {selected ? <Check size={16} className="shrink-0 text-primary" /> : !preview && <ExternalLink size={14} className="shrink-0 text-text-muted" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {list.more.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowMore((prev) => !prev)}
                  aria-expanded={showMore}
                  className="mt-2 inline-flex items-center gap-1 text-label font-medium text-primary hover:underline"
                >
                  <ChevronDown size={14} className={cn("transition-transform", showMore && "rotate-180")} aria-hidden />
                  {showMore ? t("run.fewerTools") : t("run.moreTools")}
                </button>
              )}
            </div>

            {preview && (
              <div className="flex justify-end">
                <Button type="button" onClick={() => selectedId && void run(selectedId)} disabled={!selectedId || running}>
                  <Play size={14} aria-hidden />
                  {t("run.button")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/** What happened after the click — always tells the user their next step. */
function RunOutcome({
  result,
  text,
  manualRef,
  onClose,
}: {
  result: RunWithAIResult;
  text: string;
  manualRef: React.RefObject<HTMLTextAreaElement | null>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toolName = result.tool.name;
  const ok = result.opened && (result.prefilled || result.copied);
  return (
    <div className="space-y-3" role="status">
      <div className={cn("flex items-start gap-2 rounded-md border px-3 py-2.5", ok ? "border-success/30 bg-success/5" : "border-warning/40 bg-warning/5")}>
        {ok ? <Check size={16} className="mt-0.5 shrink-0 text-success" aria-hidden /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />}
        <div className="space-y-1 text-small text-text">
          {!result.opened && <p>{t("run.popupBlocked", { tool: toolName })}</p>}
          {result.opened && result.prefilled && (
            <p>
              {t("run.openedPrefilled", { tool: toolName })}
              {result.copied && <span className="text-text-muted"> {t("run.alsoCopied")}</span>}
            </p>
          )}
          {result.copied && !(result.opened && result.prefilled) && <p>{t("run.copiedPasteReady")}</p>}
          {!result.copied && !result.prefilled && <p>{t("run.copyFailed")}</p>}
        </div>
      </div>

      {!result.copied && !result.prefilled && (
        <textarea
          ref={manualRef}
          readOnly
          rows={5}
          value={text}
          aria-label={t("run.manualCopyLabel")}
          onFocus={(event) => event.currentTarget.select()}
          className="prompt-text w-full resize-none rounded-lg border border-border bg-surface-soft px-3 py-2 text-text-secondary shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
        />
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {!result.opened && (
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-primary/30 bg-primary-soft px-3 text-label font-medium text-primary hover:border-primary/60"
          >
            <ExternalLink size={14} aria-hidden />
            {t("run.openManually", { tool: toolName })}
          </a>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t("common.close")}
        </Button>
      </div>
    </div>
  );
}
