"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "@/components/icons/loader-2";
import { RefreshCw } from "@/components/icons/refresh-cw";
import { Workflow } from "@/components/icons/workflow";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { SpaceConnection, SpaceItem } from "@/lib/supabase/spaces";
import { legacyFramesOf, loadPlanInput, runImport, runSync, syncPlan, workflowObjectsOn, type PlanInput, type PlanIO } from "@/lib/supabase/workflow-board";

const MAX_WORKFLOWS = 5;

/**
 * "Workflow değişti · Güncelle" (docs/history/262-*): panoda workflow'dan aktarılmış nesneler varsa workflow'un şimdiki hâli (taze) okunur
 * ve panoyla karşılaştırılır; fark varsa (yeni/kaldırılan/değişen adım) düzenleyiciye bir şerit çıkar. "Güncelle" yalnız farkı uygular:
 * senin taşıdığın / düzenlediğin nesneler ve elle çizdiğin oklar korunur. Hiçbir şey kendiliğinden değişmez.
 *
 * Eski tek parça çerçeve (docs/history/261-*) duran workflow için ayrıca "Ayrı nesnelere çevir" şeridi çıkar (docs/history/339-*): nesneler
 * eklenir, SONRA çerçeve kalkar (çeviri başarısız olursa eski görünüm yerinde kalır). Yine kullanıcı eylemidir, kendiliğinden olmaz.
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
  onDone: (kind: "sync" | "convert", degraded: boolean) => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const workflowIds = useMemo(
    () => [...new Set(items.filter((item) => item.sourceWorkflowId && item.sourceRole === "step").map((item) => item.sourceWorkflowId!))].slice(0, MAX_WORKFLOWS),
    [items],
  );
  // Eski çerçeve olarak duran, henüz nesnesi olmayan workflow'lar (öğe başına ilk çerçeve).
  const legacyFrames = useMemo(() => {
    const out = new Map<string, SpaceItem>();
    for (const item of items) {
      if (item.kind !== "content" || item.contentType !== "workflow" || !item.contentId || out.has(item.contentId)) continue;
      if (workflowObjectsOn(items, item.contentId).some((entry) => entry.sourceRole === "step")) continue;
      out.set(item.contentId, item);
    }
    return out;
  }, [items]);
  const loadIds = useMemo(() => [...new Set([...workflowIds, ...legacyFrames.keys()])].slice(0, MAX_WORKFLOWS * 2), [workflowIds, legacyFrames]);
  const [inputs, setInputs] = useState<Record<string, { title: string; input: PlanInput } | null>>({});
  const requested = useRef(new Set<string>());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    for (const id of loadIds) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      loadPlanInput(id, { fresh: true }).then(
        (input) => setInputs((prev) => ({ ...prev, [id]: input ? { title: input.flow.workflow.title, input } : null })),
        () => setInputs((prev) => ({ ...prev, [id]: null })),
      );
    }
  }, [loadIds]);

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

  const convertible = useMemo(
    () => [...legacyFrames].flatMap(([id, frame]) => (inputs[id] && !dismissed.has(`legacy:${id}`) ? [{ id, frame, title: inputs[id]!.title, input: inputs[id]!.input }] : [])),
    [legacyFrames, inputs, dismissed],
  );

  if (pending.length === 0 && convertible.length === 0) return null;

  async function convert(id: string, frame: SpaceItem, title: string, input: PlanInput) {
    setBusy(`legacy:${id}`);
    try {
      const options = { io: frame.flowShowIo, prompts: frame.flowShowLinks, images: frame.flowShowLinks, relations: frame.flowShowLinks && frame.flowShowRelations };
      const result = await runImport({ io, spaceId, workflowId: id, workflowTitle: title, input, options, existingItems: items, near: { x: frame.x, y: frame.y + frame.h + 120 } });
      // Nesneler yazıldı; çerçeve ancak şimdi kalkar. Burada hata olursa her ikisi de panoda kalır (kullanıcı çerçeveyi elle silebilir).
      await io.removeItems(legacyFramesOf(items, id).map((entry) => entry.id));
      onDone("convert", result.degraded);
    } catch (error) {
      onError(error instanceof Error && error.message ? error.message : t("wfSpace.legacy.failed"));
    } finally {
      setBusy(null);
    }
  }

  async function apply(id: string, plan: (typeof pending)[number]["plan"]) {
    setBusy(id);
    try {
      await runSync({ io, spaceId, workflowId: id, plan, existingItems: items });
      onDone("sync", false);
    } catch (error) {
      onError(error instanceof Error ? error.message : t("wfSpace.sync.failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-col gap-2 sm:max-w-md" data-workflow-sync="" onPointerDown={(event) => event.stopPropagation()}>
      {pending.map(({ id, title, plan }) => (
        <div key={id} role="status" className="pointer-events-auto rounded-lg border border-primary/40 bg-surface p-3 shadow-pop">
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
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-small font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
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
      {convertible.map(({ id, frame, title, input }) => (
        <div key={`legacy:${id}`} role="status" data-workflow-legacy="" className="pointer-events-auto rounded-lg border border-primary/40 bg-surface p-3 shadow-pop">
          <p className="flex items-center gap-2 text-small font-semibold text-text">
            <Workflow size={14} className="shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 break-words">{t("wfSpace.legacy.title", { title })}</span>
          </p>
          <p className="mt-1 text-caption text-text-muted">{t("wfSpace.legacy.hint")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void convert(id, frame, title, input)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-small font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              {busy === `legacy:${id}` && <Loader2 size={13} className="animate-spin" aria-hidden />}
              {busy === `legacy:${id}` ? t("wfSpace.legacy.converting") : t("wfSpace.legacy.convert")}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => setDismissed((prev) => new Set(prev).add(`legacy:${id}`))} className="inline-flex h-8 items-center rounded-full px-3 text-small font-semibold text-text-secondary hover:bg-surface-soft">
              {t("wfSpace.sync.dismiss")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
