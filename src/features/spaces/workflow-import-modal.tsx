"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { Check, Lock, Workflow as WorkflowIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { usePagedList } from "@/features/content/use-paged-list";
import { PagedListState } from "@/features/feed/paged-list-state";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { SpaceVisibility } from "@/lib/spaces";
import { importPlan, loadPlanInput, workflowObjectsOn, type PlanInput } from "@/lib/supabase/workflow-board";
import type { SpaceItem } from "@/lib/supabase/spaces";
import { fetchWorkflowsByCreatorPage } from "@/lib/supabase/workflows";
import { MAX_ITEMS, type PlanOptions } from "@/lib/workflow-board-plan";
import { cn } from "@/lib/utils";
import type { Workflow } from "@/types";
import { FormError, SubmitButton } from "./space-forms";
import { SpaceDialog } from "./space-modals";
import { WorkflowPlanPreview } from "./workflow-plan-preview";

export interface WorkflowImportInput {
  workflow: Workflow;
  options: PlanOptions;
}

/**
 * "Workflow aktar" (docs/history/262-*): kullanıcının KENDİ yayınlanmış workflow'larından birini panoya AYRI NESNELER olarak getirir:
 * her adım için adım kartı, kullandığı prompt ve prompt'un görselleri; aralarında oklar. Başkasının workflow'u listelenmez. Kopya değildir:
 * workflow değişince panoda "Güncelle" çıkar. Önizleme panoya yazılacak planın kendisidir.
 */
export function WorkflowImportModal({
  spaceVisibility,
  items,
  onImport,
  onClose,
}: {
  spaceVisibility: SpaceVisibility;
  items: readonly SpaceItem[];
  onImport: (input: WorkflowImportInput) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const list = usePagedList<Workflow>(`wf-import:${userId}`, Boolean(userId), (offset) => fetchWorkflowsByCreatorPage(userId!, {}, offset, 24));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [options, setOptions] = useState<PlanOptions>({ io: true, prompts: true, images: true, relations: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState<{ id: string; value: PlanInput | null } | null>(null);
  const groupId = useId();

  const selected = useMemo(() => list.items.find((workflow) => workflow.id === selectedId) ?? null, [list.items, selectedId]);

  // Seçilen workflow'un adımları + prompt görselleri (taze okuma: aktarma anındaki hâli görülür).
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    loadPlanInput(selectedId, { fresh: true }).then(
      (value) => !cancelled && setInput({ id: selectedId, value }),
      () => !cancelled && setInput({ id: selectedId, value: null }),
    );
    return () => {
      cancelled = true;
    };
  }, [selectedId]);
  const loaded = input && input.id === selectedId ? input : null;
  const plan = useMemo(() => (loaded?.value ? importPlan(loaded.value, options, items) : null), [loaded, options, items]);
  const alreadyOnBoard = selected ? workflowObjectsOn(items, selected.id).length > 0 : false;
  const exposesPrivate = Boolean(selected && selected.visibility === "private" && spaceVisibility !== "private");
  const tooMany = Boolean(plan && items.length + plan.items.length > MAX_ITEMS);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || alreadyOnBoard || !plan || tooMany) return;
    setBusy(true);
    setError(null);
    try {
      await onImport({ workflow: selected, options });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
      setBusy(false);
    }
  }

  const optionRows: { key: keyof PlanOptions; label: string; hint: string; disabled?: boolean }[] = [
    { key: "prompts", label: t("wfSpace.objects.optPrompts"), hint: t("wfSpace.objects.optPromptsHint") },
    { key: "images", label: t("wfSpace.objects.optImages"), hint: t("wfSpace.objects.optImagesHint"), disabled: !options.prompts },
    { key: "io", label: t("wfSpace.objects.optIo"), hint: t("wfSpace.objects.optIoHint") },
    { key: "relations", label: t("wfSpace.objects.optRelations"), hint: t("wfSpace.objects.optRelationsHint"), disabled: !options.prompts },
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
          <SubmitButton busy={busy} disabled={!selected || alreadyOnBoard || !plan || tooMany}>
            {busy ? t("wfSpace.objects.importing") : t("wfSpace.import.submit")}
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
                const on = workflowObjectsOn(items, workflow.id).length > 0;
                const active = workflow.id === selectedId;
                return (
                  <li key={workflow.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSelectedId(workflow.id)}
                      className={cn("flex w-full items-center gap-3 rounded-xl border bg-surface px-3 py-2.5 text-left transition-colors", active ? "border-primary ring-1 ring-primary" : "border-border hover:bg-surface-soft")}
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
            {plan && loaded?.value ? (
              <WorkflowPlanPreview plan={plan} steps={loaded.value.steps} />
            ) : (
              <div className={cn("h-40 rounded-xl border border-border-soft bg-surface-soft", !loaded && "skeleton-shimmer")} aria-hidden />
            )}
            {loaded && !loaded.value && <p className="mt-2 text-caption text-danger">{t("wfSpace.import.loadFailed")}</p>}
            {plan && (
              <p className="mt-2 text-caption text-text-muted" data-plan-counts="">
                {t("wfSpace.objects.willAdd", { steps: plan.counts.steps, prompts: plan.counts.prompts, images: plan.counts.images, arrows: plan.counts.arrows })}
                {plan.reused > 0 ? ` · ${t("wfSpace.objects.willReuse", { count: plan.reused })}` : ""}
              </p>
            )}
          </div>

          <div>
            <p className="mb-2 text-caption font-bold uppercase tracking-[0.06em] text-text-secondary">{t("wfSpace.objects.options")}</p>
            <p className="mb-2 text-caption text-text-muted">{t("wfSpace.objects.optStepsHint")}</p>
            <div className="space-y-2">
              {optionRows.map((row) => (
                <label key={row.key} className={cn("flex items-start gap-2.5 text-small text-text", row.disabled && "opacity-50")}>
                  <input
                    type="checkbox"
                    checked={options[row.key] && !row.disabled}
                    disabled={row.disabled}
                    onChange={(event) => setOptions((prev) => ({ ...prev, [row.key]: event.target.checked }))}
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

          {alreadyOnBoard && <p className="rounded-xl bg-primary-soft px-3 py-2 text-small text-text-secondary">{t("wfSpace.objects.alreadyHere")}</p>}
          {tooMany && <p role="status" className="rounded-xl bg-warning/10 px-3 py-2 text-small text-text-secondary">{t("wfSpace.objects.tooMany")}</p>}
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
