"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isValidVariableName, normalizeVariableName } from "@/lib/prompt-variables";
import { pickNameCandidates, suggestNameFromText } from "@/lib/prompt-variable-name";
import { useLanguage, useTranslation } from "@/lib/i18n/language-provider";
import type { Language } from "@/lib/i18n/translations";
import type { DraftVariable } from "./prompt-text-editor";
import { SHEET_INPUT_CLASS, sheetPillClassName, VariableSheetFrame } from "./variable-sheet-frame";

/**
 * Seçilen kelimeyi içeren hazır alanların adları ("sinematik" → "Işık stili"): katalog büyük olduğu için yalnızca bu sayfa açılınca,
 * tembel yüklenir. Eşleşme yoksa boş döner — sayfa kelimenin kendisinden türetilen adla çalışır.
 */
async function loadCatalogNameHints(word: string, language: Language): Promise<string[]> {
  const [catalog, localized, tags] = await Promise.all([
    import("@/lib/generator-field-catalog"),
    import("@/lib/generator-field-catalog-en"),
    import("@/lib/tag-normalize"),
  ]);
  const needle = tags.normalizeTagLabel(word);
  if (!needle) return [];
  const labels: string[] = [];
  for (const field of catalog.CATALOG_FIELDS) {
    const hit = field.options.some(
      (option) => tags.normalizeTagLabel(option.label) === needle || tags.normalizeTagLabel(localized.catalogText(option.label, "en")) === needle,
    );
    if (hit) labels.push(localized.catalogText(field.label, language));
  }
  return labels;
}

/**
 * "Değişken yap" alt sayfası (docs/history/288-*): seçili kelime için TEK alan — ad önceden dolu (kelimenin kendisi; katalogda bir hazır alanın
 * seçeneğiyse o alanın adları çip olarak önerilir), varsayılan değer kelimenin kendisidir. Tür/seçenek/koşul sonra, değişkene dokunarak.
 * Kelime metinde birden çok yerde geçiyorsa "hepsini değiştir" seçeneği sürer; aynı ada yazmak var olan değişkene bağlar.
 */
export function VariableConvertSheet({
  selectedText,
  occurrenceCount,
  variables,
  onSubmit,
  onClose,
}: {
  selectedText: string;
  occurrenceCount: number;
  variables: DraftVariable[];
  onSubmit: (values: { name: string; replaceAll: boolean; existing: boolean }) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [name, setName] = useState(() => suggestNameFromText(selectedText));
  const [hints, setHints] = useState<string[]>([]);
  const [replaceAll, setReplaceAll] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    let alive = true;
    loadCatalogNameHints(selectedText, language)
      .then((labels) => {
        if (alive) setHints(pickNameCandidates(labels, new Set()));
      })
      .catch(() => {
        /* katalog yüklenmezse yalnızca öneri çipleri olmaz */
      });
    return () => {
      alive = false;
    };
  }, [selectedText, language]);

  const normalized = normalizeVariableName(name);
  const existing = variables.find((variable) => variable.name.toLowerCase() === normalized.toLowerCase()) ?? null;
  const error = !touched ? null : normalized.length === 0 ? t("variable.nameEmptyError") : !isValidVariableName(normalized) ? t("variable.nameInvalidError") : null;

  function submit() {
    setTouched(true);
    if (!normalized || !isValidVariableName(normalized)) return;
    onSubmit({ name: existing ? existing.name : normalized, replaceAll: replaceAll && selectedText.length > 0, existing: Boolean(existing) });
  }

  return (
    <VariableSheetFrame
      title={t("variable.convertTitle")}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" size="lg" className="flex-1" data-testid="variable-convert-submit">
            {existing ? t("variable.link") : t("promptEdit.makeVariable")}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-2.5 rounded-xl bg-surface-soft px-3.5 py-3">
        <span className="shrink-0 text-caption text-text-muted">{t("promptEdit.selectedWord")}</span>
        <span className="min-w-0 break-words font-mono text-small font-medium text-text">“{selectedText}”</span>
      </div>

      <div>
        <label htmlFor="variable-convert-name" className="mb-2 block text-body font-semibold text-text">
          {t("variable.nameLabel")}
        </label>
        <input
          id="variable-convert-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={Boolean(error)}
          data-testid="variable-convert-name"
          autoComplete="off"
          className={`${SHEET_INPUT_CLASS} font-mono`}
        />
        {normalized && <p className="mt-1.5 font-mono text-caption text-primary">{`{${normalized}}`}</p>}
        {error && (
          <p role="alert" className="mt-1.5 text-caption font-semibold text-danger">
            {error}
          </p>
        )}
        {hints.length > 0 && (
          <div className="mt-3" role="group" aria-label={t("promptEdit.suggestedNames")}>
            <div className="flex flex-wrap gap-2">
              {hints.map((hint) => (
                <button key={hint} type="button" className={sheetPillClassName(normalized.toLowerCase() === hint.toLowerCase())} aria-pressed={normalized.toLowerCase() === hint.toLowerCase()} onClick={() => setName(hint)}>
                  {hint}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {existing ? (
        <div className="space-y-1 rounded-xl border border-primary/30 bg-primary-soft px-3.5 py-3 text-small">
          <p className="font-semibold text-primary">{t("variable.alreadyExistsTitle")}</p>
          <p className="text-caption text-text-secondary">
            {t("variable.willLinkPrefix")} <span className="font-mono">{`{${existing.name}}`}</span> {t("variable.willLinkSuffix")}
          </p>
        </div>
      ) : (
        <p className="text-caption leading-relaxed text-text-muted">{t("promptEdit.convertNote")}</p>
      )}

      {occurrenceCount > 1 && (
        <label className="flex cursor-pointer items-start gap-2.5 text-small text-text">
          <input type="checkbox" checked={replaceAll} onChange={(event) => setReplaceAll(event.target.checked)} className="mt-1" />
          <span>{t("variable.replaceAllOccurrences", { text: selectedText, count: occurrenceCount })}</span>
        </label>
      )}
    </VariableSheetFrame>
  );
}
