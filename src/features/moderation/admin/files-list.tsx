"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { adminFilePublicUrl, fetchAdminUserFiles, type AdminFile } from "@/lib/supabase/admin";
import { formatDateTime, formatBytes } from "./format";

export function FilesList({ userId }: { userId: string }) {
  const { t, language } = useTranslation();
  const [files, setFiles] = useState<AdminFile[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAdminUserFiles(userId)
      .then((rows) => !cancelled && setFiles(rows))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (error) return <p className="text-small text-danger">{t("admin.loadFailed")}</p>;
  if (!files) return <p className="text-small text-text-muted">{t("common.loading")}</p>;
  if (files.length === 0) return <p className="text-small text-text-muted">{t("admin.user.noFiles")}</p>;

  return (
    <ul className="space-y-2">
      {files.map((file) => {
        const url = file.kind === "image" ? adminFilePublicUrl(file) : null;
        const bucketKey = `admin.bucket.${file.bucket}` as TranslationKey;
        const bucket = t(bucketKey) === bucketKey ? file.bucket : t(bucketKey);
        return (
          <li key={`${file.bucket}/${file.name}`} className="flex items-center gap-3 rounded-lg border border-border-soft p-2.5">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" loading="lazy" />
            ) : (
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-surface-soft text-caption font-medium uppercase text-text-muted">{file.kind === "other" ? "…" : file.kind.slice(0, 3)}</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-small font-medium text-text" title={file.name}>
                {file.name.split("/").pop()}
              </p>
              <p className="text-caption text-text-muted">
                {bucket} · {file.mime || "—"} · {formatDateTime(file.createdAt, language)}
              </p>
            </div>
            <Badge variant="neutral">{formatBytes(file.size)}</Badge>
          </li>
        );
      })}
    </ul>
  );
}
