"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "@/components/icons/chevron-down";
import { Loader2 } from "@/components/icons/loader-2";
import { StudioSourcePicker } from "@/features/studio/studio-source-picker";
import { FitBadge } from "@/features/presets/preset-fit-badge";
import { fetchPromptById } from "@/lib/supabase/prompts";
import { fetchVariablesForPrompt } from "@/lib/supabase/prompt-variables";
import { effectiveVariableValues } from "@/lib/prompt-variable-types";
import { resolvePromptText } from "@/lib/prompt-variables";
import { composePromptParts, fieldName, sanitizeSelection, type PresetField, type PresetSelection } from "@/lib/preset-fields";
import { fieldAvailable, presetFit, targetOfPrompt } from "@/lib/preset-fit";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fieldControlClassName } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { Preset, Prompt } from "@/types";

/**
 * Ayar paketi formunun sağ sütunu (docs/history/446-*): "Bir promptla dene" — bir prompt seçilir (Studio'nun seçicisi, uyuma göre
 * sıralı), paketin o anki parametreleri Studio'nun birleştirme kuralıyla (`composePromptParts`) promptun sonuna eklenir; paketten gelen
 * parçalar turuncu. Altında uyum (`presetFit`) ve promptun aracında kapanan alanlar. Hiçbir şey kaydedilmez, model çağrılmaz.
 */
export function PresetTryPanel({ preset, fields, selection }: { preset: Preset; fields: PresetField[]; selection: PresetSelection }) {
  const { t, language } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [promptId, setPromptId] = useState<string | null>(null);
  const [state, setState] = useState<{ status: "idle" | "loading" | "error" } | { status: "ready"; prompt: Prompt; text: string }>({ status: "idle" });

  useEffect(() => {
    if (!promptId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading state for the newly picked prompt
    setState({ status: "loading" });
    Promise.all([fetchPromptById(promptId), fetchVariablesForPrompt(promptId)])
      .then(([prompt, variables]) => {
        if (cancelled) return;
        if (!prompt || prompt.deletedAt) return setState({ status: "error" });
        // Değişkenler varsayılan değerleriyle doldurulur (Studio ile aynı): okuyucu sonuç metnini görür.
        const { values } = effectiveVariableValues(variables, {});
        setState({ status: "ready", prompt, text: resolvePromptText(prompt.promptText, values) });
      })
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [promptId]);

  const ready = state.status === "ready" ? state : null;
  const fit = useMemo(() => (ready ? presetFit(targetOfPrompt(ready.prompt), preset) : null), [ready, preset]);
  const activeFields = useMemo(() => (ready ? fields.filter((field) => fieldAvailable(field.id, ready.prompt.tools)) : fields), [ready, fields]);
  const offFields = useMemo(() => (ready ? fields.filter((field) => selection[field.id] !== undefined && !fieldAvailable(field.id, ready.prompt.tools)) : []), [ready, fields, selection]);
  const parts = useMemo(
    () => (ready ? composePromptParts(ready.text, sanitizeSelection(selection, activeFields), activeFields, language) : []),
    [ready, selection, activeFields, language],
  );
  const hasPresetPart = parts.some((part) => part.from === "preset");

  return (
    <section className="space-y-4" data-preset-try="">
      <p className="font-display text-body font-bold text-text">{t("cs.preset.tryTitle")}</p>
      <div className="space-y-1.5">
        <span className="block text-caption font-semibold text-text-muted">{t("cs.preset.tryPick")}</span>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          data-preset-try-pick=""
          className={cn(fieldControlClassName, "flex h-11 w-full items-center gap-2 px-3 text-left text-small font-medium")}
        >
          <span className="min-w-0 flex-1 truncate">{ready ? `${ready.prompt.title} — ${ready.prompt.author.username}` : t("cs.preset.tryPick")}</span>
          <ChevronDown size={16} aria-hidden className="shrink-0 text-text-muted" />
        </button>
      </div>

      {state.status === "idle" && <p className="rounded-lg bg-surface-soft p-4 text-small text-text-secondary">{t("cs.preset.tryEmpty")}</p>}
      {state.status === "loading" && (
        <p className="flex items-center gap-2 text-small text-text-muted">
          <Loader2 size={16} className="animate-spin" aria-hidden /> {t("cs.preset.tryLoading")}
        </p>
      )}
      {state.status === "error" && <p className="text-small text-danger">{t("cs.preset.tryFailed")}</p>}

      {ready && fit && (
        <>
          {fit.level === "none" ? (
            <p className="rounded-lg bg-warning-soft p-3 text-small text-text">{t("cs.preset.typeMismatch")}</p>
          ) : (
            <>
              <p className="prompt-text whitespace-pre-wrap break-words rounded-lg bg-surface-soft p-4 text-small text-text-secondary" data-preset-try-result="">
                {parts.map((part, index) =>
                  part.from === "preset" ? (
                    <span key={index} className="rounded-xs bg-secondary-soft px-0.5 text-secondary">
                      {part.text}
                    </span>
                  ) : (
                    <span key={index}>{part.text}</span>
                  ),
                )}
              </p>
              <p className="text-caption text-text-muted">{hasPresetPart ? t("cs.preset.fromPreset") : t("cs.preset.noParams")}</p>
            </>
          )}
          <div className="space-y-3 rounded-lg border border-border-soft p-4">
            <p className="text-small font-semibold text-text">{t("cs.preset.compatibility")}</p>
            <FitBadge fit={fit} preset={preset} />
            {offFields.length > 0 && (
              <p className="text-caption text-warning" data-preset-try-off="">
                {t("cs.preset.fieldsOff", { names: offFields.map((field) => fieldName(field, language)).join(", ") })}
              </p>
            )}
          </div>
        </>
      )}

      {pickerOpen && (
        <StudioSourcePicker
          kind="prompt"
          fitFor={preset}
          onClose={() => setPickerOpen(false)}
          onPick={(key) => {
            setPickerOpen(false);
            setPromptId(key);
          }}
        />
      )}
    </section>
  );
}
