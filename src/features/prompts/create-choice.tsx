"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowRight, CircleFadingPlus, Megaphone, SlidersHorizontal, Sparkles, SquareTerminal, Workflow } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { SpacesIcon } from "@/features/spaces/space-visuals";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { ShareExistingModal } from "./share-existing-modal";

/**
 * The picker shown when a user hits a bare "Oluştur" entry point (nav,
 * empty states, etc.) — creation branches into "Prompt oluştur" (existing
 * flow, `/create?mode=prompt`), "Generator oluştur" (Generator Builder
 * module, `/generators/create`) and "İstek oluştur" (`/requests/new`).
 * Deep links that already carry intent (`?duplicate=`, `?answerRequest=`,
 * `?edit=`, `?generatorRun=`, or `?mode=`) skip this screen entirely — see
 * create-gate.tsx.
 */
const OPTIONS = [
  {
    href: "/create?mode=prompt",
    icon: SquareTerminal,
    titleKey: "create.promptTitle" as TranslationKey,
    bodyKey: "create.promptBody" as TranslationKey,
    hintKey: "create.promptHint" as TranslationKey,
  },
  {
    href: "/requests/new",
    icon: Sparkles,
    titleKey: "create.requestTitle" as TranslationKey,
    bodyKey: "create.requestBody" as TranslationKey,
    hintKey: "create.requestHint" as TranslationKey,
  },
  {
    href: "/workflows/create",
    icon: Workflow,
    titleKey: "create.workflowTitle" as TranslationKey,
    bodyKey: "create.workflowBody" as TranslationKey,
    hintKey: "create.workflowHint" as TranslationKey,
  },
  {
    href: "/presets/create",
    icon: SlidersHorizontal,
    titleKey: "create.presetTitle" as TranslationKey,
    bodyKey: "create.presetBody" as TranslationKey,
    hintKey: "create.presetHint" as TranslationKey,
  },
  // Hikâye (docs/history/198-*): 24 saatlik paylaşım; topluluk bağlamı kendi hedef kitlesi olarak taşınır.
  {
    href: "/stories/create",
    icon: CircleFadingPlus,
    titleKey: "create.storyTitle" as TranslationKey,
    bodyKey: "create.storyBody" as TranslationKey,
    hintKey: "create.storyHint" as TranslationKey,
  },
  // Space (docs/history/215-*): yaratıcı proje; Spaces sayfasında oluşturma penceresiyle açılır, sonra akışta gönderi olarak paylaşılabilir.
  {
    href: "/spaces?new=1",
    icon: SpacesIcon,
    titleKey: "create.spaceTitle" as TranslationKey,
    bodyKey: "create.spaceBody" as TranslationKey,
    hintKey: "create.spaceHint" as TranslationKey,
  },
] as const;

/** A weekly theme's `?tag=` is carried into whichever type is picked (each form attaches it, see `usePrefillTag`). */
function withParam(href: string, name: string, value: string | null): string {
  if (!value) return href;
  return `${href}${href.includes("?") ? "&" : "?"}${name}=${encodeURIComponent(value)}`;
}

export function CreateChoice() {
  const { t } = useTranslation();
  const params = useSearchParams();
  const tag = params.get("tag");
  // Topluluk bağlamı seçilen türe de taşınır: içerik o toplulukta yerel gönderi olarak yayınlanır.
  const community = params.get("community");
  const { user } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const [shareExisting, setShareExisting] = useState(false);
  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-8 sm:px-5 sm:py-12 lg:px-8">
      <div className="mb-8 space-y-2 text-center">
        <p className="text-caption font-semibold uppercase tracking-[0.08em] text-primary">{t("create.eyebrow")}</p>
        <h1 className="text-h1 font-semibold text-text">{t("create.title")}</h1>
        <p className="mx-auto max-w-lg text-small text-text-muted">{t("create.subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {OPTIONS.map((option) => (
          <Link
            key={option.href}
            href={option.href.startsWith("/spaces") ? option.href : withParam(withParam(option.href, "tag", tag), "community", community)}
            className="group flex flex-col items-start gap-3 rounded-lg border border-border-soft bg-surface p-5 text-left shadow-card transition-[border-color,box-shadow] duration-200 hover:border-primary/40 hover:shadow-card-hover"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary-soft text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
              <option.icon size={20} strokeWidth={1.9} />
            </span>
            <span className="flex w-full items-center justify-between gap-2 text-h3 font-semibold text-text">
              {t(option.titleKey)}
              <ArrowRight size={16} className="text-text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
            </span>
            <span className="text-small text-text-muted">{t(option.bodyKey)}</span>
            <span className="mt-auto pt-1 text-caption font-medium text-text-secondary">{t(option.hintKey)}</span>
          </Link>
        ))}
      </div>

      {/* Yeni içerik değil: var olan bir içeriği topluluklarda duyur (aynı Paylaş satırı). */}
      <button
        type="button"
        onClick={() => requireAuth("create") && setShareExisting(true)}
        data-create-share-existing=""
        className="group mt-3 flex w-full items-center gap-3 rounded-lg border border-dashed border-border bg-surface/60 p-4 text-left transition-colors duration-200 hover:border-primary/40 sm:mt-4"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Megaphone size={18} strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-small font-semibold text-text">{t("create.shareExistingTitle")}</span>
          <span className="block text-caption text-text-muted">{t("create.shareExistingBody")}</span>
        </span>
        <ArrowRight size={16} className="shrink-0 text-text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
      </button>
      {shareExisting && user && <ShareExistingModal userId={user.id} onClose={() => setShareExisting(false)} />}
    </div>
  );
}
