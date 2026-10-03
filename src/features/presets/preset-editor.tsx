"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { KindDraftsButton } from "@/features/drafts/kind-drafts-button";
import { CreateFormActions } from "@/features/content/create-form-actions";
import { FormSection } from "@/features/content/form-section";
import { MultiImagePicker, type MultiImageItem } from "@/features/content/multi-image-picker";
import { TaxonomyPicker } from "@/features/content/taxonomy-picker";
import { ToolPicker } from "@/features/content/tool-picker";
import { TagPicker } from "@/features/prompts/tag-picker";
import { useTagPicker } from "@/features/prompts/use-tag-picker";
import { useTagCatalog } from "@/features/tags/use-tag-catalog";
import { fetchPresetById, savePreset } from "@/lib/supabase/presets";
import { sanitizeSelection, type PresetField, type PresetSelection } from "@/lib/preset-fields";
import { normalizePresetForEditing, resolvePresetFields } from "@/lib/preset-utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { presetHref } from "@/lib/utils";
import { TitleField, DescriptionField } from "@/features/content/core-fields";
import { PresetCard } from "./preset-card";
import { PresetParametersBuilder } from "./preset-parameters-builder";
import type { ContentVisibility, Preset, PromptContentType } from "@/types";

/**
 * Hazır Ayar create/edit form (`/presets/create`, `?edit=<id>`): name,
 * description, content type → category → subcategory (the shared taxonomy),
 * recommended tool/model, parameters (the SAME catalog the Prompt form's "Ek
 * Ayar Önerileri" uses, shown for the chosen type/category), tags, cover and
 * and the shared footer (Görünürlük switch, Taslağa kaydet / Paylaş) with a
 * live `PresetCard` preview. Same two-column create layout as the request form.
 */
export function PresetEditor({ editId }: { editId: string | null }) {
  const { t, language } = useTranslation();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { profile: ownProfile } = useOwnProfile();
  const { catalog } = useTagCatalog();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contentType, setContentType] = useState<PromptContentType>("image");
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [tools, setTools] = useState<string[]>([]);
  const [fields, setFields] = useState<PresetField[]>([]);
  const [selection, setSelection] = useState<PresetSelection>({});
  const [cover, setCover] = useState<MultiImageItem[]>([]);
  const [visibility, setVisibility] = useState<ContentVisibility>("public");
  const tagPicker = useTagPicker({ title, content: description, catalog });
  const tagsSeededRef = useRef(false);

  const [loadState, setLoadState] = useState<"loading" | "ready" | "notfound" | "forbidden">(editId ? "loading" : "ready");
  const [titleTouched, setTitleTouched] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSelection = useMemo(() => sanitizeSelection(selection, resolvePresetFields({ fields, selection })), [selection, fields]);

  useEffect(() => {
    if (!editId || authLoading || !user) return;
    let cancelled = false;
    fetchPresetById(editId).then((preset) => {
      if (cancelled) return;
      if (!preset) return setLoadState("notfound");
      if (preset.creator.id !== user.id) return setLoadState("forbidden");
      setTitle(preset.title);
      setDescription(preset.description);
      setContentType(preset.contentType);
      setCategory(preset.category);
      setSubcategory(preset.subcategory);
      setTools(preset.tools);
      // One value per field: a preset saved before that rule keeps only the chosen option of each of its own fields.
      const adopted = normalizePresetForEditing(preset.fields, preset.selection, language);
      setFields(adopted.fields);
      setSelection(adopted.selection);
      setCover(preset.coverUrl ? [{ key: "existing-cover", url: preset.coverUrl, width: 0, height: 0 }] : []);
      setVisibility(preset.visibility);
      if (!tagsSeededRef.current) {
        tagsSeededRef.current = true;
        preset.tags.forEach((tag) => tagPicker.addManual(tag));
      }
      setLoadState("ready");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- addManual is stable; seeded once per load
  }, [editId, user, authLoading]);

  const titleError = titleTouched && title.trim().length < 3;

  function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    return save(false);
  }

  async function save(asDraft: boolean) {
    if (!user || isSaving) return;
    setTitleTouched(true);
    setError(null);
    if (title.trim().length < 3) return;
    if (!asDraft && Object.keys(effectiveSelection).length === 0) {
      setError(t("presetBuilder.errorNoFields"));
      return;
    }
    // Own fields need a name and a value; anything half-typed is left out of the saved preset.
    const savedFields = fields.filter((f) => f.name.trim() && effectiveSelection[f.id] !== undefined);
    const savedSelection = sanitizeSelection(effectiveSelection, resolvePresetFields({ fields: savedFields, selection: effectiveSelection }));
    setIsSaving(true);
    try {
      const id = await savePreset(
        {
          id: editId,
          title,
          description,
          coverUrl: cover[0]?.url ?? null,
          contentType,
          category,
          subcategory,
          tools,
          fields: savedFields,
          selection: savedSelection,
          tags: tagPicker.accepted.map((entry) => entry.tag),
          status: asDraft ? "draft" : "published",
          visibility,
        },
        user.id,
      );
      router.push(asDraft ? "/presets" : presetHref({ id }));
    } catch (err) {
      console.error("savePreset", err);
      setError(err instanceof Error && err.message ? err.message : t("preset.errorSave"));
      setIsSaving(false);
    }
  }

  if (authLoading || loadState === "loading") {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">{t("common.loading")}</div>;
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("auth.loginRequiredTitle")}</h1>
        <p className="mb-4 text-sm text-text-muted">{t("preset.loginRequiredBody")}</p>
        <div className="flex justify-center gap-2">
          <Link href="/login" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
            {t("header.login")}
          </Link>
          <Link href="/signup" className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface">
            {t("auth.createAccount")}
          </Link>
        </div>
      </div>
    );
  }
  if (loadState === "notfound" || loadState === "forbidden") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{loadState === "forbidden" ? t("preset.noEditPermissionTitle") : t("preset.notFoundTitle")}</h1>
        <p className="mb-4 text-sm text-text-muted">{loadState === "forbidden" ? t("preset.noEditPermissionBody") : t("preset.notFoundBody")}</p>
        <Link href="/presets" className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface">
          {t("preset.backToPresets")}
        </Link>
      </div>
    );
  }

  const previewPreset: Preset = {
    id: "preview",
    creator: ownProfile ?? {
      id: "preview",
      username: "sen",
      displayName: t("prompt.previewAuthorName"),
      avatarUrl: null,
      coverUrl: null,
      bio: null,
      website: null,
      followerCount: 0,
      followingCount: 0,
      createdAt: new Date().toISOString(),
    },
    title: title || t("preset.untitled"),
    description: description || t("prompt.noDescriptionAdded"),
    coverUrl: cover[0]?.url ?? null,
    contentType,
    category,
    subcategory,
    tools,
    fields,
    selection: effectiveSelection,
    status: "published",
    visibility,
    likeCount: 0,
    commentCount: 0,
    saveCount: 0,
    tags: tagPicker.accepted.map((entry) => entry.tag),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return (
    <div className="mx-auto max-w-5xl px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <div className="mb-1 flex items-start justify-between gap-3">
        <h1 className="text-h1 font-semibold text-text">{editId ? t("preset.editTitle") : t("preset.createTitle")}</h1>
        <KindDraftsButton kind="preset" />
      </div>
      <p className="mb-6 text-sm text-text-muted">{t("preset.createHint")}</p>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={handleSubmit} className="min-w-0 space-y-4">
          <FormSection title={t("taxonomy.categoryLabel")}>
            <TaxonomyPicker
              bare
              value={{ contentType, category, subcategory }}
              onChange={(next) => {
                if (next.contentType !== contentType) {
                  setFields([]);
                  setSelection({});
                }
                setContentType(next.contentType);
                setCategory(next.category);
                setSubcategory(next.subcategory);
              }}
            />
          </FormSection>

          <FormSection title={t("formSection.basics")}>
            <div className="space-y-4">
              <TitleField
                id="preset-title"
                label={t("preset.titleLabel")}
                value={title}
                onChange={setTitle}
                onBlur={() => setTitleTouched(true)}
                placeholder={t("preset.titlePlaceholder")}
                maxLength={120}
                required
                error={titleError ? t("preset.errorTitle") : null}
              />

              <DescriptionField
                id="preset-desc"
                label={t("preset.descriptionLabel")}
                value={description}
                onChange={setDescription}
                placeholder={t("preset.descriptionPlaceholder")}
                maxLength={1000}
                optional
              />
            </div>
          </FormSection>

          <FormSection title={t("formSection.cover")}>
            <MultiImagePicker items={cover} onChange={setCover} max={1} />
          </FormSection>

          <FormSection title={t("formSection.tool")}>
            <ToolPicker value={tools} onChange={setTools} contentType={contentType} category={category} />
          </FormSection>

          <PresetParametersBuilder
            contentType={contentType}
            category={category}
            subcategory={subcategory}
            tools={tools}
            fields={fields}
            selection={selection}
            onChange={(nextFields, nextSelection) => {
              setFields(nextFields);
              setSelection(nextSelection);
            }}
          />

          <FormSection title={t("forms.tags")}>
            <TagPicker picker={tagPicker} />
          </FormSection>

          <CreateFormActions
            visibility={visibility}
            onVisibilityChange={setVisibility}
            onSaveDraft={() => void save(true)}
            busy={isSaving}
            publishLabel={isSaving ? t("common.saving") : editId ? t("common.save") : t("common.share")}
          >
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </CreateFormActions>
        </form>

        <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{t("forms.livePreview")}</p>
          <div className="pointer-events-none select-none">
            <PresetCard preset={previewPreset} />
          </div>
        </div>
      </div>
    </div>
  );
}
