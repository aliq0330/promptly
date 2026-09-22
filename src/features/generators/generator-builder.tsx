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
import { CategoryManager, UNCATEGORIZED_CATEGORY_ID } from "./category-manager";
import { FieldList } from "./field-list";
import { FieldEditorModal } from "./field-editor-modal";
import { GeneratorDetailsForm } from "./generator-details-form";
import { TemplateEditor, emptySection } from "./template-editor";
import { GeneratorPlayground } from "./generator-playground";
import { fieldsInCategory, makeFieldKeyFromLabel, validateGeneratorForPublish } from "@/lib/generator-template";
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
import type { Generator, GeneratorCategory, GeneratorField, GeneratorSchema, GeneratorTemplate } from "@/types";

const STEPS = ["details", "fields", "template", "preview", "publish"] as const;
type Step = (typeof STEPS)[number];
const STEP_LABELS: Record<Step, string> = {
  details: "Detaylar",
  fields: "Alanlar",
  template: "Şablon",
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
  return { categories: [{ id: newId("cat"), name: "Genel", description: "", order: 0 }], fields: [] };
}

function defaultTemplate(): GeneratorTemplate {
  return { sections: [{ ...emptySection(0), title: "Prompt" }] };
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
 * Details step — it is never versioned. Its schema/template (categories,
 * fields, template sections) lives on the CURRENT `generator_versions` row
 * and is autosaved (debounced) ONLY while the generator is still a draft
 * (`saveDraftVersionContent`); once published, further schema/template
 * edits stay local-only until the user explicitly re-publishes, which is
 * the one moment a genuinely NEW version is created (§26) — there is no
 * separate "draft version" slot to autosave post-publish edits into
 * without being consciously listed as new-version content, and silently
 * mutating an already-published version in place would break the very
 * version history §26/§29 exists for.
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
  const [activeCategoryId, setActiveCategoryId] = useState<string>(() => defaultSchema().categories[0].id);
  const [editingField, setEditingField] = useState<{ field: GeneratorField | null; isNew: boolean } | null>(null);

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
      const seedSchema = ver && ver.schema.categories.length > 0 ? ver.schema : defaultSchema();
      const seedTemplate = ver && ver.template.sections.length > 0 ? ver.template : defaultTemplate();
      setSchema(seedSchema);
      setTemplate(seedTemplate);
      setActiveCategoryId(seedSchema.categories[0]?.id ?? UNCATEGORIZED_CATEGORY_ID);
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

  function handleAddCategory(name: string) {
    const nextOrder = schema.categories.length > 0 ? Math.max(...schema.categories.map((c) => c.order)) + 1 : 0;
    const category: GeneratorCategory = { id: newId("cat"), name, description: "", order: nextOrder };
    setSchema((prev) => ({ ...prev, categories: [...prev.categories, category] }));
    setActiveCategoryId(category.id);
  }

  function handleRenameCategory(id: string, name: string) {
    setSchema((prev) => ({ ...prev, categories: prev.categories.map((c) => (c.id === id ? { ...c, name } : c)) }));
  }

  function handleDeleteCategory(id: string) {
    setSchema((prev) => ({ ...prev, categories: prev.categories.filter((c) => c.id !== id) }));
    if (activeCategoryId === id) setActiveCategoryId(UNCATEGORIZED_CATEGORY_ID);
  }

  function handleReorderCategories(orderedIds: string[]) {
    setSchema((prev) => ({
      ...prev,
      categories: orderedIds.map((id, index) => {
        const category = prev.categories.find((c) => c.id === id)!;
        return { ...category, order: index };
      }),
    }));
  }

  function handleSaveField(field: GeneratorField) {
    setSchema((prev) => {
      const exists = prev.fields.some((f) => f.id === field.id);
      if (exists) return { ...prev, fields: prev.fields.map((f) => (f.id === field.id ? field : f)) };
      const categoryFields = prev.fields.filter((f) => f.categoryId === field.categoryId);
      const order = categoryFields.length > 0 ? Math.max(...categoryFields.map((f) => f.order)) + 1 : 0;
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
    const categoryFields = schema.fields.filter((f) => f.categoryId === field.categoryId);
    const order = categoryFields.length > 0 ? Math.max(...categoryFields.map((f) => f.order)) + 1 : 0;
    const clone: GeneratorField = { ...field, id: newId("field"), key, label, order };
    setSchema((prev) => ({ ...prev, fields: [...prev.fields, clone] }));
  }

  function handleReorderFields(orderedIds: string[]) {
    setSchema((prev) => {
      const orderById = new Map(orderedIds.map((id, index) => [id, index]));
      return { ...prev, fields: prev.fields.map((f) => (orderById.has(f.id) ? { ...f, order: orderById.get(f.id)! } : f)) };
    });
  }

  const visibleFields =
    activeCategoryId === UNCATEGORIZED_CATEGORY_ID
      ? schema.fields.filter((f) => !schema.categories.some((c) => c.id === f.categoryId)).sort((a, b) => a.order - b.order)
      : fieldsInCategory(schema, activeCategoryId);

  const issues = validateGeneratorForPublish(meta.title, meta.description, schema, template);
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
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-text">{generator ? `Generator ${generator.status === "published" ? "Düzenle" : "Taslağı"}` : "Yeni Generator"}</h1>
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

      <div role="tablist" aria-label="Generator oluşturma adımları" className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {STEPS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={step === s}
            onClick={() => setStep(s)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              step === s ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-text",
            )}
          >
            {STEP_LABELS[s]}
          </button>
        ))}
      </div>

      {step === "details" && (
        <div className="max-w-2xl space-y-4">
          <GeneratorDetailsForm meta={meta} onChange={(patch) => setMeta((prev) => ({ ...prev, ...patch }))} tagPicker={tagPicker} />
          {detailsError && <p className="text-sm text-red-500">{detailsError}</p>}
          <Button type="button" onClick={handleAdvanceFromDetails} disabled={creatingDraft}>
            {creatingDraft ? "Kaydediliyor…" : "İleri: Alanlar"}
          </Button>
        </div>
      )}

      {step === "fields" && (
        <div className="grid gap-6 lg:grid-cols-[200px_1fr_360px]">
          <div className="min-w-0">
            <CategoryManager
              schema={schema}
              activeCategoryId={activeCategoryId}
              onSelectCategory={setActiveCategoryId}
              onAddCategory={handleAddCategory}
              onRenameCategory={handleRenameCategory}
              onDeleteCategory={handleDeleteCategory}
              onReorderCategories={handleReorderCategories}
            />
          </div>
          <div className="min-w-0">
            <FieldList
              fields={visibleFields}
              template={template}
              onAddField={() => setEditingField({ field: null, isNew: true })}
              onEditField={(field) => setEditingField({ field, isNew: false })}
              onDuplicateField={handleDuplicateField}
              onDeleteField={handleDeleteField}
              onReorderFields={handleReorderFields}
            />
          </div>
          <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Canlı Önizleme</p>
            <GeneratorPlayground schema={schema} template={template} enableNegativePrompt={meta.enableNegativePrompt} />
          </div>
        </div>
      )}

      {step === "template" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0">
            <TemplateEditor template={template} schema={schema} onChange={setTemplate} />
          </div>
          <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Canlı Önizleme</p>
            <GeneratorPlayground schema={schema} template={template} enableNegativePrompt={meta.enableNegativePrompt} />
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="max-w-2xl">
          <GeneratorPlayground schema={schema} template={template} enableNegativePrompt={meta.enableNegativePrompt} />
        </div>
      )}

      {step === "publish" && (
        <div className="max-w-2xl space-y-4">
          <div className="rounded-md border border-border bg-surface p-4">
            <p className="mb-2 text-sm font-medium text-text">
              {schema.categories.length} kategori · {schema.fields.length} alan · {template.sections.filter((s) => s.enabled).length} aktif şablon bölümü
            </p>
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

      {editingField && (
        <FieldEditorModal
          initial={editingField.field}
          isNew={editingField.isNew}
          categories={schema.categories.length > 0 ? schema.categories : [{ id: "", name: "Genel", description: "", order: 0 }]}
          allFields={schema.fields}
          activeCategoryId={activeCategoryId === UNCATEGORIZED_CATEGORY_ID ? (schema.categories[0]?.id ?? null) : activeCategoryId}
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
