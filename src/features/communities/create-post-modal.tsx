"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, FilePlus2, FileSymlink, SlidersHorizontal, Sparkles, SquareTerminal, Workflow as WorkflowIcon, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CommunityPostType } from "@/lib/supabase/communities";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

/** Mevcut oluşturma ekranları — ikinci bir form YOK: topluluk bağlamı yalnızca `?community=` ile taşınır. */
const CREATE_HREF: Record<CommunityPostType, string> = { prompt: "/create", request: "/requests/new", workflow: "/workflows/create", preset: "/presets/create" };
const TYPES: { type: CommunityPostType; icon: LucideIcon; label: TranslationKey }[] = [
  { type: "prompt", icon: SquareTerminal, label: "communities.feed.type.prompt" },
  { type: "request", icon: Sparkles, label: "communities.feed.type.request" },
  { type: "workflow", icon: WorkflowIcon, label: "communities.feed.type.workflow" },
  { type: "preset", icon: SlidersHorizontal, label: "communities.feed.type.preset" },
];

/**
 * "Gönderi oluştur": iki yol —
 *   1) Yeni içerik oluştur → türü seç → NORMAL oluşturma ekranı topluluk bağlamıyla açılır; yayınlanınca içerik bu toplulukta kendi
 *      gönderisi olur (yerel gönderi).
 *   2) Mevcut içeriğe başvur → var olan yayınlanmış içerik seçilir, isteğe bağlı not eklenir (başvuru gönderisi).
 */
export function CreatePostModal({ communityId, onClose, onApply }: { communityId: string; onClose: () => void; onApply: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState<"choose" | "new">("choose");
  const optionClass = cn(
    "flex w-full items-start gap-3 rounded-lg border border-border-soft bg-background p-3.5 text-left transition-colors",
    "hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
  );

  return (
    <Modal onClose={onClose} labelledBy="create-post-title">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg" onClick={(event) => event.stopPropagation()}>
        {step === "choose" ? (
          <>
            <div className="space-y-1">
              <h2 id="create-post-title" className="text-base font-semibold text-text">
                {t("communities.post.choose.title")}
              </h2>
              <p className="text-small text-text-muted">{t("communities.post.choose.help")}</p>
            </div>
            <div className="space-y-2.5">
              <button type="button" className={optionClass} onClick={() => setStep("new")} data-post-option="new">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                  <FilePlus2 size={17} strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-label font-semibold text-text">{t("communities.post.choose.newTitle")}</span>
                  <span className="block text-caption text-text-secondary">{t("communities.post.choose.newHelp")}</span>
                </span>
              </button>
              <button type="button" className={optionClass} onClick={onApply} data-post-option="apply">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                  <FileSymlink size={17} strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-label font-semibold text-text">{t("communities.post.choose.applyTitle")}</span>
                  <span className="block text-caption text-text-secondary">{t("communities.post.choose.applyHelp")}</span>
                </span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <button type="button" onClick={() => setStep("choose")} className="mb-1 inline-flex items-center gap-1 text-caption text-text-muted hover:text-text">
                <ArrowLeft size={13} aria-hidden /> {t("communities.post.back")}
              </button>
              <h2 id="create-post-title" className="text-base font-semibold text-text">
                {t("communities.post.new.title")}
              </h2>
              <p className="text-small text-text-muted">{t("communities.post.new.help")}</p>
            </div>
            <ul className="grid grid-cols-2 gap-2.5">
              {TYPES.map(({ type, icon: Icon, label }) => (
                <li key={type}>
                  <Link href={`${CREATE_HREF[type]}?community=${communityId}`} className={cn(optionClass, "items-center")} data-post-new-type={type}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                      <Icon size={17} strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="text-label font-semibold text-text">{t(label)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
