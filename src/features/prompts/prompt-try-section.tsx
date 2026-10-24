"use client";

import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { ScrollRow } from "@/components/ui/scroll-row";
import { StorageImg } from "@/components/ui/storage-media";
import { useAuth } from "@/features/auth/auth-provider";
import { RunButton } from "@/features/content/run-with-ai";
import { DetailSection } from "@/features/content/detail-parts";
import { FinalPromptPreview } from "@/features/presets/final-prompt-preview";
import { FitBadge } from "@/features/presets/preset-fit-badge";
import { CopyPromptButton } from "@/features/prompts/copy-prompt-button";
import { OpenInStudioButton } from "@/features/studio/open-in-studio-button";
import { StudioFieldSwitches } from "@/features/studio/studio-field-switches";
import { composePromptParts, sanitizeSelection } from "@/lib/preset-fields";
import { fieldAvailable, rankPresetsByFit, targetOfPrompt } from "@/lib/preset-fit";
import { presetParameterCount, resolvePresetFields } from "@/lib/preset-utils";
import { joinPromptParts } from "@/lib/prompt-parts";
import { fetchRecentPresets, fetchSavedPresets } from "@/lib/supabase/presets";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { Preset, Prompt } from "@/types";

const RECENT_TTL_MS = 3 * 60 * 1000;
const RECENT_LIMIT = 60;
const SHOWN = 8;
let recentCache: { items: Preset[]; at: number } | null = null;
let savedCache: { userId: string; items: Preset[]; at: number } | null = null;

const fresh = (at: number) => Date.now() - at < RECENT_TTL_MS;

/** Public presets + the viewer's saved ones, each kept a few minutes (Back and the next prompt do not refetch). A user change reloads the page, which clears these. */
async function loadCandidates(userId: string | null): Promise<Preset[]> {
  let recent = recentCache && fresh(recentCache.at) ? recentCache.items : null;
  if (!recent) {
    recent = (await fetchRecentPresets(RECENT_LIMIT)).items;
    recentCache = { items: recent, at: Date.now() };
  }
  let saved: Preset[] = [];
  if (userId) {
    if (savedCache && savedCache.userId === userId && fresh(savedCache.at)) saved = savedCache.items;
    else {
      saved = await fetchSavedPresets(userId).catch(() => [] as Preset[]);
      savedCache = { userId, items: saved, at: Date.now() };
    }
  }
  const seen = new Set<string>();
  return [...recent, ...saved].filter((preset) => !seen.has(preset.id) && seen.add(preset.id));
}

/**
 * "Hazır ayarla dene" on a prompt page (docs/history/228-*): presets that fit THIS prompt (`presetFit`: same type, then category and
 * recommended tool), the final text with the chosen preset applied, and three ways on — Studio with both, copy the adjusted text,
 * or copy-and-open in the recommended tool. Nothing is drawn while loading or when no preset fits.
 */
export function PromptTrySection({ prompt, text }: { prompt: Prompt; text: string }) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [candidates, setCandidates] = useState<Preset[] | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [offFields, setOffFields] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadCandidates(userId)
      .then((items) => !cancelled && setCandidates(items))
      .catch((error) => {
        console.error("PromptTrySection", error);
        if (!cancelled) setCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const ranked = useMemo(() => (candidates ? rankPresetsByFit(targetOfPrompt(prompt), candidates).slice(0, SHOWN) : []), [candidates, prompt]);
  const current = ranked.find((row) => row.preset.id === pickedId) ?? ranked[0] ?? null;
  const preset = current?.preset ?? null;

  const fields = useMemo(() => (preset ? resolvePresetFields({ fields: preset.fields, selection: preset.selection }) : []), [preset]);
  const unavailable = useMemo(() => fields.filter((field) => !fieldAvailable(field.id, prompt.tools)).map((field) => field.id), [fields, prompt.tools]);
  const active = useMemo(() => fields.filter((field) => !unavailable.includes(field.id) && !offFields.includes(field.id)), [fields, unavailable, offFields]);
  const parts = useMemo(
    () => (preset ? composePromptParts(text, sanitizeSelection(preset.selection, active), active, language) : []),
    [preset, text, active, language],
  );

  if (!preset || !current) return null;
  const composed = joinPromptParts(parts);
  const studioKinds = prompt.contentType === "image" || prompt.contentType === "text";

  return (
    <DetailSection id="prompt-try" title={t("promptTry.title")}>
      <p className="text-small text-text-secondary">{t("promptTry.hint")}</p>
      <ScrollRow role="radiogroup" aria-label={t("promptTry.listAria")} className="-mx-3 gap-2 px-3 sm:mx-0 sm:px-0">
        {ranked.map(({ preset: item, fit }) => {
          const selected = item.id === preset.id;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selected}
              data-preset-option={item.id}
              onClick={() => {
                setPickedId(item.id);
                setOffFields([]);
              }}
              className={cn(
                "flex w-44 shrink-0 flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors duration-200",
                selected ? "border-primary bg-primary-soft/40 ring-1 ring-primary" : "border-border-soft bg-surface hover:border-border-strong",
              )}
            >
              {item.coverUrl ? (
                <StorageImg src={item.coverUrl} alt="" className="h-10 w-10 rounded-md bg-surface-soft object-cover" />
              ) : (
                <span aria-hidden className="grid h-10 w-10 place-items-center rounded-md bg-primary-soft text-primary">
                  <SlidersHorizontal size={18} />
                </span>
              )}
              <span className="text-small font-semibold leading-snug text-text">{item.title}</span>
              <span className="text-caption text-text-muted">{t("preset.paramCount", { count: presetParameterCount(item) })}</span>
              <FitBadge fit={fit} preset={item} />
            </button>
          );
        })}
      </ScrollRow>
      <p className="text-caption text-text-muted">{t("promptTry.rankHint")}</p>
      <StudioFieldSwitches
        fields={fields}
        selection={preset.selection}
        off={offFields}
        unavailable={unavailable}
        onToggle={(id) => setOffFields((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))}
      />
      <FinalPromptPreview parts={parts} label={t("promptTry.preview")} />
      <div className="flex flex-wrap items-center gap-2">
        {studioKinds && <OpenInStudioButton kind="prompt" id={prompt.id} presetId={preset.id} label={t("promptTry.openStudio")} primary />}
        <CopyPromptButton text={composed} promptId={prompt.id} label={t("promptTry.copy")} size="md" variant="outline" />
        <RunButton text={composed} recommendedRefs={prompt.tools} promptId={prompt.id} />
      </div>
    </DetailSection>
  );
}
