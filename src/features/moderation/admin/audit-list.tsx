"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { fetchAdminUserAudit, type AdminAuditEntry } from "@/lib/supabase/admin";
import { formatDateTime } from "./format";

export function AuditList({ userId }: { userId: string }) {
  const { t, language } = useTranslation();
  const [rows, setRows] = useState<AdminAuditEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAdminUserAudit(userId)
      .then((next) => !cancelled && setRows(next))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (error) return <p className="text-small text-danger">{t("admin.loadFailed")}</p>;
  if (!rows) return <p className="text-small text-text-muted">{t("common.loading")}</p>;
  if (rows.length === 0) return <p className="text-small text-text-muted">{t("admin.audit.empty")}</p>;
  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const key = `admin.audit.${row.action}` as TranslationKey;
        const label = t(key) === key ? row.action : t(key);
        const reason = typeof row.details.reason === "string" ? row.details.reason : null;
        return (
          <li key={row.id} className="rounded-lg border border-border-soft p-3">
            <p className="text-small font-medium text-text">{label}</p>
            <p className="text-caption text-text-muted">
              {row.moderatorUsername ? t("admin.audit.by", { name: row.moderatorUsername }) : "—"} · {formatDateTime(row.createdAt, language)}
            </p>
            {reason && <p className="mt-1 break-words text-caption text-text-secondary">{reason}</p>}
          </li>
        );
      })}
    </ul>
  );
}
