"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveToCollectionModal } from "@/features/collections/save-to-collection-modal";
import { useSaveState } from "@/features/prompts/use-save-state";
import { SaveFeedbackToast } from "@/features/prompts/save-feedback-toast";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";

/**
 * The labelled "Kaydet" ⇄ "✓ Kaydedildi" button on a preset's detail page. It
 * is the ordinary save, not a second system (docs/history/336-*): not saved →
 * one tap saves it ("Kaydedilenlerin tümü") and the toast offers "Koleksiyona
 * ekle"; saved → tapping opens the collection sheet, exactly like the filled
 * bookmark icon. Saved presets are what the Prompt form's "Kaydettiklerim" tab lists.
 */
export function PresetSaveCta({
  presetId,
  saveCount,
  size = "lg",
  onChange,
  iconOnly = false,
}: {
  presetId: string;
  saveCount: number;
  size?: "sm" | "lg";
  /** Icon-only (no text) button; the label moves to aria-label. */
  iconOnly?: boolean;
  /** Called after the saved state changed (so a list of saved presets can reload). */
  onChange?: () => void;
}) {
  const { t } = useTranslation();
  const { requireAuth } = useAuthPrompt();
  const { isSaved, markSaved, markUnsaved, quickSave, saving, canSave } = useSaveState(presetId, "preset", saveCount);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<"saved" | "removed" | "failed" | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iconSize = size === "sm" ? 14 : 18;

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  function showToast(kind: "saved" | "removed" | "failed") {
    setToast(kind);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), kind === "saved" ? 4500 : 2200);
  }

  async function handleClick() {
    if (isSaved) {
      setModalOpen(true);
      return;
    }
    if (saving) return;
    if (await quickSave()) {
      showToast("saved");
      onChange?.();
    } else {
      showToast("failed");
    }
  }

  if (!canSave) {
    return (
      <Button type="button" size={size} onClick={() => requireAuth("save")} aria-haspopup="dialog" aria-label={iconOnly ? t("preset.save") : undefined} className={iconOnly ? "h-9 w-9 px-0" : undefined}>
        <Bookmark size={iconSize} aria-hidden />
        {!iconOnly && t("preset.save")}
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={isSaved ? "secondary" : "primary"}
        onClick={handleClick}
        disabled={saving}
        aria-pressed={isSaved}
        aria-haspopup={isSaved ? "dialog" : undefined}
        aria-label={iconOnly ? (isSaved ? t("preset.saved") : t("preset.save")) : undefined}
        className={iconOnly ? "h-9 w-9 px-0" : undefined}
      >
        {isSaved ? <Check size={iconSize} aria-hidden /> : <Bookmark size={iconSize} aria-hidden />}
        {!iconOnly && (isSaved ? t("preset.saved") : t("preset.save"))}
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
            showToast("removed");
            onChange?.();
          }}
        />
      )}
      {toast && (
        <SaveFeedbackToast
          message={toast === "saved" ? t("prompt.savedToast") : toast === "removed" ? t("prompt.removedFromSavedToast") : t("common.actionFailedRetry")}
          actionLabel={toast === "saved" ? t("prompt.addToCollection") : undefined}
          onAction={
            toast === "saved"
              ? () => {
                  setToast(null);
                  setModalOpen(true);
                }
              : undefined
          }
        />
      )}
    </>
  );
}
