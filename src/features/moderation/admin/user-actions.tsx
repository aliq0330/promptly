"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldInputClassName } from "@/components/ui/field";
import { useTranslation } from "@/lib/i18n/language-provider";
import { deleteUserAccount, setPostingBlock, suspendUser, type AdminUser } from "@/lib/supabase/admin";
import { formatDateTime } from "./format";
import { isSuspended } from "./users-panel";

const DAYS = [
  { days: 1, key: "admin.actions.days1" },
  { days: 7, key: "admin.actions.days7" },
  { days: 30, key: "admin.actions.days30" },
  { days: 90, key: "admin.actions.days90" },
] as const;

/** Posting block, temporary suspension and permanent deletion. All enforced server-side (`admin_*` RPCs). */
export function UserActions({ user, onChanged, onDeleted }: { user: AdminUser; onChanged: () => Promise<void>; onDeleted: () => void }) {
  const { t, language } = useTranslation();
  const [reason, setReason] = useState("");
  const [days, setDays] = useState<number>(7);
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const suspended = isSuspended(user);

  async function run(action: () => Promise<void>, doneText: string, after?: () => void) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ kind: "ok", text: doneText });
      setReason("");
      setConfirmName("");
      if (after) after();
      else await onChanged();
    } catch (err) {
      console.error("admin action", err);
      const detail = err instanceof Error ? err.message : "";
      setMessage({ kind: "error", text: detail ? `${t("admin.actions.failed")} (${detail})` : t("admin.actions.failed") });
    } finally {
      setBusy(false);
    }
  }

  if (user.role === "moderator") {
    return <p className="rounded-xl border border-border-soft bg-surface p-4 text-small text-text-muted">{t("admin.actions.cannotModerator")}</p>;
  }

  const reasonInput = (
    <input
      value={reason}
      onChange={(event) => setReason(event.target.value)}
      maxLength={300}
      placeholder={t("admin.actions.reasonPlaceholder")}
      aria-label={t("admin.actions.reasonPlaceholder")}
      className={fieldInputClassName}
    />
  );

  return (
    <section className="space-y-5 rounded-xl border border-border-soft bg-surface p-4 shadow-card sm:p-5" data-admin-actions>
      <h3 className="text-small font-semibold text-text">{t("admin.actions.title")}</h3>

      <div className="space-y-2">
        <p className="text-small text-text-secondary">{t("admin.actions.blockHint")}</p>
        {user.postingBlocked && (
          <p className="text-small font-medium text-warning">
            {t("admin.actions.blockedNow")}
            {user.postingBlockReason ? ` · ${user.postingBlockReason}` : ""}
          </p>
        )}
        {!user.postingBlocked && reasonInput}
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => setPostingBlock(user.id, !user.postingBlocked, reason), t("admin.actions.done"))}>
          {user.postingBlocked ? t("admin.actions.unblockPosting") : t("admin.actions.blockPosting")}
        </Button>
      </div>

      <div className="space-y-2 border-t border-border-soft pt-4">
        <p className="text-small text-text-secondary">{t("admin.actions.suspendHint")}</p>
        {suspended ? (
          <>
            <p className="text-small font-medium text-danger">
              {t("admin.actions.suspendedUntil", { date: formatDateTime(user.suspendedUntil as string, language) })}
              {user.suspendedReason ? ` · ${user.suspendedReason}` : ""}
            </p>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => suspendUser(user.id, null, ""), t("admin.actions.done"))}>
              {t("admin.actions.unsuspend")}
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-caption text-text-muted" htmlFor="admin-suspend-days">
                {t("admin.actions.duration")}
              </label>
              <select id="admin-suspend-days" value={days} onChange={(event) => setDays(Number(event.target.value))} className="h-10 rounded-lg border border-border bg-surface px-2 text-small text-text">
                {DAYS.map((d) => (
                  <option key={d.days} value={d.days}>
                    {t(d.key)}
                  </option>
                ))}
              </select>
            </div>
            {reasonInput}
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => suspendUser(user.id, new Date(Date.now() + days * 86_400_000), reason), t("admin.actions.done"))}>
              {t("admin.actions.suspend")}
            </Button>
          </>
        )}
      </div>

      <div className="space-y-2 border-t border-border-soft pt-4">
        <p className="text-small font-medium text-text">{t("admin.actions.deleteAccount")}</p>
        <p className="text-small text-text-secondary">{t("admin.actions.deleteHint")}</p>
        <label className="block text-caption text-text-muted" htmlFor="admin-delete-confirm">
          {t("admin.actions.deleteConfirmLabel", { username: user.username })}
        </label>
        <input id="admin-delete-confirm" value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" className={fieldInputClassName} />
        <Button variant="danger" size="sm" disabled={busy || confirmName !== user.username} onClick={() => run(() => deleteUserAccount(user.id, confirmName), t("admin.actions.deleted"), onDeleted)}>
          {t("admin.actions.deleteButton")}
        </Button>
      </div>

      {message && (
        <p role="status" className={message.kind === "ok" ? "text-small text-success" : "text-small text-danger"}>
          {message.text}
        </p>
      )}
    </section>
  );
}
