"use client";

import { useRef } from "react";
import { Camera, Check } from "lucide-react";
import { CommunityCover } from "@/features/communities/community-cover";
import { COMMUNITY_COVER_COLORS, normalizeCoverColor, type CoverMode } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

export const ACCEPTED_COVER_TYPES = ["image/jpeg", "image/png", "image/webp"];

const MODES: { mode: CoverMode; labelKey: TranslationKey }[] = [
  { mode: "auto", labelKey: "groups.cover.auto" },
  { mode: "color", labelKey: "groups.cover.color" },
  { mode: "photo", labelKey: "groups.cover.photo" },
];

/**
 * Cover settings of a community (docs/history/191-*): a live preview of the band and the three ways to fill it —
 * AUTOMATIC (follows the community picture, the default), a COLOUR (hand-picked swatch or any colour) or a PHOTO
 * (cropped to a wide strip and shrunk automatically on upload). Controlled: the settings form owns the state and saves it.
 */
export function CommunityCoverPicker({
  mode,
  onModeChange,
  color,
  onColorChange,
  photoPreviewUrl,
  savedPhotoUrl,
  avatarUrl,
  onPickPhoto,
  error,
  disabled,
}: {
  mode: CoverMode;
  onModeChange: (mode: CoverMode) => void;
  color: string;
  onColorChange: (color: string) => void;
  /** Object URL of a just-picked, not yet uploaded photo. */
  photoPreviewUrl: string | null;
  /** The photo that is saved now (shown until a new one is picked). */
  savedPhotoUrl: string | null;
  avatarUrl: string | null;
  onPickPhoto: (file: File | undefined) => void;
  error: string | null;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const normalized = normalizeCoverColor(color) ?? COMMUNITY_COVER_COLORS[0];
  const shownPhoto = photoPreviewUrl ?? savedPhotoUrl;

  return (
    <fieldset className="space-y-3" data-cover-picker>
      <legend className="text-label font-semibold text-text">{t("groups.cover.title")}</legend>
      <p className="text-caption text-text-muted">{t("groups.cover.help")}</p>

      <div className="overflow-hidden rounded-xl border border-border-soft">
        <CommunityCover coverUrl={mode === "photo" ? shownPhoto : null} coverColor={mode === "color" ? normalized : null} avatarUrl={avatarUrl} />
      </div>

      <div role="radiogroup" aria-label={t("groups.cover.modesAria")} className="inline-flex gap-1 rounded-full bg-surface-soft p-1">
        {MODES.map((option) => (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={mode === option.mode}
            disabled={disabled}
            onClick={() => onModeChange(option.mode)}
            className={cn(
              "h-9 rounded-full px-4 text-label font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50",
              mode === option.mode ? "bg-surface text-text shadow-xs" : "text-text-muted hover:text-text",
            )}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>

      {mode === "color" && (
        <div className="flex flex-wrap items-center gap-2">
          {COMMUNITY_COVER_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              disabled={disabled}
              onClick={() => onColorChange(swatch)}
              aria-label={t("groups.cover.swatchAria", { color: swatch })}
              aria-pressed={normalized === swatch}
              data-cover-swatch={swatch}
              // The swatch IS the colour the community can choose (user content), not a design token.
              style={{ backgroundColor: swatch }}
              className="relative flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 aria-pressed:ring-2 aria-pressed:ring-text"
            >
              {normalized === swatch && <Check size={16} className="text-white" aria-hidden />}
            </button>
          ))}
          <label className="ml-1 inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border-soft px-3 text-label font-medium text-text-secondary hover:border-border">
            <input
              type="color"
              value={normalized}
              disabled={disabled}
              onChange={(event) => onColorChange(event.target.value)}
              aria-label={t("groups.cover.customAria")}
              data-cover-custom
              className="h-5 w-5 cursor-pointer rounded-full border-0 bg-transparent p-0"
            />
            {t("groups.cover.custom")}
          </label>
        </div>
      )}

      {mode === "photo" && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            data-cover-pick
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface px-4 text-label font-semibold text-text hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            <Camera size={15} aria-hidden /> {shownPhoto ? t("groups.cover.photoChange") : t("groups.cover.photoPick")}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_COVER_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              onPickPhoto(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <p className="text-caption text-text-muted">{t("groups.cover.photoHint")}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
