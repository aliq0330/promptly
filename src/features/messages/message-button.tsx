"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useRealMessages } from "./real-messages-provider";
import { messageHref } from "@/lib/utils";
import { buttonClassName } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { UserProfile } from "@/types";

// The profile's actions row (docs/history/203-*): an outline pill as tall as the big "Takip et" beside it; icon-only on
// phones so the row (Takip et · Mesaj · Paylaş · ⋮) stays on one line.
const CLASS_NAME = buttonClassName({ variant: "outline", size: "lg", className: "w-12 px-0 sm:w-auto sm:px-6" });
// Profile header (docs/history/243-*): the same pill at the height of the inline Takip et beside it.
const COMPACT_CLASS_NAME = buttonClassName({ variant: "outline", size: "md", className: "w-10 px-0 sm:w-auto sm:px-5" });
const LABEL_CLASS = "hidden sm:inline";

/** "Mesaj Gönder" — finds or starts a real 1:1 conversation and navigates to it (CLAUDE.md Bölüm 21 Faz 6). */
export function MessageButton({ user, compact = false }: { user: UserProfile; compact?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user: authUser } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const { startConversationWith } = useRealMessages();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const className = compact ? COMPACT_CLASS_NAME : CLASS_NAME;

  if (!authUser) {
    return (
      <button
        type="button"
        onClick={() => requireAuth("message")}
        aria-haspopup="dialog"
        title={t("messages.loginToSendTitle")}
        aria-label={t("messages.sendMessage")}
        className={className}
      >
        <MessageCircle size={18} aria-hidden />
        <span className={LABEL_CLASS}>{t("messages.sendMessage")}</span>
      </button>
    );
  }

  async function handleClick() {
    setIsStarting(true);
    setError(null);
    try {
      const conversation = await startConversationWith(user);
      router.push(messageHref(conversation));
    } catch (err) {
      console.error("startConversationWith", err);
      setError(err instanceof Error ? err.message : t("messages.startConversationFailed"));
      setIsStarting(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button type="button" onClick={handleClick} disabled={isStarting} aria-label={t("messages.sendMessage")} className={className}>
        <MessageCircle size={18} aria-hidden />
        <span className={LABEL_CLASS}>{isStarting ? t("messages.startingEllipsis") : t("messages.sendMessage")}</span>
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
