"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FlaskConical, Plus, Redo2, RotateCcw, Save, Share2, Sparkles, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-provider";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { appendLinkedStep, newStep } from "@/lib/workflow-logic";
import { generatorRef, promptRef } from "@/lib/supabase/workflows";
import { absoluteUrl, copyTextToClipboard, studioHref } from "@/lib/utils";
import { AddSourceModal, type PickedItem } from "./add-source-modal";
import { ComparePane, DRAFT_ID } from "./compare-pane";
import { GeneratorPane } from "./generator-pane";
import { PresetPane } from "./preset-pane";
import { PromptPane } from "./prompt-pane";
import { ResultPane } from "./result-pane";
import { SaveNewModal } from "./save-new-modal";
import { SourcePanel } from "./source-panel";
import { KIND_ICONS } from "./studio-meta";
import { composeStudioResult, loadStudioSource, STUDIO_KINDS, type LoadedSource, type StudioKind, type StudioRef } from "./studio-model";
import { saveGeneratorAsNew, savePromptAsNew, saveWorkflowAsNew, type SaveTarget } from "./studio-save";
import { useStudio } from "./use-studio";
import { VersionsPane } from "./versions-pane";
import { WorkflowPane } from "./workflow-pane";
import type { WorkflowStep } from "@/types";

type TopTab = "work" | "compare" | "versions";

function refsFromParams(params: URLSearchParams): StudioRef[] {
  return STUDIO_KINDS.flatMap((kind) => {
    // Old links used `?dna=<promptId>`: a prompt's DNA now comes with the prompt.
    const id = params.get(kind) ?? (kind === "prompt" ? params.get("dna") : null);
    return id ? [{ kind, id }] : [];
  });
}

/**
 * Studio: a development workspace over the existing Prompt / Prompt DNA /
 * Generator / Hazır Ayar / Workflow records. Sources are attached by
 * reference and edited as a local draft; the originals are never written.
 * Wide: sources | editor | result. Narrow: chips, one focused editor, result.
 */
export function StudioView() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { profile } = useOwnProfile();
  const { requireAuth } = useAuthPrompt();
  const { addPrompt } = useRealPrompts();
  const studio = useStudio();
  const { state, changes, attach } = studio;

  const [loading, setLoading] = useState(() => refsFromParams(searchParams).length > 0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tab, setTab] = useState<TopTab>("work");
  const [pickerMode, setPickerMode] = useState<"source" | "step" | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<{ aId: string; bId: string }>({ aId: "", bId: DRAFT_ID });
  const initialised = useRef(false);
  const noticeTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600);
  }, []);

  // Load whatever the URL names, once.
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const refs = refsFromParams(searchParams);
    if (refs.length === 0) return;
    (async () => {
      const results = await Promise.all(refs.map((ref) => loadStudioSource(ref)));
      const loaded = results.flat();
      if (loaded.length === 0) setLoadFailed(true);
      else attach(loaded);
      setLoading(false);
    })();
  }, [searchParams, attach]);

  // Mirror the attached sources into the URL so a refresh/share reopens the same set.
  const hrefFromSources = useMemo(
    () =>
      studioHref({
        prompt: state.sources.prompt?.prompt.id,
        generator: state.sources.generator?.generator.slug,
        preset: state.sources.preset?.preset.id,
        workflow: state.sources.workflow?.workflow.id,
      }),
    [state.sources],
  );
  useEffect(() => {
    if (loading) return;
    const current = `/studio${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    if (current !== hrefFromSources) router.replace(hrefFromSources, { scroll: false });
  }, [hrefFromSources, loading, router, searchParams]);

  useEffect(() => {
    if (changes.length === 0 || !studio.unsaved) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [changes.length, studio.unsaved]);

  const attached = STUDIO_KINDS.filter((kind) => state.sources[kind]);
  const enableNegative = state.sources.generator?.generator.enableNegativePrompt ?? false;
  const result = useMemo(() => composeStudioResult(state.draft, language, enableNegative), [state.draft, language, enableNegative]);
  const firstVersionId = state.versions[0]?.id ?? "";

  async function attachRef(ref: StudioRef) {
    const loaded: LoadedSource[] = await loadStudioSource(ref);
    if (loaded.length === 0) {
      flash(t("studio.loadError"));
      return;
    }
    const replacing = loaded.some((l) => {
      if (!state.sources[l.kind]) return false;
      return JSON.stringify(state.draft[l.kind]) !== JSON.stringify(state.baseline[l.kind]);
    });
    if (replacing && !window.confirm(t("studio.replaceConfirm"))) return;
    studio.attach(loaded);
  }

  function handlePick(item: PickedItem) {
    if (pickerMode === "step") {
      const step: WorkflowStep = newStep(item.kind === "generator" ? "generator" : "prompt");
      step.title = item.title;
      if (item.kind === "generator") step.content = generatorRef(item.generator);
      else if (item.kind === "prompt") step.content = promptRef(item.prompt);
      studio.edit((d) => (d.workflow ? { ...d, workflow: { ...d.workflow, steps: appendLinkedStep(d.workflow.steps, step, t("studio.defaultOutput")) } } : d));
      setPickerMode(null);
      return;
    }
    setPickerMode(null);
    void attachRef({ kind: item.kind, id: item.id });
  }

  function openStepContent(step: WorkflowStep) {
    if (!step.content) return;
    const kind: StudioKind = step.stepType === "generator" ? "generator" : "prompt";
    void attachRef({ kind, id: step.content.id });
  }

  function newStudio() {
    if (changes.length > 0 && studio.unsaved && !window.confirm(t("studio.newConfirm"))) return;
    studio.clear();
    setCompareIds({ aId: "", bId: DRAFT_ID });
    setTab("work");
    router.replace("/studio", { scroll: false });
  }

  async function share() {
    const ok = await copyTextToClipboard(absoluteUrl(hrefFromSources));
    flash(ok ? t("studio.linkCopied") : t("studio.linkCopyFailed"));
  }

  function openSave() {
    if (!requireAuth("create")) return;
    setSaveOpen(true);
  }

  async function saveNew(target: SaveTarget, title: string): Promise<string> {
    if (!user || !profile) throw new Error("not signed in");
    if (target === "prompt") return savePromptAsNew({ title, draft: state.draft, sources: state.sources, result, language, profile, addPrompt });
    if (target === "generator") return saveGeneratorAsNew({ title, draft: state.draft, sources: state.sources, profile });
    return saveWorkflowAsNew({ title, draft: state.draft, sources: state.sources, profile });
  }

  const active = state.active && state.sources[state.active] ? state.active : (attached[0] ?? null);
  const ActiveIcon = active ? KIND_ICONS[active] : null;

  const editor = (() => {
    if (!active) return null;
    if (active === "prompt") return <PromptPane draft={state.draft} baseline={state.baseline} contentType={state.sources.prompt?.prompt.contentType ?? "text"} edit={studio.edit} />;
    if (active === "generator") return <GeneratorPane draft={state.draft} edit={studio.edit} />;
    if (active === "preset" && state.sources.preset) return <PresetPane draft={state.draft} preset={state.sources.preset.preset} edit={studio.edit} />;
    if (active === "workflow") return <WorkflowPane draft={state.draft} edit={studio.edit} onAddStep={() => setPickerMode("step")} onOpenStepContent={openStepContent} />;
    return null;
  })();

  const iconButton =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-soft disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <div className="@container mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-5 lg:px-6 lg:py-6">
      <header className="mb-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <FlaskConical className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 font-display text-h2 font-semibold text-text">
                {t("studio.title")}
                <Badge variant="accent">{t("studio.beta")}</Badge>
              </h1>
              <p className="text-small text-text-secondary">{t("studio.subtitle")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <button type="button" className={iconButton} onClick={() => router.back()} aria-label={t("studio.back")}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" className={iconButton} onClick={studio.undo} disabled={!studio.canUndo} aria-label={t("studio.undo")}>
              <Undo2 className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" className={iconButton} onClick={studio.redo} disabled={!studio.canRedo} aria-label={t("studio.redo")}>
              <Redo2 className="h-4 w-4" aria-hidden />
            </button>
            <Button type="button" variant="outline" onClick={newStudio} disabled={attached.length === 0} className="h-11" aria-label={t("studio.newStudio")}>
              <Plus className="h-4 w-4" aria-hidden />
              <span className="max-sm:sr-only">{t("studio.newStudio")}</span>
            </Button>
            <Button type="button" variant="outline" onClick={share} disabled={attached.length === 0} className="h-11" aria-label={t("studio.share")}>
              <Share2 className="h-4 w-4" aria-hidden />
              <span className="max-sm:sr-only">{t("studio.share")}</span>
            </Button>
            <Button type="button" variant="outline" onClick={() => studio.saveVersion("")} disabled={!studio.unsaved} className="h-11" aria-label={t("studio.saveVersion")}>
              <Save className="h-4 w-4" aria-hidden />
              <span className="max-sm:sr-only">{t("studio.save")}</span>
            </Button>
            <Button type="button" onClick={openSave} disabled={attached.length === 0} className="h-11">
              <Sparkles className="h-4 w-4" aria-hidden />
              {t("studio.saveNewShort")}
            </Button>
          </div>
        </div>
      </header>
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 md:bottom-8">
        {notice && <p className="animate-pop-in rounded-full border border-border bg-surface-elevated px-4 py-2 text-small text-text shadow-pop">{notice}</p>}
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-11 w-full max-w-md" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : attached.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title={loadFailed ? t("studio.loadError") : t("studio.emptyTitle")}
          description={t("studio.emptyBody")}
          action={{ label: t("studio.addSource"), onClick: () => setPickerMode("source") }}
        />
      ) : (
        <>
          <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <Tabs
              items={[
                { key: "work" as const, label: t("studio.tab.work") },
                { key: "compare" as const, label: t("studio.tab.compare") },
                { key: "versions" as const, label: t("studio.tab.versions"), count: state.versions.length },
              ]}
              active={tab}
              onChange={setTab}
              ariaLabel={t("studio.title")}
            />
            <div className="flex items-center gap-2">
              {changes.length > 0 ? <Badge variant="accent">{t("studio.changeCount", { count: changes.length })}</Badge> : <Badge variant="neutral">{t("studio.noChanges")}</Badge>}
              {studio.unsaved && <Badge variant="warning">{t("studio.unsaved")}</Badge>}
              {changes.length > 0 && (
                <button type="button" onClick={studio.reset} className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-caption font-medium text-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  {t("studio.resetChanges")}
                </button>
              )}
            </div>
          </div>

          {tab === "work" && (
            <div className="grid gap-4 @min-[720px]:grid-cols-[minmax(0,1fr)_320px] @min-[1000px]:grid-cols-[220px_minmax(0,1fr)_340px]">
              <div className="hidden @min-[1000px]:block">
                <SourcePanel layout="cards" sources={state.sources} draft={state.draft} active={active} onSelect={studio.setActive} onRemove={studio.detach} onAdd={() => setPickerMode("source")} />
              </div>
              <div className="min-w-0 @min-[720px]:col-span-2 @min-[1000px]:hidden">
                <SourcePanel layout="chips" sources={state.sources} draft={state.draft} active={active} onSelect={studio.setActive} onRemove={studio.detach} onAdd={() => setPickerMode("source")} />
              </div>
              <section aria-label={active ? t(`studio.kind.${active}` as const) : t("studio.title")} className="min-w-0 @min-[720px]:order-none">
                {active && ActiveIcon && (
                  <h2 className="mb-3 flex items-center gap-2 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
                    <ActiveIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    {t(`studio.kind.${active}` as const)}
                  </h2>
                )}
                <div key={active} className="animate-fade-in">
                  {editor}
                </div>
              </section>
              <div className="min-w-0 self-start rounded-lg border border-border-soft bg-surface p-4 @min-[720px]:sticky @min-[720px]:top-20">
                <ResultPane draft={state.draft} baseline={state.baseline} sources={state.sources} changeCount={changes.length} />
              </div>
            </div>
          )}

          {tab === "compare" && (
            <div className="mx-auto max-w-5xl">
              <ComparePane
                versions={state.versions}
                draft={state.draft}
                aId={compareIds.aId || firstVersionId}
                bId={compareIds.bId}
                onChange={(next) => setCompareIds((prev) => ({ ...prev, ...next }))}
                enableNegative={enableNegative}
              />
            </div>
          )}

          {tab === "versions" && (
            <div className="mx-auto max-w-2xl">
              <VersionsPane
                versions={state.versions}
                draft={state.draft}
                unsaved={studio.unsaved}
                onSave={studio.saveVersion}
                onCompare={(id) => {
                  setCompareIds({ aId: id, bId: DRAFT_ID });
                  setTab("compare");
                }}
                onRestore={(id) => {
                  studio.restoreVersion(id);
                  setTab("work");
                  flash(t("studio.restored"));
                }}
              />
            </div>
          )}
        </>
      )}

      {pickerMode && (
        <AddSourceModal
          kinds={pickerMode === "step" ? ["prompt", "generator"] : STUDIO_KINDS}
          title={pickerMode === "step" ? t("studio.addStep") : t("studio.addSource")}
          onPick={handlePick}
          onClose={() => setPickerMode(null)}
        />
      )}
      {saveOpen && <SaveNewModal draft={state.draft} result={result} sources={state.sources} onSave={saveNew} onClose={() => setSaveOpen(false)} />}
    </div>
  );
}
