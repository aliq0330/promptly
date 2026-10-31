"use client";

import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isValidVariableName, normalizeVariableName } from "@/lib/prompt-variables";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { DraftVariable } from "./prompt-text-editor";
import { SHEET_INPUT_CLASS, VariableSheetFrame } from "./variable-sheet-frame";

const SUGGESTION_KEYS: TranslationKey[] = [
  "promptEdit.suggest.setting",
  "promptEdit.suggest.style",
  "promptEdit.suggest.palette",
  "promptEdit.suggest.angle",
  "promptEdit.suggest.mood",
];

/**
 * "Değişken ekle" alt sayfası (docs/history/288-*): eski liste + süzgeç + "Yeni oluştur" penceresi ikilisinin yerine TEK sayfa — bir ad kutusu,
 * "Bu promptta" çipleri (dokununca imlecin olduğu yere eklenir) ve tek dokunuşluk öneriler. Tür/açıklama/koşul burada SORULMAZ:
 * metindeki değişkene dokununca açılan düzenleme sayfasında ayarlanır. Aynı ada (büyük/küçük harf duyarsız) yazmak yeni değişken değil,
 * var olanı ekler.
 */
export function VariableAddSheet({
  variables,
  usage,
  onInsertExisting,
  onCreate,
  onOpenLibrary,
  onClose,
}: {
  variables: DraftVariable[];
  /** Metinde her değişkenin kaç yerde geçtiği (ad → sayı). */
  usage: Map<string, number>;
  onInsertExisting: (name: string) => void;
  /** Yeni (geçerli, normalize) adla metin değişkeni oluşturur ve imlece ekler. */
  onCreate: (name: string) => void;
  onOpenLibrary: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const normalized = normalizeVariableName(name);
  const error = !touched ? null : normalized.length === 0 ? t("variable.nameEmptyError") : !isValidVariableName(normalized) ? t("variable.nameInvalidError") : null;
  const taken = new Set(variables.map((variable) => variable.name.toLowerCase()));

  function submit() {
    setTouched(true);
    if (!normalized || !isValidVariableName(normalized)) return;
    const existing = variables.find((variable) => variable.name.toLowerCase() === normalized.toLowerCase());
    if (existing) onInsertExisting(existing.name);
    else onCreate(normalized);
  }

  const suggestions = SUGGESTION_KEYS.map((key) => t(key)).filter((label) => !taken.has(normalizeVariableName(label).toLowerCase()));

  return (
    <VariableSheetFrame
      title={t("composer.addVariableTitle")}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <button
          type="button"
          onClick={onOpenLibrary}
          className="flex min-h-11 w-full items-center justify-between rounded-lg px-2 text-small font-semibold text-text-secondary transition-colors hover:bg-surface-soft hover:text-text"
        >
          {t("composer.fieldLibrary")}
          <ChevronRight size={18} aria-hidden />
        </button>
      }
    >
      <div>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("promptEdit.addNamePlaceholder")}
            aria-label={t("variable.nameLabel")}
            aria-invalid={Boolean(error)}
            data-testid="variable-add-name"
            autoComplete="off"
            className={SHEET_INPUT_CLASS}
          />
          <Button type="submit" size="lg" className="h-12 shrink-0 px-5" data-testid="variable-add-submit">
            {t("variable.add")}
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-caption font-semibold text-danger">
            {error}
          </p>
        )}
      </div>

      {variables.length > 0 && (
        <section aria-labelledby="variable-add-in-prompt">
          <h3 id="variable-add-in-prompt" className="mb-2.5 text-caption font-bold uppercase tracking-[0.08em] text-text-muted">
            {t("promptEdit.inPrompt")}
          </h3>
          <div className="flex flex-wrap gap-2">
            {variables.map((variable) => (
              <button
                key={variable.tempId}
                type="button"
                onClick={() => onInsertExisting(variable.name)}
                aria-label={t("composer.insertAria", { name: variable.name })}
                data-variable-chip={variable.name}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary-soft px-3.5 font-mono text-small text-primary transition-colors hover:bg-primary-soft/70"
              >
                {`{${variable.name}}`}
                <span className="font-sans text-caption text-text-muted">{usage.get(variable.name) ?? 0}×</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {suggestions.length > 0 && (
        <section aria-labelledby="variable-add-suggested">
          <h3 id="variable-add-suggested" className="mb-2.5 text-caption font-bold uppercase tracking-[0.08em] text-text-muted">
            {t("promptEdit.suggested")}
          </h3>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => onCreate(normalizeVariableName(label))}
                data-variable-suggestion={label}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-dashed border-border-strong px-3.5 text-small text-text-secondary transition-colors hover:border-primary hover:text-text"
              >
                <Plus size={14} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </section>
      )}
    </VariableSheetFrame>
  );
}
