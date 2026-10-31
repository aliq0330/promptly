"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailSection } from "@/features/content/detail-parts";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { findTool, parseToolRef } from "@/lib/ai-tool-catalog";
import { MIN_OUTCOME_VOTES, outcomeToolLabel, summarizeOutcomes, type OutcomeStatRow, type PromptOutcome } from "@/lib/prompt-outcomes";
import { PROMPT_COPIED_EVENT } from "@/lib/supabase/prompt-usage";
import { fetchMyOutcomes, fetchOutcomeStats, hasCopiedPrompt, setPromptOutcome, type MyOutcome } from "@/lib/supabase/prompt-outcomes";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Prompt } from "@/types";

const LAST_TOOL_KEY = "promptly-last-outcome-tool";

const OUTCOME_LABEL: Record<PromptOutcome, TranslationKey> = { worked: "outcome.worked", partial: "outcome.partial", failed: "outcome.failed" };
const OUTCOME_ACTIVE: Record<PromptOutcome, string> = {
  worked: "border-success bg-success/10 text-success",
  partial: "border-warning bg-warning/10 text-warning",
  failed: "border-danger bg-danger/10 text-danger",
};
const OTHER = "\u0000other";

function readLastTool(): string {
  try {
    return window.localStorage.getItem(LAST_TOOL_KEY) ?? "";
  } catch {
    return "";
  }
}
function writeLastTool(tool: string): void {
  try {
    if (tool) window.localStorage.setItem(LAST_TOOL_KEY, tool);
  } catch {
    /* private window / blocked storage: the convenience just does not persist */
  }
}

/**
 * "Çalıştı mı?" (docs/history/296-*): the community result of a public prompt (share of "worked / partly / didn't" and a per-tool breakdown) and,
 * for someone who has copied it, a two-step answer — outcome, then which tool. The database enforces the rules (copied first, not your own prompt,
 * no block, rate limit); this component only reflects them. Below `MIN_OUTCOME_VOTES` answers no percentage is shown.
 */
export function PromptOutcomeSection({ prompt }: { prompt: Prompt }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isOwn = user?.id === prompt.author.id;
  const eligible = prompt.status === "published" && prompt.visibility === "public" && !prompt.communityId;

  const [rows, setRows] = useState<OutcomeStatRow[] | null>(null);
  const [mine, setMine] = useState<MyOutcome[]>([]);
  const [copied, setCopied] = useState(false);
  const [choice, setChoice] = useState<PromptOutcome | null>(null);
  const [toolChoice, setToolChoice] = useState("");
  const [otherName, setOtherName] = useState("");
  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<"saved" | "failed" | null>(null);

  const refresh = useCallback(async () => {
    const [stats, own] = await Promise.all([fetchOutcomeStats(prompt.id), user && !isOwn ? fetchMyOutcomes(prompt.id, user.id) : Promise.resolve([])]);
    setRows(stats);
    setMine(own);
  }, [prompt.id, user, isOwn]);

  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    void (async () => {
      const [stats, own, didCopy] = await Promise.all([
        fetchOutcomeStats(prompt.id),
        user && !isOwn ? fetchMyOutcomes(prompt.id, user.id) : Promise.resolve([] as MyOutcome[]),
        user && !isOwn ? hasCopiedPrompt(prompt.id) : Promise.resolve(false),
      ]);
      if (cancelled) return;
      setRows(stats);
      setMine(own);
      setCopied(didCopy);
    })();
    return () => {
      cancelled = true;
    };
  }, [eligible, prompt.id, user, isOwn]);

  // A copy made on this very page makes "Denedin mi?" appear without a reload.
  useEffect(() => {
    if (!eligible || !user || isOwn) return;
    function onCopied(event: Event) {
      if ((event as CustomEvent<string>).detail !== prompt.id) return;
      void hasCopiedPrompt(prompt.id).then(setCopied);
    }
    window.addEventListener(PROMPT_COPIED_EVENT, onCopied);
    return () => window.removeEventListener(PROMPT_COPIED_EVENT, onCopied);
  }, [eligible, user, isOwn, prompt.id]);

  const summary = useMemo(() => summarizeOutcomes(rows ?? []), [rows]);
  const recommendedTools = useMemo(() => [...new Set(prompt.tools.map((ref) => findTool(parseToolRef(ref).toolId)?.name).filter((name): name is string => Boolean(name)))].slice(0, 4), [prompt.tools]);
  const toolChips = useMemo(() => {
    const last = typeof window === "undefined" ? "" : readLastTool();
    return last && !recommendedTools.includes(last) ? [...recommendedTools, last].slice(0, 5) : recommendedTools;
  }, [recommendedTools]);

  if (!eligible || rows === null) return null;
  const canAnswer = Boolean(user) && !isOwn && copied;
  const showCopyHint = Boolean(user) && !isOwn && !copied;
  if (summary.total === 0 && !canAnswer && !showCopyHint) return null;

  function begin(outcome: PromptOutcome, existing?: MyOutcome) {
    setFlash(null);
    setChoice(outcome);
    const known = existing?.tool ?? readLastTool();
    if (existing || known) {
      if (known && !toolChips.includes(known)) {
        setToolChoice(OTHER);
        setOtherName(known);
      } else {
        setToolChoice(known);
        setOtherName("");
      }
    } else {
      setToolChoice(toolChips[0] ?? "");
      setOtherName("");
    }
    setVersion(existing?.toolVersion ?? "");
  }

  const finalTool = (toolChoice === OTHER ? otherName : toolChoice).trim();

  async function send() {
    if (!choice || busy) return;
    setBusy(true);
    try {
      await setPromptOutcome(prompt.id, choice, finalTool, version.trim());
      writeLastTool(finalTool);
      setChoice(null);
      setFlash("saved");
      await refresh();
    } catch {
      setFlash("failed");
    } finally {
      setBusy(false);
    }
  }

  async function undo(item: MyOutcome) {
    if (busy) return;
    setBusy(true);
    try {
      await setPromptOutcome(prompt.id, null, item.tool, item.toolVersion);
      setFlash(null);
      await refresh();
    } catch {
      setFlash("failed");
    } finally {
      setBusy(false);
    }
  }

  const chipClass = (active: boolean) =>
    cn(
      "min-h-9 rounded-full border px-3 text-caption transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      active ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border-soft bg-surface text-text hover:border-border",
    );

  return (
    <DetailSection id="prompt-outcome" title={t("outcome.title")}>
      <div className="space-y-4" data-testid="prompt-outcome">
        {summary.total > 0 && (
          <div className="space-y-3" data-testid="outcome-summary">
            <p className="text-small text-text-secondary">{summary.total === 1 ? t("outcome.triedOne") : t("outcome.triedCount", { count: summary.total })}</p>
            {summary.enough ? (
              <>
                <div
                  role="img"
                  aria-label={t("outcome.barAria", { w: summary.workedPct, p: summary.partialPct, f: summary.failedPct })}
                  className="flex h-2.5 overflow-hidden rounded-full bg-surface-soft"
                >
                  <i className="block bg-success" style={{ width: `${summary.workedPct}%` }} />
                  <i className="block bg-warning" style={{ width: `${summary.partialPct}%` }} />
                  <i className="block bg-danger" style={{ width: `${summary.failedPct}%` }} />
                </div>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-caption">
                  <span className="font-semibold text-success">{t("outcome.workedPct", { pct: summary.workedPct })}</span>
                  <span className="text-text-secondary">{t("outcome.partialPct", { pct: summary.partialPct })}</span>
                  <span className="text-text-secondary">{t("outcome.failedPct", { pct: summary.failedPct })}</span>
                </p>
                {summary.tools.length > 1 || summary.tools[0]?.tool ? (
                  <ul className="space-y-1.5">
                    {summary.tools.slice(0, 6).map((row) => (
                      <li key={`${row.tool}\u0000${row.toolVersion}`} className="grid grid-cols-[minmax(0,1fr)_5rem_2.5rem] items-center gap-3 text-small">
                        <span className="min-w-0 truncate text-text">{outcomeToolLabel(row.tool, row.toolVersion, t("outcome.unspecifiedTool"))}</span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-surface-soft" aria-hidden>
                          <i className="block h-full bg-success" style={{ width: `${row.workedPct}%` }} />
                        </span>
                        <span className="text-right tabular-nums text-text-muted">{row.total}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="text-caption text-text-muted">{t("outcome.notEnough", { min: MIN_OUTCOME_VOTES })}</p>
            )}
          </div>
        )}

        {showCopyHint && <p className="text-small text-text-muted">{t("outcome.needCopyHint")}</p>}

        {canAnswer && (
          <div className="space-y-3 rounded-lg border border-border-soft bg-surface p-4" data-testid="outcome-ask">
            {mine.length > 0 && choice === null && (
              <ul className="space-y-1.5">
                {mine.map((item) => (
                  <li key={`${item.tool}\u0000${item.toolVersion}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small">
                    <span className="text-text-muted">{t("outcome.mine")}:</span>
                    <span className="font-semibold text-text">
                      {t(OUTCOME_LABEL[item.outcome])} · {outcomeToolLabel(item.tool, item.toolVersion, t("outcome.unspecifiedTool"))}
                    </span>
                    <button type="button" onClick={() => begin(item.outcome, item)} className="text-primary hover:underline">
                      {t("outcome.change")}
                    </button>
                    <button type="button" onClick={() => void undo(item)} disabled={busy} className="text-text-muted hover:text-text hover:underline">
                      {t("outcome.undo")}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div>
              <p className="text-label font-semibold text-text">{t("outcome.ask")}</p>
              <div role="group" aria-label={t("outcome.askAria")} className="mt-2 grid grid-cols-3 gap-2">
                {(["worked", "partial", "failed"] as const).map((outcome) => (
                  <button
                    key={outcome}
                    type="button"
                    aria-pressed={choice === outcome}
                    onClick={() => begin(outcome)}
                    className={cn(
                      "min-h-10 rounded-lg border px-2 text-label font-semibold transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      choice === outcome ? OUTCOME_ACTIVE[outcome] : "border-border-soft bg-surface text-text hover:border-border",
                    )}
                  >
                    {t(OUTCOME_LABEL[outcome])}
                  </button>
                ))}
              </div>
            </div>

            {choice && (
              <div className="space-y-3" data-testid="outcome-step2">
                <div>
                  <p className="text-caption text-text-muted">{t("outcome.toolQuestion")}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {toolChips.map((name) => (
                      <button key={name} type="button" aria-pressed={toolChoice === name} onClick={() => setToolChoice(name)} className={chipClass(toolChoice === name)}>
                        {name}
                      </button>
                    ))}
                    <button type="button" aria-pressed={toolChoice === OTHER} onClick={() => setToolChoice(OTHER)} className={chipClass(toolChoice === OTHER)}>
                      {t("outcome.toolOther")}
                    </button>
                    <button type="button" aria-pressed={toolChoice === ""} onClick={() => setToolChoice("")} className={chipClass(toolChoice === "")}>
                      {t("outcome.toolNone")}
                    </button>
                  </div>
                </div>
                {toolChoice === OTHER && (
                  <input
                    value={otherName}
                    onChange={(event) => setOtherName(event.target.value)}
                    maxLength={80}
                    placeholder={t("outcome.toolOtherPlaceholder")}
                    aria-label={t("outcome.toolOtherPlaceholder")}
                    className="h-10 w-full rounded-lg border border-border-soft bg-surface px-3 text-small text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                )}
                {finalTool && (
                  <input
                    value={version}
                    onChange={(event) => setVersion(event.target.value)}
                    maxLength={40}
                    placeholder={t("outcome.versionPlaceholder")}
                    aria-label={t("outcome.versionLabel")}
                    className="h-10 w-full rounded-lg border border-border-soft bg-surface px-3 text-small text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-56"
                  />
                )}
                <div className="flex justify-end">
                  <Button type="button" size="sm" onClick={() => void send()} disabled={busy || (toolChoice === OTHER && !otherName.trim())}>
                    {busy ? t("outcome.saving") : t("outcome.send")}
                  </Button>
                </div>
              </div>
            )}

            {flash === "saved" && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-success/10 px-3 py-2 text-small text-text" role="status">
                <Check size={14} className="text-success" aria-hidden />
                {t("outcome.saved")}
                <button type="button" className="font-semibold text-primary hover:underline" onClick={() => document.getElementById("prompt-results")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                  {t("outcome.addResult")}
                </button>
              </p>
            )}
            {flash === "failed" && (
              <p className="text-small text-danger" role="alert">
                {t("outcome.saveFailed")}
              </p>
            )}
          </div>
        )}
      </div>
    </DetailSection>
  );
}
