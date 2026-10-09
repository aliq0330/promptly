"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TaxonomyPicker } from "@/features/content/taxonomy-picker";
import { ToolPicker } from "@/features/content/tool-picker";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useRealGenerators } from "@/features/generators/real-generators-provider";
import { createRealPrompt, searchPrompts } from "@/lib/supabase/prompts";
import { createDraftGenerator, searchGenerators } from "@/lib/supabase/generators";
import { generatorRef, promptRef } from "@/lib/supabase/workflows";
import { PICKABLE_STEP_TYPES } from "@/lib/workflow-logic";
import { taxonomyPathLabel, type TaxonomySelection } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { WorkflowContentRef, WorkflowStepType } from "@/types";
import { MEDIA_ICON, STEP_TYPE_META } from "./step-meta";

/** Prompt requests are not workflow steps — only these can be added. */
const TYPES = PICKABLE_STEP_TYPES;
const inputClass = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60";

/**
 * Add / replace a step's content: pick an existing prompt or generator,
 * or create a new one right here. Creation only writes the
 * content record (through the normal create functions) — nothing is run.
 * Bottom sheet on mobile, dialog on larger screens (via `Modal`).
 */
export function AddContentModal({
  initialType = "prompt",
  initialMode = "existing",
  onSelect,
  onClose,
}: {
  initialType?: WorkflowStepType;
  initialMode?: "existing" | "scratch";
  onSelect: (ref: WorkflowContentRef) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // A legacy "request" step opens on Prompt: it can only be swapped for a prompt or a generator.
  const [type, setType] = useState<WorkflowStepType>(TYPES.includes(initialType) ? initialType : "prompt");
  const [mode, setMode] = useState<"existing" | "scratch">(initialMode);

  return (
    <Modal onClose={onClose} labelledBy="workflow-add-content-title">
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-lg border border-border bg-surface p-4 shadow-lg sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="workflow-add-content-title" className="text-base font-semibold text-text">
            {t("workflow.pickerTitle")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text">
            <X size={18} />
          </button>
        </div>
        <Tabs
          items={TYPES.map((key) => ({ key, label: t(STEP_TYPE_META[key].labelKey), icon: STEP_TYPE_META[key].icon }))}
          active={type}
          onChange={setType}
          ariaLabel={t("workflow.pickerTitle")}
          variant="segmented"
          className="mb-3"
        />
        <div className="mb-3 flex gap-2">
          {(["existing", "scratch"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "h-9 flex-1 rounded-md border px-3 text-label font-medium transition-colors",
                mode === value ? "border-primary bg-primary-soft text-primary" : "border-border text-text-secondary hover:border-border-strong",
              )}
            >
              {value === "existing" ? t("workflow.useExisting") : t("workflow.createNew")}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {mode === "existing" ? <ExistingList type={type} onSelect={onSelect} /> : <ScratchForm key={type} type={type} onSelect={onSelect} />}
        </div>
      </div>
    </Modal>
  );
}

function ExistingList({ type, onSelect }: { type: WorkflowStepType; onSelect: (ref: WorkflowContentRef) => void }) {
  const { t, language } = useTranslation();
  const { realPrompts } = useRealPrompts();
  const { realGenerators } = useRealGenerators();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<WorkflowContentRef[] | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const text = query.trim();

  // Empty query: the already-loaded recent content; typing: a debounced server search.
  const recent = useMemo<WorkflowContentRef[]>(() => {
    if (type === "prompt") return realPrompts.slice(0, 30).map(promptRef);
    return realGenerators.slice(0, 30).map(generatorRef);
  }, [type, realPrompts, realGenerators]);

  useEffect(() => {
    if (!text) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- back to the recent list when the box is emptied
      setFound(null);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      const refs =
        type === "prompt"
          ? (await searchPrompts(text, {}, 20)).map(promptRef)
          : (await searchGenerators(text, {}, 20)).map(generatorRef);
      if (!cancelled) setFound(refs);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [text, type]);

  const list = text ? found : recent;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("workflow.pickerSearch")}
          aria-label={t("workflow.pickerSearch")}
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-text placeholder:text-text-muted shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
        />
      </div>
      {list === null ? (
        <p className="py-6 text-center text-sm text-text-muted">{t("workflow.pickerSearching")}</p>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">{t("workflow.pickerEmpty")}</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((ref) => {
            const Icon = STEP_TYPE_META[ref.type].icon;
            const MediaIcon = ref.contentType ? MEDIA_ICON[ref.contentType] : null;
            const isAdded = added === ref.id;
            return (
              <li key={ref.id}>
                <button
                  type="button"
                  onClick={() => {
                    setAdded(ref.id);
                    onSelect(ref);
                  }}
                  className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-border-soft p-2.5 text-left transition-colors hover:border-border-strong hover:bg-surface-soft"
                >
                  {ref.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- real (possibly data-URL) thumbnail
                    <img src={ref.thumbnailUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                      <Icon size={18} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">{ref.title}</span>
                    <span className="flex items-center gap-1 truncate text-caption text-text-muted">
                      {MediaIcon && <MediaIcon size={12} className="shrink-0" />}
                      <span className="truncate">
                        {[ref.contentType ? taxonomyPathLabel({ contentType: ref.contentType, category: ref.category }, language) : "", `@${ref.authorUsername}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </span>
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", isAdded ? "bg-success text-white" : "bg-primary-soft text-primary")}>
                    {isAdded ? <Check size={14} aria-label={t("workflow.pickerAdded")} /> : <Plus size={14} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ScratchForm({ type, onSelect }: { type: WorkflowStepType; onSelect: (ref: WorkflowContentRef) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile } = useOwnProfile();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [taxonomy, setTaxonomy] = useState<TaxonomySelection>({ contentType: type === "prompt" ? "text" : "image", category: null, subcategory: null });
  const [tools, setTools] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ name?: boolean; body?: boolean }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bodyLabel = type === "prompt" ? t("workflow.newPromptText") : t("workflow.newGeneratorDescription");
  const nameLabel = type === "prompt" ? t("workflow.newPromptName") : t("workflow.newGeneratorName");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || !user || !profile) return;
    const nextErrors = { name: !name.trim(), body: !body.trim() };
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.body) return;
    setBusy(true);
    setError(null);
    try {
      const common = { contentType: taxonomy.contentType, category: taxonomy.category, subcategory: taxonomy.subcategory, tools, tags: [] };
      if (type === "prompt") {
        const prompt = await createRealPrompt(
          {
            ...common,
            title: name,
            description: "",
            promptText: body,
            tool: null,
            images: [],
          },
          user.id,
          profile,
        );
        onSelect(promptRef(prompt));
      } else {
        const { generator } = await createDraftGenerator(
          {
            title: name,
            description: body,
            media: [],
            tools,
            contentType: taxonomy.contentType,
            category: taxonomy.category,
            subcategory: taxonomy.subcategory,
            tags: [],
            visibility: "public",
            allowPromptEditing: true,
            allowSavingGeneratedPrompts: true,
            enableNegativePrompt: false,
            requiresReferenceImage: false,
            requiresReferenceVideo: false,
            requiresReferenceAudio: false,
          },
          user.id,
          profile,
        );
        onSelect(generatorRef(generator));
      }
    } catch {
      setError(t("workflow.createContentError"));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="wf-new-name" className="mb-1.5 block text-sm font-medium text-text">
          {nameLabel} <span className="text-danger">*</span>
        </label>
        <input id="wf-new-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} className={inputClass} aria-invalid={errors.name} />
        {errors.name && <p className="mt-1 text-caption text-danger">{t("workflow.fieldRequired")}</p>}
      </div>
      <div>
        <label htmlFor="wf-new-body" className="mb-1.5 block text-sm font-medium text-text">
          {bodyLabel} <span className="text-danger">*</span>
        </label>
        <textarea
          id="wf-new-body"
          rows={type === "prompt" ? 5 : 3}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          aria-invalid={errors.body}
          className={cn("w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text", type === "prompt" && "prompt-text")}
        />
        {errors.body && <p className="mt-1 text-caption text-danger">{t("workflow.fieldRequired")}</p>}
      </div>
      <TaxonomyPicker value={taxonomy} onChange={setTaxonomy} />
      <ToolPicker
        label={t("tool.recommendedLabel")}
        value={tools}
        onChange={setTools}
        contentType={taxonomy.contentType}
        category={taxonomy.category}
      />
      {type === "generator" && <p className="rounded-md bg-surface-soft p-2.5 text-caption text-text-muted">{t("workflow.generatorDraftNote")}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? t("workflow.creating") : t("workflow.createAndAdd")}
      </Button>
    </form>
  );
}
