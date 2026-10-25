"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Chip } from "@/components/ui/chip";
import { fieldInputClassName } from "@/components/ui/field";
import { StorageImg } from "@/components/ui/storage-media";
import { useAuth } from "@/features/auth/auth-provider";
import { FinalPromptPreview } from "@/features/presets/final-prompt-preview";
import { FitBadge } from "@/features/presets/preset-fit-badge";
import { CopyPromptButton } from "@/features/prompts/copy-prompt-button";
import { OpenInStudioButton } from "@/features/studio/open-in-studio-button";
import { StudioFieldSwitches } from "@/features/studio/studio-field-switches";
import { composePromptParts, sanitizeSelection } from "@/lib/preset-fields";
import { fieldAvailable, rankPresetsByFit, targetOfPrompt, type PresetFit } from "@/lib/preset-fit";
import { resolvePresetFields } from "@/lib/preset-utils";
import { joinPromptParts } from "@/lib/prompt-parts";
import { fetchRecentPresets, fetchSavedPresets } from "@/lib/supabase/presets";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { Preset, Prompt } from "@/types";

const RECENT_TTL_MS = 3 * 60 * 1000;
const RECENT_LIMIT = 60;
let recentCache: { items: Preset[]; at: number } | null = null;
let savedCache: { userId: string; items: Preset[]; at: number } | null = null;

const fresh = (at: number) => Date.now() - at < RECENT_TTL_MS;

interface Candidates {
  items: Preset[];
  savedIds: Set<string>;
}

/** Public presets + the viewer's saved ones, each kept a few minutes (Back and the next prompt do not refetch). A user change reloads the page, which clears these. */
async function loadCandidates(userId: string | null): Promise<Candidates> {
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
  return { items: [...recent, ...saved].filter((preset) => !seen.has(preset.id) && seen.add(preset.id)), savedIds: new Set(saved.map((preset) => preset.id)) };
}

/** Presets ranked by how well they fit this prompt (`presetFit`: same type, then category and recommended tool). `ranked` is null while loading. */
function useRankedPresets(prompt: Prompt) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [candidates, setCandidates] = useState<Candidates | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadCandidates(userId)
      .then((value) => !cancelled && setCandidates(value))
      .catch((error) => {
        console.error("PromptTryButton", error);
        if (!cancelled) setCandidates({ items: [], savedIds: new Set() });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  const ranked = useMemo(() => (candidates ? rankPresetsByFit(targetOfPrompt(prompt), candidates.items) : null), [candidates, prompt]);
  return { ranked, savedIds: candidates?.savedIds ?? new Set<string>(), userId };
}

/**
 * "Hazır ayarla dene" (docs/history/229-*, replaces the inline section of 228): a quiet button with the number of presets that fully fit this prompt;
 * the list, final text and Studio/copy actions live in the sheet it opens. Nothing is drawn while loading or when no preset fits.
 */
export function PromptTryButton({ prompt, text, className }: { prompt: Prompt; text: string; className?: string }) {
  const { t } = useTranslation();
  const { ranked, savedIds, userId } = useRankedPresets(prompt);
  const [open, setOpen] = useState(false);
  if (!ranked || ranked.length === 0) return null;
  const matches = ranked.filter((row) => row.fit.level === "match").length;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <SlidersHorizontal size={16} aria-hidden className="text-primary" />
        {t("promptTry.title")}
        {matches > 0 && (
          <span data-fit-count aria-label={t("promptTry.countAria", { count: matches })} className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-caption font-bold text-primary-foreground">
            {matches}
          </span>
        )}
      </button>
      {open && <PromptTrySheet prompt={prompt} text={text} ranked={ranked} savedIds={savedIds} userId={userId} onClose={() => setOpen(false)} />}
    </>
  );
}

type Filter = "fit" | "saved" | "mine";

function PromptTrySheet({
  prompt,
  text,
  ranked,
  savedIds,
  userId,
  onClose,
}: {
  prompt: Prompt;
  text: string;
  ranked: { preset: Preset; fit: PresetFit }[];
  savedIds: Set<string>;
  userId: string | null;
  onClose: () => void;
}) {
  const { t, language } = useTranslation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter | null>(() => (ranked.some((row) => row.fit.level === "match") ? "fit" : null));
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [offFields, setOffFields] = useState<string[]>([]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ranked.filter(({ preset, fit }) => {
      if (needle && !preset.title.toLowerCase().includes(needle)) return false;
      if (filter === "fit") return fit.level === "match";
      if (filter === "saved") return savedIds.has(preset.id);
      if (filter === "mine") return userId !== null && preset.creator.id === userId;
      return true;
    });
  }, [ranked, query, filter, savedIds, userId]);
  const current = visible.find((row) => row.preset.id === pickedId) ?? visible[0] ?? null;
  const preset = current?.preset ?? null;

  const fields = useMemo(() => (preset ? resolvePresetFields({ fields: preset.fields, selection: preset.selection }) : []), [preset]);
  const unavailable = useMemo(() => fields.filter((field) => !fieldAvailable(field.id, prompt.tools)).map((field) => field.id), [fields, prompt.tools]);
  const active = useMemo(() => fields.filter((field) => !unavailable.includes(field.id) && !offFields.includes(field.id)), [fields, unavailable, offFields]);
  const parts = useMemo(
    () => (preset ? composePromptParts(text, sanitizeSelection(preset.selection, active), active, language) : []),
    [preset, text, active, language],
  );
  const composed = joinPromptParts(parts);
  const studioKinds = prompt.contentType === "image" || prompt.contentType === "text";
  const toggle = (next: Filter) => setFilter((value) => (value === next ? null : next));

  return (
    <Modal onClose={onClose} labelledBy="prompt-try-title">
      <div role="document" onClick={(event) => event.stopPropagation()} className="flex max-h-[88dvh] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-pop">
        <div className="px-4 pb-1 pt-3">
          <div className="flex items-center gap-2">
            <h2 id="prompt-try-title" className="min-w-0 flex-1 text-h3 font-semibold text-text">
              {t("promptTry.title")}
            </h2>
            <button type="button" aria-label={t("common.close")} onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text">
              <X size={18} />
            </button>
          </div>
          <p className="text-small text-text-secondary">{t("promptTry.hint")}</p>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4 pt-2">
          <div className="relative">
            <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search.placeholderPresets")} className={`${fieldInputClassName} pl-9`} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip selected={filter === "fit"} onClick={() => toggle("fit")}>
              {t("presetTry.onlyFit")}
            </Chip>
            {userId && (
              <>
                <Chip selected={filter === "saved"} onClick={() => toggle("saved")}>
                  {t("promptTry.filterSaved")}
                </Chip>
                <Chip selected={filter === "mine"} onClick={() => toggle("mine")}>
                  {t("promptTry.filterMine")}
                </Chip>
              </>
            )}
          </div>
          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-surface-soft p-4 text-small text-text-muted">{t("studio.noResults")}</p>
          ) : (
            <ul role="radiogroup" aria-label={t("promptTry.listAria")} className="space-y-1.5">
              {visible.map(({ preset: item, fit }) => {
                const selected = item.id === preset?.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      data-preset-option={item.id}
                      onClick={() => {
                        setPickedId(item.id);
                        setOffFields([]);
                      }}
                      className={cn(
                        "flex min-h-16 w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors duration-200",
                        selected ? "border-primary bg-primary-soft/50 ring-1 ring-primary" : "border-border-soft bg-background hover:border-border-strong hover:bg-surface-soft",
                      )}
                    >
                      {item.coverUrl ? (
                        <StorageImg src={item.coverUrl} alt="" className="h-12 w-12 shrink-0 rounded-md bg-surface-soft object-cover" />
                      ) : (
                        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-primary-soft text-primary">
                          <SlidersHorizontal size={18} />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-small font-semibold text-text">{item.title}</span>
                        <FitBadge fit={fit} preset={item} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {preset && (
            <div className="space-y-3">
              <StudioFieldSwitches
                fields={fields}
                selection={preset.selection}
                off={offFields}
                unavailable={unavailable}
                onToggle={(id) => setOffFields((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))}
              />
              <FinalPromptPreview parts={parts} label={t("promptTry.preview")} heading />
            </div>
          )}
        </div>
        {preset && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border-soft px-4 py-3">
            {studioKinds && <OpenInStudioButton kind="prompt" id={prompt.id} presetId={preset.id} label={t("promptTry.openStudio")} primary className="min-h-11 flex-1 sm:flex-none" />}
            <CopyPromptButton text={composed} promptId={prompt.id} label={t("promptTry.copy")} size="md" variant="outline" className="min-h-11 flex-1 justify-center sm:flex-none" />
          </div>
        )}
      </div>
    </Modal>
  );
}
