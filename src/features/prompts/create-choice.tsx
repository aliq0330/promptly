"use client";

import Link from "next/link";
import { ArrowRight, Blocks, Sparkles, SquareTerminal, Workflow } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

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
    href: "/generators/create",
    icon: Blocks,
    titleKey: "create.generatorTitle" as TranslationKey,
    bodyKey: "create.generatorBody" as TranslationKey,
    hintKey: "create.generatorHint" as TranslationKey,
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
] as const;

export function CreateChoice() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-8 sm:px-5 sm:py-12 lg:px-8">
      <div className="mb-8 space-y-2 text-center">
        <p className="text-caption font-semibold uppercase tracking-[0.08em] text-primary">{t("create.eyebrow")}</p>
        <h1 className="text-h1 font-semibold text-text">{t("create.title")}</h1>
        <p className="mx-auto max-w-lg text-small text-text-muted">{t("create.subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {OPTIONS.map((option) => (
          <Link
            key={option.href}
            href={option.href}
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
    </div>
  );
}
