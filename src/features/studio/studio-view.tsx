"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Eye, EyeOff, Loader2, Pencil, Plus, SlidersHorizontal, Sparkles, Square, Upload, X } from "lucide-react";
import { Button, buttonClassName } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { fieldControlClassName, fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { PresetFieldList } from "@/features/presets/preset-field-list";
import { PromptVariableInputs } from "@/features/prompts/prompt-variable-inputs";
import { GeneratorRuntimeForm } from "@/features/generators/generator-runtime-form";
import { StudioSourcePicker } from "./studio-source-picker";
import { StudioPresetPicker } from "./studio-preset-picker";
import { StudioHistory } from "./studio-history";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { clearKey, loadKey, saveKey } from "@/lib/ai-generate/key-store";
import { fallbackModels, generateOne, listModels } from "@/lib/ai-generate/providers";
import { AI_PROVIDERS, AiError, toolIdFor, type AiKind, type AiModel, type AiOutput, type AiProvider } from "@/lib/ai-generate/types";
import { addHistory, clearHistory, deleteHistory, listHistory, type HistoryEntry } from "@/lib/ai-generate/history-store";
import { stashHandoff } from "@/lib/generate-handoff";
import { fetchPresetById } from "@/lib/supabase/presets";
import { fetchPromptById } from "@/lib/supabase/prompts";
import { fetchVariablesForPrompt } from "@/lib/supabase/prompt-variables";
import { fetchGeneratorBySlug, fetchGeneratorVersion } from "@/lib/supabase/generators";
import { resolvePromptText } from "@/lib/prompt-variables";
import { buildGeneratorOutput } from "@/lib/generator-output";
import { defaultValuesFromSchema } from "@/lib/generator-template";
import { resolvePresetFields } from "@/lib/preset-utils";
import { composePrompt, sanitizeSelection, type PresetSelection } from "@/lib/preset-fields";
import { contentTypeLabelKey } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { copyTextToClipboard } from "@/lib/utils";
import type { Generator, GeneratorSchema, GeneratorValues, Preset, Prompt, PromptContentType, PromptVariable } from "@/types";

const MAX_COUNT = 4;

/** What a finished result was made with — kept per result so history items and publishing never depend on the current form. */
interface SlotMeta {
  provider: AiProvider;
  model: string;
  prompt: string;
}

type Slot =
  | { id: number; status: "loading"; label: string }
  | { id: number; status: "done"; output: AiOutput; meta: SlotMeta }
  | { id: number; status: "error"; error: AiError; label: string };

/** One provider/model a run is sent to. The first is the main form; up to MAX_EXTRA more can be compared side by side. */
interface Target {
  provider: AiProvider;
  model: string;
}
interface ExtraTarget extends Target {
  uid: number;
}

const MAX_EXTRA = 2;

function targetLabel(target: Target): string {
  return `${target.provider === "gemini" ? "Gemini" : "OpenAI"} · ${target.model}`;
}

const ERROR_KEY: Record<AiError["kind"], TranslationKey> = {
  invalid_key: "generate.errInvalidKey",
  quota: "generate.errQuota",
  network: "generate.errNetwork",
  blocked: "generate.errBlocked",
  model: "generate.errModel",
  empty: "generate.errEmpty",
  unknown: "generate.errUnknown",
};

type SourceKind = "blank" | "prompt" | "generator" | "preset";

/** Studio only generates images and text; other media keep the current choice. */
function kindFor(contentType: PromptContentType, current: AiKind): AiKind {
  if (contentType === "text") return "text";
  if (contentType === "image") return "image";
  return current;
}

/**
 * `/studio` — a small workspace to try a prompt and see the result, with the
 * user's OWN Gemini / OpenAI key. The starting point ("source") is blank, a
 * Prompt (`?prompt=<id>`), a Generator (`?generator=<slug>`) or a preset
 * (`?preset=<id>`); the URL is the single source of truth. Everything runs in
 * the browser: the key is never sent to Promptly, and "Prompt olarak yayınla"
 * hands a result to the ordinary Prompt create form.
 */
export function StudioView() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const presetId = searchParams.get("preset");
  const promptId = searchParams.get("prompt");
  const generatorSlug = searchParams.get("generator");
  const source: SourceKind = promptId ? "prompt" : generatorSlug ? "generator" : presetId ? "preset" : "blank";

  const [kind, setKind] = useState<AiKind>("image");
  const [provider, setProvider] = useState<AiProvider>("gemini");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<AiModel[]>([]);
  const [modelsFailed, setModelsFailed] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [preset, setPreset] = useState<Preset | null>(null);
  const [presetError, setPresetError] = useState(false);
  const [promptSource, setPromptSource] = useState<Prompt | null>(null);
  const [promptVars, setPromptVars] = useState<PromptVariable[]>([]);
  const [varOverrides, setVarOverrides] = useState<Record<string, string>>({});
  const [generatorSource, setGeneratorSource] = useState<Generator | null>(null);
  const [generatorSchema, setGeneratorSchema] = useState<GeneratorSchema | null>(null);
  const [generatorValues, setGeneratorValues] = useState<GeneratorValues>({});
  const [sourceError, setSourceError] = useState(false);
  const [sourcePicker, setSourcePicker] = useState<"prompt" | "generator" | "preset" | null>(null);
  const [selection, setSelection] = useState<PresetSelection>({});
  const [promptText, setPromptText] = useState("");
  const [count, setCount] = useState(1);
  const [extra, setExtra] = useState<ExtraTarget[]>([]);
  const [extraKeys, setExtraKeys] = useState<Partial<Record<AiProvider, string>>>({});

  const [slots, setSlots] = useState<Slot[]>([]);
  const [running, setRunning] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // The key follows the provider: load what this browser knows for it.
  useEffect(() => {
    const stored = loadKey(provider);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from browser storage when the provider changes
    setApiKey(stored.key);
    setRemember(stored.remembered);
  }, [provider]);

  // Preset from the URL.
  useEffect(() => {
    if (!presetId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the query param goes away
      setPreset(null);
      return;
    }
    let cancelled = false;
    setPresetError(false);
    fetchPresetById(presetId).then((found) => {
      if (cancelled) return;
      if (!found) {
        setPreset(null);
        setPresetError(true);
        return;
      }
      setPreset(found);
      setSelection(found.selection);
      setKind(found.contentType === "text" ? "text" : "image");
    });
    return () => {
      cancelled = true;
    };
  }, [presetId]);

  // Prompt from the URL: its text becomes the editable working text, its variables become fields.
  useEffect(() => {
    if (!promptId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the query param goes away
      setPromptSource(null);
      setPromptVars([]);
      setVarOverrides({});
      return;
    }
    let cancelled = false;
    setSourceError(false);
    Promise.all([fetchPromptById(promptId), fetchVariablesForPrompt(promptId)]).then(([found, vars]) => {
      if (cancelled) return;
      if (!found || found.deletedAt) {
        setPromptSource(null);
        setSourceError(true);
        return;
      }
      setPromptSource(found);
      setPromptVars(vars);
      setVarOverrides({});
      setPromptText(found.promptText);
      setKind((current) => kindFor(found.contentType, current));
    });
    return () => {
      cancelled = true;
    };
  }, [promptId]);

  // Generator from the URL: its form drives the prompt; the text box adds the user's own words.
  useEffect(() => {
    if (!generatorSlug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the query param goes away
      setGeneratorSource(null);
      setGeneratorSchema(null);
      setGeneratorValues({});
      return;
    }
    let cancelled = false;
    setSourceError(false);
    (async () => {
      const found = await fetchGeneratorBySlug(generatorSlug);
      const version = found?.currentVersionId ? await fetchGeneratorVersion(found.currentVersionId) : null;
      if (cancelled) return;
      if (!found || !version) {
        setGeneratorSource(null);
        setSourceError(true);
        return;
      }
      setGeneratorSource(found);
      setGeneratorSchema(version.schema);
      setGeneratorValues(defaultValuesFromSchema(version.schema));
      setPromptText("");
      setKind((current) => kindFor(found.contentType, current));
    })();
    return () => {
      cancelled = true;
    };
  }, [generatorSlug]);

  // Model list: defaults at once, replaced by the provider's own list once a key is present.
  useEffect(() => {
    const defaults = fallbackModels(provider, kind);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the list when provider/kind change
    setModels(defaults);
    setModelsFailed(false);
    setModel((current) => (defaults.some((m) => m.id === current) ? current : (defaults[0]?.id ?? "")));
    const key = apiKey.trim();
    if (key.length < 20) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setModelsLoading(true);
      listModels(provider, kind, key, controller.signal)
        .then((list) => {
          if (list.length === 0) return setModelsFailed(true);
          setModels(list);
          setModel((current) => (list.some((m) => m.id === current) ? current : (list.find((m) => defaults.some((d) => d.id === m.id))?.id ?? list[0].id)));
        })
        .catch((error) => {
          if ((error as { name?: string }).name !== "AbortError") setModelsFailed(true);
        })
        .finally(() => !controller.signal.aborted && setModelsLoading(false));
    }, 600);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      setModelsLoading(false);
    };
  }, [provider, kind, apiKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    let cancelled = false;
    listHistory().then((entries) => !cancelled && setHistory(entries));
    return () => {
      cancelled = true;
    };
  }, []);

  const fields = useMemo(() => (preset ? resolvePresetFields({ fields: preset.fields, selection }) : []), [preset, selection]);
  const variableValues = useMemo(() => Object.fromEntries(promptVars.map((v) => [v.name, varOverrides[v.name] ?? v.defaultValue])), [promptVars, varOverrides]);
  const finalPrompt = useMemo(() => {
    if (promptSource) return resolvePromptText(promptText, variableValues).trim();
    if (generatorSource && generatorSchema) return String(buildGeneratorOutput(generatorSchema, generatorValues, promptText, "", false).prompt ?? "").trim();
    if (preset) return composePrompt(promptText, sanitizeSelection(selection, fields), fields, language).trim();
    return promptText.trim();
  }, [promptSource, generatorSource, generatorSchema, generatorValues, preset, promptText, variableValues, selection, fields, language]);
  const sourceTitle = promptSource?.title ?? generatorSource?.title ?? preset?.title;

  const persistKey = useCallback(
    (key: string, keep: boolean) => {
      saveKey(provider, key, keep);
    },
    [provider],
  );

  function onKeyChange(value: string) {
    setApiKey(value);
    persistKey(value, remember);
  }

  function onRememberChange(value: boolean) {
    setRemember(value);
    persistKey(apiKey, value);
  }

  function onClearKey() {
    clearKey(provider);
    setApiKey("");
    setRemember(false);
  }

  async function runSlot(id: number, target: Target, key: string, prompt: string, signal: AbortSignal) {
    const meta: SlotMeta = { provider: target.provider, model: target.model, prompt };
    try {
      const output = await generateOne(target.provider, kind, target.model, prompt, key, signal);
      setSlots((current) => current.map((slot) => (slot.id === id ? { id, status: "done", output, meta } : slot)));
      const entry: HistoryEntry = { id: `${id}-${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now(), kind, presetTitle: sourceTitle, output, ...meta };
      await addHistory(entry);
      setHistory(await listHistory());
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") {
        setSlots((current) => current.filter((slot) => slot.id !== id));
        return;
      }
      const aiError = error instanceof AiError ? error : new AiError("unknown");
      setSlots((current) => current.map((slot) => (slot.id === id ? { id, status: "error", error: aiError, label: targetLabel(target) } : slot)));
    }
  }

  /** The model a compare row really uses: its own pick if it exists for this kind, else the provider's first. */
  function extraModel(target: ExtraTarget): string {
    const list = fallbackModels(target.provider, kind);
    return list.some((m) => m.id === target.model) ? target.model : (list[0]?.id ?? target.model);
  }

  function extraKey(target: ExtraTarget): string {
    if (target.provider === provider) return apiKey.trim();
    return (extraKeys[target.provider] ?? loadKey(target.provider).key).trim();
  }

  function addExtra() {
    const other = AI_PROVIDERS.find((p) => p !== provider) ?? provider;
    const first = fallbackModels(other, kind)[0]?.id ?? "";
    setExtra((current) => (current.length >= MAX_EXTRA ? current : [...current, { uid: Date.now() + current.length, provider: other, model: first }]));
  }

  function updateExtra(uid: number, patch: Partial<Target>) {
    setExtra((current) =>
      current.map((row) => {
        if (row.uid !== uid) return row;
        const next = { ...row, ...patch };
        if (patch.provider && patch.provider !== row.provider) next.model = fallbackModels(patch.provider, kind)[0]?.id ?? "";
        return next;
      }),
    );
  }

  function onExtraKeyChange(target: ExtraTarget, value: string) {
    setExtraKeys((current) => ({ ...current, [target.provider]: value }));
    saveKey(target.provider, value, loadKey(target.provider).remembered);
  }

  async function onGenerate() {
    setFormError(null);
    setPublishError(false);
    const key = apiKey.trim();
    if (!key) return setFormError(t("generate.needKey"));
    if (!finalPrompt) return setFormError(t("generate.needPrompt"));
    const jobs: { target: Target; key: string }[] = [{ target: { provider, model }, key }];
    for (const row of extra) {
      const rowKey = extraKey(row);
      if (!rowKey) return setFormError(t("studio.compareNeedKey", { provider: row.provider === "gemini" ? "Gemini" : "OpenAI" }));
      jobs.push({ target: { provider: row.provider, model: extraModel(row) }, key: rowKey });
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const base = Date.now();
    const planned = jobs.flatMap((job, ji) => Array.from({ length: count }, (_, i) => ({ id: base + ji * 100 + i, job })));
    setSlots(planned.map(({ id, job }) => ({ id, status: "loading" as const, label: targetLabel(job.target) })));
    setRunning(true);
    await Promise.all(planned.map(({ id, job }) => runSlot(id, job.target, job.key, finalPrompt, controller.signal)));
    if (abortRef.current === controller) setRunning(false);
  }

  function onStop() {
    abortRef.current?.abort();
    setRunning(false);
  }

  function onPublish(output: AiOutput, meta: SlotMeta) {
    if (!user) return requireAuth("create");
    setPublishError(false);
    const ok = stashHandoff(
      output.kind === "image"
        ? { contentType: "image", promptText: meta.prompt, toolId: toolIdFor(meta.provider, "image"), imageUrl: output.imageUrl, width: output.width, height: output.height }
        : { contentType: "text", promptText: output.text ?? "", toolId: toolIdFor(meta.provider, "text") },
    );
    if (!ok) return setPublishError(true);
    router.push("/create?mode=prompt&fromGenerate=1");
  }

  function openHistory(entry: HistoryEntry) {
    setPublishError(false);
    setSlots([{ id: Date.now(), status: "done", output: entry.output, meta: { provider: entry.provider, model: entry.model, prompt: entry.prompt } }]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** "Edit and try again" from a result: its exact prompt becomes the working text, focus moves to the box. */
  function editFromResult(meta: SlotMeta) {
    setPromptText(meta.prompt);
    setPreset(null);
    setSelection({});
    if (source !== "blank") router.replace("/studio");
    window.setTimeout(() => {
      const box = document.getElementById("gen-prompt") as HTMLTextAreaElement | null;
      box?.scrollIntoView({ behavior: "smooth", block: "center" });
      box?.focus();
    }, 50);
  }

  function usePromptFromHistory(entry: HistoryEntry) {
    // The stored prompt already contains the preset's phrases, so it goes back as plain text.
    setPromptText(entry.prompt);
    setPreset(null);
    setSelection({});
    setKind(entry.kind);
    setProvider(entry.provider);
    if (source !== "blank") router.replace("/studio");
  }

  async function removeHistory(entry: HistoryEntry) {
    await deleteHistory(entry.id);
    setHistory((current) => current.filter((e) => e.id !== entry.id));
  }

  async function wipeHistory() {
    await clearHistory();
    setHistory([]);
  }

  function pickPreset(picked: Preset) {
    setPreset(picked);
    setPresetError(false);
    setSelection(picked.selection);
    setSourcePicker(null);
    router.replace(`/studio?preset=${picked.id}`);
  }

  function pickSource(kindPicked: "prompt" | "generator", key: string) {
    setSourcePicker(null);
    router.replace(`/studio?${kindPicked}=${encodeURIComponent(key)}`);
  }

  function clearSource() {
    setPromptText("");
    setSelection({});
    setSourceError(false);
    router.replace("/studio");
  }

  function onSourceChip(next: SourceKind) {
    if (next === "blank") return clearSource();
    setSourcePicker(next);
  }

  // Layout follows what the results ARE (a restored history item may differ from the current form).
  const showLabels = new Set(slots.map((slot) => (slot.status === "done" ? targetLabel(slot.meta) : slot.label))).size > 1;
  const slotsAreImages = slots.every((slot) => (slot.status === "done" ? slot.output.kind === "image" : kind === "image"));

  const presetTypeNote =
    preset && ((preset.contentType === "text") !== (kind === "text") || (preset.contentType !== "text" && preset.contentType !== "image"))
      ? t("generate.presetKindNote", { type: t(contentTypeLabelKey(preset.contentType) as TranslationKey) })
      : null;

  return (
    <PageContainer>
      <PageHeader title={t("generate.title")} description={t("generate.subtitle")} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          {/* Provider · key · model */}
          <section className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 shadow-card sm:p-5">
            <div>
              <span className={fieldLabelClassName}>{t("generate.kind")}</span>
              <ChipRow>
                {(["image", "text"] as const).map((k) => (
                  <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>
                    {t(k === "image" ? "generate.kindImage" : "generate.kindText")}
                  </Chip>
                ))}
              </ChipRow>
            </div>
            <div>
              <span className={fieldLabelClassName}>{t("generate.provider")}</span>
              <ChipRow>
                {AI_PROVIDERS.map((p) => (
                  <Chip key={p} selected={provider === p} onClick={() => setProvider(p)}>
                    {t(`generate.provider.${p}`)}
                  </Chip>
                ))}
              </ChipRow>
            </div>
            <div>
              <label htmlFor="gen-key" className={fieldLabelClassName}>
                {t("generate.apiKey")}
              </label>
              <div className="relative">
                <input
                  id="gen-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => onKeyChange(event.target.value)}
                  placeholder={t("generate.apiKeyPlaceholder")}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className={`${fieldInputClassName} pr-11 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? t("generate.hideKey") : t("generate.showKey")}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-text-muted hover:text-text"
                >
                  {showKey ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                </button>
              </div>
              <p className="mt-1.5 text-caption text-text-muted">{t("generate.apiKeyPrivacy")}</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-small text-text-secondary">
                  <input type="checkbox" checked={remember} onChange={(event) => onRememberChange(event.target.checked)} />
                  {t("generate.remember")}
                </label>
                {apiKey && (
                  <button type="button" onClick={onClearKey} className="text-small font-medium text-danger hover:underline">
                    {t("generate.clearKey")}
                  </button>
                )}
              </div>
              {remember && <p className="mt-1 text-caption text-warning">{t("generate.rememberWarning")}</p>}
            </div>
            <div>
              <label htmlFor="gen-model" className={fieldLabelClassName}>
                {t("generate.model")}
              </label>
              <select id="gen-model" value={model} onChange={(event) => setModel(event.target.value)} className={fieldInputClassName}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              {modelsLoading && <p className="mt-1.5 text-caption text-text-muted">{t("generate.modelsLoading")}</p>}
              {modelsFailed && !modelsLoading && <p className="mt-1.5 text-caption text-text-muted">{t("generate.modelsFallback")}</p>}
            </div>

            {/* Compare: the same prompt on more models */}
            {extra.length > 0 && (
              <div className="space-y-3 border-t border-border-soft pt-4">
                <p className={fieldLabelClassName}>{t("studio.compareTitle")}</p>
                {extra.map((row) => {
                  const rowModel = extraModel(row);
                  const needsKey = row.provider !== provider && !(extraKeys[row.provider] ?? loadKey(row.provider).key);
                  return (
                    <div key={row.uid} className="space-y-2 rounded-lg border border-border-soft bg-surface-soft p-3">
                      <div className="flex items-center justify-between gap-2">
                        <ChipRow>
                          {AI_PROVIDERS.map((p) => (
                            <Chip key={p} selected={row.provider === p} onClick={() => updateExtra(row.uid, { provider: p })}>
                              {t(`generate.provider.${p}`)}
                            </Chip>
                          ))}
                        </ChipRow>
                        <button
                          type="button"
                          onClick={() => setExtra((current) => current.filter((r) => r.uid !== row.uid))}
                          aria-label={t("studio.compareRemove")}
                          className="shrink-0 rounded-md p-1.5 text-text-muted hover:bg-surface hover:text-text"
                        >
                          <X size={14} aria-hidden />
                        </button>
                      </div>
                      <select
                        value={rowModel}
                        onChange={(event) => updateExtra(row.uid, { model: event.target.value })}
                        aria-label={t("generate.model")}
                        className={fieldInputClassName}
                      >
                        {fallbackModels(row.provider, kind).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      {row.provider !== provider && (
                        <input
                          type="password"
                          value={extraKeys[row.provider] ?? loadKey(row.provider).key}
                          onChange={(event) => onExtraKeyChange(row, event.target.value)}
                          placeholder={t("generate.apiKeyPlaceholder")}
                          aria-label={t("generate.apiKey")}
                          autoComplete="off"
                          spellCheck={false}
                          className={`${fieldInputClassName} font-mono`}
                        />
                      )}
                      {needsKey && <p className="text-caption text-text-muted">{t("studio.compareKeyHint")}</p>}
                    </div>
                  );
                })}
              </div>
            )}
            {extra.length < MAX_EXTRA && (
              <button type="button" onClick={addExtra} className="inline-flex min-h-9 items-center gap-1.5 text-small font-medium text-primary hover:underline">
                <Plus size={14} aria-hidden /> {t("studio.compareAdd")}
              </button>
            )}
          </section>

          {/* Source */}
          <section className="space-y-3 rounded-xl border border-border-soft bg-surface p-4 shadow-card sm:p-5">
            <h2 className="flex items-center gap-2 text-label font-semibold text-text">
              <SlidersHorizontal size={16} aria-hidden /> {t("studio.source")}
            </h2>
            <ChipRow>
              {(["blank", "prompt", "generator", "preset"] as const).map((k) => (
                <Chip key={k} selected={source === k} onClick={() => onSourceChip(k)}>
                  {t(`studio.source.${k}` as TranslationKey)}
                </Chip>
              ))}
            </ChipRow>
            {(sourceError || presetError) && <p role="alert" className="text-small text-danger">{t(presetError ? "generate.presetLoadFailed" : "studio.sourceLoadFailed")}</p>}

            {source === "blank" && <p className="text-small text-text-muted">{t("studio.sourceBlankHint")}</p>}

            {source !== "blank" && (
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-small font-medium text-text">{sourceTitle ?? t("studio.loading")}</p>
                <div className="flex shrink-0 items-center gap-3">
                  <button type="button" onClick={() => setSourcePicker(source)} className="text-small font-medium text-primary hover:underline">
                    {t("studio.change")}
                  </button>
                  <button type="button" onClick={clearSource} className="inline-flex items-center gap-1 text-small font-medium text-text-secondary hover:text-text">
                    <X size={14} aria-hidden /> {t("studio.remove")}
                  </button>
                </div>
              </div>
            )}

            {source === "prompt" && promptSource && promptVars.length > 0 && (
              <PromptVariableInputs
                variables={promptVars}
                values={variableValues}
                isCustomized={Object.keys(varOverrides).length > 0}
                onChange={(name, value) => setVarOverrides((current) => ({ ...current, [name]: value }))}
                onReset={() => setVarOverrides({})}
              />
            )}

            {source === "generator" && generatorSchema && (
              <GeneratorRuntimeForm
                schema={generatorSchema}
                values={generatorValues}
                onChange={(key, value) => setGeneratorValues((current) => ({ ...current, [key]: value }))}
              />
            )}

            {source === "preset" && preset && (
              <>
                {presetTypeNote && <p className="text-caption text-text-muted">{presetTypeNote}</p>}
                {fields.length > 0 && <PresetFieldList fields={fields} selection={selection} onChange={setSelection} fragmentLanguage={language} defaultOpenFirst={false} />}
              </>
            )}
          </section>

          {/* Prompt */}
          <section className="space-y-3 rounded-xl border border-border-soft bg-surface p-4 shadow-card sm:p-5">
            <label htmlFor="gen-prompt" className={fieldLabelClassName}>
              {t(source === "generator" ? "studio.promptExtra" : "generate.prompt")}
            </label>
            <textarea
              id="gen-prompt"
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              placeholder={t("generate.promptPlaceholder")}
              rows={5}
              className={`${fieldControlClassName} min-h-28 resize-y py-2.5`}
            />
            {source !== "blank" && finalPrompt && (
              <div>
                <p className="mb-1 text-caption font-medium text-text-muted">{t("generate.finalPrompt")}</p>
                <p className="prompt-text break-words rounded-lg border border-border-soft bg-surface-soft p-3 text-small text-text-secondary">{finalPrompt}</p>
              </div>
            )}
            <div>
              <span className={fieldLabelClassName}>{t("generate.count")}</span>
              <ChipRow>
                {Array.from({ length: MAX_COUNT }, (_, i) => i + 1).map((n) => (
                  <Chip key={n} selected={count === n} onClick={() => setCount(n)}>
                    {n}
                  </Chip>
                ))}
              </ChipRow>
            </div>
            <p className="text-caption text-text-muted">{t("generate.costNote")}</p>
            {formError && (
              <p role="alert" className="text-small text-danger">
                {formError}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" onClick={onGenerate} disabled={running} className="flex-1">
                {running ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} aria-hidden />}
                {running ? t("generate.running") : t("generate.run")}
              </Button>
              {running && (
                <Button type="button" variant="outline" onClick={onStop}>
                  <Square size={14} aria-hidden /> {t("generate.stop")}
                </Button>
              )}
            </div>
          </section>
        </div>

        {/* Results */}
        <div className="min-w-0 space-y-6">
        <section aria-label={t("generate.results")} className="space-y-3">
          <h2 className="text-label font-semibold text-text">{t("generate.results")}</h2>
          {publishError && (
            <p role="alert" className="text-small text-danger">
              {t("generate.publishFailed")}
            </p>
          )}
          {slots.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-surface-soft p-6 text-small text-text-muted">{t("generate.resultsEmpty")}</p>
          ) : (
            <ul className={slotsAreImages ? "grid gap-3 sm:grid-cols-2" : "space-y-3"}>
              {slots.map((slot, index) => (
                <li key={slot.id} className="min-w-0 overflow-hidden rounded-xl border border-border-soft bg-surface shadow-card">
                  {showLabels && (
                    <p className="truncate border-b border-border-soft bg-surface-soft px-3 py-1.5 text-caption font-medium text-text-secondary">
                      {slot.status === "done" ? targetLabel(slot.meta) : slot.label}
                    </p>
                  )}
                  {slot.status === "loading" && (
                    <div className={`${slotsAreImages ? "aspect-square" : "h-32"} skeleton-shimmer`} aria-busy="true">
                      <span className="sr-only">{t("generate.running")}</span>
                    </div>
                  )}
                  {slot.status === "error" && (
                    <div className="space-y-2 p-4">
                      <p role="alert" className="text-small text-danger">
                        {t(ERROR_KEY[slot.error.kind])}
                      </p>
                      {slot.error.message && <p className="break-words text-caption text-text-muted">{slot.error.message}</p>}
                    </div>
                  )}
                  {slot.status === "done" && (
                    <ResultBody
                      output={slot.output}
                      index={index}
                      onPublish={() => onPublish(slot.output, slot.meta)}
                      onEdit={() => editFromResult(slot.meta)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <StudioHistory entries={history} onOpen={openHistory} onUsePrompt={usePromptFromHistory} onDelete={removeHistory} onClear={wipeHistory} />
        </div>
      </div>
      {sourcePicker === "preset" && <StudioPresetPicker contentType={kind} onPick={pickPreset} onClose={() => setSourcePicker(null)} />}
      {(sourcePicker === "prompt" || sourcePicker === "generator") && (
        <StudioSourcePicker kind={sourcePicker} onPick={(key) => pickSource(sourcePicker, key)} onClose={() => setSourcePicker(null)} />
      )}
    </PageContainer>
  );
}

function ResultBody({ output, index, onPublish, onEdit }: { output: AiOutput; index: number; onPublish: () => void; onEdit: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!output.text) return;
    if (await copyTextToClipboard(output.text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div>
      {output.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- generated base64 image, kept in memory only
        <img src={output.imageUrl} alt={t("generate.resultAlt", { n: String(index + 1) })} className="w-full bg-surface-soft object-contain" />
      )}
      {output.text && <p className="prompt-text max-h-80 overflow-y-auto whitespace-pre-wrap break-words p-4 text-small text-text">{output.text}</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-border-soft p-3">
        <Button type="button" size="sm" onClick={onPublish}>
          <Upload size={14} aria-hidden /> {t("generate.publish")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onEdit}>
          <Pencil size={14} aria-hidden /> {t("studio.editRetry")}
        </Button>
        {output.text && (
          <Button type="button" size="sm" variant="outline" onClick={copy}>
            {copied ? t("common.copied") : t("generate.copyText")}
          </Button>
        )}
        {output.imageUrl && (
          <a href={output.imageUrl} download={`promptly-${index + 1}.png`} className={buttonClassName({ variant: "outline", size: "sm" })}>
            <Download size={14} aria-hidden /> {t("generate.download")}
          </a>
        )}
      </div>
    </div>
  );
}
