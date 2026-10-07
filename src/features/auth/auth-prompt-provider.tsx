"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { buttonClassName } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { authHref } from "@/lib/auth-redirect";
import type { TranslationKey } from "@/lib/i18n/translations";

/** What the visitor tried to do — picks the dialog's sentence. */
export type AuthPromptReason = "like" | "save" | "follow" | "comment" | "create" | "message" | "generic";

const REASON_KEYS: Record<AuthPromptReason, TranslationKey> = {
  like: "prompt.loginToLike",
  save: "prompt.loginToSave",
  follow: "common.loginToFollowTitle",
  comment: "auth.gateComment",
  create: "auth.gateCreate",
  message: "messages.loginToSendTitle",
  generic: "auth.gateGeneric",
};

interface AuthPromptContextValue {
  /**
   * Call before a member-only action. Returns true when the visitor is signed
   * in (go ahead). Otherwise opens the login dialog and returns false. While
   * the session is still resolving it does nothing (returns false) — a
   * member must never be shown a login prompt by mistake.
   */
  requireAuth: (reason: AuthPromptReason) => boolean;
}

const AuthPromptContext = createContext<AuthPromptContextValue | null>(null);

export function AuthPromptProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [reason, setReason] = useState<AuthPromptReason | null>(null);

  const requireAuth = useCallback(
    (nextReason: AuthPromptReason) => {
      if (user) return true;
      if (!loading) setReason(nextReason);
      return false;
    },
    [user, loading],
  );

  const value = useMemo(() => ({ requireAuth }), [requireAuth]);

  return (
    <AuthPromptContext.Provider value={value}>
      {children}
      {reason && !user && <AuthPromptDialog reason={reason} onClose={() => setReason(null)} />}
    </AuthPromptContext.Provider>
  );
}

function AuthPromptDialog({ reason, onClose }: { reason: AuthPromptReason; onClose: () => void }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  // `window.location.search` rather than useSearchParams (no Suspense needed).
  const next = typeof window === "undefined" ? pathname : pathname + window.location.search;

  return (
    <Modal onClose={onClose} labelledBy="auth-prompt-title">
      <div
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-sm rounded-lg border border-border-soft bg-surface-elevated p-5 text-center"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
        >
          <X size={16} />
        </button>
        <h2 id="auth-prompt-title" className="text-h3 font-semibold text-text">
          {t("auth.loginRequiredTitle")}
        </h2>
        <p className="mt-1.5 text-small text-text-secondary">{t(REASON_KEYS[reason])}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            href={authHref("/login", next)}
            onClick={onClose}
            className={buttonClassName({ variant: "primary", className: "h-10 sm:flex-1" })}
          >
            {t("header.login")}
          </Link>
          <Link
            href={authHref("/signup", next)}
            onClick={onClose}
            className={buttonClassName({ variant: "outline", className: "h-10 sm:flex-1" })}
          >
            {t("auth.signUp")}
          </Link>
        </div>
      </div>
    </Modal>
  );
}

export function useAuthPrompt(): AuthPromptContextValue {
  const ctx = useContext(AuthPromptContext);
  if (!ctx) throw new Error("useAuthPrompt must be used within an AuthPromptProvider");
  return ctx;
}
