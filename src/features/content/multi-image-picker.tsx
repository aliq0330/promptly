"use client";

import { useId } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, X } from "lucide-react";
import { resizeImageToDataUrlFit } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { MultiImageItem } from "@/lib/supabase/media-input";

export type { MultiImageItem };

/**
 * Shared multi-image picker used by all four creation flows (Prompt,
 * Prompt İsteği, Generator, Workflow) — an ordered, removable, reorderable
 * grid of staged images plus an "add" tile. Purely a local, in-memory
 * ordered list; it never talks to Supabase itself (see each form's own
 * submit handler for what happens to `.file`/`.existingId` per content
 * type — `prompts.ts`/`requests.ts`/`generators.ts`/`workflows.ts`'s shared
 * `MediaInput`/`resolveMediaInputs`).
 */
export function MultiImagePicker({
  items,
  onChange,
  max = 6,
  previewMaxDimension = 720,
  disabled,
  label,
  hint,
}: {
  items: MultiImageItem[];
  onChange: (items: MultiImageItem[]) => void;
  max?: number;
  previewMaxDimension?: number;
  disabled?: boolean;
  label?: string;
  hint?: string;
}) {
  const { t } = useTranslation();
  const inputId = useId();

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const room = Math.max(0, max - items.length);
    const files = Array.from(fileList).slice(0, room);
    const added: MultiImageItem[] = [];
    for (const file of files) {
      try {
        const resized = await resizeImageToDataUrlFit(file, previewMaxDimension);
        added.push({ key: `${Date.now()}-${added.length}-${file.name}`, url: resized.url, width: resized.width, height: resized.height, file });
      } catch {
        // A single bad file (corrupt/unsupported) is skipped rather than failing the whole batch.
      }
    }
    if (added.length > 0) onChange([...items, ...added]);
  }

  function remove(key: string) {
    onChange(items.filter((item) => item.key !== key));
  }

  function move(key: string, direction: -1 | 1) {
    const index = items.findIndex((item) => item.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    const next = items.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  const canAddMore = items.length < max;

  return (
    <div>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-text">
          {label} <span className="text-text-muted">({t("common.optional")})</span>
        </label>
      )}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {items.map((item, index) => (
          <figure key={item.key} className="relative aspect-square overflow-hidden rounded-md border border-border bg-surface-soft">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview data URL or an already-stored real URL, never a next/image-optimizable remote asset list */}
            <img src={item.url} alt="" className="h-full w-full object-cover" draggable={false} />
            <button
              type="button"
              onClick={() => remove(item.key)}
              disabled={disabled}
              aria-label={t("media.removeImage")}
              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/85 disabled:opacity-50"
            >
              <X size={15} />
            </button>
            {items.length > 1 && (
              <div className="absolute inset-x-1 bottom-1 flex justify-between">
                <button
                  type="button"
                  onClick={() => move(item.key, -1)}
                  disabled={disabled || index === 0}
                  aria-label={t("media.moveLeft")}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/85 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => move(item.key, 1)}
                  disabled={disabled || index === items.length - 1}
                  aria-label={t("media.moveRight")}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/85 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
            {index === 0 && items.length > 1 && (
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[0.65rem] font-medium text-white">
                {t("media.coverBadge")}
              </span>
            )}
          </figure>
        ))}
        {canAddMore && (
          <label
            htmlFor={inputId}
            className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-strong bg-surface-soft text-text-secondary hover:border-primary"
          >
            <ImagePlus size={18} strokeWidth={1.75} />
            <span className="text-[0.7rem] font-medium">{t("media.addImages")}</span>
            <input
              id={inputId}
              type="file"
              accept="image/*"
              multiple
              disabled={disabled}
              className="sr-only"
              onChange={(event) => {
                void handleFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      <p className="mt-1.5 text-caption text-text-muted">{hint ?? t("media.multiImageHint", { max })}</p>
    </div>
  );
}
