"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ExternalLink, ListChecks, RotateCcw } from "lucide-react";
import { Button, buttonClassName } from "@/components/ui/button";
import { RunButton } from "@/features/content/run-with-ai";
import { CopyPromptButton } from "@/features/prompts/copy-prompt-button";
import { PromptVariableInputs } from "@/features/prompts/prompt-variable-inputs";
import { OpenInStudioButton } from "@/features/studio/open-in-studio-button";
import { fetchPromptById } from "@/lib/supabase/prompts";
import { fetchVariablesForPrompt } from "@/lib/supabase/prompt-variables";
import { effectiveVariableValues } from "@/lib/prompt-variable-types";
import { resolvePromptText } from "@/lib/prompt-variables";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  collectResults,
  goToStep,
  initialRunState,
  resolveInputs,
  runProgress,
  runStorageKey,
  sanitizeRunState,
  setRunOutput,
  setRunOwnInput,
  toggleStepDone,
  MAX_RUN_VALUE_LENGTH,
  type WorkflowRunState,
} from "@/lib/workflow-run";
import { cn } from "@/lib/utils";
import { ScrollRow } from "@/components/ui/scroll-row";
import { CardBandBackdrop } from "@/features/content/content-card";
import type { Prompt, PromptVariable, WorkflowStep } from "@/types";
import { STEP_TYPE_META } from "./step-meta";
import { WorkflowAutoRun } from "./workflow-auto-run";

const FIELD_CLASS =
  "w-full resize-y rounded-md border border-border-soft bg-surface px-3 py-2 text-small text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const BLOCK_CLASS = "prompt-text max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border-soft bg-surface-soft p-3 text-text";

function loadSavedRun(workflowId: string, steps: WorkflowStep[]): WorkflowRunState {
  try {
    const raw = window.sessionStorage.getItem(runStorageKey(workflowId));
    return raw ? sanitizeRunState(JSON.parse(raw), steps) : initialRunState();
  } catch {
    return initialRunState();
  }
}

/**
 * The public workflow worked through one step at a time. Promptly's SERVERS run no model:
 * the person copies each step's prompt into their own tool, pastes the result back
 * here, and that result is offered again as the input of the later steps wired to it
 * (`lib/workflow-run.ts`). Optionally the text steps can be run automatically with the
 * person's OWN API key straight from this browser (`WorkflowAutoRun`, docs/history/296-*) —
 * it writes into the same state. Everything typed lives in this browser session only.
 */
export function WorkflowRunner({ workflowId, steps }: { workflowId: string; steps: WorkflowStep[] }) {
  const { t } = useTranslation();
  const [state, setState] = useState<WorkflowRunState>(() => (typeof window === "undefined" ? initialRunState() : loadSavedRun(workflowId, steps)));
  const [showSummary, setShowSummary] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(runStorageKey(workflowId), JSON.stringify(state));
    } catch {
      // sessionStorage may be unavailable (private mode); the run just won't survive a reload.
    }
  }, [workflowId, state]);

  const progress = runProgress(steps, state);
  const index = Math.min(state.current, steps.length - 1);
  const step = steps[index];
  const isLast = index === steps.length - 1;
  const isDone = state.done.includes(step.id);

  const go = (target: number) => {
    setShowSummary(false);
    setState((prev) => goToStep(prev, target, steps));
    panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  function restart() {
    if (!confirmRestart) {
      setConfirmRestart(true);
      window.setTimeout(() => setConfirmRestart(false), 3000);
      return;
    }
    setConfirmRestart(false);
    setShowSummary(false);
    setState(initialRunState());
  }

  return (
    <div className="space-y-4">
      <p className="text-small text-text-muted">{t("workflow.run.intro")}</p>

      <WorkflowAutoRun steps={steps} state={state} onState={setState} onShowSummary={() => setShowSummary(true)} />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-caption font-medium text-text-secondary">
          <span>{t("workflow.run.progress", { done: progress.doneCount, total: progress.total })}</span>
          <button type="button" onClick={restart} className={cn("inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 hover:text-text", confirmRestart ? "text-danger" : "text-text-muted")}>
            <RotateCcw size={12} aria-hidden />
            {confirmRestart ? t("workflow.run.restartConfirm") : t("workflow.run.restart")}
          </button>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.doneCount}
          aria-label={t("workflow.run.progress", { done: progress.doneCount, total: progress.total })}
          className="h-1.5 overflow-hidden rounded-full bg-surface-soft"
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-200 ease-soft" style={{ width: `${progress.percent}%` }} />
        </div>
        <nav aria-label={t("workflow.run.stepsNavAria")}>
          <ScrollRow as="ol" className="gap-1.5 pb-1">
            {steps.map((item, itemIndex) => {
              const done = state.done.includes(item.id);
              const current = !showSummary && itemIndex === index;
              return (
                <li key={item.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => go(itemIndex)}
                    aria-current={current ? "step" : undefined}
                    aria-label={`${t("workflow.stepN", { n: String(itemIndex + 1) })}: ${item.title || t("workflow.untitledStep")}`}
                    title={item.title || t("workflow.untitledStep")}
                    className={cn(
                      "flex h-9 min-w-9 items-center justify-center gap-1 rounded-full border px-2.5 text-label font-semibold transition-colors",
                      current
                        ? "border-primary bg-primary text-primary-foreground"
                        : done
                          ? "border-primary/40 bg-primary-soft text-primary"
                          : "border-border-soft bg-surface text-text-secondary hover:border-border",
                    )}
                  >
                    {done && !current ? <Check size={14} aria-hidden /> : itemIndex + 1}
                  </button>
                </li>
              );
            })}
          </ScrollRow>
        </nav>
      </div>

      <div ref={panelRef} className="scroll-mt-20">
        {showSummary ? (
          <RunSummary steps={steps} state={state} onBack={() => go(index)} />
        ) : (
          <StepPanel
            key={step.id}
            steps={steps}
            index={index}
            state={state}
            done={isDone}
            onGo={go}
            onInput={(inputId, value) => setState((prev) => setRunOwnInput(prev, inputId, value))}
            onOutput={(outputId, value) => setState((prev) => setRunOutput(prev, outputId, value))}
            onToggleDone={() => setState((prev) => toggleStepDone(prev, step.id))}
          />
        )}
      </div>

      {!showSummary && (
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="lg" onClick={() => go(index - 1)} disabled={index === 0}>
            <ArrowLeft size={15} aria-hidden /> {t("workflow.run.prev")}
          </Button>
          {isLast ? (
            <Button size="lg" className="shadow-pop" onClick={() => setShowSummary(true)}>
              <ListChecks size={15} aria-hidden /> {t("workflow.run.finish")}
            </Button>
          ) : (
            <Button size="lg" className="shadow-pop" onClick={() => go(index + 1)}>
              {t("workflow.run.next")} <ArrowRight size={15} aria-hidden />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

interface StepPromptState {
  id: string;
  prompt: Prompt | null;
  variables: PromptVariable[];
}

/** The prompt a step points at, with its variable fields — the same fill-in + copy flow as the prompt page. */
function StepPrompt({ step }: { step: WorkflowStep }) {
  const { t } = useTranslation();
  const ref = step.content;
  const promptId = ref?.type === "prompt" && ref.published ? ref.id : null;
  const [loaded, setLoaded] = useState<StepPromptState | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!promptId) return;
    let cancelled = false;
    Promise.all([fetchPromptById(promptId), fetchVariablesForPrompt(promptId)])
      .then(([prompt, variables]) => !cancelled && setLoaded({ id: promptId, prompt, variables }))
      .catch(() => !cancelled && setLoaded({ id: promptId, prompt: null, variables: [] }));
    return () => {
      cancelled = true;
    };
  }, [promptId]);

  const prompt = loaded?.id === promptId ? loaded.prompt : null;
  const variables = useMemo(() => (loaded?.id === promptId ? loaded.variables : []), [loaded, promptId]);
  const { values, visible } = useMemo(() => effectiveVariableValues(variables, overrides), [variables, overrides]);
  const isCustomized = variables.some((variable) => variable.name in overrides && overrides[variable.name] !== variable.defaultValue);

  if (!ref) return <p className="text-small text-text-muted">{step.contentMissing ? t("workflow.contentMissing") : t("workflow.stepNoContentPublic")}</p>;
  if (ref.type === "request") {
    return (
      <div className="space-y-2">
        <p className="text-small text-text-muted">{t("workflow.run.requestHint")}</p>
        {ref.published && (
          <Link href={ref.href} className={buttonClassName({ variant: "outline", size: "sm" })}>
            <ExternalLink size={14} aria-hidden /> {t("workflow.flowOpen")}
          </Link>
        )}
      </div>
    );
  }
  if (!promptId) return <p className="text-small text-text-muted">{t("workflow.contentMissing")}</p>;
  if (!loaded || loaded.id !== promptId) return <p className="text-small text-text-muted">{t("workflow.run.promptLoading")}</p>;
  if (!prompt) return <p className="text-small text-danger">{t("workflow.run.promptFailed")}</p>;

  const text = variables.length > 0 ? resolvePromptText(prompt.promptText, values) : prompt.promptText;
  return (
    <div className="space-y-3">
      <div className="flex min-w-0 items-center gap-1.5 text-label font-medium text-text">
        <span className="truncate">{ref.title}</span>
        <span className="shrink-0 text-text-muted">@{ref.authorUsername}</span>
      </div>
      {variables.length > 0 && (
        <PromptVariableInputs
          variables={variables}
          values={values}
          visible={visible}
          isCustomized={isCustomized}
          onChange={(name, value) => setOverrides((prev) => ({ ...prev, [name]: value }))}
          onReset={() => setOverrides({})}
        />
      )}
      <pre className={BLOCK_CLASS}>{text}</pre>
      <div className="flex flex-wrap items-center gap-2">
        <CopyPromptButton text={text} promptId={prompt.id} size="md" variant="primary" />
        <RunButton text={text} recommendedRefs={prompt.tools} promptId={prompt.id} />
        <OpenInStudioButton kind="prompt" id={prompt.id} quiet />
        <Link href={ref.href} className={buttonClassName({ variant: "ghost", size: "sm" })}>
          <ExternalLink size={14} aria-hidden /> {t("workflow.flowOpen")}
        </Link>
      </div>
    </div>
  );
}

function StepPanel({
  steps,
  index,
  state,
  done,
  onGo,
  onInput,
  onOutput,
  onToggleDone,
}: {
  steps: WorkflowStep[];
  index: number;
  state: WorkflowRunState;
  done: boolean;
  onGo: (index: number) => void;
  onInput: (inputId: string, value: string) => void;
  onOutput: (outputId: string, value: string) => void;
  onToggleDone: () => void;
}) {
  const { t } = useTranslation();
  const step = steps[index];
  const Icon = STEP_TYPE_META[step.stepType].icon;
  const inputs = resolveInputs(steps, index, state);

  return (
    <section aria-labelledby={`run-step-${step.id}`} className="space-y-4 rounded-xl border border-border-soft bg-surface pb-4 shadow-card sm:pb-5">
      {/* Albüm (docs/history/203-*): the step opens with a small band — its type as the art, "Adım 2 / 3", the big title. */}
      <header data-run-step-band className="relative rounded-t-xl px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
        <CardBandBackdrop />
        <div className="relative flex items-start gap-3.5">
          <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-surface text-primary shadow-pop">
            <Icon size={22} strokeWidth={1.6} />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.08em] text-primary">
              {t("workflow.run.stepOf", { n: String(index + 1), total: String(steps.length) })}
            </p>
            <h3 id={`run-step-${step.id}`} className="break-words font-display text-[1.375rem] font-extrabold leading-tight tracking-[-0.02em] text-text">
              {step.title || t("workflow.untitledStep")}
            </h3>
            {step.description && <p className="break-words text-small text-text-secondary">{step.description}</p>}
          </div>
        </div>
      </header>
      <div className="space-y-4 px-4 sm:px-5">

        {step.instructions && (
          <div className="space-y-1">
            <h4 className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("workflow.instructionsLabel")}</h4>
            <p className="whitespace-pre-wrap break-words text-small text-text">{step.instructions}</p>
          </div>
        )}

        {inputs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("workflow.run.inputsHeading")}</h4>
            <ul className="space-y-3">
              {inputs.map((resolved) => (
                <li key={resolved.input.id} className="space-y-1.5">
                  {resolved.kind === "linked" ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-label font-medium text-text">
                          {resolved.input.label || t("workflow.inputLabel")}
                          <span className="ml-1.5 text-caption font-normal text-text-muted">
                            {t("workflow.flowInputFrom", { n: String(resolved.fromIndex + 1), label: resolved.outputLabel || t("workflow.outputLabel") })}
                          </span>
                        </span>
                        {resolved.value.trim() && <CopyPromptButton text={resolved.value} />}
                      </div>
                      {resolved.value.trim() ? (
                        <pre className={BLOCK_CLASS}>{resolved.value}</pre>
                      ) : (
                        <p className="text-small text-text-muted">
                          {t("workflow.run.linkedEmpty", { n: String(resolved.fromIndex + 1) })}{" "}
                          <button type="button" onClick={() => onGo(resolved.fromIndex)} className="font-medium text-primary hover:underline">
                            {t("workflow.stepN", { n: String(resolved.fromIndex + 1) })}
                          </button>
                        </p>
                      )}
                    </>
                  ) : (
                    <label className="block space-y-1.5">
                      <span className="text-label font-medium text-text">{resolved.input.label || t("workflow.inputLabel")}</span>
                      <textarea
                        value={resolved.value}
                        onChange={(event) => onInput(resolved.input.id, event.target.value)}
                        maxLength={MAX_RUN_VALUE_LENGTH}
                        rows={2}
                        placeholder={t("workflow.run.ownInputPlaceholder")}
                        className={FIELD_CLASS}
                      />
                    </label>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <StepPrompt step={step} />

        {step.outputs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("workflow.run.outputsHeading")}</h4>
            {step.outputs.map((output) => (
              <label key={output.id} className="block space-y-1.5">
                <span className="text-label font-medium text-text">{output.label || t("workflow.outputLabel")}</span>
                <textarea
                  value={state.outputs[output.id] ?? ""}
                  onChange={(event) => onOutput(output.id, event.target.value)}
                  maxLength={MAX_RUN_VALUE_LENGTH}
                  rows={4}
                  placeholder={t("workflow.run.outputPlaceholder")}
                  className={FIELD_CLASS}
                />
              </label>
            ))}
          </div>
        )}

        <div>
          <Button variant={done ? "secondary" : "outline"} size="sm" onClick={onToggleDone} aria-pressed={done}>
            <Check size={14} aria-hidden /> {done ? t("workflow.run.markedDone") : t("workflow.run.markDone")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function RunSummary({ steps, state, onBack }: { steps: WorkflowStep[]; state: WorkflowRunState; onBack: () => void }) {
  const { t } = useTranslation();
  const results = collectResults(steps, state);
  const progress = runProgress(steps, state);
  return (
    <section aria-labelledby="run-summary-title" className="space-y-4 rounded-lg border border-border-soft bg-surface p-4 shadow-card sm:p-5">
      <header className="space-y-1">
        <h3 id="run-summary-title" className="text-h3 font-semibold text-text">
          {t("workflow.run.summaryTitle")}
        </h3>
        <p className="text-small text-text-secondary">{t("workflow.run.progress", { done: progress.doneCount, total: progress.total })}</p>
      </header>
      {results.length === 0 ? (
        <p className="text-small text-text-muted">{t("workflow.run.summaryEmpty")}</p>
      ) : (
        <ul className="space-y-3">
          {results.map((result) => (
            <li key={result.outputId} className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-label font-medium text-text">
                  {t("workflow.stepN", { n: String(result.stepIndex + 1) })} · {result.label || t("workflow.outputLabel")}
                </span>
                <CopyPromptButton text={result.value} />
              </div>
              <pre className={BLOCK_CLASS}>{result.value}</pre>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" onClick={onBack}>
        <ArrowLeft size={15} aria-hidden /> {t("workflow.run.backToSteps")}
      </Button>
    </section>
  );
}
