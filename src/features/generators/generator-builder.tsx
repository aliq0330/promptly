"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useTagCatalog } from "@/features/tags/use-tag-catalog";
import { useTagPicker } from "@/features/prompts/use-tag-picker";
import { FieldList } from "./field-list";
import { FieldEditorModal } from "./field-editor-modal";
import { FieldCatalogPicker } from "./field-catalog-picker";
import { GeneratorDetailsForm } from "./generator-details-form";
import { GeneratorPlayground } from "./generator-playground";
import { makeFieldKeyFromLabel, validateGeneratorForPublish } from "@/lib/generator-template";
import { validateGeneratorOutputMapping } from "@/lib/generator-output";
import type { CatalogField } from "@/lib/generator-field-catalog";
import { cn, generatorHref } from "@/lib/utils";
import {
  createDraftGenerator,
  fetchGeneratorById,
  fetchGeneratorVersion,
  publishGenerator,
  saveDraftVersionContent,
  updateGeneratorMeta,
  type GeneratorMetaInput,
  type GeneratorVersionResult,
} from "@/lib/supabase/generators";
import type { Generator, GeneratorField, GeneratorSchema, GeneratorTemplate } from "@/types";

const STEPS = ["details", "fields", "preview", "publish"] as const;
type Step = (typeof STEPS)[number];
const STEP_LABELS: Record<Step, string> = {
  details: "Detaylar",
  fields: "Alanlar",
  preview: "Önizleme",
  publish: "Yayınla",
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultMeta(): GeneratorMetaInput {
  return {
    title: "",
    description: "",
    coverUrl: null,
    category: "image",
    subcategory: null,
    tags: [],
    visibility: "public",
    allowRemix: true,
    allowPromptEditing: true,
    allowSavingGeneratedPrompts: true,
    enableNegativePrompt: false,
  };
}

function defaultSchema(): GeneratorSchema {
  return { fields: [] };
}

// The generator's `template` field on the DB row is no longer authored by
// the builder UI (see this file's own doc comment below) — kept only so
// `saveDraftVersionContent`/`publishGenerator`/`remixGenerator`'s existing
// signatures (and a previously-authored generator's stored template, if any)
// round-trip unchanged. A brand-new generator's template is always this
// single, empty, never-rendered placeholder section.
function defaultTemplate(): GeneratorTemplate {
  return { sections: [{ id: newId("section"), title: "Prompt", content: "", order: 0, enabled: true }] };
}

function LoginGate() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-2 text-lg font-semibold text-text">Giriş yapmalısın</h1>
      <p className="mb-4 text-sm text-text-muted">Bir generator oluşturmak/düzenlemek için önce giriş yapmalısın.</p>
      <div className="flex justify-center gap-2">
        <Link href="/login" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-dark">
          Giriş Yap
        </Link>
        <Link href="/signup" className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface">
          Hesap Oluştur
        </Link>
      </div>
    </div>
  );
}

/**
 * The real, end-to-end Generator Builder (§76's ANALIZ/PLAN step concluded:
 * this app has no existing "multi-step form with per-section autosave"
 * component to reuse, but does have every smaller building block —
 * `TagPicker`/`useTagPicker`, the `Modal`/two-click-delete conventions, the
 * `resizeImageToDataUrlFit` image pattern, the `?edit=`-via-query-param
 * convention `CreatePromptForm`/`CreateRequestForm` already use — all reused
 * here rather than re-invented).
 *
 * A generator's own metadata (title/description/cover/category/tags/
 * visibility/settings) lives directly on `generators` and is saved
 * immediately (via `updateGeneratorMeta`) whenever the user leaves the
 * Details step — it is never versioned. Its schema (a flat, ordered field
 * list — the earlier field-organization category system was removed, see
 * CLAUDE.md) lives on the CURRENT `generator_versions` row and is autosaved
 * (debounced) ONLY while the generator is still a draft
 * (`saveDraftVersionContent`); once published, further schema edits stay
 * local-only until the user explicitly re-publishes, which is the one
 * moment a genuinely NEW version is created (§26) — there is no separate
 * "draft version" slot to autosave post-publish edits into without being
 * consciously listed as new-version content, and silently mutating an
 * already-published version in place would break the very version history
 * §26/§29 exists for.
 *
 * The builder no longer lets the creator author a `{{variable}}` prompt
 * template — that responsibility moved to whoever RUNS the generator, who
 * types the real prompt/negative-prompt text directly at the top of the
 * runtime form (`generator-playground.tsx`). This component still carries
 * a `template` value through to the DB layer purely for round-trip
 * compatibility with `saveDraftVersionContent`/`publishGenerator`/
 * `remixGenerator`'s existing signatures (and so a generator authored
 * before this change keeps whatever template content it already had
 * stored) — it is never shown or edited in this UI.
 *
 * No draft row is created until the user actually advances past the
 * Details step with a real title/description — glancing at `/generators/
 * create` and leaving never litters the database with an empty draft.
 */
export function GeneratorBuilder({ editId }: { editId: string | null }) {
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useOwnProfile();
  const { catalog } = useTagCatalog();

  const [step, setStep] = useState<Step>("details");
  const [meta, setMeta] = useState<GeneratorMetaInput>(defaultMeta);
  const [schema, setSchema] = useState<GeneratorSchema>(defaultSchema);
  const [template, setTemplate] = useState<GeneratorTemplate>(defaultTemplate);
  const [generator, setGenerator] = useState<Generator | null>(null);
  const [version, setVersion] = useState<GeneratorVersionResult | null>(null);
  const [editingField, setEditingField] = useState<{ field: GeneratorField | null; isNew: boolean } | null>(null);
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);

  const [loadingExisting, setLoadingExisting] = useState(Boolean(editId));
  const [notFound, setNotFound] = useState(false);
  const [notOwner, setNotOwner] = useState(false);
  const tagsSeededRef = useRef(false);

  const [creatingDraft, setCreatingDraft] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const tagPicker = useTagPicker({ title: meta.title, content: meta.description, catalog });

  useEffect(() => {
    if (!editId || !user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no fetch to do (no editId, or no session yet) — just clears the initial loading state synchronously
      setLoadingExisting(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const gen = await fetchGeneratorById(editId);
      if (cancelled) return;
      if (!gen) {
        setNotFound(true);
        setLoadingExisting(false);
        return;
      }
      if (gen.creator.id !== user.id) {
        setNotOwner(true);
        setLoadingExisting(false);
        return;
      }
      const ver = gen.currentVersionId ? await fetchGeneratorVersion(gen.currentVersionId) : null;
      if (cancelled) return;
      setGenerator(gen);
      setVersion(ver);
      setMeta({
        title: gen.title,
        description: gen.description,
        coverUrl: gen.coverUrl,
        category: gen.category,
        subcategory: gen.subcategory,
        tags: gen.tags,
        visibility: gen.visibility,
        allowRemix: gen.allowRemix,
        allowPromptEditing: gen.allowPromptEditing,
        allowSavingGeneratedPrompts: gen.allowSavingGeneratedPrompts,
        enableNegativePrompt: gen.enableNegativePrompt,
      });
      const seedSchema = ver && ver.schema.fields.length > 0 ? ver.schema : defaultSchema();
      const seedTemplate = ver && ver.template.sections.length > 0 ? ver.template : defaultTemplate();
      setSchema(seedSchema);
      setTemplate(seedTemplate);
      setLoadingExisting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [editId, user]);

  // A loaded generator's tags can only be seeded into the tag picker once
  // its async fetch resolves — `useTagPicker`'s `initialTags` is a lazy
  // `useState` initializer and can't retroactively pick up data that
  // arrives after mount (the same async-data-vs-lazy-initializer problem
  // `/profile/edit` and the request-answer form solve the same way).
  useEffect(() => {
    if (!generator || tagsSeededRef.current) return;
    tagsSeededRef.current = true;
    for (const tag of generator.tags) tagPicker.addManual(tag);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- addManual is stable (useCallback with empty deps); only re-runs when the loaded generator itself changes
  }, [generator]);

  // Autosaves the CURRENT draft version's schema/template — see this file's
  // own doc comment above for why this only runs pre-first-publish.
  useEffect(() => {
    if (!generator || !version || generator.status !== "draft") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flips the status indicator the instant schema/template change, the actual debounced network call happens below
    setSaveStatus("saving");
    const timeout = setTimeout(async () => {
      try {
        await saveDraftVersionContent(version.id, schema, template);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, 900);
    return () => clearTimeout(timeout);
  }, [schema, template, generator, version]);

  if (!user) return <LoginGate />;

  if (loadingExisting) {
    return (
      <div className="flex items-center justify-center px-4 py-24 text-text-muted">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">Generator bulunamadı</h1>
        <p className="text-sm text-text-muted">Bu generator silinmiş olabilir ya da hiç var olmadı.</p>
      </div>
    );
  }

  if (notOwner) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">Bu generatoru düzenleme yetkin yok</h1>
        <p className="text-sm text-text-muted">Yalnızca bir generatorun sahibi onu düzenleyebilir.</p>
      </div>
    );
  }

  // Tags live in `tagPicker`'s own accepted-chip state (the shared
  // TagPicker's established convention — see CreatePromptForm), not in
  // `meta.tags` directly; this assembles the real submission shape at the
  // moment it's actually needed rather than keeping a second, easily
  // stale copy in `meta` itself.
  function metaForSubmit(): GeneratorMetaInput {
    return { ...meta, tags: tagPicker.accepted.map((entry) => entry.tag) };
  }

  async function ensureDraftExists(): Promise<{ generator: Generator; version: GeneratorVersionResult } | null> {
    if (generator && version) return { generator, version };
    if (!user || !profile) return null;
    setCreatingDraft(true);
    setDetailsError(null);
    try {
      const result = await createDraftGenerator(metaForSubmit(), user.id, profile);
      setGenerator(result.generator);
      setVersion(result.version);
      return result;
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Generator oluşturulamadı, lütfen tekrar dene.");
      return null;
    } finally {
      setCreatingDraft(false);
    }
  }

  async function handleAdvanceFromDetails() {
    if (!meta.title.trim() || !meta.description.trim()) {
      setDetailsError("Başlık ve kısa açıklama zorunlu.");
      return;
    }
    setDetailsError(null);
    if (!generator) {
      const created = await ensureDraftExists();
      if (!created) return;
    } else {
      try {
        const submitMeta = metaForSubmit();
        await updateGeneratorMeta(generator.id, submitMeta);
        setGenerator((prev) => (prev ? { ...prev, ...metaToGeneratorPatch(submitMeta) } : prev));
      } catch (err) {
        setDetailsError(err instanceof Error ? err.message : "Kaydedilemedi, lütfen tekrar dene.");
        return;
      }
    }
    setStep("fields");
  }

  function handleSaveField(field: GeneratorField) {
    setSchema((prev) => {
      const exists = prev.fields.some((f) => f.id === field.id);
      if (exists) return { ...prev, fields: prev.fields.map((f) => (f.id === field.id ? field : f)) };
      const order = prev.fields.length > 0 ? Math.max(...prev.fields.map((f) => f.order)) + 1 : 0;
      return { ...prev, fields: [...prev.fields, { ...field, order }] };
    });
    setEditingField(null);
  }

  function handleDeleteField(fieldId: string) {
    setSchema((prev) => ({ ...prev, fields: prev.fields.filter((f) => f.id !== fieldId) }));
    setEditingField(null);
  }

  function handleDuplicateField(field: GeneratorField) {
    const existingKeys = schema.fields.map((f) => f.key);
    const label = `${field.label} (kopya)`;
    const key = makeFieldKeyFromLabel(label, existingKeys);
    const order = schema.fields.length > 0 ? Math.max(...schema.fields.map((f) => f.order)) + 1 : 0;
    const clone: GeneratorField = { ...field, id: newId("field"), key, label, order };
    setSchema((prev) => ({ ...prev, fields: [...prev.fields, clone] }));
  }

  // Converts chosen catalog entries into real `GeneratorField`s — the exact
  // same `makeFieldKeyFromLabel`/order logic `handleDuplicateField` already
  // uses, so there is one real place a `GeneratorField` gets constructed
  // from something else, not two. The picker itself never builds a
  // `GeneratorField`.
  function handleInsertCatalogFields(catalogFields: CatalogField[]) {
    setSchema((prev) => {
      let existingKeys = prev.fields.map((f) => f.key);
      let nextOrder = prev.fields.length > 0 ? Math.max(...prev.fields.map((f) => f.order)) + 1 : 0;
      const inserted: GeneratorField[] = [];
      for (const catalogField of catalogFields) {
        const key = makeFieldKeyFromLabel(catalogField.label, existingKeys);
        existingKeys = [...existingKeys, key];
        inserted.push({
          id: newId("field"),
          key,
          label: catalogField.label,
          description: "",
          type: catalogField.type,
          required: false,
          options: catalogField.options,
          defaultValue: catalogField.type === "multi_select" ? [] : "",
          placeholder: catalogField.placeholder ?? "",
          min: catalogField.min ?? null,
          max: catalogField.max ?? null,
          step: catalogField.step ?? null,
          order: nextOrder,
          condition: null,
          jsonPath: catalogField.jsonPath,
        });
        nextOrder += 1;
      }
      return { ...prev, fields: [...prev.fields, ...inserted] };
    });
    setCatalogPickerOpen(false);
  }

  function handleReorderFields(orderedIds: string[]) {
    setSchema((prev) => {
      const orderById = new Map(orderedIds.map((id, index) => [id, index]));
      return { ...prev, fields: prev.fields.map((f) => (orderById.has(f.id) ? { ...f, order: orderById.get(f.id)! } : f)) };
    });
  }

  const visibleFields = [...schema.fields].sort((a, b) => a.order - b.order);

  const issues = [...validateGeneratorForPublish(meta.title, meta.description, schema), ...validateGeneratorOutputMapping(schema)];
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  async function handlePublish() {
    if (errors.length > 0 || !user) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const draft = await ensureDraftExists();
      if (!draft) return;
      const submitMeta = metaForSubmit();
      await updateGeneratorMeta(draft.generator.id, submitMeta);
      const newVersion = await publishGenerator(draft.generator, schema, template, user.id);
      const publishedGenerator: Generator = { ...draft.generator, ...metaToGeneratorPatch(submitMeta), status: "published", currentVersionId: newVersion.id };
      setGenerator(publishedGenerator);
      setVersion(newVersion);
      router.push(generatorHref(publishedGenerator));
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Yayınlanamadı, lütfen tekrar dene.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 sm:px-5">
        <h1 className="text-base font-semibold text-text sm:text-lg">
          {generator ? `Generator ${generator.status === "published" ? "Düzenle" : "Taslağı"}` : "Yeni Generator"}
        </h1>
        {generator && generator.status === "draft" && (
          <p className="flex items-center gap-1.5 text-xs text-text-muted">
            {saveStatus === "saving" && (
              <>
                <Loader2 size={12} className="animate-spin" /> Kaydediliyor…
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <CheckCircle2 size={12} className="text-green-600" /> Taslak kaydedildi
              </>
            )}
            {saveStatus === "error" && (
              <>
                <AlertTriangle size={12} className="text-red-500" /> Kaydedilemedi
              </>
            )}
          </p>
        )}
        {generator && generator.status === "published" && (
          <p className="text-xs text-text-muted">Yayında — değişiklikler yalnızca yeniden yayınlayınca kalıcı olur.</p>
        )}
      </div>

      <div role="tablist" aria-label="Generator oluşturma adımları" className="mb-6 -mx-1 flex gap-1 overflow-x-auto border-b border-border px-1">
        {STEPS.map((s, index) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={step === s}
            onClick={() => setStep(s)}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              step === s ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-text",
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                step === s ? "bg-primary text-primary-foreground" : "bg-accent-surface text-text-muted",
              )}
            >
              {index + 1}
            </span>
            {STEP_LABELS[s]}
          </button>
        ))}
      </div>

      {step === "details" && (
        <div className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
          <GeneratorDetailsForm meta={meta} onChange={(patch) => setMeta((prev) => ({ ...prev, ...patch }))} tagPicker={tagPicker} />
          {detailsError && <p className="text-sm text-red-500">{detailsError}</p>}
          <Button type="button" onClick={handleAdvanceFromDetails} disabled={creatingDraft}>
            {creatingDraft ? "Kaydediliyor…" : "İleri: Alanlar"}
          </Button>
        </div>
      )}

      {step === "fields" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0 rounded-lg border border-border bg-surface p-4 sm:p-5">
            <FieldList
              fields={visibleFields}
              onAddField={() => setCatalogPickerOpen(true)}
              onEditField={(field) => setEditingField({ field, isNew: false })}
              onDuplicateField={handleDuplicateField}
              onDeleteField={handleDeleteField}
              onReorderFields={handleReorderFields}
            />
          </div>
          <div className="min-w-0">
            <div className="rounded-lg border border-border bg-surface p-4 sm:p-5 lg:sticky lg:top-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Canlı Önizleme</p>
              <GeneratorPlayground schema={schema} enableNegativePrompt={meta.enableNegativePrompt} />
            </div>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="max-w-2xl rounded-lg border border-border bg-surface p-4 sm:p-5">
          <GeneratorPlayground schema={schema} enableNegativePrompt={meta.enableNegativePrompt} />
        </div>
      )}

      {step === "publish" && (
        <div className="max-w-2xl space-y-4">
          <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
            <p className="mb-2 text-sm font-medium text-text">{schema.fields.length} alan</p>
            {errors.length === 0 && warnings.length === 0 && <p className="text-sm text-green-600">Yayınlamaya hazır.</p>}
            {errors.map((issue, i) => (
              <p key={`e-${i}`} className="mt-1 flex items-start gap-1.5 text-sm text-red-500">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {issue.message}
              </p>
            ))}
            {warnings.map((issue, i) => (
              <p key={`w-${i}`} className="mt-1 flex items-start gap-1.5 text-sm text-amber-600">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {issue.message}
              </p>
            ))}
          </div>
          {publishError && <p className="text-sm text-red-500">{publishError}</p>}
          <Button type="button" onClick={handlePublish} disabled={errors.length > 0 || publishing}>
            {publishing ? "Yayınlanıyor…" : generator?.status === "published" ? "Yeniden Yayınla" : "Yayınla"}
          </Button>
        </div>
      )}

      {catalogPickerOpen && (
        <FieldCatalogPicker
          existingFields={schema.fields}
          onClose={() => setCatalogPickerOpen(false)}
          onInsert={handleInsertCatalogFields}
          onCreateCustom={() => {
            setCatalogPickerOpen(false);
            setEditingField({ field: null, isNew: true });
          }}
        />
      )}

      {editingField && (
        <FieldEditorModal
          initial={editingField.field}
          isNew={editingField.isNew}
          allFields={schema.fields}
          onClose={() => setEditingField(null)}
          onSave={handleSaveField}
          onDelete={editingField.field ? () => handleDeleteField(editingField.field!.id) : undefined}
        />
      )}
    </div>
  );
}

function metaToGeneratorPatch(meta: GeneratorMetaInput) {
  return {
    title: meta.title.trim(),
    description: meta.description.trim(),
    coverUrl: meta.coverUrl,
    category: meta.category,
    subcategory: meta.subcategory,
    tags: meta.tags,
    visibility: meta.visibility,
    allowRemix: meta.allowRemix,
    allowPromptEditing: meta.allowPromptEditing,
    allowSavingGeneratedPrompts: meta.allowSavingGeneratedPrompts,
    enableNegativePrompt: meta.enableNegativePrompt,
  };
}
