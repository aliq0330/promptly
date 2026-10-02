"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import type { ContentTypeId } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { catalogFieldsForType, fieldIdsFor, getCatalogField } from "@/lib/prompt-extra-settings";
import { cloneField, fieldName, type PresetField } from "@/lib/preset-fields";
import { normalizeTagLabel } from "@/lib/tag-normalize";
import { deleteLibraryField, fetchOwnLibraryFields, saveLibraryField } from "@/lib/supabase/presets";
import { cn } from "@/lib/utils";
import { FieldEditorModal } from "./field-editor-modal";

/**
 * "+ Alan Ekle": the platform's ready-made fields for this content type
 * (recommended ones first), the user's own field library ("Alanlarım") and
 * "+ Yeni alan oluştur".
 *
 *  - `target="form"`: a field is used AS IS (platform fields keep their stable
 *    id, so a selection stays compatible), and a newly created field is saved
 *    to the user's library first so it can be reused.
 *  - `target="preset"`: every pick is a user-owned COPY (new ids) the preset
 *    can edit freely; a newly created field belongs to that preset only.
 */
export function AddFieldModal({
  contentType,
  category,
  subcategory,
  tools,
  existingIds,
  target,
  onAdd,
  onLibraryUpdate,
  onLibraryDelete,
  onClose,
}: {
  contentType: ContentTypeId;
  category: string | null;
  subcategory: string | null;
  tools: string[];
  /** Ids already in use — shown as "Eklendi", not offered again. */
  existingIds: ReadonlySet<string>;
  target: "form" | "preset";
  onAdd: (fields: PresetField[]) => void;
  /** The user edited a library field that may already be in the form. */
  onLibraryUpdate?: (field: PresetField) => void;
  onLibraryDelete?: (id: string) => void;
  onClose: () => void;
}) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [library, setLibrary] = useState<PresetField[] | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<{ field: PresetField | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchOwnLibraryFields(user.id).then((fields) => {
      if (!cancelled) setLibrary(fields);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const recommendedIds = useMemo(() => new Set(fieldIdsFor(contentType, category, subcategory, tools)), [contentType, category, subcategory, tools]);
  const catalog = useMemo(() => catalogFieldsForType(contentType), [contentType]);
  const q = normalizeTagLabel(query);
  const matches = (field: PresetField) => {
    if (!q) return true;
    return [field.name, field.i18n?.en, field.i18n?.tr].some((name) => name && normalizeTagLabel(name).includes(q));
  };

  const recommended = catalog.filter((f) => recommendedIds.has(f.id) && matches(f));
  const others = catalog.filter((f) => !recommendedIds.has(f.id) && matches(f));
  const mine = (library ?? []).filter((f) => (!f.contentTypes || f.contentTypes.length === 0 || f.contentTypes.includes(contentType)) && matches(f));

  function isTaken(field: PresetField) {
    return added.has(field.id) || (target === "form" && existingIds.has(field.id));
  }

  function pick(field: PresetField) {
    if (isTaken(field)) return;
    const result = target === "preset" ? cloneField(field, language) : field;
    setAdded((current) => new Set(current).add(field.id));
    onAdd([result]);
  }

  async function handleEditorSave(finished: PresetField) {
    if (target === "preset") {
      // A preset-only field: no library write.
      const created = { ...finished, source: "user" as const };
      setAdded((current) => new Set(current).add(created.id));
      onAdd([created]);
      setEditor(null);
      return;
    }
    if (!user) throw new Error(t("preset.pickLoginRequired"));
    const saved = await saveLibraryField(finished, user.id);
    const isNew = !editor?.field;
    setLibrary((current) => (isNew ? [...(current ?? []), saved] : (current ?? []).map((f) => (f.id === saved.id ? saved : f))));
    if (isNew) {
      setAdded((current) => new Set(current).add(saved.id));
      onAdd([saved]);
    } else {
      onLibraryUpdate?.(saved);
    }
    setEditor(null);
  }

  async function handleDelete(field: PresetField) {
    if (confirmDelete !== field.id) {
      setConfirmDelete(field.id);
      return;
    }
    try {
      await deleteLibraryField(field.id);
      setLibrary((current) => (current ?? []).filter((f) => f.id !== field.id));
      onLibraryDelete?.(field.id);
      setConfirmDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("preset.errorDelete"));
    }
  }

  const renderRow = (field: PresetField, own?: boolean) => {
    const taken = isTaken(field);
    return (
      <li key={field.id} className="flex items-center gap-2 rounded-md border border-border-soft bg-surface px-3 py-2" data-add-field-row={field.id}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-label font-semibold text-text">{fieldName(field, language)}</p>
          <p className="truncate text-caption text-text-muted">
            {t(`presetFieldType.${field.type}`)}
            {field.options.length > 0 && ` · ${t("presetField.optionCount", { count: field.options.length })}`}
          </p>
        </div>
        {own && (
          <>
            <button type="button" aria-label={t("presetField.editAria", { name: field.name })} onClick={() => setEditor({ field })} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text">
              <Pencil size={14} />
            </button>
            <button
              type="button"
              aria-label={confirmDelete === field.id ? t("preset.deleteConfirm") : t("presetField.deleteAria", { name: field.name })}
              onClick={() => handleDelete(field)}
              onBlur={() => setConfirmDelete((c) => (c === field.id ? null : c))}
              className={cn("grid h-8 shrink-0 place-items-center rounded-md px-2 text-caption font-medium hover:bg-surface-soft", confirmDelete === field.id ? "w-auto text-danger" : "w-8 text-text-muted hover:text-danger")}
            >
              {confirmDelete === field.id ? t("preset.deleteConfirm") : <Trash2 size={14} />}
            </button>
          </>
        )}
        <Button type="button" size="sm" variant={taken ? "ghost" : "outline"} disabled={taken} onClick={() => pick(field)} data-add-field={field.id}>
          {taken ? <Check size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
          {taken ? t("presetField.added") : t("presetField.add")}
        </Button>
      </li>
    );
  };

  const hasCatalog = recommended.length + others.length > 0;

  return (
    <>
    <Modal onClose={onClose} labelledBy="add-field-title">
      <div onClick={(event) => event.stopPropagation()} className="flex max-h-[92dvh] w-full max-w-xl flex-col rounded-lg border border-border bg-surface shadow-pop">
        <div className="flex items-start justify-between gap-3 border-b border-border-soft px-4 py-3">
          <div>
            <h2 id="add-field-title" className="text-h3 font-semibold text-text">
              {t("presetField.addTitle")}
            </h2>
            <p className="text-caption text-text-secondary">{t("presetField.addHint")}</p>
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
              className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditor({ field: null })} data-create-field>
            <Plus size={14} aria-hidden />
            {t("presetField.createNew")}
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {recommended.length > 0 && (
            <section aria-label={t("presetField.recommended")}>
              <h3 className="mb-2 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("presetField.recommended")}</h3>
              <ul className="space-y-1.5">{recommended.map((f) => renderRow(f))}</ul>
            </section>
          )}
          <section aria-label={t("presetField.mine")}>
            <h3 className="mb-2 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("presetField.mine")}</h3>
            {!user ? (
              <p className="text-caption text-text-muted">{t("preset.pickLoginRequired")}</p>
            ) : library === null ? (
              <p className="text-caption text-text-muted">{t("common.loading")}</p>
            ) : mine.length === 0 ? (
              <p className="text-caption text-text-muted">{t("presetField.mineEmpty")}</p>
            ) : (
              <ul className="space-y-1.5">{mine.map((f) => renderRow(f, true))}</ul>
            )}
          </section>
          {others.length > 0 && (
            <section aria-label={t("presetField.others")}>
              <h3 className="mb-2 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("presetField.others")}</h3>
              <ul className="space-y-1.5">{others.map((f) => renderRow(f))}</ul>
            </section>
          )}
          {!hasCatalog && mine.length === 0 && q && <p className="text-small text-text-muted">{t("presetField.noMatch")}</p>}
          {error && (
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end border-t border-border-soft px-4 py-3">
          <Button type="button" onClick={onClose}>
            {t("presetField.done")}
          </Button>
        </div>
      </div>

    </Modal>
    {/* Rendered beside, not inside, the Modal: React events bubble through the tree and would hit this backdrop's onClick. */}
    {editor && <FieldEditorModal initial={editor.field} contentType={contentType} onSave={handleEditorSave} onClose={() => setEditor(null)} />}
    </>
  );
}

/** Looks a field up by id in the catalog — handy for callers restoring a stored selection. */
export function catalogFieldById(id: string): PresetField | undefined {
  return getCatalogField(id);
}
