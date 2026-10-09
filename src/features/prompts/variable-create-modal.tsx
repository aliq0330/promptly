"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { isValidVariableName, normalizeVariableName } from "@/lib/prompt-variables";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { DraftVariable } from "./prompt-text-editor";

/**
 * Yeni değişken oluşturma / metne bağlama penceresi (Bölüm 9.136).
 *
 * İki giriş noktası aynı pencereyi kullanır:
 *  - Metinden bir kelime seçip "Değişkene dönüştür": varsayılan değer seçilen
 *    metinle önceden dolar ("İstanbul"), değişken adını (örn. "Şehir")
 *    kullanıcı verir. Seçilen metin birden çok yerde geçiyorsa hepsini aynı
 *    değişkene çevirme seçeneği sunulur.
 *  - Seçici içinden "Yeni değişken oluştur": seçim yok, varsayılan değer boş.
 *
 * Girilen ad mevcut bir değişkenle (büyük/küçük harf duyarsız) çakışırsa
 * ikinci bir değişken oluşturulmaz; seçim/imleç konumu mevcut değişkene
 * bağlanır (varsayılan değer/açıklama ona aittir, burada değişmez).
 */
export function VariableCreateModal({
  selectedText,
  occurrenceCount,
  variables,
  onClose,
  onSubmit,
}: {
  /** Seçili (dönüştürülecek) metin; yoksa boş. */
  selectedText: string;
  occurrenceCount: number;
  variables: DraftVariable[];
  onClose: () => void;
  onSubmit: (values: { name: string; defaultValue: string; description: string; replaceAll: boolean; existing: boolean }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [defaultValue, setDefaultValue] = useState(selectedText);
  const [description, setDescription] = useState("");
  const [replaceAll, setReplaceAll] = useState(false);
  const [touched, setTouched] = useState(false);

  const normalizedName = normalizeVariableName(name);
  const existing = variables.find((variable) => variable.name.toLowerCase() === normalizedName.toLowerCase()) ?? null;
  const error = !touched
    ? null
    : normalizedName.length === 0
      ? t("variable.nameEmptyError")
      : !isValidVariableName(normalizedName)
        ? t("variable.nameInvalidError")
        : null;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // React portal olayları React ağacı boyunca kabarcıklar: durdurmazsak
    // bu pencerenin gönderimi dış prompt-yayın formunu da tetikler.
    event.stopPropagation();
    setTouched(true);
    if (normalizedName.length === 0 || !isValidVariableName(normalizedName)) return;
    onSubmit({
      name: existing ? existing.name : normalizedName,
      defaultValue,
      description,
      replaceAll: replaceAll && selectedText.length > 0,
      existing: Boolean(existing),
    });
  }

  return (
    <Modal onClose={onClose} labelledBy="variable-create-title">
      <div
        className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="variable-create-title" className="text-base font-semibold text-text">
            {selectedText ? t("variable.convertTitle") : t("variable.createTitle")}
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

        {selectedText && (
          <p className="rounded-md bg-surface-soft px-3 py-2 text-sm text-text-secondary">
            {t("variable.selectedTextLabel")} <span className="font-medium text-text">“{selectedText}”</span>
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="variable-create-name" className="mb-1.5 block text-sm font-medium text-text">
              {t("variable.nameLabel")}
            </label>
            <input
              id="variable-create-name"
              type="text"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("variable.createNamePlaceholder")}
              aria-invalid={Boolean(error)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
            />
            {normalizedName && <p className="mt-1.5 font-mono text-xs text-primary">{`{${normalizedName}}`}</p>}
            {error && (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {error}
              </p>
            )}
          </div>

          {existing ? (
            <div className="space-y-1.5 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="font-medium text-primary">{t("variable.alreadyExistsTitle")}</p>
              <p className="text-xs text-text-muted">
                {t("variable.willLinkPrefix")} <span className="font-mono">{`{${existing.name}}`}</span> {t("variable.willLinkSuffix")}
              </p>
              {existing.defaultValue && (
                <p className="text-xs text-text-muted">
                  {t("variable.existingDefaultValue")} <span className="text-text">{existing.defaultValue}</span>
                </p>
              )}
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="variable-create-default" className="mb-1.5 block text-sm font-medium text-text">
                  {t("variable.defaultValueLabel")} <span className="text-text-muted">({t("common.optional")})</span>
                </label>
                <input
                  id="variable-create-default"
                  type="text"
                  value={defaultValue}
                  onChange={(event) => setDefaultValue(event.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
                />
              </div>
              <div>
                <label htmlFor="variable-create-description" className="mb-1.5 block text-sm font-medium text-text">
                  {t("variable.descriptionLabel")} <span className="text-text-muted">({t("common.optional")})</span>
                </label>
                <textarea
                  id="variable-create-description"
                  rows={2}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("variable.descriptionPlaceholder")}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
                />
              </div>
            </>
          )}

          {selectedText && occurrenceCount > 1 && (
            <label className="flex cursor-pointer items-start gap-2 text-sm text-text">
              <input type="checkbox" checked={replaceAll} onChange={(event) => setReplaceAll(event.target.checked)} className="mt-0.5" />
              <span>{t("variable.replaceAllOccurrences", { text: selectedText, count: occurrenceCount })}</span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit">{existing ? t("variable.link") : selectedText ? t("variable.convert") : t("variable.add")}</Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
