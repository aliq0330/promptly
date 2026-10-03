"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import { Modal } from "@/components/ui/modal";
import type { ContentTypeId } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { catalogFieldsForType, fieldIdsFor } from "@/lib/prompt-extra-settings";
import { fieldName, type PresetField, type PresetValue } from "@/lib/preset-fields";
import { newOwnField, singleChoiceField, toStoredValue } from "@/lib/preset-utils";
import { normalizeTagLabel } from "@/lib/tag-normalize";
import { cn } from "@/lib/utils";
import { PresetFieldInput } from "./preset-field-input";

const INPUT =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * "+ Alan Ekle" for a preset: the platform's fields for this content type are
 * listed (recommended first); opening one shows its options and picking ONE
 * adds the parameter. "+ Yeni alan oluştur" is a name plus a single option
 * (the type is always single-select) and is the only place a custom field is
 * made — never in the Prompt form.
 */
export function PresetAddParameterModal({
  contentType,
  category,
  subcategory,
  tools,
  takenIds,
  onAddCatalog,
  onAddOwn,
  onClose,
}: {
  contentType: ContentTypeId;
  category: string | null;
  subcategory: string | null;
  tools: string[];
  /** Fields already in the preset — shown as "Eklendi". */
  takenIds: ReadonlySet<string>;
  onAddCatalog: (fieldId: string, value: PresetValue) => void;
  onAddOwn: (field: PresetField, value: string) => void;
  onClose: () => void;
}) {
  const { t, language } = useTranslation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newOption, setNewOption] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const recommendedIds = useMemo(() => new Set(fieldIdsFor(contentType, category, subcategory, tools)), [contentType, category, subcategory, tools]);
  const catalog = useMemo(() => catalogFieldsForType(contentType), [contentType]);
  const q = normalizeTagLabel(query);
  const matches = (field: PresetField) => !q || [field.name, field.i18n?.en, field.i18n?.tr].some((name) => name && normalizeTagLabel(name).includes(q));
  const recommended = catalog.filter((f) => recommendedIds.has(f.id) && matches(f));
  const others = catalog.filter((f) => !recommendedIds.has(f.id) && matches(f));
  const isTaken = (id: string) => takenIds.has(id) || added.has(id);

  function pick(field: PresetField, value: PresetValue | undefined) {
    if (value === undefined) return;
    onAddCatalog(field.id, toStoredValue(field, value));
    setAdded((current) => new Set(current).add(field.id));
    setOpen(null);
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!newName.trim() || !newOption.trim()) {
      setCreateError(t("presetBuilder.newFieldRequired"));
      return;
    }
    const { field, value } = newOwnField(newName, newOption);
    onAddOwn(field, value);
    setNewName("");
    setNewOption("");
    setCreateError(null);
    setCreating(false);
  }

  const renderRow = (field: PresetField) => {
    const taken = isTaken(field.id);
    const isOpen = open === field.id;
    return (
      <li key={field.id} data-add-field-row={field.id} className="overflow-hidden rounded-md border border-border-soft bg-surface">
        <button
          type="button"
          disabled={taken}
          aria-expanded={isOpen}
          onClick={() => setOpen(isOpen ? null : field.id)}
          className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-soft disabled:cursor-default disabled:opacity-70 disabled:hover:bg-transparent"
        >
          <span className="min-w-0 flex-1 truncate text-label font-semibold text-text">{fieldName(field, language)}</span>
          {taken ? (
            <span className="inline-flex items-center gap-1 text-caption text-text-muted">
              <Check size={14} aria-hidden />
              {t("presetField.added")}
            </span>
          ) : (
            <ChevronDown size={16} className={cn("shrink-0 text-text-muted transition-transform duration-200", isOpen && "rotate-180")} aria-hidden />
          )}
        </button>
        <Collapsible open={isOpen && !taken}>
          <div className="border-t border-border-soft px-3 py-3">
            <p className="mb-2 text-caption text-text-secondary">{t("presetBuilder.pickOne")}</p>
            <PresetFieldInput field={singleChoiceField(field)} value={undefined} onChange={(value) => pick(field, value)} />
          </div>
        </Collapsible>
      </li>
    );
  };

  return (
    <Modal onClose={onClose} labelledBy="add-parameter-title">
      <div onClick={(event) => event.stopPropagation()} className="flex max-h-[92dvh] w-full max-w-xl flex-col rounded-lg border border-border bg-surface shadow-pop">
        <div className="flex items-start justify-between gap-3 border-b border-border-soft px-4 py-3">
          <div>
            <h2 id="add-parameter-title" className="text-h3 font-semibold text-text">
              {t("presetField.addTitle")}
            </h2>
            <p className="text-caption text-text-secondary">{t("presetBuilder.addHint")}</p>
          </div>
          <button type="button" aria-label={t("common.close")} onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2 border-b border-border-soft px-4 py-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("presetField.searchPlaceholder")}
              aria-label={t("presetField.searchPlaceholder")}
              className={cn(INPUT, "pl-9")}
            />
          </div>
          {creating ? (
            <form onSubmit={handleCreate} className="space-y-2 rounded-md border border-border-soft bg-surface-soft p-3" data-new-field-form>
              <p className="text-label font-semibold text-text">{t("presetField.createNew")}</p>
              <input value={newName} maxLength={60} onChange={(event) => setNewName(event.target.value)} placeholder={t("presetBuilder.newFieldName")} aria-label={t("presetBuilder.newFieldName")} className={INPUT} data-new-field-name />
              <input value={newOption} maxLength={120} onChange={(event) => setNewOption(event.target.value)} placeholder={t("presetBuilder.newFieldOption")} aria-label={t("presetBuilder.newFieldOption")} className={INPUT} data-new-field-option />
              <p className="text-caption text-text-muted">{t("presetBuilder.newFieldHint")}</p>
              {createError && (
                <p role="alert" className="text-caption text-danger">
                  {createError}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="submit" size="sm" data-new-field-submit>
                  {t("presetField.add")}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          ) : (
            <Button type="button" variant="secondary" size="sm" onClick={() => setCreating(true)} data-create-field>
              <Plus size={14} aria-hidden />
              {t("presetField.createNew")}
            </Button>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {recommended.length > 0 && (
            <section aria-label={t("presetField.recommended")}>
              <h3 className="mb-2 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("presetField.recommended")}</h3>
              <ul className="space-y-1.5">{recommended.map(renderRow)}</ul>
            </section>
          )}
          {others.length > 0 && (
            <section aria-label={t("presetField.others")}>
              <h3 className="mb-2 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("presetField.others")}</h3>
              <ul className="space-y-1.5">{others.map(renderRow)}</ul>
            </section>
          )}
          {recommended.length + others.length === 0 && <p className="text-small text-text-muted">{t("presetField.noMatch")}</p>}
        </div>

        <div className="flex justify-end border-t border-border-soft px-4 py-3">
          <Button type="button" onClick={onClose}>
            {t("presetField.done")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
