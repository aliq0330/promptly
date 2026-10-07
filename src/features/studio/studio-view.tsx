"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FlaskConical, GitCompare, Plus, Redo2, RotateCcw, Save, Share2, Shuffle, Sparkles, Trash2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth-provider";
import { useAuthStatus } from "@/features/auth/use-auth-status";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { appendLinkedStep, newStep } from "@/lib/workflow-logic";
import { generatorRef, promptRef } from "@/lib/supabase/workflows";
import { deleteStudioSession, fetchStudioSession } from "@/lib/supabase/studio-sessions";
import { shuffleUnlockedValues } from "@/lib/studio-v2";
import { absoluteUrl, copyTextToClipboard, studioHref } from "@/lib/utils";
import { AddSourceModal, type PickedItem } from "./add-source-modal";
import { ComparePane, DRAFT_ID } from "./compare-pane";
import { CompositionView } from "./composition-view";
import { GeneratorPane } from "./generator-pane";
import { PresetPane } from "./preset-pane";
import { PromptPane } from "./prompt-pane";
import { ResultPane } from "./result-pane";
import { SaveNewModal } from "./save-new-modal";
import { SourcePanel } from "./source-panel";
import { StudioHome } from "./studio-home";
import { StudioMenu, type StudioMenuItem } from "./studio-menu";
import { VariationModal } from "./variation-modal";
import { VersionStrip } from "./version-strip";
import { useStudioSession } from "./use-studio-session";
import { KIND_ICONS } from "./studio-meta";
import { composeStudioResult, loadStudioSource, sourcesFromLoaded, STUDIO_KINDS, type LoadedSource, type StudioKind, type StudioRef } from "./studio-model";
import { saveGeneratorAsNew, savePromptAsNew, saveWorkflowAsNew, type SaveTarget } from "./studio-save";
import { clearPiece, useStudio, type HydratePayload } from "./use-studio";
import { VersionsPane } from "./versions-pane";
import { WorkflowPane } from "./workflow-pane";
import type { StudioSnapshot } from "@/lib/studio-diff";
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
 * Studio V2: the creative workspace over the existing Prompt / Prompt DNA /
 * Generator / Hazır Ayar / Workflow records. Sources are attached by
 * reference and edited as a local draft; the originals are never written.
 * `/studio` is the front door (recent sessions); `/studio?session=…` reopens a
 * stored session; `/studio?prompt=…` etc. open an ad-hoc workspace.
 * Wide: sources | develop | result. Tablet: source rail | develop over result.
 * Phone: chips, one focused editor, result, versions.
 */
export function StudioView() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const authStatus = useAuthStatus();
  const { profile } = useOwnProfile();
  const { requireAuth } = useAuthPrompt();
  const { addPrompt } = useRealPrompts();
  const studio = useStudio();
  const { state, changes, attach } = studio;

  const sessionParam = searchParams.get("session");
  const initialRefs = useMemo(() => refsFromParams(searchParams), [searchParams]);
  // The URL is the source of truth for which screen shows: a bare `/studio` is Home, anything with parameters is a workspace.
  const urlKey = searchParams.toString();
  const mode = urlKey === "" ? "home" : "workspace";
  const [loading, setLoading] = useState(() => Boolean(sessionParam) || initialRefs.length > 0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tab, setTab] = useState<TopTab>("work");
  const [pickerMode, setPickerMode] = useState<"source" | "step" | null>(null);
  const [pickerFirst, setPickerFirst] = useState<StudioKind | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [variationOpen, setVariationOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<{ aId: string; bId: string }>({ aId: "", bId: DRAFT_ID });
  const initialised = useRef(false);
  const noticeTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600);
  }, []);

  const attached = STUDIO_KINDS.filter((kind) => state.sources[kind]);
  const defaultTitle = state.draft.prompt?.title || state.draft.generator?.title || state.draft.preset?.title || state.draft.workflow?.title || t("studio.untitledSession");
  const session = useStudioSession({ state, userId: user?.id ?? null, defaultTitle, onCreated: studio.setSessionId });

  /** Fetches a stored session and re-fetches its sources from the library. No state is touched here. */
  const resolveStoredSession = useCallback(async (id: string) => {
    const stored = await fetchStudioSession(id);
    if (!stored) return null;
    const refs: StudioRef[] = STUDIO_KINDS.flatMap((kind) => (stored.refs[kind] ? [{ kind, id: stored.refs[kind]! }] : []));
    const loaded = (await Promise.all(refs.map((ref) => loadStudioSource(ref)))).flat();
    const present = new Set(loaded.map((l) => l.kind));
    // Pieces whose source is gone are dropped, not faked.
    const missing = STUDIO_KINDS.filter((kind) => stored.refs[kind] && !present.has(kind));
    const strip = (snapshot: StudioSnapshot) => missing.reduce((acc, kind) => clearPiece(acc, kind), snapshot);
    const payload: HydratePayload = {
      sessionId: stored.id,
      title: stored.title,
      sources: sourcesFromLoaded(loaded),
      baseline: strip(stored.baseline),
      draft: strip(stored.draft),
      versions: stored.versions.map((v) => ({ id: v.id, number: v.number, label: v.label, kind: v.kind, parentId: v.parentId, snapshot: strip(v.snapshot), createdAt: v.createdAt })),
      active: stored.active && present.has(stored.active) ? stored.active : (STUDIO_KINDS.find((k) => present.has(k)) ?? null),
    };
    return { payload, missingCount: missing.length };
  }, []);

  const applyStoredSession = useCallback(
    (resolved: Awaited<ReturnType<typeof resolveStoredSession>>) => {
      if (!resolved) {
        setLoadFailed(true);
        setLoading(false);
        return;
      }
      session.markLoaded(resolved.payload);
      studio.hydrate(resolved.payload);
      setCompareIds({ aId: "", bId: DRAFT_ID });
      setLoading(false);
      if (resolved.missingCount > 0) flash(t("studio.sourceMissing"));
    },
    // `session.markLoaded` / `studio.hydrate` are stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flash, t],
  );

  /** Opens a stored session from Home (the URL flips to the workspace at the same time). */
  function openSession(id: string) {
    setLoading(true);
    setLoadFailed(false);
    setTab("work");
    router.replace(`/studio?session=${id}`, { scroll: false });
    void resolveStoredSession(id).then(applyStoredSession);
  }

  // First load: a stored session (needs to know who is signed in first) or the sources the URL names.
  useEffect(() => {
    if (initialised.current) return;
    if (sessionParam) {
      if (authStatus === "loading") return;
      initialised.current = true;
      void resolveStoredSession(sessionParam).then(applyStoredSession);
      return;
    }
    initialised.current = true;
    if (initialRefs.length === 0) return;
    (async () => {
      const results = await Promise.all(initialRefs.map((ref) => loadStudioSource(ref)));
      const loaded = results.flat();
      if (loaded.length === 0) setLoadFailed(true);
      else attach(loaded);
      setLoading(false);
    })();
  }, [sessionParam, authStatus, initialRefs, attach, resolveStoredSession, applyStoredSession]);

  // Mirror the workspace into the URL so a refresh/share reopens it: the stored session, else the attached sources. A bare `/studio` is Home.
  const hrefFromState = useMemo(
    () =>
      state.sessionId
        ? `/studio?session=${state.sessionId}`
        : attached.length > 0
          ? studioHref({
              prompt: state.sources.prompt?.prompt.id,
              generator: state.sources.generator?.generator.slug,
              preset: state.sources.preset?.preset.id,
              workflow: state.sources.workflow?.workflow.id,
            })
          : "/studio?new=1",
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.sessionId, state.sources],
  );
  useEffect(() => {
    if (loading || mode !== "workspace") return;
    if (`/studio?${urlKey}` !== hrefFromState) router.replace(hrefFromState, { scroll: false });
  }, [hrefFromState, loading, mode, router, urlKey]);

  const hasUnsavedWork = session.dirty && (changes.length > 0 || state.sessionId !== null || state.versions.length > 1);
  useEffect(() => {
    if (!hasUnsavedWork) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedWork]);

  // Undo / redo / save shortcuts (not while a dialog is open, so its own inputs keep their native behaviour).
  useEffect(() => {
    if (mode !== "workspace") return;
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('[role="dialog"], [data-native-undo]')) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) studio.redo();
        else studio.undo();
      } else if (key === "y") {
        event.preventDefault();
        studio.redo();
      } else if (key === "s") {
        event.preventDefault();
        void saveSession();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, studio.undo, studio.redo, user, session.saveNow]);

  const enableNegative = state.sources.generator?.generator.enableNegativePrompt ?? false;
  // The result/recipe are derived from a deferred copy of the draft, so typing in a long prompt never waits on recomputing them.
  const deferredDraft = useDeferredValue(state.draft);
  const result = useMemo(() => composeStudioResult(deferredDraft, language, enableNegative), [deferredDraft, language, enableNegative]);
  const firstVersionId = state.versions[0]?.id ?? "";
  const lastVersionId = state.versions[state.versions.length - 1]?.id ?? null;

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

  function confirmLeave(): boolean {
    return !hasUnsavedWork || state.sessionId !== null || window.confirm(t("studio.newConfirm"));
  }

  function startNew(startWith?: StudioKind) {
    if (mode === "workspace" && !confirmLeave()) return;
    studio.clear();
    setCompareIds({ aId: "", bId: DRAFT_ID });
    setTab("work");
    setLoadFailed(false);
    router.replace("/studio?new=1", { scroll: false });
    if (startWith) {
      setPickerFirst(startWith);
      setPickerMode("source");
    }
  }

  function goHome() {
    if (!confirmLeave()) return;
    router.replace("/studio", { scroll: false });
  }

  async function share() {
    const sourceHref = studioHref({
      prompt: state.sources.prompt?.prompt.id,
      generator: state.sources.generator?.generator.slug,
      preset: state.sources.preset?.preset.id,
      workflow: state.sources.workflow?.workflow.id,
    });
    const ok = await copyTextToClipboard(absoluteUrl(sourceHref));
    flash(ok ? t("studio.linkCopied") : t("studio.linkCopyFailed"));
  }

  async function saveSession() {
    if (attached.length === 0) return;
    if (!requireAuth("create")) return;
    const ok = await session.saveNow();
    flash(ok ? t("studio.sessionSaved") : t("studio.sessionSaveError"));
  }

  async function deleteSession() {
    if (!state.sessionId || !window.confirm(t("studio.deleteSessionAsk"))) return;
    try {
      await deleteStudioSession(state.sessionId);
      studio.clear();
      router.replace("/studio", { scroll: false });
    } catch (err) {
      console.error("delete studio session", err);
      flash(t("studio.sessionSaveError"));
    }
  }

  function openCreate() {
    if (!requireAuth("create")) return;
    setSaveOpen(true);
  }

  function createVariation(label: string, shuffle: boolean) {
    let draft = state.draft;
    if (shuffle && draft.generator) {
      const out = shuffleUnlockedValues(draft.generator.schema, draft.generator.values, draft.generator.locked ?? []);
      draft = { ...draft, generator: { ...draft.generator, values: out.values } };
    }
    studio.createVariation(label, draft, t("studio.autoVersionLabel"));
    setVariationOpen(false);
    flash(t("studio.variationCreated", { name: label }));
  }

  function compareWithCurrent(id: string) {
    const aId = id === DRAFT_ID ? (lastVersionId ?? firstVersionId) : id;
    setCompareIds({ aId, bId: DRAFT_ID });
    setTab("compare");
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

  if (mode === "home") {
    return (
      <div className="@container mx-auto w-full max-w-[1100px] px-3 py-4 sm:px-5 lg:px-6 lg:py-6">
        <StudioHome
          onNew={startNew}
          onOpen={openSession}
          onContinue={attached.length > 0 ? () => router.replace(hrefFromState, { scroll: false }) : undefined}
        />
      </div>
    );
  }

  const menuItems: StudioMenuItem[] = [
    { key: "version", label: t("studio.saveVersion"), icon: Save, onSelect: () => studio.saveVersion(""), disabled: attached.length === 0 || !studio.unsaved },
    { key: "variation", label: t("studio.variation"), icon: Shuffle, onSelect: () => setVariationOpen(true), disabled: attached.length === 0 },
    { key: "reset", label: t("studio.resetChanges"), icon: RotateCcw, onSelect: studio.reset, disabled: changes.length === 0 },
    { key: "share", label: t("studio.share"), icon: Share2, onSelect: () => void share(), disabled: attached.length === 0 },
    { key: "new", label: t("studio.newStudio"), icon: Plus, onSelect: () => startNew() },
    ...(state.sessionId ? [{ key: "delete", label: t("studio.deleteSession"), icon: Trash2, onSelect: () => void deleteSession(), danger: true }] : []),
  ];

  const statusText =
    session.status === "saving"
      ? t("studio.status.saving")
      : session.status === "error"
        ? t("studio.status.error")
        : hasUnsavedWork || (session.dirty && attached.length > 0 && changes.length > 0)
          ? t("studio.status.unsaved")
          : session.status === "saved"
            ? t("studio.status.saved")
            : null;

  return (
    <div className="@container mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-5 lg:px-6 lg:py-6">
      <header className="mb-4 flex min-w-0 flex-wrap items-center gap-2">
        <button type="button" className={`${iconButton} order-1`} onClick={goHome} aria-label={t("studio.backToStudio")} title={t("studio.backToStudio")}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </button>
        <span className="order-1 hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary sm:flex">
          <FlaskConical className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="order-2 min-w-0 flex-1 basis-40">
          <label htmlFor="studio-session-name" className="sr-only">
            {t("studio.sessionName")}
          </label>
          <input
            id="studio-session-name"
            data-native-undo
            value={state.title}
            onChange={(event) => studio.setTitle(event.target.value)}
            maxLength={120}
            placeholder={defaultTitle}
            className="h-11 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 font-display text-h3 font-semibold text-text placeholder:text-text-secondary hover:border-border-soft focus:border-primary"
          />
        </div>
        <div className="order-3 flex min-w-0 basis-full flex-wrap items-center gap-2 sm:basis-auto">
          <button type="button" className={iconButton} onClick={studio.undo} disabled={!studio.canUndo} aria-label={t("studio.undo")} title={`${t("studio.undo")} (Ctrl+Z)`}>
            <Undo2 className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={iconButton} onClick={studio.redo} disabled={!studio.canRedo} aria-label={t("studio.redo")} title={`${t("studio.redo")} (Ctrl+Shift+Z)`}>
            <Redo2 className="h-4 w-4" aria-hidden />
          </button>
          <div role="status" aria-live="polite" className="min-w-0 text-caption text-text-secondary">
            {statusText && (
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${session.status === "error" ? "bg-danger" : session.status === "saving" ? "animate-pulse bg-primary" : hasUnsavedWork ? "bg-warning" : "bg-success"}`} aria-hidden />
                <span className="max-sm:max-w-[10rem] max-sm:truncate">{statusText}</span>
                {session.status === "error" && (
                  <button type="button" onClick={() => void saveSession()} className="ml-1 inline-flex h-9 items-center rounded-md px-2 font-medium text-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    {t("studio.retry")}
                  </button>
                )}
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void saveSession()} disabled={attached.length === 0 || session.status === "saving"} className="h-11" aria-label={t("studio.save")}>
              <Save className="h-4 w-4" aria-hidden />
              <span className="max-sm:sr-only">{t("studio.save")}</span>
            </Button>
            <Button type="button" variant="outline" onClick={() => setTab("compare")} disabled={attached.length === 0} className="h-11" aria-label={t("studio.compare")}>
              <GitCompare className="h-4 w-4 sm:hidden" aria-hidden />
              <span className="max-sm:sr-only">{t("studio.compare")}</span>
            </Button>
            <Button type="button" onClick={openCreate} disabled={attached.length === 0} className="h-11" aria-label={t("studio.saveNewShort")}>
              <Sparkles className="h-4 w-4" aria-hidden />
              <span className="max-md:sr-only">{t("studio.saveNewShort")}</span>
            </Button>
          </div>
        </div>
        <div className="order-2 sm:order-4">
          <StudioMenu items={menuItems} />
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
          action={{ label: t("studio.addSource"), onClick: () => { setPickerFirst(null); setPickerMode("source"); } }}
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
            <div className="flex flex-wrap items-center gap-2">
              {changes.length > 0 ? <Badge variant="accent">{t("studio.changeCount", { count: changes.length })}</Badge> : <Badge variant="neutral">{t("studio.noChanges")}</Badge>}
              {tab === "work" && (
                <button
                  type="button"
                  onClick={() => setVariationOpen(true)}
                  className="inline-flex h-11 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-small font-medium text-text hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Shuffle className="h-4 w-4 text-primary" aria-hidden />
                  {t("studio.variation")}
                </button>
              )}
              {changes.length > 0 && (
                <button type="button" onClick={studio.reset} className="inline-flex h-11 items-center gap-1 rounded-md px-2 text-caption font-medium text-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  {t("studio.resetChanges")}
                </button>
              )}
            </div>
          </div>

          {tab === "work" && (
            <div className="grid gap-4 @min-[680px]:grid-cols-[200px_minmax(0,1fr)] @min-[1000px]:grid-cols-[220px_minmax(0,1fr)_340px]">
              <div className="hidden min-w-0 self-start @min-[680px]:col-start-1 @min-[680px]:row-span-2 @min-[680px]:row-start-1 @min-[680px]:block @min-[1000px]:row-span-1">
                <SourcePanel layout="cards" sources={state.sources} draft={state.draft} active={active} onSelect={studio.setActive} onRemove={studio.detach} onAdd={() => { setPickerFirst(null); setPickerMode("source"); }} />
              </div>
              <div className="min-w-0 @min-[680px]:hidden">
                <SourcePanel layout="chips" sources={state.sources} draft={state.draft} active={active} onSelect={studio.setActive} onRemove={studio.detach} onAdd={() => { setPickerFirst(null); setPickerMode("source"); }} />
              </div>
              <section aria-label={active ? t(`studio.kind.${active}` as const) : t("studio.title")} className="min-w-0 @min-[680px]:col-start-2 @min-[680px]:row-start-1">
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
              <div className="min-w-0 space-y-4 @min-[680px]:col-start-2 @min-[680px]:row-start-2 @min-[1000px]:sticky @min-[1000px]:top-20 @min-[1000px]:col-start-3 @min-[1000px]:row-start-1 @min-[1000px]:self-start">
                <CompositionView draft={deferredDraft} active={active} onSelect={studio.setActive} finalText={result.text} />
                <div className="min-w-0 rounded-lg border border-border-soft bg-surface p-4">
                  <ResultPane draft={deferredDraft} baseline={state.baseline} sources={state.sources} changeCount={changes.length} onCreate={openCreate} />
                </div>
                <div className="@min-[1000px]:hidden">
                  <VersionStrip versions={state.versions} currentId={lastVersionId} onPick={compareWithCurrent} />
                </div>
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
                onVariation={() => setVariationOpen(true)}
                onCompare={(id) => compareWithCurrent(id)}
                onRestore={(id) => {
                  studio.restoreVersion(id, t("studio.beforeRestoreLabel"));
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
          kinds={pickerMode === "step" ? ["prompt", "generator"] : pickerFirst ? [pickerFirst, ...STUDIO_KINDS.filter((k) => k !== pickerFirst)] : STUDIO_KINDS}
          title={pickerMode === "step" ? t("studio.addStep") : t("studio.addSource")}
          onPick={handlePick}
          onClose={() => setPickerMode(null)}
        />
      )}
      {saveOpen && <SaveNewModal draft={state.draft} result={result} sources={state.sources} onSave={saveNew} onClose={() => setSaveOpen(false)} />}
      {variationOpen && (
        <VariationModal
          draft={state.draft}
          defaultLabel={t("studio.variationDefault", { n: state.versions.filter((v) => v.kind === "variation").length + 1 })}
          onCreate={createVariation}
          onClose={() => setVariationOpen(false)}
        />
      )}
    </div>
  );
}
