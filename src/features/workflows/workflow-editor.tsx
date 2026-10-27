"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCommunityContext, useCommunityReturn } from "@/features/communities/community-return";
import { AlertTriangle, Workflow as WorkflowIcon, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { fetchWorkflowById, saveWorkflow } from "@/lib/supabase/workflows";
import { invalidateWorkflowFlow } from "@/lib/supabase/workflow-flow";
import { applyWorkflowSpaceChoice } from "@/lib/supabase/workflow-space";
import { WorkflowSpaceField, useWorkflowSpaceChoice } from "./workflow-space-field";
import { useTranslation } from "@/lib/i18n/language-provider";
import { appendLinkedStep, duplicateStep, moveStep, newStep, sanitizeLinks, validateWorkflow, type WorkflowIssue } from "@/lib/workflow-logic";
import { cn } from "@/lib/utils";
import { multiImageItemFromMedia } from "@/lib/supabase/media-input";
import type { ContentVisibility, WorkflowContentRef, WorkflowStep } from "@/types";
import { AddContentModal } from "./add-content-modal";
import { ContentPane, GeneralPane, IOPane, SettingsPane, StepActions, StepPreview } from "./step-panes";
import { StepList } from "./step-list";
import { useTagPicker } from "@/features/prompts/use-tag-picker";
import { usePrefillTag } from "@/features/challenges/use-prefill-tag";
import { useTagCatalog } from "@/features/tags/use-tag-catalog";
import { useLayoutMode } from "./use-layout-mode";
import { EMPTY_META, WorkflowMetaForm, type WorkflowMeta } from "./workflow-meta-form";
import type { TranslationKey } from "@/lib/i18n/translations";
import { KindDraftsButton } from "@/features/drafts/kind-drafts-button";
import { ComposeShell, PublishPreview, useComposeLeave } from "@/features/content/compose";
import { ComposeAudienceLine, ComposeSection, FormDisclosure } from "@/features/content/compose-form";
import { SuggestedTagsRow } from "@/features/content/compose-fields";
import { PublishPanel, type PublishPanelHandle, type PublishProblem } from "@/features/content/publish-panel";
import { TaxonomyPicker } from "@/features/content/taxonomy-picker";
import { ToolPicker } from "@/features/content/tool-picker";
import { TagPicker } from "@/features/prompts/tag-picker";
import { resolveToolRefs } from "@/lib/ai-tool-catalog";
import { taxonomyPathLabel } from "@/lib/content-taxonomy";

type SaveState = "idle" | "saving" | "saved" | "error";
type LoadState = "loading" | "ready" | "notfound" | "forbidden";
type AddTarget = { stepId: string | null; initialMode: "existing" | "scratch" } | null;

const card = "rounded-xl border border-border-soft bg-surface p-4 shadow-card sm:p-6";

/**
 * The workflow editor: a compact header (type pill, title, description, cover) on top, then the step list and the selected step's
 * editor. Wide (≥ 640px of editor width) = two columns (steps · one tabbed step card with its actions in the card header);
 * mobile = the step list, each step opening in a bottom sheet with its tabs. Kategori / Araç / Etiketler live in the
 * "Paylaşmadan önce" sheet (docs/history/216-*). Nothing here runs a model — it only saves how existing content is chained.
 */
export function WorkflowEditor({ editId }: { editId: string | null }) {
  const { t, language } = useTranslation();
  const router = useRouter();
  const returnToCommunity = useCommunityReturn();
  const { communityId, name: communityName } = useCommunityContext();
  const { user, loading: authLoading } = useAuth();
  const { profile: ownProfile } = useOwnProfile();
  const [rootRef, mode] = useLayoutMode();

  const [workflowId, setWorkflowId] = useState<string | null>(editId);
  const [loadState, setLoadState] = useState<LoadState>(editId ? "loading" : "ready");
  const [meta, setMeta] = useState<WorkflowMeta>(EMPTY_META);
  const { catalog } = useTagCatalog();
  const tagPicker = useTagPicker({ title: meta.title, content: meta.description, catalog });
  usePrefillTag(tagPicker.addManual, !editId);
  const tagsSeededRef = useRef(false);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [issues, setIssues] = useState<WorkflowIssue[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<ContentVisibility>("public");
  // "Space'te göster" (docs/history/261-*): karar yayınlanınca uygulanır.
  const spaceChoice = useWorkflowSpaceChoice(workflowId, user?.id ?? null);
  const [addTarget, setAddTarget] = useState<AddTarget>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
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
        media: multiImageItemFromMedia(result.workflow.media),
        contentType: (result.workflow.contentTypes[0] ?? "image") as WorkflowMeta["contentType"],
        category: result.workflow.category,
        subcategory: result.workflow.subcategory,
        tools: result.workflow.tools,
      });
      if (!tagsSeededRef.current) {
        tagsSeededRef.current = true;
        for (const tag of result.workflow.tags) tagPicker.addManual(tag);
      }
      setSteps(result.steps);
      setStatus(result.workflow.status);
      setVisibility(result.workflow.visibility);
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
    // The new step's first input is wired to the previous step's output by default (changeable in Girdi / Çıktı).
    commitSteps(appendLinkedStep(steps, step, t("workflow.defaultOutputLabel")));
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
      stepRequestNotAllowed: "workflow.issueStepRequest",
    };
    return t(keys[issue.code], { n });
  }

  async function handleSave(target: "draft" | "published"): Promise<boolean> {
    if (!user || saveState === "saving") return false;
    const found = validateWorkflow(meta, steps, target === "published");
    setIssues(found);
    const blocking = found.filter((i) => i.level === "error");
    if (blocking.length > 0) {
      const firstStep = blocking.find((i) => i.stepId);
      if (firstStep?.stepId) setSelectedId(firstStep.stepId);
      return false;
    }
    setSaveState("saving");
    setSaveError(null);
    try {
      // content_types = the main type plus the types of the content the steps link to (what the workflow "chains").
      const contentTypes = Array.from(new Set([meta.contentType, ...steps.map((step) => step.content?.contentType).filter((type): type is NonNullable<typeof type> => Boolean(type))]));
      const { contentType: _mainType, ...rest } = meta;
      void _mainType;
      const id = await saveWorkflow({ id: workflowId, ...rest, contentTypes, tags: tagPicker.accepted.map((entry) => entry.tag), status: target, visibility, communityId, steps }, user.id);
      setWorkflowId(id);
      setStatus(target);
      setDirty(false);
      setSaveState("saved");
      if (!editId) window.history.replaceState(null, "", `${window.location.pathname}?edit=${id}`);
      invalidateWorkflowFlow(id);
      if (target === "published") {
        // Workflow kaydedildi; Space bağı ayrı bir adım. Başarısız olursa kullanıcı yerinde kalır (Paylaş yeniden dener), workflow kaybolmaz.
        try {
          spaceChoice.settle(await applyWorkflowSpaceChoice({ workflowId: id, title: meta.title, userId: user.id, choice: spaceChoice.choice }));
        } catch {
          setSaveState("error");
          setSaveError(t("wfSpace.field.applyFailed"));
          return false;
        }
      }
      if (target === "published") router.push((await returnToCommunity("workflow", id)) ?? `/workflows/local?id=${id}`);
      return true;
    } catch {
      setSaveState("error");
      setSaveError(t("workflow.errorSave"));
      return false;
    }
  }

  // Tek sayfa form (docs/history/244-*): yayın bölümü + ✕'teki "kaydedilsin mi?" (yayındaki workflow taslağa dönmez).
  const panelRef = useRef<PublishPanelHandle>(null);
  const [attempted, setAttempted] = useState(false);
  const leave = useComposeLeave({ dirty, saveDraft: status === "published" ? undefined : () => handleSave("draft") });
  // Eksikler: başlık, adım ve adım içerikleri (yayın kuralı `validateWorkflow`); ilk "Paylaş" denemesinden sonra gösterilir.
  const liveIssues = validateWorkflow(meta, steps, true);

  const gate = authLoading || loadState === "loading" || mode === null ? (
    <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">{t("common.loading")}</div>
  ) : !user ? (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("auth.loginRequiredTitle")}</h1>
        <p className="mb-4 text-sm text-text-muted">{t("workflow.loginRequired")}</p>
        <Link href="/login" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
          {t("header.login")}
        </Link>
      </div>
  ) : loadState === "notfound" || loadState === "forbidden" ? (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("workflow.notFoundTitle")}</h1>
        <p className="mb-4 text-sm text-text-muted">{loadState === "forbidden" ? t("workflow.notYours") : t("workflow.notFoundBody")}</p>
        <Link href="/workflows" className="text-sm font-medium text-primary hover:underline">
          {t("workflow.pageTitle")}
        </Link>
      </div>
  ) : null;

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

  if (gate || !user || mode === null) return <div ref={rootRef} className="w-full min-w-0">{gate}</div>;

  const isSaveMode = status === "published";
  const problems: PublishProblem[] = liveIssues
    .filter((issue) => issue.level === "error")
    .map((issue, index) => ({
      key: `${issue.code}-${issue.stepId ?? index}`,
      label: issueMessage(issue),
      onFix: issue.stepId
        ? () => {
            setSelectedId(issue.stepId!);
            if (mode === "mobile") setSheetOpen(true);
          }
        : () => document.getElementById("wf-title")?.focus(),
    }));
  const warnings = liveIssues.filter((issue) => issue.level !== "error");

  function updateMeta(patch: Partial<WorkflowMeta>) {
    setMeta((prev) => ({ ...prev, ...patch }));
    touch();
  }
  const categoryPath = meta.category ? taxonomyPathLabel({ contentType: meta.contentType, category: meta.category, subcategory: meta.subcategory }, language, false) : "";

  return (
    <ComposeShell
      wide
      title={editId ? t("workflow.editTitle") : t("compose.newWorkflow")}
      titleExtra={<KindDraftsButton kind="workflow" compact />}
      status={
        <span aria-live="polite" className={cn("font-medium", dirty ? "text-warning" : saveState === "saved" ? "text-success" : "text-text-muted")}>
          {stateLabel}
        </span>
      }
      onClose={leave.requestClose}
      onPublish={() => panelRef.current?.publish()}
      publishLabel={isSaveMode ? t("common.save") : t("common.share")}
      publishDisabled={saveState === "saving"}
      publishDimmed={problems.length > 0}
      onSaveDraft={status === "published" || communityId ? undefined : () => void handleSave("draft")}
    >
    <div ref={rootRef} className="w-full min-w-0 space-y-6">
      {notice && (
        <p className="flex items-start justify-between gap-2 rounded-md bg-primary-soft p-2.5 text-caption text-primary">
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label={t("common.close")}>
            <X size={14} />
          </button>
        </p>
      )}

      {communityId && (
        <ComposeAudienceLine profile={ownProfile} label={communityName ?? t("compose.aCommunity")} onClick={() => document.getElementById("compose-publish")?.scrollIntoView({ behavior: "smooth", block: "center" })} />
      )}

      <WorkflowMetaForm
        meta={meta}
        titleError={issues.some((i) => i.code === "titleRequired") || (attempted && !meta.title.trim())}
        onChange={(patch) => {
          setMeta((prev) => ({ ...prev, ...patch }));
          touch();
        }}
      />

      <ComposeSection title={t("workflow.stepsHeading")}>
      {mode !== "mobile" && (
        <div className="grid grid-cols-[minmax(220px,280px)_minmax(0,1fr)] items-start gap-4">
          <section className={cn(card, "sticky top-20 min-w-0 max-h-[calc(100dvh-6rem)] overflow-y-auto")}>
            {list}
          </section>
          <section className={cn(card, "min-w-0")}>
            {panes && selected ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="min-w-0 truncate text-base font-semibold text-text">
                    {selectedIndex + 1} · {selected.title || t("workflow.untitledStep")}
                  </h2>
                  <StepActions
                    index={selectedIndex}
                    count={steps.length}
                    onDuplicate={() => handleDuplicate(selected)}
                    onDelete={() => handleDelete(selected)}
                    onMove={(delta) => handleReorder(selectedIndex, selectedIndex + delta)}
                  />
                </div>
                <Tabs
                  items={[
                    { key: "general" as const, label: t("workflow.tabGeneral") },
                    { key: "io" as const, label: t("workflow.tabIO") },
                    { key: "content" as const, label: t("workflow.tabContent") },
                  ]}
                  active={detailTab === "settings" ? "general" : detailTab}
                  onChange={setDetailTab}
                  ariaLabel={t("workflow.stepDetailAria")}
                />
                {detailTab !== "content" && detailTab !== "io" && panes.general}
                {detailTab === "io" && (
                  <div className="space-y-4">
                    {panes.io}
                    {panes.preview}
                  </div>
                )}
                {detailTab === "content" && (
                  <div className="space-y-4">
                    {panes.content}
                    {panes.preview}
                  </div>
                )}
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-text-muted">{t("workflow.selectStepHint")}</p>
            )}
          </section>
        </div>
      )}

      {mode === "mobile" && (
        <section className={card}>
          {list}
        </section>
      )}

      </ComposeSection>

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

      <ComposeSection title={t("compose.sectionDetails")}>
        <FormDisclosure id="tool" label={t("formSection.tool")} value={resolveToolRefs(meta.tools)[0]?.label}>
          <ToolPicker value={meta.tools} onChange={(tools) => updateMeta({ tools })} contentType={meta.contentType} category={meta.category} />
          <p className="mt-2 text-caption text-text-muted">{t("workflow.noteToolsMeta")}</p>
        </FormDisclosure>
        <FormDisclosure id="category" label={t("taxonomy.categoryLabel")} value={categoryPath}>
          <TaxonomyPicker
            bare
            value={{ contentType: meta.contentType, category: meta.category, subcategory: meta.subcategory }}
            onChange={(next) => updateMeta({ contentType: next.contentType, category: next.category, subcategory: next.subcategory })}
          />
        </FormDisclosure>
        <FormDisclosure
          id="tags"
          label={t("forms.tags")}
          value={tagPicker.accepted.length > 0 ? t("compose.tagCount", { count: tagPicker.accepted.length }) : undefined}
          hint={tagPicker.suggested.length > 0 ? t("compose.suggestionCount", { count: tagPicker.suggested.length }) : undefined}
        >
          <TagPicker picker={tagPicker} />
        </FormDisclosure>
        <SuggestedTagsRow picker={tagPicker} />
        <WorkflowSpaceField
          choice={spaceChoice.choice}
          onChange={(next) => {
            spaceChoice.update(next);
            touch();
          }}
          spaces={spaceChoice.spaces}
          failed={spaceChoice.failed}
          workflowVisibility={visibility}
          isDraft={status !== "published"}
        />
      </ComposeSection>

      <ComposeSection title={t("publish.whoSees")} id="compose-publish">
        <PublishPanel
          ref={panelRef}
          onConfirm={() => void handleSave("published")}
          onSaveDraft={status === "published" ? undefined : () => void handleSave("draft")}
          onBlocked={(problem) => {
            setAttempted(true);
            problem.onFix?.();
          }}
          busy={saveState === "saving"}
          confirmLabel={saveState === "saving" ? t("workflow.saving") : isSaveMode ? t("common.save") : t("common.share")}
          hideDestination={Boolean(editId)}
          visibility={visibility}
          onVisibilityChange={(next) => {
            setVisibility(next);
            touch();
          }}
          problems={problems}
          showProblems={attempted}
          preview={
            <PublishPreview
              thumbnail={meta.media[0]?.url ?? null}
              icon={WorkflowIcon}
              typeLabel={t("workflow.singular")}
              title={meta.title.trim() || t("compose.untitledWorkflow")}
              meta={t("workflow.stepCount", { count: steps.length })}
            />
          }
        >
          {saveState === "saved" && status === "draft" && !dirty && <p className="text-sm text-success">{t("draft.saved")}</p>}
          {saveError && <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">{saveError}</p>}
          {attempted && warnings.length > 0 && (
            <div role="status" className="rounded-md border border-warning/40 bg-warning/5 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-text">
                <AlertTriangle size={14} className="text-warning" />
                {t("workflow.issuesHeading")}
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-caption text-text-secondary">
                {warnings.map((issue, i) => (
                  <li key={i}>{issueMessage(issue)}</li>
                ))}
              </ul>
            </div>
          )}
        </PublishPanel>
      </ComposeSection>

      {addTarget && (
        <AddContentModal
          initialMode={addTarget.initialMode}
          onSelect={handleContent}
          onClose={() => setAddTarget(null)}
        />
      )}
      {leave.dialog}
    </div>
    </ComposeShell>
  );
}
