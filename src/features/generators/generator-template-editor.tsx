"use client";

import { useEffect, useMemo, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { PromptComposer, type ComposerHandle } from "@/features/content/prompt-composer/prompt-composer";
import type { PickerFilter, PickerItem } from "@/features/content/prompt-composer/insert-picker";
import { defaultValuesFromSchema, isFieldVisible } from "@/lib/generator-template";
import {
  fieldDisplayNames,
  fromDisplayText,
  orphanTemplateKeys,
  renderTemplateDoc,
  toDisplayText,
} from "@/lib/generator-template-doc";
import { tokenUsageMap } from "@/lib/prompt-doc";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { GENERATOR_FIELD_TYPE_LABELS } from "./generator-category-meta";
import type { GeneratorField, GeneratorFieldType } from "@/types";

const TYPE_GROUP: Record<GeneratorFieldType, "text" | "choice" | "number" | "other"> = {
  text: "text",
  textarea: "text",
  url: "text",
  select: "choice",
  multi_select: "choice",
  radio: "choice",
  number: "number",
  slider: "number",
  color: "other",
  checkbox: "other",
  toggle: "other",
};

/**
 * Generator'ın isteğe bağlı prompt şablonu (Bölüm 9.136). Aynı `PromptComposer`
 * altyapısını normal prompt değişkenleriyle paylaşır, ama veri modeli ayrıdır:
 * şablon DB'de KANONİK biçimde (`{{anahtar}}`) saklanır, düzenleyicide alanın
 * görünen adıyla (`{Stil}`) gösterilir — alanı yeniden adlandırmak her
 * kullanımı kendiliğinden günceller. Aynı alan şablonda birden çok yerde
 * kullanılabilir.
 */
export function GeneratorTemplateEditor({
  fields,
  value,
  onChange,
  onCreateField,
  onOpenCatalog,
  insertRequest,
}: {
  fields: GeneratorField[];
  /** Kanonik şablon metni (`{{anahtar}}`). */
  value: string;
  onChange: (canonical: string) => void;
  /** Yeni alan oluşturma akışını (FieldEditorModal) aç. */
  onCreateField: () => void;
  onOpenCatalog: () => void;
  /** Yeni oluşturulan alanı, bekleyen konuma yerleştirmek için (nonce her istekte değişir). */
  insertRequest: { key: string; nonce: number } | null;
}) {
  const { t } = useTranslation();
  const composerRef = useRef<ComposerHandle>(null);

  const names = useMemo(() => fieldDisplayNames(fields), [fields]);
  const displayValue = useMemo(() => toDisplayText(value, fields), [value, fields]);
  const usage = useMemo(() => tokenUsageMap(displayValue), [displayValue]);
  const displayNameSet = useMemo(() => new Set(names.values()), [names]);

  const items: PickerItem[] = useMemo(
    () =>
      [...fields]
        .sort((a, b) => a.order - b.order)
        .map((field) => {
          const name = names.get(field.key) ?? field.key;
          const typeLabel = t(GENERATOR_FIELD_TYPE_LABELS[field.type]);
          return {
            id: field.id,
            name,
            label: name,
            description: field.options.length > 0 ? `${typeLabel} · ${field.options.length}` : typeLabel,
            group: TYPE_GROUP[field.type],
            usage: usage.get(name) ?? 0,
          };
        }),
    [fields, names, usage, t],
  );
  const filters: PickerFilter[] = [
    { id: "all", label: t("composer.filterAll") },
    { id: "unused", label: t("composer.filterUnused") },
    { id: "used", label: t("composer.filterUsed") },
    { id: "text", label: t("composer.filterText") },
    { id: "choice", label: t("composer.filterChoice") },
    { id: "number", label: t("composer.filterNumber") },
    { id: "other", label: t("composer.filterOther") },
  ];

  // Yeni oluşturulan alan, alan listesi güncellendikten SONRA bekleyen konuma eklenir.
  const handledNonceRef = useRef(0);
  useEffect(() => {
    if (!insertRequest || insertRequest.nonce === handledNonceRef.current) return;
    const name = names.get(insertRequest.key);
    if (!name) return;
    handledNonceRef.current = insertRequest.nonce;
    composerRef.current?.insertToken(name);
  }, [insertRequest, names]);

  const orphans = orphanTemplateKeys(value, fields);
  const preview = useMemo(
    () =>
      value.trim()
        ? renderTemplateDoc(value, fields, defaultValuesFromSchema({ fields }), isFieldVisible)
        : null,
    [value, fields],
  );

  return (
    <div className="space-y-3">
      <PromptComposer
        ref={composerRef}
        mode="field"
        id="generator-template"
        value={displayValue}
        onChange={(display) => onChange(fromDisplayText(display, fields))}
        items={items}
        filters={filters}
        tokenTone={(name) => (displayNameSet.has(name) ? "field" : "unknown")}
        placeholder={t("generator.templatePlaceholder")}
        minRows={4}
        ariaLabel={t("generator.templateAriaLabel")}
        onCreateNew={() => onCreateField()}
        onOpenCatalog={onOpenCatalog}
      />

      {orphans.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {t("generator.templateOrphan", { tokens: orphans.map((key) => `{${key}}`).join(", ") })}
        </p>
      )}

      <div className="rounded-lg border border-border-soft bg-surface-soft p-3" data-testid="template-preview">
        <p className="mb-1.5 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("generator.templatePreview")}</p>
        {preview ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-text">
            {preview.segments.map((segment, index) =>
              segment.kind === "text" ? (
                <span key={index}>{segment.text}</span>
              ) : (
                <span
                  key={index}
                  className={cn(
                    "rounded-[5px] px-1 py-0.5",
                    segment.kind === "value" ? "bg-secondary/15 text-secondary" : "bg-warning/15 text-warning",
                  )}
                >
                  {segment.text}
                </span>
              ),
            )}
          </p>
        ) : (
          <p className="text-sm text-text-muted">{t("generator.templatePreviewEmpty")}</p>
        )}
      </div>
    </div>
  );
}

