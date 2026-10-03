"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark, Check } from "lucide-react";
import { Button, buttonClassName } from "@/components/ui/button";
import { SaveToCollectionModal } from "@/features/collections/save-to-collection-modal";
import { useSaveState } from "@/features/prompts/use-save-state";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * The labelled "Kaydet" ⇄ "✓ Kaydedildi" button on a preset's detail page. It
 * is the ordinary save, not a second system: not saved → the usual "Koleksiyona
 * ekle" modal (any collection, or a new one); saved → tapping removes it from
 * every collection, exactly like the filled bookmark icon. Saved presets are
 * what the Prompt form's "Kaydettiklerim" tab lists.
 */
export function PresetSaveCta({
  presetId,
  saveCount,
  size = "lg",
  onChange,
}: {
  presetId: string;
  saveCount: number;
  size?: "sm" | "lg";
  /** Called after the saved state changed (so a list of saved presets can reload). */
  onChange?: () => void;
}) {
  const { t } = useTranslation();
  const { isSaved, removeEverywhere, markSaved, markUnsaved, isToggling, canSave } = useSaveState(presetId, "preset", saveCount);
  const [modalOpen, setModalOpen] = useState(false);
  const iconSize = size === "sm" ? 14 : 18;

  if (!canSave) {
    return (
      <Link href="/login" className={buttonClassName({ size })}>
        <Bookmark size={iconSize} aria-hidden />
        {t("preset.save")}
      </Link>
    );
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={isSaved ? "secondary" : "primary"}
        onClick={() => (isSaved ? void removeEverywhere().then(() => onChange?.()) : setModalOpen(true))}
        disabled={isToggling}
        aria-pressed={isSaved}
        aria-haspopup={isSaved ? undefined : "dialog"}
      >
        {isSaved ? <Check size={iconSize} aria-hidden /> : <Bookmark size={iconSize} aria-hidden />}
        {isSaved ? t("preset.saved") : t("preset.save")}
      </Button>
      {modalOpen && (
        <SaveToCollectionModal
          presetId={presetId}
          onClose={() => setModalOpen(false)}
          onAdded={() => {
            markSaved();
            onChange?.();
          }}
          onRemoved={() => {
            markUnsaved();
            onChange?.();
          }}
        />
      )}
    </>
  );
}
