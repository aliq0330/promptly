"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchWorkflowById, saveWorkflow } from "@/lib/supabase/workflows";
import { useTranslation } from "@/lib/i18n/language-provider";
import { duplicateStep, moveStep, newStep, sanitizeLinks, validateWorkflow, type WorkflowIssue } from "@/lib/workflow-logic";
import { cn } from "@/lib/utils";
import type { WorkflowContentRef, WorkflowStep } from "@/types";
import { AddContentModal } from "./add-content-modal";
import { ContentPane, GeneralPane, IOPane, SettingsPane, StepPreview } from "./step-panes";
import { StepList } from "./step-list";
import { TagPicker } from "@/features/prompts/tag-picker";
import { useTagPicker } from "@/features/prompts/use-tag-picker";
import { useTagCatalog } from "@/features/tags/use-tag-catalog";
import { useLayoutMode } from "./use-layout-mode";
import { EMPTY_META, WorkflowMetaForm, type WorkflowMeta } from "./workflow-meta-form";
import type { TranslationKey } from "@/lib/i18n/translations";
import { KindDraftsButton } from "@/features/drafts/kind-drafts-button";

type SaveState = "idle" | "saving" | "saved" | "error";
type LoadState = "loading" | "ready" | "notfound" | "forbidden";
type AddTarget = { stepId: string | null; initialMode: "existing" | "scratch" } | null;

const card = "rounded-lg border border-border bg-surface p-4 sm:p-5";

/**
 * The workflow editor: name/details on top, then the step timeline and the
 * selected step's editor. Desktop = three columns (steps · step · content &
 * settings); tablet = steps + one tabbed detail card; mobile = the step list,
 * each step opening in a bottom sheet with its tabs. Nothing here runs a
 * model — it only saves how existing content is chained.
 */
export function WorkflowEditor({ editId }: { editId: string | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const mode = useLayoutMode();

  const [workflowId, setWorkflowId] = useState<string | null>(editId);
  const [loadState, setLoadState] = useState<LoadState>(editId ? "loading" : "ready");
  const [meta, setMeta] = useState<WorkflowMeta>(EMPTY_META);
  const { catalog } = useTagCatalog();
  const tagPicker = useTagPicker({ title: meta.title, content: meta.description, catalog });
  const tagsSeededRef = useRef(false);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [issues, setIssues] = useState<WorkflowIssue[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [metaOpen, setMetaOpen] = useState(!editId);
  const [addTarget, setAddTarget] = useState<AddTarget>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [centerTab, setCenterTab] = useState<"general" | "io">("general");
  const [detailTab, setDetailTab] = useState<"general" | "content" | "io" | "settings">("general");

  // Load an existing workflow (owner only).
  useEffect(() => {
    if (!editId || authLoading) return;
    if (!user) return;
    let cancelled = false;
    fetchWorkflowById(editId).then((result) => {
      if (cancelled) return;
      if (!result) return setLoadState("notfound");
      if (result.workflow.creator.id !== user.id) return setLoadState("forbidden");
      setMeta({
        title: result.workflow.title,
        description: result.workflow.description,
        coverUrl: result.workflow.coverUrl,
        contentTypes: result.workflow.contentTypes,
        category: result.workflow.category,
        tools: result.workflow.tools,
      });
      if (!tagsSeededRef.current) {
        tagsSeededRef.current = true;
        for (const tag of result.workflow.tags) tagPicker.addManual(tag);
      }
      setSteps(result.steps);
      setStatus(result.workflow.status);
      setSelectedId(result.steps[0]?.id ?? null);
      setLoadState("ready");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- addManual is stable; seeded once per load
  }, [editId, user, authLoading]);

  // Unsaved changes: ask before the tab closes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const selected = useMemo(() => steps.find((s) => s.id === selectedId) ?? steps[0] ?? null, [steps, selectedId]);
  const selectedIndex = selected ? steps.findIndex((s) => s.id === selected.id) : -1;

  const touch = useCallback(() => {
    setDirty(true);
    setSaveState("idle");
    setIssues([]);
  }, []);

  /** Every step change goes through here so links that stopped making sense (reorder, delete, removed output) are dropped and reported. */
  const commitSteps = useCallback(
    (next: WorkflowStep[]) => {
      const cleaned = sanitizeLinks(next);
      setSteps(cleaned.steps);
      setNotice(cleaned.removed > 0 ? t("workflow.linksRemoved", { count: String(cleaned.removed) }) : null);
      touch();
    },
    [t, touch],
  );

  const patchStep = (id: string, patch: Partial<WorkflowStep>) => commitSteps(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  function handleContent(ref: WorkflowContentRef) {
    const target = addTarget;
    setAddTarget(null);
    if (!target) return;
    if (target.stepId) {
      commitSteps(
        steps.map((s) =>
          s.id === target.stepId ? { ...s, stepType: ref.type, content: ref, contentMissing: false, title: s.title || ref.title } : s,
        ),
      );
      return;
    }
    const step = { ...newStep(ref.type), title: ref.title, content: ref };
    commitSteps([...steps, step]);
    setSelectedId(step.id);
    setDetailTab("general");
  }

  function handleDuplicate(step: WorkflowStep) {
    const copy = duplicateStep(step, t("workflow.copySuffix"));
    const index = steps.findIndex((s) => s.id === step.id);
    const next = steps.slice();
    next.splice(index + 1, 0, copy);
    commitSteps(next);
    setSelectedId(copy.id);
  }

  function handleDelete(step: WorkflowStep) {
    const index = steps.findIndex((s) => s.id === step.id);
    const next = steps.filter((s) => s.id !== step.id);
    commitSteps(next);
    setSelectedId(next[Math.min(index, next.length - 1)]?.id ?? null);
    setSheetOpen(false);
  }

  function handleReorder(from: number, to: number) {
    commitSteps(moveStep(steps, from, to));
  }

  function issueMessage(issue: WorkflowIssue): string {
    const n = String((issue.stepIndex ?? 0) + 1);
    const keys: Record<WorkflowIssue["code"], TranslationKey> = {
      titleRequired: "workflow.issueTitleRequired",
      noSteps: "workflow.issueNoSteps",
      stepNoTitle: "workflow.issueStepTitle",
      stepNoContent: "workflow.issueStepContent",
      stepContentMissing: "workflow.issueStepMissing",
      unpublishedGenerator: "workflow.warnUnpublished",
    };
    return t(keys[issue.code], { n });
  }

  async function handleSave(target: "draft" | "published") {
    if (!user || saveState === "saving") return;
    const found = validateWorkflow(meta, steps, target === "published");
    setIssues(found);
    const blocking = found.filter((i) => i.level === "error");
    if (blocking.length > 0) {
      const firstStep = blocking.find((i) => i.stepId);
      if (firstStep?.stepId) setSelectedId(firstStep.stepId);
      return;
    }
    setSaveState("saving");
    setSaveError(null);
    try {
      const id = await saveWorkflow({ id: workflowId, ...meta, tags: tagPicker.accepted.map((entry) => entry.tag), status: target, steps }, user.id);
      setWorkflowId(id);
      setStatus(target);
      setDirty(false);
      setSaveState("saved");
      if (!editId) window.history.replaceState(null, "", `${window.location.pathname}?edit=${id}`);
      if (target === "published") router.push(`/workflows/local?id=${id}`);
    } catch {
      setSaveState("error");
      setSaveError(t("workflow.errorSave"));
    }
  }

  if (authLoading || loadState === "loading" || mode === null) {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">{t("common.loading")}</div>;
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("auth.loginRequiredTitle")}</h1>
        <p className="mb-4 text-sm text-text-muted">{t("workflow.loginRequired")}</p>
        <Link href="/login" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
          {t("header.login")}
        </Link>
      </div>
    );
  }
  if (loadState === "notfound" || loadState === "forbidden") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("workflow.notFoundTitle")}</h1>
        <p className="mb-4 text-sm text-text-muted">{loadState === "forbidden" ? t("workflow.notYours") : t("workflow.notFoundBody")}</p>
        <Link href="/workflows" className="text-sm font-medium text-primary hover:underline">
          {t("workflow.pageTitle")}
        </Link>
      </div>
    );
  }

  const stateLabel =
    saveState === "saving"
      ? t("workflow.saving")
      : dirty
        ? t("workflow.unsaved")
        : saveState === "saved"
          ? t("workflow.saved")
          : status === "published"
            ? t("workflow.statePublished")
            : t("workflow.stateDraft");

  const list = (
    <StepList
      steps={steps}
      selectedId={selected?.id ?? null}
      onSelect={(id) => {
        setSelectedId(id);
        if (mode === "mobile") setSheetOpen(true);
      }}
      onReorder={handleReorder}
      onAdd={() => setAddTarget({ stepId: null, initialMode: "existing" })}
    />
  );

  const panes = selected && {
    general: <GeneralPane step={selected} onChange={(patch) => patchStep(selected.id, patch)} />,
    content: <ContentPane step={selected} onPick={(m) => setAddTarget({ stepId: selected.id, initialMode: m })} />,
    io: <IOPane step={selected} steps={steps} index={selectedIndex} onChange={(patch) => patchStep(selected.id, patch)} />,
    preview: <StepPreview step={selected} steps={steps} index={selectedIndex} />,
    settings: (
      <SettingsPane
        index={selectedIndex}
        count={steps.length}
        onDuplicate={() => handleDuplicate(selected)}
        onDelete={() => handleDelete(selected)}
        onMove={(delta) => handleReorder(selectedIndex, selectedIndex + delta)}
      />
    ),
  };

  const detailTabs = (
    <div className="space-y-4">
      <Tabs
        items={[
          { key: "general" as const, label: t("workflow.tabGeneral") },
          { key: "content" as const, label: t("workflow.tabContent") },
          { key: "io" as const, label: t("workflow.tabIO") },
          { key: "settings" as const, label: t("workflow.tabSettings") },
        ]}
        active={detailTab}
        onChange={setDetailTab}
        ariaLabel={t("workflow.stepDetailAria")}
      />
      {panes && detailTab === "general" && panes.general}
      {panes && detailTab === "content" && (
        <div className="space-y-4">
          {panes.content}
          {panes.preview}
        </div>
      )}
      {panes && detailTab === "io" && (
        <div className="space-y-4">
          {panes.io}
          {panes.preview}
        </div>
      )}
      {panes && detailTab === "settings" && panes.settings}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 px-3 py-5 sm:px-5 sm:py-6 lg:px-8">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href="/workflows" className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-label font-medium text-text-secondary hover:bg-surface-soft hover:text-text">
          <ArrowLeft size={16} />
          {t("workflow.back")}
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-h3 font-semibold text-text">{editId ? t("workflow.editTitle") : t("workflow.createTitle")}</h1>
        <span
          aria-live="polite"
          className={cn("text-caption font-medium", dirty ? "text-warning" : saveState === "saved" ? "text-success" : "text-text-muted")}
        >
          {stateLabel}
        </span>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button type="button" variant="outline" disabled={saveState === "saving"} onClick={() => handleSave("draft")} className="flex-1 sm:flex-none">
            {t("workflow.saveDraft")}
          </Button>
          <Button type="button" disabled={saveState === "saving"} onClick={() => handleSave("published")} className="flex-1 sm:flex-none">
            {t("workflow.publish")}
          </Button>
        </div>
        <KindDraftsButton kind="workflow" />
      </div>

      {saveError && <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{saveError}</p>}
      {issues.length > 0 && (
        <div role="alert" className="rounded-md border border-warning/40 bg-warning/5 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-text">
            <AlertTriangle size={14} className="text-warning" />
            {t("workflow.issuesHeading")}
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-caption text-text-secondary">
            {issues.map((issue, i) => (
              <li key={i} className={issue.level === "error" ? "text-danger" : ""}>
                {issueMessage(issue)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {notice && (
        <p className="flex items-start justify-between gap-2 rounded-md bg-primary-soft p-2.5 text-caption text-primary">
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label={t("common.close")}>
            <X size={14} />
          </button>
        </p>
      )}

      {/* Details */}
      <section className={card}>
        <button type="button" onClick={() => setMetaOpen((v) => !v)} aria-expanded={metaOpen} className="flex w-full items-center justify-between gap-2 text-left">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-text">{t("workflow.infoHeading")}</span>
            {!metaOpen && <span className="block truncate text-caption text-text-muted">{meta.title || t("workflow.titlePlaceholder")}</span>}
          </span>
          <ChevronDown size={18} className={cn("shrink-0 text-text-muted transition-transform", metaOpen && "rotate-180")} />
        </button>
        {metaOpen && (
          <div className="mt-4">
            <WorkflowMetaForm
              meta={meta}
              titleError={issues.some((i) => i.code === "titleRequired")}
              onChange={(patch) => {
                setMeta((prev) => ({ ...prev, ...patch }));
                touch();
              }}
            />
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium text-text">{t("generator.tagsLabel")}</label>
              <TagPicker picker={tagPicker} />
            </div>
          </div>
        )}
      </section>

      {/* Steps + step editor */}
      {mode === "desktop" && (
        <div className="grid grid-cols-[280px_minmax(0,1fr)_320px] items-start gap-4">
          <section className={cn(card, "sticky top-20")}>
            <h2 className="mb-3 text-sm font-semibold text-text">{t("workflow.stepsHeading")}</h2>
            {list}
          </section>
          <section className={cn(card, "min-w-0")}>
            {panes ? (
              <div className="space-y-4">
                <Tabs
                  items={[
                    { key: "general" as const, label: t("workflow.tabGeneral") },
                    { key: "io" as const, label: t("workflow.tabIO") },
                  ]}
                  active={centerTab}
                  onChange={setCenterTab}
                  ariaLabel={t("workflow.stepDetailAria")}
                />
                {centerTab === "general" ? panes.general : panes.io}
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-text-muted">{t("workflow.selectStepHint")}</p>
            )}
          </section>
          <section className={cn(card, "sticky top-20 space-y-5")}>
            {panes ? (
              <>
                {panes.content}
                {panes.preview}
                {panes.settings}
              </>
            ) : (
              <p className="py-6 text-center text-sm text-text-muted">{t("workflow.noStepsBody")}</p>
            )}
          </section>
        </div>
      )}

      {mode === "tablet" && (
        <div className="grid grid-cols-[260px_minmax(0,1fr)] items-start gap-4">
          <section className={cn(card, "sticky top-20")}>
            <h2 className="mb-3 text-sm font-semibold text-text">{t("workflow.stepsHeading")}</h2>
            {list}
          </section>
          <section className={cn(card, "min-w-0")}>
            {panes ? detailTabs : <p className="py-10 text-center text-sm text-text-muted">{t("workflow.selectStepHint")}</p>}
          </section>
        </div>
      )}

      {mode === "mobile" && (
        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold text-text">{t("workflow.stepsHeading")}</h2>
          {list}
        </section>
      )}

      {mode === "mobile" && sheetOpen && selected && (
        <Modal onClose={() => setSheetOpen(false)} labelledBy="workflow-step-sheet-title">
          <div className="flex max-h-[92vh] w-full flex-col rounded-lg border border-border bg-surface p-4 shadow-lg" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="workflow-step-sheet-title" className="min-w-0 truncate text-base font-semibold text-text">
                {selectedIndex + 1}. {selected.title || t("workflow.untitledStep")}
              </h2>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label={t("common.close")} className="rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text">
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{detailTabs}</div>
          </div>
        </Modal>
      )}

      {addTarget && (
        <AddContentModal
          initialType={addTarget.stepId ? (steps.find((s) => s.id === addTarget.stepId)?.stepType ?? "prompt") : "prompt"}
          initialMode={addTarget.initialMode}
          onSelect={handleContent}
          onClose={() => setAddTarget(null)}
        />
      )}
    </div>
  );
}
