"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { SpaceConnection, SpaceItem } from "@/lib/supabase/spaces";
import { loadPlanInput, runSync, syncPlan, type PlanInput, type PlanIO } from "@/lib/supabase/workflow-board";

const MAX_WORKFLOWS = 5;

/**
 * "Workflow değişti · Güncelle" (docs/history/262-*): panoda workflow'dan aktarılmış nesneler varsa workflow'un şimdiki hâli (taze) okunur
 * ve panoyla karşılaştırılır; fark varsa (yeni/kaldırılan/değişen adım) düzenleyiciye bir şerit çıkar. "Güncelle" yalnız farkı uygular:
 * senin taşıdığın / düzenlediğin nesneler ve elle çizdiğin oklar korunur. Hiçbir şey kendiliğinden değişmez.
 */
export function WorkflowSyncBar({
  spaceId,
  items,
  connections,
  io,
  onDone,
  onError,
}: {
  spaceId: string;
  items: readonly SpaceItem[];
  connections: readonly SpaceConnection[];
  io: PlanIO;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const workflowIds = useMemo(
    () => [...new Set(items.filter((item) => item.sourceWorkflowId && item.sourceRole === "step").map((item) => item.sourceWorkflowId!))].slice(0, MAX_WORKFLOWS),
    [items],
  );
  const [inputs, setInputs] = useState<Record<string, { title: string; input: PlanInput } | null>>({});
  const requested = useRef(new Set<string>());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    for (const id of workflowIds) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      loadPlanInput(id, { fresh: true }).then(
        (input) => setInputs((prev) => ({ ...prev, [id]: input ? { title: input.flow.workflow.title, input } : null })),
        () => setInputs((prev) => ({ ...prev, [id]: null })),
      );
    }
  }, [workflowIds]);

  const pending = useMemo(
    () =>
      workflowIds.flatMap((id) => {
        const loaded = inputs[id];
        if (!loaded || dismissed.has(id)) return [];
        const plan = syncPlan(loaded.input, items, connections, id);
        return plan.isEmpty ? [] : [{ id, title: loaded.title, plan }];
      }),
    [workflowIds, inputs, dismissed, items, connections],
  );

  if (pending.length === 0) return null;

  async function apply(id: string, plan: (typeof pending)[number]["plan"]) {
    setBusy(id);
    try {
      await runSync({ io, spaceId, workflowId: id, plan, existingItems: items });
      onDone();
    } catch (error) {
      onError(error instanceof Error ? error.message : t("wfSpace.sync.failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-col gap-2 sm:max-w-md" data-workflow-sync="" onPointerDown={(event) => event.stopPropagation()}>
      {pending.map(({ id, title, plan }) => (
        <div key={id} role="status" className="pointer-events-auto rounded-2xl border border-primary/40 bg-surface p-3 shadow-pop">
          <p className="flex items-center gap-2 text-small font-semibold text-text">
            <RefreshCw size={14} className="shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 break-words">{t("wfSpace.sync.changed", { title })}</span>
          </p>
          <p className="mt-1 text-caption text-text-secondary">{t("wfSpace.sync.summary", { added: plan.counts.added, removed: plan.counts.removed, changed: plan.counts.changed })}</p>
          <p className="mt-0.5 text-caption text-text-muted">{t("wfSpace.sync.hint")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void apply(id, plan)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-small font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              {busy === id && <Loader2 size={13} className="animate-spin" aria-hidden />}
              {busy === id ? t("wfSpace.sync.updating") : t("wfSpace.sync.update")}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => setDismissed((prev) => new Set(prev).add(id))} className="inline-flex h-8 items-center rounded-full px-3 text-small font-semibold text-text-secondary hover:bg-surface-soft">
              {t("wfSpace.sync.dismiss")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
