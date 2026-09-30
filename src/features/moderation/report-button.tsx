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
}: {
  targetType: ReportTargetType;
  targetId: string;
  label?: string;
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
    return <p className="text-xs text-text-muted">{t("messages.reported")}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        role="menuitem"
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
    <form onSubmit={handleSubmit} className="space-y-1.5">
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={t("report.reasonPlaceholder")}
        rows={2}
        autoFocus
        className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
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
