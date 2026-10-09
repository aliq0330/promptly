"use client";

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { PresetLists, type PresetListTab } from "@/features/presets/preset-picker";
import { PresetPreviewModal } from "@/features/presets/preset-preview-modal";
import type { ContentTypeId } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Preset } from "@/types";

/**
 * "Hazır ayar seç" on the Üret page: the same Topluluk / Kaydettiklerim lists
 * the Prompt form's panel uses (`PresetLists`), for presets of the media type
 * being generated. Picking one only sets the starting parameters — the page
 * keeps them editable.
 */
export function GeneratePresetPicker({ contentType, onPick, onClose }: { contentType: ContentTypeId; onPick: (preset: Preset) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PresetListTab>("community");
  const [previewing, setPreviewing] = useState<Preset | null>(null);
  const [savedVersion, setSavedVersion] = useState(0);

  const tabs: { key: PresetListTab; label: string }[] = [
    { key: "community", label: t("extra.tabCommunity") },
    { key: "saved", label: t("extra.tabSaved") },
  ];

  return (
    <>
      <Modal onClose={onClose} labelledBy="generate-preset-picker-title">
        <div
          role="document"
          onClick={(event) => event.stopPropagation()}
          className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-pop"
        >
          <div className="flex items-center gap-2 border-b border-border-soft px-4 py-3">
            <SlidersHorizontal size={18} className="shrink-0 text-primary" aria-hidden />
            <h2 id="generate-preset-picker-title" className="min-w-0 flex-1 text-h3 font-semibold text-text">
              {t("generate.presetBrowse")}
            </h2>
            <button type="button" aria-label={t("common.close")} onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text">
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <Tabs variant="segmented" ariaLabel={t("extra.presets")} active={tab} onChange={setTab} items={tabs} />
            <PresetLists
              tab={tab}
              contentType={contentType}
              onApply={(bundle) => bundle.preset && onPick(bundle.preset)}
              onPreview={setPreviewing}
              savedVersion={savedVersion}
              onSavedChange={() => setSavedVersion((v) => v + 1)}
            />
          </div>
        </div>
      </Modal>
      {previewing && (
        <PresetPreviewModal
          preset={previewing}
          onClose={() => setPreviewing(null)}
          onApply={() => onPick(previewing)}
          onSavedChange={() => setSavedVersion((v) => v + 1)}
        />
      )}
    </>
  );
}
