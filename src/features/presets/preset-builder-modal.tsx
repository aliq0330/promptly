"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { TaxonomyPicker } from "@/features/content/taxonomy-picker";
import type { ContentTypeId } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { sanitizeSelection, type PresetField, type PresetSelection } from "@/lib/preset-fields";
import { adoptForPreset } from "@/lib/preset-utils";
import { savePreset } from "@/lib/supabase/presets";
import { cn } from "@/lib/utils";
import { PresetFieldsBuilder } from "./preset-fields-builder";
import { useRealPresets } from "./real-presets-provider";

const INPUT =
  "w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * "+ Hazır Ayar Oluştur" / "Yeni hazır ayar olarak kaydet" from inside the
 * prompt form: a compact builder (name, description, category, fields +
 * options, visibility) that saves a real preset and hands its id back. `seed`
 * pre-fills it with the form's current fields and choices (platform fields are
 * turned into the user's own editable copies first).
 */
export function PresetBuilderModal({
  contentType,
  category: initialCategory,
  subcategory: initialSubcategory,
  tools,
  seed,
  onSaved,
  onClose,
}: {
  contentType: ContentTypeId;
  category: string | null;
  subcategory: string | null;
  tools: string[];
  seed?: { fields: PresetField[]; selection: PresetSelection };
  onSaved: (presetId: string) => void;
  onClose: () => void;
}) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const { reload } = useRealPresets();
  const adopted = useMemo(() => (seed ? adoptForPreset(seed.fields, seed.selection, language) : { fields: [] as PresetField[], selection: {} as PresetSelection }), [seed, language]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string | null>(initialCategory);
  const [subcategory, setSubcategory] = useState<string | null>(initialSubcategory);
  const [fields, setFields] = useState<PresetField[]>(adopted.fields);
  const [selection, setSelection] = useState<PresetSelection>(adopted.selection);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!user || saving) return;
    if (title.trim().length < 3) return setError(t("preset.errorTitle"));
    if (fields.length === 0) return setError(t("presetBuilder.errorNoFields"));
    setSaving(true);
    setError(null);
    try {
      const id = await savePreset(
        {
          id: null,
          title,
          description,
          coverUrl: null,
          contentType,
          category,
          subcategory,
          tools,
          fields,
          selection: sanitizeSelection(selection, fields),
          tags: [],
          status: "published",
          visibility,
        },
        user.id,
      );
      reload();
      onSaved(id);
    } catch (err) {
      console.error("PresetBuilderModal", err);
      setError(err instanceof Error && err.message ? err.message : t("preset.errorSave"));
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="preset-builder-title">
      <div onClick={(event) => event.stopPropagation()} className="flex max-h-[94dvh] w-full max-w-2xl flex-col rounded-lg border border-border bg-surface shadow-pop">
        <div className="flex items-start justify-between gap-3 border-b border-border-soft px-4 py-3">
          <div>
            <h2 id="preset-builder-title" className="text-h3 font-semibold text-text">
              {t("presetBuilder.title")}
            </h2>
            <p className="text-caption text-text-secondary">{t("presetBuilder.hint")}</p>
          </div>
          <button type="button" aria-label={t("common.close")} onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text">
            <X size={16} />
          </button>
        </div>

        {!user ? (
          <p className="px-4 py-8 text-center text-small text-text-secondary">{t("preset.pickLoginRequired")}</p>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
              <div>
                <label htmlFor="builder-name" className="mb-1.5 block text-label font-medium text-text">
                  {t("preset.titleLabel")} <span className="text-danger">*</span>
                </label>
                <input id="builder-name" value={title} maxLength={120} autoFocus onChange={(event) => setTitle(event.target.value)} placeholder={t("preset.titlePlaceholder")} className={cn(INPUT, "h-10")} />
              </div>
              <div>
                <label htmlFor="builder-desc" className="mb-1.5 block text-label font-medium text-text">
                  {t("preset.descriptionLabel")} <span className="text-text-muted">({t("common.optional")})</span>
                </label>
                <textarea id="builder-desc" rows={2} value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} placeholder={t("preset.descriptionPlaceholder")} className={cn(INPUT, "resize-none py-2")} />
              </div>

              <TaxonomyPicker
                lockContentType
                value={{ contentType, category, subcategory }}
                onChange={(next) => {
                  setCategory(next.category);
                  setSubcategory(next.subcategory);
                }}
              />

              <PresetFieldsBuilder
                contentType={contentType}
                category={category}
                subcategory={subcategory}
                tools={tools}
                fields={fields}
                selection={selection}
                onChange={(nextFields, nextSelection) => {
                  setFields(nextFields);
                  setSelection(nextSelection);
                }}
              />

              <fieldset>
                <legend className="mb-1.5 text-label font-medium text-text">{t("preset.visibilityLabel")}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["public", "private"] as const).map((value) => (
                    <label key={value} className={cn("flex cursor-pointer flex-col gap-0.5 rounded-md border p-3 transition-colors", visibility === value ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-surface-soft")}>
                      <span className="flex items-center gap-2 text-label font-semibold text-text">
                        <input type="radio" name="builder-visibility" checked={visibility === value} onChange={() => setVisibility(value)} />
                        {value === "public" ? t("preset.visPublic") : t("preset.visPrivate")}
                      </span>
                      <span className="pl-6 text-caption text-text-secondary">{value === "public" ? t("preset.visPublicHint") : t("preset.visPrivateHint")}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {error && (
                <p role="alert" className="text-small text-danger">
                  {error}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border-soft px-4 py-3">
              <Button type="button" variant="ghost" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving} data-save-preset>
                {saving ? t("common.saving") : t("preset.publish")}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
