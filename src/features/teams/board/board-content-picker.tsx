"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchRecentPresets, searchPresets } from "@/lib/supabase/presets";
import { fetchRecentRequests, searchRequests } from "@/lib/supabase/requests";
import type { SpaceContentType } from "@/lib/spaces";

/**
 * "Promptly'den ekle" seçici (docs/history/367-*): herkese açık ayar paketi / istek ara ve panoya başvuru olarak ekle (kopya değil).
 * Workflow için mevcut aktarma penceresi (`WorkflowImportModal`) kullanılır.
 */
export function ContentPickerDialog({ type, onClose, onPick }: { type: Extract<SpaceContentType, "preset" | "request">; onClose: () => void; onPick: (item: { id: string; title: string }) => Promise<void> }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<{ id: string; title: string }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      const wanted = query.trim();
      const load = async () => {
        if (type === "preset") return wanted ? await searchPresets(wanted, {}, 20) : (await fetchRecentPresets(20)).items;
        return wanted ? await searchRequests(wanted, {}, 20) : (await fetchRecentRequests(20)).items;
      };
      void load().then(
        (list) => alive && setRows(list.map((item) => ({ id: item.id, title: item.title }))),
        () => alive && setRows([]),
      );
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, type]);

  return (
    <SpaceDialog title={t(type === "preset" ? "tb.pick.presetTitle" : "tb.pick.requestTitle")} onClose={onClose} busy={busy !== null} formTestId="board-content-picker">
      <div className="space-y-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("tb.pick.search")}
          aria-label={t("tb.pick.search")}
          className="h-11 w-full rounded-lg border border-border bg-background px-3 text-body"
        />
        {rows === null && <p className="text-small text-text-muted">{t("common.loading")}</p>}
        {rows !== null && rows.length === 0 && <p className="text-small text-text-muted">{t("tb.pick.empty")}</p>}
        <ul className="divide-y divide-border-soft">
          {(rows ?? []).map((row) => (
            <li key={row.id} className="flex min-h-12 items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-body font-semibold text-text">{row.title}</span>
              <Button
                type="button"
                size="sm"
                disabled={busy !== null}
                data-board-pick={row.id}
                onClick={async () => {
                  setBusy(row.id);
                  setError(null);
                  try {
                    await onPick(row);
                    onClose();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : t("spaces.error.generic"));
                    setBusy(null);
                  }
                }}
              >
                {t("tb.pick.add")}
              </Button>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        )}
      </div>
    </SpaceDialog>
  );
}
