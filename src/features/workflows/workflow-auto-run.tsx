"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, CircleDashed, Eye, EyeOff, Loader2, Play, RotateCcw, Square, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearKey, loadKey, saveKey } from "@/lib/ai-generate/key-store";
import { fallbackModels, generateOne, listModels } from "@/lib/ai-generate/providers";
import { AI_PROVIDERS, AiError, type AiModel, type AiProvider } from "@/lib/ai-generate/types";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { fetchPromptById } from "@/lib/supabase/prompts";
import { fetchVariablesForPrompt } from "@/lib/supabase/prompt-variables";
import { effectiveVariableValues } from "@/lib/prompt-variable-types";
import { resolvePromptText } from "@/lib/prompt-variables";
import {
  clearAutoResults,
  hasStepResult,
  planChain,
  runWorkflowChain,
  stepRunBlock,
  type ChainDeps,
  type ChainErrorKind,
  type ChainEvent,
  type ChainStepError,
  type ChainStop,
  type StepRunBlock,
} from "@/lib/workflow-auto-run";
import type { WorkflowRunState } from "@/lib/workflow-run";
import { cn } from "@/lib/utils";
import type { WorkflowStep } from "@/types";

const FIELD_CLASS =
  "w-full rounded-md border border-border-soft bg-surface px-3 py-2 text-small text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

const BLOCK_KEY: Record<StepRunBlock, TranslationKey> = {
  no_content: "workflow.auto.block.no_content",
  not_prompt: "workflow.auto.block.not_prompt",
  unpublished: "workflow.auto.block.unpublished",
  not_text: "workflow.auto.block.not_text",
  no_output: "workflow.auto.block.no_output",
};

const PROVIDER_ERROR_KEY: Partial<Record<ChainErrorKind, TranslationKey>> = {
  invalid_key: "generate.errInvalidKey",
  quota: "generate.errQuota",
  network: "generate.errNetwork",
  blocked: "generate.errBlocked",
  model: "generate.errModel",
  empty: "generate.errEmpty",
  unknown: "generate.errUnknown",
};

type StepStatus =
  | { kind: "running" }
  | { kind: "done" }
  | { kind: "kept" }
  | { kind: "blocked"; reason: StepRunBlock }
  | { kind: "error"; error: ChainStepError };

const PROVIDER_LABEL: Record<AiProvider, string> = { gemini: "Gemini", openai: "OpenAI" };

/**
 * "Otomatik çalıştır" (docs/history/296-*): workflow'un metin adımlarını kişinin KENDİ API anahtarıyla, tarayıcıdan sağlayıcıya, sırayla çalıştırır.
 * Sunucu hiçbir model çalıştırmaz ve anahtar Promptly'ye/Supabase'e GİTMEZ (Studio ile aynı `key-store`/`providers`). Zincirin kuralları saf kütüphanede
 * (`lib/workflow-auto-run.ts`): bir adımın çıktısı elle "Adım adım" modunun AYNI durumuna yazılır, bağlı sonraki adım onu girdi olarak okur; çalışamayan
 * adımda zincir durur ve elle yapılıp yapıştırılınca devam eder. Değişkenli promptlar varsayılan değerleriyle çalışır (değeri olmayan değişken adımı durdurur).
 */
export function WorkflowAutoRun({
  steps,
  state,
  onState,
  onShowSummary,
}: {
  steps: WorkflowStep[];
  state: WorkflowRunState;
  onState: (next: WorkflowRunState) => void;
  onShowSummary: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<AiProvider>("gemini");
  // Panel kapalı başlar (anahtar alanı sunucu HTML'inde yok), bu yüzden tarayıcıdan okunan değer hidrasyonu bozmaz.
  const [key, setKey] = useState(() => loadKey("gemini").key);
  const [remember, setRemember] = useState(() => loadKey("gemini").remembered);
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<AiModel[]>(() => fallbackModels("gemini", "text"));
  const [model, setModel] = useState(() => fallbackModels("gemini", "text")[0].id);
  const [modelsFailed, setModelsFailed] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, StepStatus>>({});
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<{ stop: ChainStop; at?: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const promptCache = useRef(new Map<string, string>());

  // Sağlayıcı değişince: o sağlayıcının anahtarı bu tarayıcının key-store'undan (bellek ya da "hatırla" ile localStorage) okunur, model listesi sıfırlanır.
  function changeProvider(next: AiProvider) {
    setProvider(next);
    const stored = loadKey(next);
    setKey(stored.key);
    setRemember(stored.remembered);
    const base = fallbackModels(next, "text");
    setModels(base);
    setModel(base[0].id);
    setModelsFailed(false);
  }

  // Anahtar varsa sağlayıcının kendi (metin) model listesini dener; olmazsa güvenli varsayılanlar kalır.
  useEffect(() => {
    if (key.trim().length < 12) return;
    const controller = new AbortController();
    listModels(provider, "text", key.trim(), controller.signal)
      .then((list) => {
        if (list.length === 0) return;
        setModels(list);
        setModel((current) => (list.some((m) => m.id === current) ? current : list[0].id));
        setModelsFailed(false);
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") setModelsFailed(true);
      });
    return () => controller.abort();
  }, [provider, key]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const plan = useMemo(() => planChain(steps, state, 0), [steps, state]);
  const hasProgress = useMemo(() => steps.some((step) => stepRunBlock(step) === null && hasStepResult(step, state)), [steps, state]);
  const canRun = key.trim() !== "" && !running && plan.runs.length > 0;

  const loadPrompt = useCallback<ChainDeps["loadPrompt"]>(async (step) => {
    const ref = step.content;
    if (!ref) return { ok: false };
    const cached = promptCache.current.get(step.id);
    if (cached !== undefined) return { ok: true, text: cached };
    const [prompt, variables] = await Promise.all([fetchPromptById(ref.id), fetchVariablesForPrompt(ref.id)]);
    if (!prompt) return { ok: false };
    if (variables.length === 0) {
      promptCache.current.set(step.id, prompt.promptText);
      return { ok: true, text: prompt.promptText };
    }
    const { values, visible } = effectiveVariableValues(variables, {});
    const missing = variables.find((variable) => visible[variable.name] && !(values[variable.name] ?? "").trim());
    if (missing) return { ok: false, missingVariable: missing.name };
    const text = resolvePromptText(prompt.promptText, values);
    promptCache.current.set(step.id, text);
    return { ok: true, text };
  }, []);

  async function start(fresh: boolean) {
    if (running || key.trim() === "") return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setOutcome(null);
    setStatuses({});
    const base = fresh ? clearAutoResults(steps, state) : state;
    if (fresh) onState(base);
    const apiKey = key.trim();
    const deps: ChainDeps = {
      loadPrompt,
      generate: async (prompt, signal) => {
        const out = await generateOne(provider, "text", model, prompt, apiKey, signal);
        if (!out.text) throw new AiError("empty");
        return out.text;
      },
    };
    const onEvent = (event: ChainEvent) => {
      const step = steps[event.index];
      if (!step) return;
      const next: StepStatus | null =
        event.type === "start" ? { kind: "running" }
        : event.type === "done" ? { kind: "done" }
        : event.type === "kept" ? { kind: "kept" }
        : event.type === "blocked" ? { kind: "blocked", reason: event.reason }
        : event.type === "error" ? { kind: "error", error: event.error }
        : null;
      if (next) setStatuses((prev) => ({ ...prev, [step.id]: next }));
      if (event.type === "done") onState(event.state);
    };
    try {
      const result = await runWorkflowChain({ steps, state: base, from: 0, deps, signal: controller.signal, onEvent, defaultInputLabel: t("workflow.inputLabel") });
      onState(result.state);
      setOutcome({ stop: result.stop, at: result.at });
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function onKeyChange(value: string) {
    setKey(value);
    saveKey(provider, value, remember);
  }
  function onRememberChange(value: boolean) {
    setRemember(value);
    saveKey(provider, key, value);
  }

  function errorText(error: ChainStepError): string {
    if (error.kind === "variable") return t("workflow.auto.err.variable", { name: error.detail ?? "" });
    if (error.kind === "missing_input") return t("workflow.auto.err.missing_input", { label: error.detail ?? "" });
    if (error.kind === "prompt_load") return t("workflow.auto.err.prompt_load");
    const key = PROVIDER_ERROR_KEY[error.kind];
    return key ? t(key) : t("generate.errUnknown");
  }

  const runnableCount = steps.filter((step) => stepRunBlock(step) === null).length;
  if (runnableCount === 0 && plan.stopsAt === null) return null;

  return (
    <section data-auto-run className="rounded-xl border border-border-soft bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="workflow-auto-run-body"
        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
          <Wand2 size={18} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-small font-semibold text-text">{t("workflow.auto.title")}</span>
          <span className="block truncate text-caption text-text-muted">{t("workflow.auto.subtitle")}</span>
        </span>
        <ChevronDown size={18} aria-hidden className={cn("shrink-0 text-text-muted transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div id="workflow-auto-run-body" className="space-y-4 border-t border-border-soft px-4 pb-4 pt-3">
          <p className="text-caption leading-relaxed text-text-secondary">{t("workflow.auto.intro")}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-label font-medium text-text">{t("generate.provider")}</span>
              <select value={provider} onChange={(event) => changeProvider(event.target.value as AiProvider)} disabled={running} className={FIELD_CLASS}>
                {AI_PROVIDERS.map((id) => (
                  <option key={id} value={id}>
                    {PROVIDER_LABEL[id]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-label font-medium text-text">{t("generate.model")}</span>
              <select value={model} onChange={(event) => setModel(event.target.value)} disabled={running} className={FIELD_CLASS}>
                {models.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              {modelsFailed && <span className="block text-caption text-text-muted">{t("generate.modelsFallback")}</span>}
            </label>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="workflow-auto-key" className="text-label font-medium text-text">
              {t("generate.apiKey")}
            </label>
            <div className="flex gap-2">
              <input
                id="workflow-auto-key"
                type={showKey ? "text" : "password"}
                value={key}
                onChange={(event) => onKeyChange(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={running}
                placeholder={t("generate.apiKeyPlaceholder")}
                className={FIELD_CLASS}
              />
              <Button variant="outline" size="sm" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? t("generate.hideKey") : t("generate.showKey")}>
                {showKey ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
              </Button>
            </div>
            <p className="text-caption text-text-muted">{t("generate.apiKeyPrivacy")}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <label className="inline-flex items-center gap-2 text-caption text-text-secondary">
                <input type="checkbox" checked={remember} onChange={(event) => onRememberChange(event.target.checked)} disabled={running} />
                {t("generate.remember")}
              </label>
              {key && (
                <button
                  type="button"
                  className="text-caption font-medium text-text-muted hover:text-text"
                  onClick={() => {
                    clearKey(provider);
                    setKey("");
                    setRemember(false);
                  }}
                >
                  {t("generate.clearKey")}
                </button>
              )}
            </div>
            {remember && <p className="text-caption text-warning">{t("generate.rememberWarning")}</p>}
          </div>

          <div className="space-y-1 rounded-lg bg-surface-soft px-3 py-2.5 text-caption text-text-secondary" data-auto-plan>
            <p>{plan.runs.length > 0 ? t("workflow.auto.plan", { n: plan.runs.length }) : t("workflow.auto.planNone")}</p>
            {plan.stopsAt && <p>{t("workflow.auto.stopsAt", { n: plan.stopsAt.index + 1, reason: t(BLOCK_KEY[plan.stopsAt.reason]) })}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {running ? (
              <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                <Square size={14} aria-hidden /> {t("workflow.auto.stop")}
              </Button>
            ) : (
              <Button onClick={() => void start(false)} disabled={!canRun}>
                <Play size={14} aria-hidden /> {hasProgress ? t("workflow.auto.resume") : t("workflow.auto.run")}
              </Button>
            )}
            {!running && hasProgress && (
              <Button variant="outline" onClick={() => void start(true)} disabled={key.trim() === ""}>
                <RotateCcw size={14} aria-hidden /> {t("workflow.auto.rerun")}
              </Button>
            )}
            {key.trim() === "" && <span className="text-caption text-text-muted">{t("generate.needKey")}</span>}
          </div>

          {Object.keys(statuses).length > 0 && (
            <ol aria-label={t("workflow.auto.statusListAria")} className="space-y-1.5" data-auto-status>
              {steps.map((step, index) => {
                const status = statuses[step.id];
                if (!status) return null;
                return (
                  <li key={step.id} data-status={status.kind} className="flex items-start gap-2 text-small">
                    <span className="mt-0.5 shrink-0 text-text-muted" aria-hidden>
                      {status.kind === "running" ? <Loader2 size={15} className="animate-spin" /> : status.kind === "done" || status.kind === "kept" ? <Check size={15} className="text-success" /> : status.kind === "blocked" ? <CircleDashed size={15} /> : <AlertTriangle size={15} className="text-danger" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-text">{t("workflow.stepN", { n: String(index + 1) })}</span>
                      <span className="text-text-muted"> · {step.title}</span>
                      <span className={cn("block text-caption", status.kind === "error" ? "text-danger" : "text-text-secondary")}>
                        {status.kind === "running" && t("workflow.auto.status.running")}
                        {status.kind === "done" && t("workflow.auto.status.done")}
                        {status.kind === "kept" && t("workflow.auto.status.kept")}
                        {status.kind === "blocked" && `${t("workflow.auto.status.blocked")}: ${t(BLOCK_KEY[status.reason])}`}
                        {status.kind === "error" && errorText(status.error)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {outcome?.stop === "completed" && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg bg-primary-soft px-3 py-2.5 text-small text-primary">
              <span className="flex-1">{t("workflow.auto.finished")}</span>
              <Button size="sm" variant="outline" onClick={onShowSummary}>
                {t("workflow.auto.finishedSummary")}
              </Button>
            </div>
          )}
          {outcome?.stop === "aborted" && (
            <p role="status" className="text-small text-text-secondary">
              {t("workflow.auto.stopped")}
            </p>
          )}
          {outcome?.stop === "blocked" && outcome.at !== undefined && steps[outcome.at] && (
            <p role="status" className="text-small text-text-secondary">
              {t("workflow.auto.blockedStop", { n: outcome.at + 1, reason: t(BLOCK_KEY[stepRunBlock(steps[outcome.at]) ?? "no_content"]) })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
