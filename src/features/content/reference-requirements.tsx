"use client";

import { Image as ImageIcon, Music, Video } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { PromptContentType } from "@/types";

/*
 * "Bu içerik bir referans ... ile birlikte kullanılır" — Prompt ve Generator
 * için TEK paylaşılan modül. Üç bağımsız bayrak vardır; hangilerinin sorulacağı
 * içerik türüne bağlıdır:
 *   görsel → görsel      ses → ses      video → video VE görsel (ikisi de seçilebilir)
 * Metin türünde hiçbir şey sorulmaz.
 */

export type ReferenceKind = "image" | "video" | "audio";

export interface ReferenceRequirements {
  image: boolean;
  video: boolean;
  audio: boolean;
}

export const NO_REFERENCES: ReferenceRequirements = { image: false, video: false, audio: false };

/** Which references this content type can ask for (display order). */
export function applicableReferenceKinds(contentType: PromptContentType): ReferenceKind[] {
  if (contentType === "image") return ["image"];
  if (contentType === "audio") return ["audio"];
  if (contentType === "video") return ["video", "image"];
  return [];
}

/** Drops flags that don't apply to the content type (e.g. after switching type). */
export function clampReferences(contentType: PromptContentType, value: ReferenceRequirements): ReferenceRequirements {
  const kinds = applicableReferenceKinds(contentType);
  return {
    image: kinds.includes("image") && value.image,
    video: kinds.includes("video") && value.video,
    audio: kinds.includes("audio") && value.audio,
  };
}

const ICONS = { image: ImageIcon, video: Video, audio: Music } as const;

type Subject = "prompt" | "generator";

const LABEL_KEYS: Record<Subject, Record<ReferenceKind, TranslationKey>> = {
  prompt: {
    image: "prompt.requiresReferenceImageLabel",
    video: "prompt.requiresReferenceVideoLabel",
    audio: "prompt.requiresReferenceAudioLabel",
  },
  generator: {
    image: "generator.requiresReferenceImageLabel",
    video: "generator.requiresReferenceVideoLabel",
    audio: "generator.requiresReferenceAudioLabel",
  },
};

const NOTE_KEYS: Record<Subject, Record<ReferenceKind, TranslationKey>> = {
  prompt: {
    image: "prompt.requiresReferenceNote",
    video: "prompt.requiresReferenceVideoNote",
    audio: "prompt.requiresReferenceAudioNote",
  },
  generator: {
    image: "generator.requiresReferenceImageNote",
    video: "generator.requiresReferenceVideoNote",
    audio: "generator.requiresReferenceAudioNote",
  },
};

/** Form control: one checkbox per applicable reference kind. Renders nothing for text. */
export function ReferenceRequirementsField({
  subject,
  contentType,
  value,
  onChange,
}: {
  subject: Subject;
  contentType: PromptContentType;
  value: ReferenceRequirements;
  onChange: (next: ReferenceRequirements) => void;
}) {
  const { t } = useTranslation();
  const kinds = applicableReferenceKinds(contentType);
  if (kinds.length === 0) return null;
  return (
    <fieldset className="space-y-2 rounded-lg border border-border bg-surface-soft p-3">
      <legend className="sr-only">{t("prompt.requiresReferenceTitle")}</legend>
      <p className="text-caption text-text-muted">{t("prompt.requiresReferenceHint")}</p>
      {kinds.map((kind) => {
        const Icon = ICONS[kind];
        return (
          <label key={kind} className="flex cursor-pointer items-center gap-3 py-0.5">
            <input
              type="checkbox"
              checked={value[kind]}
              onChange={(event) => onChange({ ...value, [kind]: event.target.checked })}
              className="size-4 shrink-0"
            />
            <Icon size={15} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-muted" />
            <span className="min-w-0 text-sm font-medium text-text">{t(LABEL_KEYS[subject][kind])}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** Detail-page notes for every reference the author ticked (video can show two). */
export function ReferenceRequirementNotes({
  subject,
  contentType,
  value,
}: {
  subject: Subject;
  contentType: PromptContentType;
  value: ReferenceRequirements;
}) {
  const { t } = useTranslation();
  const active = applicableReferenceKinds(contentType).filter((kind) => value[kind]);
  if (active.length === 0) return null;
  return (
    <div className="max-w-2xl space-y-1.5">
      {active.map((kind) => {
        const Icon = ICONS[kind];
        return (
          <p
            key={kind}
            className="flex items-start gap-2 rounded-lg border border-border-soft bg-surface-soft px-3 py-2 text-small text-text-secondary"
          >
            <Icon size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-primary" />
            <span className="min-w-0 break-words">{t(NOTE_KEYS[subject][kind])}</span>
          </p>
        );
      })}
    </div>
  );
}
