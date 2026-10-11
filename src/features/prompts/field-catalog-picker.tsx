"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Blocks, Check, ChevronDown, ChevronRight, Eye, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { normalizeTagLabel } from "@/lib/tag-normalize";
import { cn } from "@/lib/utils";
import {
  CATALOG_CATEGORIES,
  CATALOG_PACKAGES,
  fieldsInSubgroup,
  packageFields,
  searchCatalogFields,
  type CatalogField,
} from "@/lib/generator-field-catalog";
import { useTranslation, useLanguage } from "@/lib/i18n/language-provider";
import { catalogText, localizeCatalogField } from "@/lib/generator-field-catalog-en";
import { GENERATOR_FIELD_TYPE_LABELS } from "./field-type-labels";

/**
 * "Alan Ekle" modal, catalog step (the user's "HAZIR KATEGORİ / ALT
 * KATEGORİ / ALAN ŞABLON KÜTÜPHANESİ" request) — browse/search
 * `src/lib/generator-field-catalog.ts` and insert one or more ready-made
 * fields into the active generator's schema in one batch, instead of
 * building every field by hand through `FieldEditorModal`.
 *
 * Deliberately a pure PICKER: it never constructs a real `GeneratorField`
 * itself (no id/key/order logic here) — it hands the chosen `CatalogField[]`
 * back to `onInsert`, and `generator-builder.tsx` converts them using the
 * exact same `makeFieldKeyFromLabel`/ordering logic it already uses for
 * duplicating a field, so there is one real place fields get created, not
 * two. "+ Özel Alan Oluştur" closes this picker and opens the existing
 * `FieldEditorModal` in create mode (`onCreateCustom`) — a fully custom
 * field was never meant to be reinvented here.
 *
 * Per the user's own explicit architecture decision (see
 * `generator-field-catalog.ts`'s header comment): every catalog field only
 * carries a real `jsonPath` + canonical option `value` — there is no
 * `promptVariable`/`{{token}}`/`promptValue` anywhere in this picker, and
 * nothing here writes to a prompt template (Bölüm 9.29 removed that
 * responsibility from the builder entirely).
 */
export function FieldCatalogPicker({
  existingFields,
  onClose,
  onInsert,
  onCreateCustom,
  hideOptionPreview = false,
}: {
  /** Yalnızca `label` okunur — Generator alanları ve prompt değişkenleri (adı) aynı seçiciyi kullanır. */
  existingFields: { label: string }[];
  onClose: () => void;
  onInsert: (fields: CatalogField[]) => void;
  /** Verilmezse "Özel alan oluştur" bağlantısı gösterilmez (örn. prompt değişkeni seçimi). */
  onCreateCustom?: () => void;
  /** Seçeneklerdeki hazır görsel/renk önizlemesini gizler (değişkenlerde hazır görsel/renk kullanılmaz). */
  hideOptionPreview?: boolean;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [query, setQuery] = useState("");
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [expandedSubgroupId, setExpandedSubgroupId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewPackageId, setPreviewPackageId] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(true);
  const previewRef = useRef<HTMLDivElement>(null);

  const alreadyUsedLabels = useMemo(() => new Set(existingFields.map((f) => normalizeTagLabel(f.label))), [existingFields]);

  function isAlreadyInSchema(field: CatalogField): boolean {
    // Existing schemas may have been built in either language.
    return alreadyUsedLabels.has(normalizeTagLabel(field.label)) || alreadyUsedLabels.has(normalizeTagLabel(catalogText(field.label, "en")));
  }

  function toggleField(field: CatalogField) {
    if (isAlreadyInSchema(field)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(field.id)) next.delete(field.id);
      else next.add(field.id);
      return next;
    });
  }

  function addPackage(fields: CatalogField[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const field of fields) {
        if (!isAlreadyInSchema(field)) next.add(field.id);
      }
      return next;
    });
  }

  /**
   * "Tümünü seç" per subgroup (e.g. Kimlik's 6 fields — cinsiyet, yaş grubu,
   * karakter türü, rol, kişilik, yüz şekli — in one click) — the user's own
   * explicit request. A toggle, not a one-way add like `addPackage`: if every
   * still-selectable field in the subgroup is already checked, it clears
   * them all; otherwise it selects the remaining ones. Fields already in the
   * generator's schema are never touched either way (same rule as everywhere
   * else in this picker).
   */
  function toggleSubgroup(fields: CatalogField[]) {
    const selectable = fields.filter((f) => !isAlreadyInSchema(f));
    if (selectable.length === 0) return;
    const allSelected = selectable.every((f) => selectedIds.has(f.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const field of selectable) {
        if (allSelected) next.delete(field.id);
        else next.add(field.id);
      }
      return next;
    });
  }

  const searchResults = useMemo(() => (query.trim() ? searchCatalogFields(query, normalizeTagLabel) : []), [query]);
  const selectedCount = selectedIds.size;

  const allCatalogFields = useMemo(
    () => CATALOG_CATEGORIES.flatMap((category) => category.subgroups.flatMap((sub) => fieldsInSubgroup(category.id, sub.id))),
    [],
  );
  const fieldById = useMemo(() => new Map(allCatalogFields.map((field) => [field.id, field])), [allCatalogFields]);
  /** Seçilenler, seçilme sırasıyla. */
  const selectedFields = useMemo(
    () => Array.from(selectedIds).map((id) => fieldById.get(id)).filter((field): field is CatalogField => Boolean(field)),
    [selectedIds, fieldById],
  );
  const previewPackage = previewPackageId ? CATALOG_PACKAGES.find((pkg) => pkg.id === previewPackageId) ?? null : null;
  const previewPackageFields = previewPackage ? packageFields(previewPackage) : [];
  const previewAddable = previewPackageFields.filter((field) => !isAlreadyInSchema(field));

  // Çipler çok olduğundan önizleme ekran dışında kalabilir: açılınca görünür alana getir.
  useEffect(() => {
    if (previewPackageId) previewRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [previewPackageId]);

  function removeSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function handleInsert() {
    const chosen = allCatalogFields.filter((field) => selectedIds.has(field.id));
    if (chosen.length === 0) return;
    onInsert(chosen.map((field) => localizeCatalogField(field, language)));
  }

  /** Alanın ne olduğunu tek bakışta gösteren küçük önizleme: tip + ilk seçenekler (ya da aralık). */
  function renderFieldPreview(field: CatalogField) {
    const optionLabels = field.options.map((option) => catalogText(option.label, language));
    const shown = optionLabels.slice(0, 4);
    const extra = optionLabels.length - shown.length;
    return (
      <span className="mt-1 flex flex-wrap items-center gap-1">
        <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-text-secondary">{t(GENERATOR_FIELD_TYPE_LABELS[field.type])}</span>
        {shown.map((label, index) => (
          <span key={`${label}-${index}`} className="max-w-[9rem] truncate rounded-full bg-surface px-2 py-0.5 text-[10px] text-text-muted">
            {label}
          </span>
        ))}
        {extra > 0 && <span className="text-[10px] text-text-muted">+{extra}</span>}
        {optionLabels.length === 0 && field.min !== undefined && field.max !== undefined && (
          <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-text-muted">{field.min}–{field.max}</span>
        )}
        {optionLabels.length === 0 && field.min === undefined && (
          <span className="text-[10px] text-text-muted">{t("fieldCatalog.freeText")}</span>
        )}
      </span>
    );
  }

  function renderFieldRow(field: CatalogField, breadcrumb?: string) {
    const used = isAlreadyInSchema(field);
    const selected = selectedIds.has(field.id);
    return (
      <label
        key={field.id}
        className={cn(
          "flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200 ease-soft",
          used ? "cursor-not-allowed opacity-55" : "cursor-pointer",
          selected ? "bg-primary-soft ring-1 ring-primary/25" : used ? "bg-surface-soft" : "bg-surface-soft hover:bg-primary-soft/60",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors",
            used ? "border-border bg-surface" : selected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-surface",
          )}
        >
          {(selected || used) && <Check size={11} strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <input type="checkbox" className="sr-only" checked={selected || used} disabled={used} onChange={() => toggleField(field)} />
          <span className="flex flex-wrap items-center gap-1.5">
            {hideOptionPreview ? null : field.options[0]?.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- tiny data-URL preview thumbnail, never a remote asset
              <img src={field.options[0].image} alt="" className="h-4 w-4 shrink-0 rounded object-cover" title={t("fieldCatalog.imageHint")} />
            ) : (
              field.options[0]?.color && (
                <span
                  className="h-3 w-3 shrink-0 rounded-full border border-border/60"
                  style={{ backgroundColor: field.options[0].color }}
                  aria-hidden="true"
                  title={t("fieldCatalog.colorHint")}
                />
              )
            )}
            <span className="truncate font-medium text-text">{catalogText(field.label, language)}</span>
            {used && <span className="text-xs font-medium text-primary">{t("fieldCatalog.alreadyAdded")}</span>}
          </span>
          {breadcrumb && <span className="mt-0.5 block truncate text-xs text-text-muted">{breadcrumb}</span>}
          {renderFieldPreview(field)}
        </span>
      </label>
    );
  }

  return (
    <Modal onClose={onClose} labelledBy="field-catalog-title">
      <div
        className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-soft bg-surface-elevated shadow-pop"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <h2 id="field-catalog-title" className="font-display text-lg font-semibold text-text">
              {t("fieldCatalog.title")}
            </h2>
            <p className="mt-0.5 text-sm text-text-secondary">{t("fieldCatalog.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("fieldCatalog.searchPlaceholder")}
              className="h-11 w-full rounded-full border border-transparent bg-surface-soft pl-10 pr-4 text-sm text-text placeholder:text-text-muted transition-colors duration-200 ease-soft hover:bg-primary-soft/50 focus:border-primary/40 focus:bg-surface"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
          {query.trim() ? (
            <div className="space-y-1.5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{t("fieldCatalog.resultsCount", { count: searchResults.length })}</p>
              {searchResults.length === 0 && <p className="rounded-xl bg-surface-soft p-5 text-center text-sm text-text-muted">{t("fieldCatalog.noFieldMatch")}</p>}
              {searchResults.map((field) => {
                const category = CATALOG_CATEGORIES.find((c) => c.id === field.categoryId);
                const subgroup = category?.subgroups.find((s) => s.id === field.subgroupId);
                return renderFieldRow(field, category && subgroup ? `${catalogText(category.label, language)} · ${catalogText(subgroup.label, language)}` : undefined);
              })}
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{t("fieldCatalog.readyPackages")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {CATALOG_PACKAGES.map((pkg) => {
                    const fields = packageFields(pkg);
                    const active = previewPackageId === pkg.id;
                    return (
                      <button
                        key={pkg.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setPreviewPackageId(active ? null : pkg.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 ease-soft",
                          active ? "bg-primary text-primary-foreground" : "bg-surface-soft text-text hover:bg-primary-soft",
                        )}
                      >
                        <Blocks size={12} /> {catalogText(pkg.label, language)}{" "}
                        <span className={active ? "text-primary-foreground/80" : "text-text-muted"}>({fields.length})</span>
                      </button>
                    );
                  })}
                </div>

                {previewPackage && (
                  <div ref={previewRef} className="mt-3 animate-fade-in scroll-mb-4 rounded-2xl bg-primary-soft/50 p-3 ring-1 ring-primary/15">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
                        <Eye size={14} className="text-primary" aria-hidden /> {catalogText(previewPackage.label, language)}
                        <span className="text-xs font-normal text-text-secondary">· {t("fieldCatalog.packagePreview")}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => setPreviewPackageId(null)}
                        aria-label={t("fieldCatalog.hidePreview")}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface hover:text-text"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="space-y-1.5">{previewPackageFields.map((field) => renderFieldRow(field))}</div>
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        disabled={previewAddable.length === 0}
                        onClick={() => {
                          addPackage(previewPackageFields);
                          setPreviewPackageId(null);
                        }}
                      >
                        {previewAddable.length === 0 ? t("fieldCatalog.packageAllAdded") : t("fieldCatalog.addPackage", { count: previewAddable.length })}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{t("fieldCatalog.categories")}</p>
                {CATALOG_CATEGORIES.map((category) => {
                  const isCategoryOpen = expandedCategoryId === category.id;
                  return (
                    <div key={category.id} className="overflow-hidden rounded-2xl bg-surface-soft">
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedCategoryId(isCategoryOpen ? null : category.id);
                          setExpandedSubgroupId(null);
                        }}
                        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-text transition-colors hover:bg-primary-soft/60"
                      >
                        <span className="truncate">{catalogText(category.label, language)}</span>
                        {isCategoryOpen ? <ChevronDown size={15} className="shrink-0 text-text-muted" /> : <ChevronRight size={15} className="shrink-0 text-text-muted" />}
                      </button>
                      {isCategoryOpen && (
                        <div className="space-y-1 border-t border-border-soft p-2">
                          {category.subgroups.map((subgroup) => {
                            const isSubOpen = expandedSubgroupId === subgroup.id;
                            const fields = fieldsInSubgroup(category.id, subgroup.id);
                            if (fields.length === 0) return null;
                            const selectableFields = fields.filter((f) => !isAlreadyInSchema(f));
                            const allSubgroupSelected = selectableFields.length > 0 && selectableFields.every((f) => selectedIds.has(f.id));
                            return (
                              <div key={subgroup.id}>
                                <div className="flex items-center justify-between gap-2 rounded-xl px-1 transition-colors hover:bg-surface">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedSubgroupId(isSubOpen ? null : subgroup.id)}
                                    className="flex flex-1 items-center gap-1 py-2 pl-2 text-left text-xs font-medium text-text-secondary hover:text-text"
                                  >
                                    {isSubOpen ? <ChevronDown size={13} className="shrink-0" /> : <ChevronRight size={13} className="shrink-0" />}
                                    <span>
                                      {catalogText(subgroup.label, language)} <span className="text-text-muted">({fields.length})</span>
                                    </span>
                                  </button>
                                  <label
                                    className={cn(
                                      "flex shrink-0 items-center gap-1 pr-2 text-[11px] font-medium",
                                      selectableFields.length === 0 ? "cursor-not-allowed text-text-muted/50" : "cursor-pointer text-text-muted hover:text-primary",
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      className="h-3 w-3"
                                      checked={allSubgroupSelected}
                                      disabled={selectableFields.length === 0}
                                      onChange={() => toggleSubgroup(fields)}
                                    />
                                    {t("fieldCatalog.selectAll")}
                                  </label>
                                </div>
                                {isSubOpen && <div className="mt-1 space-y-1.5 px-1 pb-1">{fields.map((field) => renderFieldRow(field))}</div>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {selectedCount > 0 && (
          <div className="border-t border-border-soft bg-surface-soft/60">
            <div className="flex items-center justify-between gap-2 px-5 py-2">
              <button
                type="button"
                onClick={() => setTrayOpen((open) => !open)}
                aria-expanded={trayOpen}
                className="flex items-center gap-1.5 text-sm font-semibold text-text"
              >
                {trayOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                {t("fieldCatalog.selectedTitle", { count: selectedCount })}
              </button>
              <button type="button" onClick={() => setSelectedIds(new Set())} className="text-xs font-medium text-text-muted hover:text-danger">
                {t("fieldCatalog.clearSelection")}
              </button>
            </div>
            {trayOpen && (
              <ul className="max-h-44 space-y-1.5 overflow-y-auto overscroll-contain px-5 pb-3">
                {selectedFields.map((field) => (
                  <li key={field.id} className="flex items-start gap-2 rounded-xl bg-surface px-3 py-2 shadow-xs">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-text">{catalogText(field.label, language)}</span>
                      {renderFieldPreview(field)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSelected(field.id)}
                      aria-label={t("fieldCatalog.removeField", { name: catalogText(field.label, language) })}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-soft px-5 py-3.5">
          {onCreateCustom ? (
            <button type="button" onClick={onCreateCustom} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              <Plus size={14} /> {t("fieldCatalog.createCustomField")}
            </button>
          ) : (
            <span className="text-xs text-text-muted">{selectedCount > 0 ? t("fieldCatalog.fieldsSelectedCount", { count: selectedCount }) : t("fieldCatalog.noFieldsSelected")}</span>
          )}
          <Button type="button" onClick={handleInsert} disabled={selectedCount === 0}>
            {t("variable.add")} {selectedCount > 0 ? `(${selectedCount})` : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
