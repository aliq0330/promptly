"use client";

import { CheckRow } from "@/components/ui/check-row";
import { Music } from "@/components/icons/music";
import { Video } from "@/components/icons/video";
import { ImageIcon } from "@/components/icons/image-icon";
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

const LABEL_KEYS: Record<ReferenceKind, TranslationKey> = {
  image: "prompt.requiresReferenceImageLabel",
  video: "prompt.requiresReferenceVideoLabel",
  audio: "prompt.requiresReferenceAudioLabel",
};

const NOTE_KEYS: Record<ReferenceKind, TranslationKey> = {
  image: "prompt.requiresReferenceNote",
  video: "prompt.requiresReferenceVideoNote",
  audio: "prompt.requiresReferenceAudioNote",
};

/** Form control: one checkbox per applicable reference kind. Renders nothing for text. */
export function ReferenceRequirementsField({
  contentType,
  value,
  onChange,
}: {
  contentType: PromptContentType;
  value: ReferenceRequirements;
  onChange: (next: ReferenceRequirements) => void;
}) {
  const { t } = useTranslation();
  const kinds = applicableReferenceKinds(contentType);
  if (kinds.length === 0) return null;
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">{t("prompt.requiresReferenceTitle")}</legend>
      <p className="text-caption text-text-muted">{t("prompt.requiresReferenceHint")}</p>
      {kinds.map((kind) => (
        <CheckRow key={kind} checked={value[kind]} onChange={(checked) => onChange({ ...value, [kind]: checked })} icon={ICONS[kind]} label={t(LABEL_KEYS[kind])} />
      ))}
    </fieldset>
  );
}

/** Detail-page notes for every reference the author ticked (video can show two). */
export function ReferenceRequirementNotes({
  contentType,
  value,
}: {
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
            className="flex items-start gap-2 rounded-lg card-soft px-3 py-2 text-small text-text-secondary"
          >
            <Icon size={16} className="mt-0.5 shrink-0 text-primary" />
            <span className="min-w-0 break-words">{t(NOTE_KEYS[kind])}</span>
          </p>
        );
      })}
    </div>
  );
}
