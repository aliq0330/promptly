"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Blocks, FileText, Sparkles, SquareTerminal, Trash2, Workflow as WorkflowIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteDraft, fetchOwnDrafts, type DraftKind } from "@/lib/supabase/drafts";
import type { DraftItem } from "@/features/drafts/drafts-button";
import { useLanguage, useTranslation } from "@/lib/i18n/language-provider";
import { formatRelativeTime } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n/translations";

type DraftFilter = "all" | DraftKind;
type DraftRow = DraftItem & { kind: DraftKind };

const KIND_ORDER: DraftKind[] = ["prompt", "request", "generator", "workflow"];
const KIND_META: Record<DraftKind, { labelKey: TranslationKey; icon: LucideIcon }> = {
  prompt: { labelKey: "draft.kindPrompt", icon: SquareTerminal },
  request: { labelKey: "draft.kindRequest", icon: Sparkles },
  generator: { labelKey: "draft.kindGenerator", icon: Blocks },
  workflow: { labelKey: "draft.kindWorkflow", icon: WorkflowIcon },
};

/**
 * The owner-only "Taslaklar" profile tab — all four content types' drafts
 * (prompt/request/generator/workflow) in one place, filterable by a
 * Tümü/Promptlar/.../Workflowlar sub-tab row. Reuses the exact same data
 * layer (`fetchOwnDrafts`/`deleteDraft`, `lib/supabase/drafts.ts`) and
 * continue/delete behavior as the per-page `DraftsButton` (CLAUDE.md Bölüm
 * 9.65) — no parallel draft system, just a second place to reach the same
 * drafts. RLS already restricts each table's draft rows to their own
 * author, so this never needs its own visibility check beyond the caller
 * only rendering it when `isOwnProfile`.
 */
export function ProfileDraftsPanel({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [filter, setFilter] = useState<DraftFilter>("all");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const lists = await Promise.all(KIND_ORDER.map((kind) => fetchOwnDrafts(kind, userId)));
    const combined: DraftRow[] = KIND_ORDER.flatMap((kind, index) => lists[index].map((item) => ({ ...item, kind })));
    combined.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    setRows(combined);
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of the owner's drafts across all four content types
    void refresh();
  }, [refresh]);

  const counts = useMemo(() => {
    const base: Record<DraftKind, number> = { prompt: 0, request: 0, generator: 0, workflow: 0 };
    rows?.forEach((row) => {
      base[row.kind] += 1;
    });
    return base;
  }, [rows]);

  const tabs = useMemo(
    () => [
      { key: "all" as const, label: t("common.all"), count: rows?.length ?? 0 },
      ...KIND_ORDER.map((kind) => ({ key: kind, label: t(KIND_META[kind].labelKey), count: counts[kind] })),
    ],
    [rows, counts, t],
  );

  const visible = useMemo(() => (filter === "all" ? (rows ?? []) : (rows ?? []).filter((row) => row.kind === filter)), [rows, filter]);

  async function handleDelete(row: DraftRow) {
    if (confirmId !== row.id) {
      setConfirmId(row.id);
      return;
    }
    setBusyId(row.id);
    setError(null);
    try {
      await deleteDraft(row.kind, row.id);
      setRows((prev) => (prev ? prev.filter((item) => item.id !== row.id) : prev));
      setConfirmId(null);
    } catch {
      setError(t("draft.deleteFailed"));
    } finally {
      setBusyId(null);
    }
  }

  if (rows === null) {
    return <p className="text-sm text-text-muted">{t("draft.loading")}</p>;
  }

  return (
    <div className="space-y-4">
      <Tabs items={tabs} active={filter} onChange={setFilter} ariaLabel={t("profile.draftKindsAriaLabel")} variant="segmented" />

      {visible.length === 0 ? (
        <EmptyState icon={FileText} title={t("draft.empty")} className="border-0" />
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => {
            const Icon = KIND_META[row.kind].icon;
            return (
              <li key={`${row.kind}-${row.id}`} className="rounded-md border border-border-soft bg-surface-soft p-3">
                <div className="flex items-center gap-1.5 text-caption font-medium text-text-muted">
                  <Icon size={13} aria-hidden />
                  {t(KIND_META[row.kind].labelKey)}
                </div>
                <p className="mt-1 truncate text-sm font-medium text-text">{row.title.trim() || t("draft.untitled")}</p>
                <p className="mb-2 text-xs text-text-muted">{t("draft.lastEdited", { time: formatRelativeTime(row.updatedAt, language) })}</p>
                {confirmId === row.id && <p className="mb-2 text-xs text-danger">{t("draft.deleteConfirm")}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={row.href}
                    className="inline-flex min-h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                  >
                    {t("draft.continue")}
                  </Link>
                  <Button type="button" variant="ghost" size="sm" disabled={busyId === row.id} onClick={() => void handleDelete(row)}>
                    <Trash2 size={14} aria-hidden />
                    {t("common.delete")}
                  </Button>
                  {confirmId === row.id && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                      {t("common.cancel")}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
