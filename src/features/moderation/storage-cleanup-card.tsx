"use client";

import { useState } from "react";
import { HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { supabase } from "@/lib/supabase/client";

type CleanupReport = {
  applied: boolean;
  total: number;
  removed?: number;
  buckets: Record<string, { count: number; bytes: number }>;
  failures?: string[];
};

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Moderatör aracı: hiçbir DB satırının göstermediği Storage dosyalarını
 * tarar (kuru çalışma) ve onayla siler. Asıl iş `cleanup-orphan-storage`
 * Edge Function'ında (service role orada; istemcide yok) — o da çağıranın
 * moderatör olduğunu sunucuda doğrular.
 */
export function StorageCleanupCard() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<CleanupReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(apply: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("cleanup-orphan-storage", { body: { apply } });
      if (fnError) throw new Error(fnError.message);
      setReport(data as CleanupReport);
    } catch (err) {
      console.error("cleanup-orphan-storage", err);
      setError(t("moderation.storageFailed"));
    } finally {
      setBusy(false);
    }
  }

  const rows = report ? Object.entries(report.buckets) : [];

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <HardDrive size={18} className="mt-0.5 shrink-0 text-text-muted" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text">{t("moderation.storageTitle")}</h2>
          <p className="text-small text-text-secondary">{t("moderation.storageHint")}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => run(false)} disabled={busy}>
          {busy && !report?.applied ? t("moderation.storageScanning") : t("moderation.storageScan")}
        </Button>
        {report && !report.applied && report.total > 0 && (
          <Button size="sm" variant="danger" onClick={() => run(true)} disabled={busy}>
            {t("moderation.storageDelete", { count: report.total })}
          </Button>
        )}
      </div>
      {report && (
        <div className="space-y-1 text-small text-text-secondary" role="status">
          {report.total === 0 ? (
            <p>{t("moderation.storageNone")}</p>
          ) : (
            <>
              {rows.map(([bucket, s]) => (
                <p key={bucket}>
                  <span className="font-medium text-text">{bucket}</span> — {s.count} · {formatBytes(s.bytes)}
                </p>
              ))}
              {report.applied && <p className="font-medium text-success">{t("moderation.storageDone", { count: report.removed ?? 0 })}</p>}
              {report.failures && report.failures.length > 0 && <p className="text-danger">{report.failures.join("; ")}</p>}
            </>
          )}
        </div>
      )}
      {error && <p className="text-small text-danger">{error}</p>}
    </section>
  );
}
