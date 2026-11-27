"use client";

import { useState } from "react";
import { Quote as QuoteIcon } from "@/components/icons/quote";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { contentActionClassName } from "@/features/content/action-styles";
import type { ShareModalTarget } from "@/features/prompts/share-modal";
import { useTranslation } from "@/lib/i18n/language-provider";
import { QuoteSection } from "./quote-section";
import { announceTarget } from "./quote-target";

/**
 * "Alıntıla" düğmesi (docs/history/480-*): detay sayfalarının eylem çubuğunda İstatistik'in yerini aldı (İstatistik ⋮ menüsündedir). Beğeni / Yorum / Kaydet ile
 * AYNI düğme görünümü; açılınca not + "Nerede görünsün?" penceresi (`QuoteSection mode="popup"`). Topluluğa özgü içerik alıntılanamaz → düğme çizilmez;
 * yayında/herkese açık değilse düğme nedeniyle kapalı durur. Misafir tıklayınca ortak giriş penceresi açılır.
 */
export function QuoteTriggerButton({ target, size = 20, className }: { target: ShareModalTarget; size?: number; className?: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const [open, setOpen] = useState(false);
  const announce = announceTarget(target);
  if (!announce) return null;
  const blocked = announce.blockedKey ? t(announce.blockedKey) : null;
  const title = target.contentType === "prompt" ? target.prompt.title : target.contentType === "request" ? target.request.title : target.contentType === "workflow" ? target.workflow.title : target.contentType === "preset" ? target.preset.title : target.contentType === "skill" ? target.skill.title : "";

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!user) {
            requireAuth("generic");
            return;
          }
          setOpen(true);
        }}
        disabled={Boolean(blocked) && Boolean(user)}
        aria-label={t("quotes.section.title")}
        title={blocked ?? t("quotes.section.title")}
        aria-haspopup="dialog"
        data-quote-trigger=""
        className={contentActionClassName(false, className)}
      >
        <QuoteIcon size={size} />
      </button>
      {user && (
        <QuoteSection mode="popup" hideTrigger open={open} onOpenChange={setOpen} contextTitle={title} type={announce.type} contentId={announce.id} blockedReason={blocked} />
      )}
    </>
  );
}
