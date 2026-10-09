"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Eye, EyeOff, Loader2, SlidersHorizontal, Sparkles, Square, Upload, X } from "lucide-react";
import { Button, buttonClassName } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { fieldControlClassName, fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { PresetFieldList } from "@/features/presets/preset-field-list";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { clearKey, loadKey, saveKey } from "@/lib/ai-generate/key-store";
import { fallbackModels, generateOne, listModels } from "@/lib/ai-generate/providers";
import { AI_PROVIDERS, AiError, toolIdFor, type AiKind, type AiModel, type AiOutput, type AiProvider } from "@/lib/ai-generate/types";
import { stashHandoff } from "@/lib/generate-handoff";
import { fetchPresetById } from "@/lib/supabase/presets";
import { resolvePresetFields } from "@/lib/preset-utils";
import { composePrompt, sanitizeSelection, type PresetSelection } from "@/lib/preset-fields";
import { contentTypeLabelKey } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { copyTextToClipboard } from "@/lib/utils";
import type { Preset } from "@/types";

const MAX_COUNT = 4;

type Slot = { id: number; status: "loading" } | { id: number; status: "done"; output: AiOutput } | { id: number; status: "error"; error: AiError };

const ERROR_KEY: Record<AiError["kind"], TranslationKey> = {
  invalid_key: "generate.errInvalidKey",
  quota: "generate.errQuota",
  network: "generate.errNetwork",
  blocked: "generate.errBlocked",
  model: "generate.errModel",
  empty: "generate.errEmpty",
  unknown: "generate.errUnknown",
};

/**
 * `/generate` — a small workspace to generate an image or text with the
 * user's OWN Gemini / OpenAI key, optionally starting from a preset
 * (`?preset=<id>`). Everything runs in the browser: the key is never sent to
 * Promptly, results are kept in memory only, and "Prompt olarak yayınla" hands
 * a result to the ordinary Prompt create form.
 */
export function GenerateView() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const presetId = searchParams.get("preset");

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
  const [selection, setSelection] = useState<PresetSelection>({});
  const [promptText, setPromptText] = useState("");
  const [count, setCount] = useState(1);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [running, setRunning] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

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
          setModel((current) => (list.some((m) => m.id === current) ? current : list[0].id));
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

  const fields = useMemo(() => (preset ? resolvePresetFields({ fields: preset.fields, selection }) : []), [preset, selection]);
  const finalPrompt = useMemo(
    () => (preset ? composePrompt(promptText, sanitizeSelection(selection, fields), fields, language) : promptText).trim(),
    [preset, promptText, selection, fields, language],
  );

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

  async function runSlot(id: number, key: string, prompt: string, signal: AbortSignal) {
    try {
      const output = await generateOne(provider, kind, model, prompt, key, signal);
      setSlots((current) => current.map((slot) => (slot.id === id ? { id, status: "done", output } : slot)));
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") {
        setSlots((current) => current.filter((slot) => slot.id !== id));
        return;
      }
      const aiError = error instanceof AiError ? error : new AiError("unknown");
      setSlots((current) => current.map((slot) => (slot.id === id ? { id, status: "error", error: aiError } : slot)));
    }
  }

  async function onGenerate() {
    setFormError(null);
    setPublishError(false);
    const key = apiKey.trim();
    if (!key) return setFormError(t("generate.needKey"));
    if (!finalPrompt) return setFormError(t("generate.needPrompt"));
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const base = Date.now();
    setSlots(Array.from({ length: count }, (_, i) => ({ id: base + i, status: "loading" as const })));
    setRunning(true);
    await Promise.all(Array.from({ length: count }, (_, i) => runSlot(base + i, key, finalPrompt, controller.signal)));
    if (abortRef.current === controller) setRunning(false);
  }

  function onStop() {
    abortRef.current?.abort();
    setRunning(false);
  }

  function onPublish(output: AiOutput) {
    if (!user) return requireAuth("create");
    setPublishError(false);
    const ok = stashHandoff(
      kind === "image"
        ? { contentType: "image", promptText: finalPrompt, toolId: toolIdFor(provider, kind), imageUrl: output.imageUrl, width: output.width, height: output.height }
        : { contentType: "text", promptText: output.text ?? "", toolId: toolIdFor(provider, kind) },
    );
    if (!ok) return setPublishError(true);
    router.push("/create?mode=prompt&fromGenerate=1");
  }

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
          </section>

          {/* Preset */}
          <section className="space-y-3 rounded-xl border border-border-soft bg-surface p-4 shadow-card sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-label font-semibold text-text">
                <SlidersHorizontal size={16} aria-hidden /> {t("generate.preset")}
              </h2>
              {preset ? (
                <button
                  type="button"
                  onClick={() => router.replace("/generate")}
                  className="inline-flex items-center gap-1 text-small font-medium text-text-secondary hover:text-text"
                >
                  <X size={14} aria-hidden /> {t("generate.presetRemove")}
                </button>
              ) : (
                <Link href="/presets" className="text-small font-medium text-primary hover:underline">
                  {t("generate.presetBrowse")}
                </Link>
              )}
            </div>
            {presetError && <p className="text-small text-danger">{t("generate.presetLoadFailed")}</p>}
            {preset ? (
              <>
                <p className="text-small font-medium text-text">{preset.title}</p>
                {presetTypeNote && <p className="text-caption text-text-muted">{presetTypeNote}</p>}
                {fields.length > 0 && <PresetFieldList fields={fields} selection={selection} onChange={setSelection} fragmentLanguage={language} defaultOpenFirst={false} />}
              </>
            ) : (
              !presetError && <p className="text-small text-text-muted">{t("generate.presetNone")}</p>
            )}
          </section>

          {/* Prompt */}
          <section className="space-y-3 rounded-xl border border-border-soft bg-surface p-4 shadow-card sm:p-5">
            <label htmlFor="gen-prompt" className={fieldLabelClassName}>
              {t("generate.prompt")}
            </label>
            <textarea
              id="gen-prompt"
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              placeholder={t("generate.promptPlaceholder")}
              rows={5}
              className={`${fieldControlClassName} min-h-28 resize-y py-2.5`}
            />
            {preset && finalPrompt && (
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
        <section aria-label={t("generate.results")} className="min-w-0 space-y-3">
          <h2 className="text-label font-semibold text-text">{t("generate.results")}</h2>
          {publishError && (
            <p role="alert" className="text-small text-danger">
              {t("generate.publishFailed")}
            </p>
          )}
          {slots.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-surface-soft p-6 text-small text-text-muted">{t("generate.resultsEmpty")}</p>
          ) : (
            <ul className={kind === "image" ? "grid gap-3 sm:grid-cols-2" : "space-y-3"}>
              {slots.map((slot, index) => (
                <li key={slot.id} className="min-w-0 overflow-hidden rounded-xl border border-border-soft bg-surface shadow-card">
                  {slot.status === "loading" && (
                    <div className={`${kind === "image" ? "aspect-square" : "h-32"} skeleton-shimmer`} aria-busy="true">
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
                      onPublish={() => onPublish(slot.output)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageContainer>
  );
}

function ResultBody({ output, index, onPublish }: { output: AiOutput; index: number; onPublish: () => void }) {
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
