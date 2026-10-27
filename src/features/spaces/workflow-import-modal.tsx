"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { Check, Lock, Workflow as WorkflowIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { usePagedList } from "@/features/content/use-paged-list";
import { PagedListState } from "@/features/feed/paged-list-state";
import { WorkflowFlowDiagram, useWorkflowFlow } from "@/features/workflows/workflow-flow-diagram";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { SpaceVisibility } from "@/lib/spaces";
import { fetchWorkflowFlow } from "@/lib/supabase/workflow-flow";
import { fetchWorkflowsByCreatorPage } from "@/lib/supabase/workflows";
import { computeFlowLayout, flowItemSize } from "@/lib/workflow-flow-layout";
import { cn } from "@/lib/utils";
import type { Workflow } from "@/types";
import { FormError, SubmitButton } from "./space-forms";
import { SpaceDialog } from "./space-modals";

export interface WorkflowImportInput {
  workflow: Workflow;
  size: { w: number; h: number };
  showIo: boolean;
  showLinks: boolean;
  showRelations: boolean;
}

/**
 * "Workflow aktar" (docs/history/261-*): kullanıcının KENDİ yayınlanmış workflow'larından birini panoya akış diyagramı olarak getirir.
 * Başkasının workflow'u listelenmez (ilk sürümün bilinçli sınırı). Workflow kopyalanmaz, başvurulur: sonradan değişirse çerçeve de değişir.
 */
export function WorkflowImportModal({
  spaceVisibility,
  existingWorkflowIds,
  onImport,
  onClose,
}: {
  spaceVisibility: SpaceVisibility;
  existingWorkflowIds: ReadonlySet<string>;
  onImport: (input: WorkflowImportInput) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const list = usePagedList<Workflow>(`wf-import:${userId}`, Boolean(userId), (offset) => fetchWorkflowsByCreatorPage(userId!, {}, offset, 24));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layers, setLayers] = useState({ showIo: true, showLinks: true, showRelations: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupId = useId();

  const selected = useMemo(() => list.items.find((workflow) => workflow.id === selectedId) ?? null, [list.items, selectedId]);
  const preview = useWorkflowFlow(selected?.id);
  const alreadyOnBoard = selected ? existingWorkflowIds.has(selected.id) : false;
  const exposesPrivate = Boolean(selected && selected.visibility === "private" && spaceVisibility !== "private");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || alreadyOnBoard) return;
    setBusy(true);
    setError(null);
    try {
      const flow = await fetchWorkflowFlow(selected.id);
      if (!flow) throw new Error(t("wfSpace.import.loadFailed"));
      const size = flowItemSize(computeFlowLayout(flow.steps, layers, flow.relations));
      await onImport({ workflow: selected, size, ...layers });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
      setBusy(false);
    }
  }

  const layerRows: { key: keyof typeof layers; label: string; hint: string }[] = [
    { key: "showIo", label: t("wfSpace.layer.io"), hint: t("wfSpace.layer.ioHint") },
    { key: "showLinks", label: t("wfSpace.layer.links"), hint: t("wfSpace.layer.linksHint") },
    { key: "showRelations", label: t("wfSpace.layer.relations"), hint: t("wfSpace.layer.relationsHint") },
  ];

  return (
    <SpaceDialog
      title={t("wfSpace.import.title")}
      onClose={onClose}
      busy={busy}
      wide
      onSubmit={submit}
      formTestId="workflow-import"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy} disabled={!selected || alreadyOnBoard}>
            {t("wfSpace.import.submit")}
          </SubmitButton>
        </>
      }
    >
      <p className="text-small text-text-secondary">{t("wfSpace.import.hint")}</p>

      <fieldset className="mt-4">
        <legend className="sr-only">{t("wfSpace.import.title")}</legend>
        <PagedListState list={list}>
          {list.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center">
              <WorkflowIcon size={24} className="mx-auto text-primary" aria-hidden />
              <p className="mt-2 text-body font-semibold text-text">{t("wfSpace.import.emptyTitle")}</p>
              <p className="mt-1 text-small text-text-muted">{t("wfSpace.import.emptyHint")}</p>
              <Link href="/workflows/create" className="mt-3 inline-flex h-9 items-center rounded-full bg-primary px-4 text-small font-semibold text-primary-foreground hover:bg-primary-hover">
                {t("wfSpace.import.create")}
              </Link>
            </div>
          ) : (
            <ul className="space-y-2" role="radiogroup" aria-labelledby={groupId}>
              {list.items.map((workflow) => {
                const on = existingWorkflowIds.has(workflow.id);
                const active = workflow.id === selectedId;
                return (
                  <li key={workflow.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSelectedId(workflow.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border bg-surface px-3 py-2.5 text-left transition-colors",
                        active ? "border-primary ring-1 ring-primary" : "border-border hover:bg-surface-soft",
                      )}
                    >
                      <span className={cn("h-4 w-4 shrink-0 rounded-full border-2", active ? "border-[5px] border-primary" : "border-border-strong")} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-small font-semibold text-text">{workflow.title}</span>
                        <span className="block truncate text-caption text-text-muted">
                          {t("workflow.stepCount", { count: workflow.stepCount })} · {workflow.visibility === "public" ? t("visibility.public") : t("visibility.private")}
                        </span>
                      </span>
                      {on && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-caption font-semibold text-primary">
                          <Check size={12} aria-hidden /> {t("wfSpace.import.onBoard")}
                        </span>
                      )}
                      {workflow.visibility === "private" && !on && <Lock size={14} className="shrink-0 text-text-muted" aria-label={t("visibility.private")} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </PagedListState>
        <p id={groupId} className="mt-3 text-caption text-text-muted">
          {t("wfSpace.import.onlyOwn")}
        </p>
      </fieldset>

      {selected && (
        <div className="mt-5 space-y-4 border-t border-border-soft pt-4">
          <div>
            <p className="mb-2 text-caption font-bold uppercase tracking-[0.06em] text-text-secondary">{t("wfSpace.import.preview")}</p>
            <div className="overflow-hidden rounded-xl border border-border-soft bg-surface-soft">
              {preview.data ? (
                <WorkflowFlowDiagram data={preview.data} options={layers} fit={{ mode: "width" }} />
              ) : (
                <div className={cn("h-40", preview.state === "loading" && "skeleton-shimmer")} aria-hidden />
              )}
            </div>
            {preview.state === "failed" && <p className="mt-2 text-caption text-danger">{t("wfSpace.import.loadFailed")}</p>}
          </div>

          <div>
            <p className="mb-2 text-caption font-bold uppercase tracking-[0.06em] text-text-secondary">{t("wfSpace.import.layers")}</p>
            <div className="space-y-2">
              {layerRows.map((row) => (
                <label key={row.key} className="flex items-start gap-2.5 text-small text-text">
                  <input
                    type="checkbox"
                    checked={layers[row.key]}
                    onChange={(event) => setLayers((prev) => ({ ...prev, [row.key]: event.target.checked }))}
                    className="mt-1 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="block font-medium">{row.label}</span>
                    <span className="block text-caption text-text-muted">{row.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {alreadyOnBoard && <p className="rounded-xl bg-primary-soft px-3 py-2 text-small text-text-secondary">{t("wfSpace.import.alreadyOnBoard")}</p>}
          {exposesPrivate && (
            <p role="status" className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2 text-small text-text-secondary">
              <Lock size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
              {t("wfSpace.import.privateWarn")}
            </p>
          )}
        </div>
      )}

      <FormError message={error} />
    </SpaceDialog>
  );
}
