"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCommunityContext, useCommunityReturn } from "@/features/communities/community-return";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { Cpu, Folder, Hash, SlidersHorizontal } from "lucide-react";
import { KindDraftsButton } from "@/features/drafts/kind-drafts-button";
import { ComposeSheet, ComposeShell, PublishPreview, composeBodyClassName, composeTitleClassName, useComposeLeave, useDirty } from "@/features/content/compose";
import { ComposeBody, ContentTypePicker, SuggestedTagsRow } from "@/features/content/compose-fields";
import { PublishDetailsSection, PublishSheet, type PublishDetailRow, type PublishProblem } from "@/features/content/publish-sheet";
import { MultiImagePicker, type MultiImageItem } from "@/features/content/multi-image-picker";
import { TaxonomyPicker } from "@/features/content/taxonomy-picker";
import { ToolPicker } from "@/features/content/tool-picker";
import { TagPicker } from "@/features/prompts/tag-picker";
import { useTagPicker } from "@/features/prompts/use-tag-picker";
import { usePrefillTag } from "@/features/challenges/use-prefill-tag";
import { useTagCatalog } from "@/features/tags/use-tag-catalog";
import { fetchPresetById, savePreset } from "@/lib/supabase/presets";
import { sanitizeSelection, type PresetField, type PresetSelection } from "@/lib/preset-fields";
import { normalizePresetForEditing, resolvePresetFields } from "@/lib/preset-utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { presetHref } from "@/lib/utils";
import { resolveToolRefs } from "@/lib/ai-tool-catalog";
import { taxonomyPathLabel } from "@/lib/content-taxonomy";
import { PresetCard } from "./preset-card";
import { PresetParametersBuilder } from "./preset-parameters-builder";
import type { ContentVisibility, Preset, PromptContentType } from "@/types";

type ComposeSheetKey = "tags" | "tool" | "category";

/**
 * Hazır Ayar create/edit form (`/presets/create`, `?edit=<id>`): name,
 * description, content type → category → subcategory (the shared taxonomy),
 * recommended tool/model, parameters (the SAME catalog the Prompt form's "Ek
 * Ayar Önerileri" uses, shown for the chosen type/category), tags, cover and
 * and the shared footer (Görünürlük switch, Taslağa kaydet / Paylaş) with a
 * live `PresetCard` preview. Yazma ekranında yalnız başlık, açıklama, kapak ve parametreler durur; Kategori / Araç / Etiketler
 * "Paylaşmadan önce" penceresindedir (docs/history/216-*, Prompt ve İstek'le aynı düzen).
 */
export function PresetEditor({ editId }: { editId: string | null }) {
  const { t, language } = useTranslation();
  const router = useRouter();
  const returnToCommunity = useCommunityReturn();
  const { communityId, name: communityName } = useCommunityContext();
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
  const [sheet, setSheet] = useState<ComposeSheetKey | null>(null);
  const tagPicker = useTagPicker({ title, content: description, catalog });
  usePrefillTag(tagPicker.addManual, !editId);
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

  // Yazma ekranı kabuğu (docs/history/216-*): son kontrol penceresi + ✕'teki "kaydedilsin mi?".
  const [publishOpen, setPublishOpen] = useState(false);
  const dirty = useDirty(
    JSON.stringify([title, description, contentType, category, subcategory, tools, fields, selection, cover.map((item) => item.key), tagPicker.accepted.map((entry) => entry.tag.slug), visibility]),
    loadState === "ready",
  );
  const leave = useComposeLeave({ dirty, saveDraft: () => save(true, true) });

  /** `leaving`: ✕ → "Taslağa kaydet" — kaydedip çıkılır (taslak listesine gitmez). */
  async function save(asDraft: boolean, leaving = false): Promise<boolean> {
    if (!user || isSaving) return false;
    setTitleTouched(true);
    setError(null);
    if (title.trim().length < 3) {
      if (leaving) document.getElementById("preset-title")?.focus();
      return false;
    }
    if (!asDraft && Object.keys(effectiveSelection).length === 0) {
      setError(t("presetBuilder.errorNoFields"));
      return false;
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
          communityId,
        },
        user.id,
      );
      if (asDraft && leaving) return true;
      router.push(asDraft ? "/presets" : ((await returnToCommunity("preset", id)) ?? presetHref({ id })));
      return true;
    } catch (err) {
      console.error("savePreset", err);
      setError(err instanceof Error && err.message ? err.message : t("preset.errorSave"));
      setIsSaving(false);
      return false;
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

  const problems: PublishProblem[] = [
    ...(title.trim().length < 3 ? [{ key: "title", label: t("preset.errorTitle"), onFix: () => document.getElementById("preset-title")?.focus() }] : []),
    ...(Object.keys(effectiveSelection).length === 0 ? [{ key: "fields", label: t("presetBuilder.errorNoFields") }] : []),
  ];

  /** Tür değişince parametre katalogu da değişir: alanlar ve seçim sıfırlanır (eski davranış). */
  function changeTaxonomy(next: { contentType: PromptContentType; category: string | null; subcategory: string | null }) {
    if (next.contentType !== contentType) {
      setFields([]);
      setSelection({});
    }
    setContentType(next.contentType);
    setCategory(next.category);
    setSubcategory(next.subcategory);
  }

  const sheetTitle: Record<ComposeSheetKey, string> = {
    tags: t("forms.tags"),
    tool: t("formSection.tool"),
    category: t("taxonomy.categoryLabel"),
  };
  const categoryPath = category ? taxonomyPathLabel({ contentType, category, subcategory }, language, false) : "";
  const infoRows: PublishDetailRow[] = [
    { key: "category", icon: Folder, label: t("taxonomy.categoryLabel"), value: categoryPath, onClick: () => setSheet("category") },
    { key: "tool", icon: Cpu, label: t("formSection.tool"), value: resolveToolRefs(tools)[0]?.label, onClick: () => setSheet("tool") },
    {
      key: "tags",
      icon: Hash,
      label: t("forms.tags"),
      value: tagPicker.accepted.length > 0 ? t("compose.tagCount", { count: tagPicker.accepted.length }) : undefined,
      hint: tagPicker.suggested.length > 0 ? t("compose.suggestionCount", { count: tagPicker.suggested.length }) : undefined,
      onClick: () => setSheet("tags"),
    },
  ];

  return (
    <ComposeShell
      title={editId ? t("preset.editTitle") : t("compose.newPreset")}
      titleExtra={<KindDraftsButton kind="preset" compact />}
      onClose={leave.requestClose}
      onPublish={() => {
        setTitleTouched(true);
        setPublishOpen(true);
      }}
      publishLabel={editId ? t("common.save") : t("common.share")}
      publishDisabled={isSaving}
      aside={
        <>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{t("forms.livePreview")}</p>
          <div className="pointer-events-none select-none">
            <PresetCard preset={previewPreset} />
          </div>
        </>
      }
    >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setPublishOpen(true);
          }}
          className="min-w-0 space-y-4"
        >
          <ComposeBody
            profile={ownProfile}
            audienceLabel={communityId ? (communityName ?? t("compose.aCommunity")) : undefined}
            onAudience={() => setPublishOpen(true)}
            typeSlot={<ContentTypePicker value={contentType} onChange={(type) => changeTaxonomy({ contentType: type, category: null, subcategory: null })} />}
          >
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0 space-y-3">
                <div className="space-y-1.5">
                  <input
                    id="preset-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onBlur={() => setTitleTouched(true)}
                    maxLength={120}
                    placeholder={t("preset.titlePlaceholder")}
                    aria-label={t("preset.titleLabel")}
                    aria-invalid={titleError}
                    className={composeTitleClassName}
                  />
                  {titleError && <p className="text-caption text-danger">{t("preset.errorTitle")}</p>}
                </div>
                <textarea
                  id="preset-desc"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder={t("preset.descriptionPlaceholder")}
                  aria-label={t("preset.descriptionLabel")}
                  className={composeBodyClassName}
                />
              </div>
              <div className="sm:w-40">
                <MultiImagePicker variant="strip" max={1} items={cover} onChange={setCover} hint="" />
              </div>
            </div>
          </ComposeBody>

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

        </form>

      {sheet && (
        <ComposeSheet id={sheet} title={sheetTitle[sheet]} onClose={() => setSheet(null)}>
          {sheet === "tags" && <TagPicker picker={tagPicker} />}
          {sheet === "tool" && <ToolPicker value={tools} onChange={setTools} contentType={contentType} category={category} />}
          {sheet === "category" && <TaxonomyPicker bare value={{ contentType, category, subcategory }} onChange={changeTaxonomy} />}
        </ComposeSheet>
      )}

      {publishOpen && (
        <PublishSheet
          onClose={() => setPublishOpen(false)}
          onConfirm={() => void save(false)}
          onSaveDraft={() => void save(true)}
          busy={isSaving}
          title={editId ? t("compose.beforeSave") : undefined}
          confirmLabel={isSaving ? t("common.saving") : editId ? t("common.save") : t("common.share")}
          hideDestination={Boolean(editId)}
          visibility={visibility}
          onVisibilityChange={setVisibility}
          problems={problems}
          details={
            <>
              <PublishDetailsSection title={t("compose.postInfo")} rows={infoRows} />
              <SuggestedTagsRow picker={tagPicker} />
            </>
          }
          preview={
            <PublishPreview
              thumbnail={cover[0]?.url ?? null}
              icon={SlidersHorizontal}
              typeLabel={t("preset.singular")}
              title={title.trim() || t("preset.untitled")}
              meta={ownProfile ? `@${ownProfile.username}` : ""}
            />
          }
        >
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </PublishSheet>
      )}
      {leave.dialog}
    </ComposeShell>
  );
}
