"use client";

import { useMemo, useState } from "react";
import { Blocks, Check, ChevronDown, ChevronRight, Plus, Search, X } from "lucide-react";
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
import type { GeneratorField, GeneratorFieldType } from "@/types";

const FIELD_TYPE_SHORT_LABELS: Record<GeneratorFieldType, string> = {
  text: "Kısa Metin",
  textarea: "Uzun Metin",
  select: "Seçim",
  multi_select: "Çoklu Seçim",
  number: "Sayı",
  slider: "Kaydırıcı",
  color: "Renk",
  checkbox: "Onay Kutusu",
  toggle: "Açma/Kapama",
  radio: "Radio",
  url: "URL",
};

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
}: {
  existingFields: GeneratorField[];
  onClose: () => void;
  onInsert: (fields: CatalogField[]) => void;
  onCreateCustom: () => void;
}) {
  const [query, setQuery] = useState("");
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [expandedSubgroupId, setExpandedSubgroupId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const alreadyUsedLabels = useMemo(() => new Set(existingFields.map((f) => normalizeTagLabel(f.label))), [existingFields]);

  function isAlreadyInSchema(field: CatalogField): boolean {
    return alreadyUsedLabels.has(normalizeTagLabel(field.label));
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

  function handleInsert() {
    const allCatalogFields = CATALOG_CATEGORIES.flatMap((category) => category.subgroups.flatMap((sub) => fieldsInSubgroup(category.id, sub.id)));
    const chosen = allCatalogFields.filter((field) => selectedIds.has(field.id));
    if (chosen.length === 0) return;
    onInsert(chosen);
  }

  function renderFieldRow(field: CatalogField, breadcrumb?: string) {
    const used = isAlreadyInSchema(field);
    const selected = selectedIds.has(field.id);
    return (
      <label
        key={field.id}
        className={cn(
          "flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm",
          used ? "cursor-not-allowed border-border/60 opacity-60" : selected ? "border-primary bg-accent-surface" : "border-border hover:bg-accent-surface",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
            used ? "border-border bg-accent-surface" : selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
          )}
        >
          {(selected || used) && <Check size={11} />}
        </span>
        <span className="min-w-0 flex-1">
          <input type="checkbox" className="sr-only" checked={selected || used} disabled={used} onChange={() => toggleField(field)} />
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-medium text-text">{field.label}</span>
            <span className="rounded-sm bg-accent-surface px-1.5 py-0.5 text-[10px] font-medium text-text-muted">{FIELD_TYPE_SHORT_LABELS[field.type]}</span>
          </span>
          {breadcrumb && <span className="mt-0.5 block truncate text-xs text-text-muted">{breadcrumb}</span>}
          {used && <span className="mt-0.5 block text-xs text-primary">Zaten eklendi</span>}
        </span>
      </label>
    );
  }

  return (
    <Modal onClose={onClose} labelledBy="field-catalog-title">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 id="field-catalog-title" className="text-base font-semibold text-text">
            Hazır Alan Kütüphanesinden Ekle
          </h2>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text">
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-border p-4">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Alan ara… (örn. göz rengi, ışık, kamera açısı)"
              className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-text placeholder:text-text-muted"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {query.trim() ? (
            <div className="space-y-1.5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{searchResults.length} sonuç</p>
              {searchResults.length === 0 && <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-text-muted">Eşleşen bir alan bulunamadı.</p>}
              {searchResults.map((field) => {
                const category = CATALOG_CATEGORIES.find((c) => c.id === field.categoryId);
                const subgroup = category?.subgroups.find((s) => s.id === field.subgroupId);
                return renderFieldRow(field, category && subgroup ? `${category.label} · ${subgroup.label}` : undefined);
              })}
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Hazır Paketler</p>
                <div className="flex flex-wrap gap-1.5">
                  {CATALOG_PACKAGES.map((pkg) => {
                    const fields = packageFields(pkg);
                    return (
                      <button
                        key={pkg.id}
                        type="button"
                        onClick={() => addPackage(fields)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text hover:bg-accent-surface"
                      >
                        <Blocks size={12} /> {pkg.label} <span className="text-text-muted">({fields.length})</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Kategoriler</p>
                {CATALOG_CATEGORIES.map((category) => {
                  const isCategoryOpen = expandedCategoryId === category.id;
                  return (
                    <div key={category.id} className="rounded-md border border-border">
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedCategoryId(isCategoryOpen ? null : category.id);
                          setExpandedSubgroupId(null);
                        }}
                        className="flex w-full items-center justify-between gap-2 p-2.5 text-left text-sm font-medium text-text hover:bg-accent-surface"
                      >
                        <span className="truncate">{category.label}</span>
                        {isCategoryOpen ? <ChevronDown size={15} className="shrink-0 text-text-muted" /> : <ChevronRight size={15} className="shrink-0 text-text-muted" />}
                      </button>
                      {isCategoryOpen && (
                        <div className="space-y-1 border-t border-border p-2">
                          {category.subgroups.map((subgroup) => {
                            const isSubOpen = expandedSubgroupId === subgroup.id;
                            const fields = fieldsInSubgroup(category.id, subgroup.id);
                            if (fields.length === 0) return null;
                            const selectableFields = fields.filter((f) => !isAlreadyInSchema(f));
                            const allSubgroupSelected = selectableFields.length > 0 && selectableFields.every((f) => selectedIds.has(f.id));
                            return (
                              <div key={subgroup.id}>
                                <div className="flex items-center justify-between gap-2 rounded-md px-1 hover:bg-accent-surface">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedSubgroupId(isSubOpen ? null : subgroup.id)}
                                    className="flex flex-1 items-center gap-1 py-1.5 pl-1 text-left text-xs font-medium text-text-muted hover:text-text"
                                  >
                                    {isSubOpen ? <ChevronDown size={13} className="shrink-0" /> : <ChevronRight size={13} className="shrink-0" />}
                                    <span>
                                      {subgroup.label} <span className="text-text-muted">({fields.length})</span>
                                    </span>
                                  </button>
                                  <label
                                    className={cn(
                                      "flex shrink-0 items-center gap-1 pr-1 text-[11px] font-medium",
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
                                    Tümünü seç
                                  </label>
                                </div>
                                {isSubOpen && <div className="mt-1 space-y-1 pl-2">{fields.map((field) => renderFieldRow(field))}</div>}
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

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-4">
          <button type="button" onClick={onCreateCustom} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <Plus size={14} /> Özel Alan Oluştur
          </button>
          <div className="flex items-center gap-2">
            <p className="text-xs text-text-muted">{selectedCount > 0 ? `${selectedCount} alan seçili` : "Hiç alan seçilmedi"}</p>
            <Button type="button" onClick={handleInsert} disabled={selectedCount === 0}>
              Ekle {selectedCount > 0 ? `(${selectedCount})` : ""}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
