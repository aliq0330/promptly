"use client";

import { useEffect, useRef, useState } from "react";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { imageAppearanceFromUrl } from "@/lib/image-appearance";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchMediaAppearanceStats, fetchMediaMissingAppearance, saveMediaAppearance } from "@/lib/supabase/media-appearance";
import { resolveMediaUrl } from "@/lib/supabase/media-url";

const BATCH = 20;

/**
 * Moderatör aracı (docs/history/209-*): eski prompt görsellerinin baskın rengini ve küçük önizlemesini bir kez hesaplar
 * (yeni yüklemeler bunu kendisi yapar). Görsel tarayıcıda okunur (signed URL), değer `admin_set_media_appearance` ile
 * yazılır; okunamayan görsel bu çalıştırmada atlanır ve sayılır, bir sonrakinde yeniden denenir.
 */
export function MediaAppearanceCard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<{ missing: number; total: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchMediaAppearanceStats()
      .then((value) => alive && setStats(value))
      .catch(() => alive && setError(t("moderation.appearanceFailed")));
    return () => {
      alive = false;
    };
  }, [t]);

  async function run() {
    if (running) return;
    stopRef.current = false;
    setRunning(true);
    setError(null);
    let done = 0;
    const failed: string[] = [];
    setProgress({ done, failed: 0 });
    try {
      while (!stopRef.current) {
        const batch = await fetchMediaMissingAppearance(BATCH, failed);
        if (batch.length === 0) break;
        for (const row of batch) {
          if (stopRef.current) break;
          const signed = await resolveMediaUrl(row.url);
          const appearance = signed ? await imageAppearanceFromUrl(signed) : null;
          if (appearance) {
            try {
              await saveMediaAppearance(row.id, appearance);
              done += 1;
            } catch {
              failed.push(row.id);
            }
          } else {
            failed.push(row.id);
          }
          setProgress({ done, failed: failed.length });
        }
      }
      setStats(await fetchMediaAppearanceStats());
    } catch (err) {
      console.error("media appearance backfill", err);
      setError(t("moderation.appearanceFailed"));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <Palette size={18} className="mt-0.5 shrink-0 text-text-muted" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text">{t("moderation.appearanceTitle")}</h2>
          <p className="text-small text-text-secondary">{t("moderation.appearanceHint")}</p>
        </div>
      </div>
      {stats && (
        <p className="text-small text-text-secondary tabular-nums">{t("moderation.appearanceStats", { missing: stats.missing, total: stats.total })}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void run()} disabled={running || stats?.missing === 0}>
          {running ? t("moderation.appearanceRunning") : t("moderation.appearanceRun")}
        </Button>
        {running && (
          <Button size="sm" variant="ghost" onClick={() => (stopRef.current = true)}>
            {t("moderation.appearanceStop")}
          </Button>
        )}
      </div>
      {progress && (
        <p className="text-small text-text-secondary tabular-nums" role="status">
          {t("moderation.appearanceProgress", { done: progress.done, failed: progress.failed })}
        </p>
      )}
      {error && <p className="text-small text-danger">{error}</p>}
    </section>
  );
}
