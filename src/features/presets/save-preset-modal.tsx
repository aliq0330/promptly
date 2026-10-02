"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button, buttonClassName } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { useRealPresets } from "./real-presets-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { presetParameterCount } from "@/lib/preset-utils";
import type { PresetField, PresetSelection } from "@/lib/preset-fields";
import { savePreset } from "@/lib/supabase/presets";
import { cn, presetHref } from "@/lib/utils";
import type { PromptContentType } from "@/types";

/**
 * "Yeni hazır ayar olarak kaydet" — turns the parameters the user just
 * tweaked into a real, new preset (name, description, visibility). Always a
 * NEW preset (the one the user started from is never overwritten), saved
 * through the same `savePreset` the Hazır Ayar editor uses.
 */
export function SavePresetModal({
  contentType,
  category,
  subcategory,
  tools,
  fields,
  selection,
  defaultTitle,
  onClose,
}: {
  contentType: PromptContentType;
  category: string | null;
  subcategory: string | null;
  tools: string[];
  fields: PresetField[];
  selection: PresetSelection;
  defaultTitle?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { reload } = useRealPresets();
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const count = presetParameterCount({ fields, selection });

  async function handleSave() {
    if (!user || saving) return;
    if (!title.trim()) {
      setError(t("preset.saveNameRequired"));
      return;
    }
    if (count === 0) {
      setError(t("preset.errorNoParameters"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = await savePreset(
        { id: null, title, description, coverUrl: null, contentType, category, subcategory, tools, fields, selection, tags: [], status: "published", visibility },
        user.id,
      );
      reload();
      setSavedId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("preset.errorSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="save-preset-title">
      <div onClick={(event) => event.stopPropagation()} className="m-auto w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-pop">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id="save-preset-title" className="text-h3 font-semibold text-text">
            {t("preset.saveAsNew")}
          </h2>
          <button type="button" aria-label={t("common.close")} onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text">
            <X size={16} />
          </button>
        </div>

        {!user ? (
          <p className="text-small text-text-secondary">{t("preset.pickLoginRequired")}</p>
        ) : savedId ? (
          <div className="space-y-3">
            <p className="text-small text-success">{t("preset.saveDone")}</p>
            <div className="flex gap-2">
              <Link href={presetHref({ id: savedId })} className={buttonClassName({})}>
                {t("preset.view")}
              </Link>
              <Button type="button" variant="ghost" onClick={onClose}>
                {t("common.close")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-caption text-text-secondary">{t("preset.saveHint", { count })}</p>
            <div>
              <label htmlFor="save-preset-name" className="mb-1 block text-label font-medium text-text">
                {t("preset.titleLabel")}
              </label>
              <input
                id="save-preset-name"
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("preset.titlePlaceholder")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="save-preset-desc" className="mb-1 block text-label font-medium text-text">
                {t("preset.descriptionLabel")}
              </label>
              <textarea
                id="save-preset-desc"
                value={description}
                maxLength={1000}
                rows={3}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("preset.descriptionPlaceholder")}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              />
            </div>
            <fieldset>
              <legend className="mb-1 text-label font-medium text-text">{t("preset.visibilityLabel")}</legend>
              <div className="flex gap-2">
                {(["public", "private"] as const).map((value) => (
                  <label
                    key={value}
                    className={cn(
                      "flex-1 cursor-pointer rounded-md border px-3 py-2 text-center text-small",
                      visibility === value ? "border-primary bg-primary-soft font-semibold text-text" : "border-border text-text-secondary",
                    )}
                  >
                    <input type="radio" name="save-preset-vis" className="sr-only" checked={visibility === value} onChange={() => setVisibility(value)} />
                    {value === "public" ? t("preset.visPublic") : t("preset.visPrivate")}
                  </label>
                ))}
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="text-small text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? t("common.saving") : t("preset.publish")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
