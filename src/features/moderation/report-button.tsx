"use client";

import { useState, type FormEvent } from "react";
import { Flag } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fileReport, type ReportTargetType } from "@/lib/supabase/reports";

/**
 * A real, permanent report — no modal (this app has none, see Bölüm 9.2's
 * note on that), an inline expanding reason field instead. Renders nothing
 * while signed out: filing a report needs a real account (RLS, Bölüm 19).
 */
export function ReportButton({
  targetType,
  targetId,
  label,
  menuItem = true,
  row = false,
}: {
  targetType: ReportTargetType;
  targetId: string;
  label?: string;
  /** False when rendered outside a `role="menu"` (e.g. under a comment). */
  menuItem?: boolean;
  /** Sohbet bilgi sayfasındaki satır görünümü (simge dairesi + tam genişlik, tehlike rengi). */
  row?: boolean;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!user) return null;

  if (done) {
    return <p className={row ? "px-4 py-4 text-small text-text-muted" : "text-xs text-text-muted"}>{t("messages.reported")}</p>;
  }

  if (!open) {
    if (row) {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-14 w-full items-center gap-3.5 px-4 text-left text-body text-danger transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-soft" aria-hidden>
            <Flag size={18} strokeWidth={1.75} />
          </span>
          {label ?? t("messages.reportAction")}
        </button>
      );
    }
    return (
      <button
        type="button"
        role={menuItem ? "menuitem" : undefined}
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
      >
        <Flag size={14} />
        {label ?? t("messages.reportAction")}
      </button>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await fileReport(user!.id, targetType, targetId, reason);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("report.failed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={row ? "space-y-1.5 px-4 py-3" : "space-y-1.5"}>
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={t("report.reasonPlaceholder")}
        rows={2}
        autoFocus
        className="w-full resize-none rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/15 shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!reason.trim() || isSubmitting}
          className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
        >
          {isSubmitting ? t("report.sending") : t("common.send")}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReason("");
            setError(null);
          }}
          className="text-sm text-text-muted hover:text-text"
        >
          {t("common.cancelAction")}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
