"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, ChevronRight, Sparkles, X } from "lucide-react";
import { Portal } from "@/components/ui/portal";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { PresetPicker } from "@/features/presets/preset-picker";
import { SavePresetModal } from "@/features/presets/save-preset-modal";
import { recordPresetUse } from "@/lib/supabase/presets";
import {
  composePrompt,
  sanitizeSelection,
  settingLabel,
  type SettingGroup,
  type SettingSelection,
} from "@/lib/prompt-extra-settings";
import type { ContentTypeId } from "@/lib/content-taxonomy";
import { SettingGroupsEditor } from "@/features/presets/setting-groups-editor";

/**
 * Trigger row + applied chips. The panel itself (mobile bottom sheet,
 * tablet/desktop centered modal) is only mounted while open, so only the
 * groups relevant to the current type/category are ever rendered.
 */
export function ExtraSettingsSection({
  contentType,
  groups,
  value,
  onChange,
  englishFragments,
  onEnglishFragmentsChange,
  promptText,
  hasTool,
  category = null,
  subcategory = null,
  tools = [],
}: {
  contentType: ContentTypeId;
  groups: SettingGroup[];
  value: SettingSelection;
  onChange: (next: SettingSelection) => void;
  englishFragments: boolean;
  onEnglishFragmentsChange: (value: boolean) => void;
  promptText: string;
  hasTool: boolean;
  /** Carried into "Yeni hazır ayar olarak kaydet" so the saved preset keeps the form's taxonomy/tools. */
  category?: string | null;
  subcategory?: string | null;
  tools?: string[];
}) {
  const { t, language } = useTranslation();
  const [open, setOpen] = useState(false);
  const applied = useMemo(() => sanitizeSelection(value, groups), [value, groups]);
  const appliedEntries = groups.flatMap((g) => {
    const option = g.options.find((o) => o.id === applied[g.id]);
    return option ? [{ groupId: g.id, label: settingLabel(option, language), groupLabel: settingLabel(g, language) }] : [];
  });
  const fragmentLanguage = englishFragments ? "en" : language;
  const composed = composePrompt(promptText, applied, groups, fragmentLanguage);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex w-full items-center gap-3 rounded-md border border-dashed border-border-strong bg-surface-soft px-3 py-2.5 text-left transition-colors hover:border-primary hover:bg-primary-soft"
      >
        <Sparkles size={18} className="shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-label font-semibold text-text">{t("extra.title")}</span>
          <span className="block text-caption text-text-secondary">{t("extra.hint")}</span>
        </span>
        {appliedEntries.length > 0 && (
          <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-caption font-semibold text-primary-foreground">
            {t("extra.count", { count: appliedEntries.length })}
          </span>
        )}
        <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden />
      </button>

      {appliedEntries.length > 0 && (
        <div className="space-y-2">
          <ul className="flex flex-wrap gap-1.5" aria-label={t("extra.selected")}>
            {appliedEntries.map((entry) => (
              <li key={entry.groupId} data-extra-chip={entry.groupId} className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-1 pl-2.5 pr-1 text-caption font-medium text-text">
                <span className="text-text-muted">{entry.groupLabel}:</span> {entry.label}
                <button
                  type="button"
                  aria-label={t("extra.removeAria", { name: entry.label })}
                  onClick={() => {
                    const next = { ...applied };
                    delete next[entry.groupId];
                    onChange(next);
                  }}
                  className="grid h-5 w-5 place-items-center rounded-full text-text-muted hover:bg-surface hover:text-text"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => onChange({})} className="px-1.5 py-1 text-caption font-medium text-text-muted underline hover:text-text">
                {t("extra.clear")}
              </button>
            </li>
          </ul>
          <div className="rounded-md border border-border-soft bg-surface-soft p-3">
            <p className="mb-1 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("extra.savedPrompt")}</p>
            <p data-extra-composed className="prompt-text whitespace-pre-wrap break-words text-small text-text">
              {composed || t("extra.emptyBase")}
            </p>
            <p className="mt-1.5 text-caption text-text-muted">{t("extra.originalKept")}</p>
          </div>
        </div>
      )}

      {open && (
        <ExtraSettingsPanel
          contentType={contentType}
          groups={groups}
          initial={applied}
          promptText={promptText}
          hasTool={hasTool}
          category={category}
          subcategory={subcategory}
          tools={tools}
          englishFragments={englishFragments}
          onEnglishFragmentsChange={onEnglishFragmentsChange}
          onClose={() => setOpen(false)}
          onApply={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ExtraSettingsPanel({
  contentType,
  groups,
  initial,
  promptText,
  hasTool,
  category,
  subcategory,
  tools,
  englishFragments,
  onEnglishFragmentsChange,
  onClose,
  onApply,
}: {
  contentType: ContentTypeId;
  groups: SettingGroup[];
  initial: SettingSelection;
  promptText: string;
  hasTool: boolean;
  category: string | null;
  subcategory: string | null;
  tools: string[];
  englishFragments: boolean;
  onEnglishFragmentsChange: (value: boolean) => void;
  onClose: () => void;
  onApply: (next: SettingSelection) => void;
}) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [draft, setDraft] = useState<SettingSelection>(initial);
  const [savingPreset, setSavingPreset] = useState(false);
  // Escape inside the nested save-preset modal must close only that modal.
  const savingPresetRef = useRef(false);
  useEffect(() => {
    savingPresetRef.current = savingPreset;
  }, [savingPreset]);
  const fragmentLanguage = englishFragments ? "en" : language;
  const composed = composePrompt(promptText, draft, groups, fragmentLanguage);
  const selectedCount = Object.keys(draft).length;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !savingPresetRef.current) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function applyPreset(selection: SettingSelection, preset: { id: string } | null) {
    // Only fills the draft — everything stays editable (a preset is a starting configuration).
    setDraft(sanitizeSelection({ ...draft, ...selection }, groups));
    if (preset && user) void recordPresetUse(preset.id, user.id);
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 animate-fade-in bg-[rgb(10_8_20/0.45)] backdrop-blur-[2px] md:flex md:items-center md:justify-center md:p-4" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="extra-settings-title"
          data-extra-panel
          onClick={(event) => event.stopPropagation()}
          className={
            "absolute inset-x-0 bottom-0 flex max-h-[90dvh] flex-col rounded-t-xl border border-b-0 border-border bg-surface shadow-pop animate-sheet-up " +
            "md:static md:inset-auto md:max-h-[85dvh] md:w-full md:max-w-lg md:rounded-lg md:border md:animate-pop-in"
          }
        >
          <div className="flex items-start gap-3 border-b border-border-soft px-4 py-3">
            <Sparkles size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 id="extra-settings-title" className="text-h3 font-semibold text-text">
                {t("extra.title")}
              </h2>
              <p className="text-caption text-text-secondary">{t("extra.hint")}</p>
            </div>
            <button type="button" aria-label={t("extra.close")} onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text">
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
            <PresetPicker contentType={contentType} onApply={applyPreset} />

            {language === "tr" && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border-soft bg-surface-soft px-3 py-2.5">
                <input type="checkbox" data-english-fragments checked={englishFragments} onChange={(e) => onEnglishFragmentsChange(e.target.checked)} className="mt-0.5" />
                <span>
                  <span className="block text-label font-semibold text-text">{t("extra.englishFragments")}</span>
                  <span className="block text-caption text-text-secondary">{t("extra.englishFragmentsHint")}</span>
                </span>
              </label>
            )}

            {hasTool && groups.some((g) => g.kind === "suffix") && <p className="rounded-md bg-primary-soft px-3 py-2 text-caption text-text-secondary">{t("extra.toolHint")}</p>}

            <SettingGroupsEditor groups={groups} selection={draft} onChange={(next) => setDraft(sanitizeSelection(next, groups))} fragmentLanguage={fragmentLanguage} />

            <section className="rounded-md border border-border-soft bg-surface-soft p-3">
              <h3 className="mb-1 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("extra.preview")}</h3>
              <p data-extra-preview className="prompt-text whitespace-pre-wrap break-words text-small text-text">
                {composed || t("extra.emptyBase")}
              </p>
            </section>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border-soft px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" onClick={() => setDraft({})} disabled={selectedCount === 0}>
                {t("extra.clear")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSavingPreset(true)} disabled={selectedCount === 0}>
                <BookmarkPlus size={16} aria-hidden />
                {t("preset.saveAsNew")}
              </Button>
            </div>
            <Button type="button" onClick={() => onApply(draft)}>
              {t("extra.apply")}
            </Button>
          </div>
        </div>
      </div>
      {savingPreset && (
        <SavePresetModal
          contentType={contentType}
          category={category}
          subcategory={subcategory}
          tools={tools}
          selection={sanitizeSelection(draft, groups)}
          onClose={() => setSavingPreset(false)}
        />
      )}
    </Portal>
  );
}
