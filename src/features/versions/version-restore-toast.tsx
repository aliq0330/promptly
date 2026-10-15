"use client";

import { useEffect, useState } from "react";
import { Portal } from "@/components/ui/portal";
import { useTranslation } from "@/lib/i18n/language-provider";
import { RESTORE_NOTICE_KEY } from "./version-history-panel";

/**
 * The success message of a restore, shown once on the reloaded page — and only when the previous page really
 * stored it after the server confirmed the restore (a failed restore never writes the hand-off). Keyed by content
 * id so a notice can't surface on some other page.
 */
export function VersionRestoreToast({ contentId }: { contentId: string }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RESTORE_NOTICE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { contentId?: string; from?: number };
      if (parsed.contentId !== contentId || typeof parsed.from !== "number") return;
      sessionStorage.removeItem(RESTORE_NOTICE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads a one-shot value from sessionStorage once on mount
      setFrom(parsed.from);
    } catch {
      // storage unavailable: no notice, the restored content is on screen anyway
    }
  }, [contentId]);

  useEffect(() => {
    if (from === null) return;
    const timer = setTimeout(() => setFrom(null), 3500);
    return () => clearTimeout(timer);
  }, [from]);

  if (from === null) return null;
  return (
    <Portal>
      <div role="status" className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 md:bottom-6">
        <div className="animate-pop-in rounded-md bg-text px-3.5 py-2 text-small text-background shadow-pop">{t("history.restoredToast", { from })}</div>
      </div>
    </Portal>
  );
}
