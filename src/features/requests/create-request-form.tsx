"use client";
import { ToolPicker } from "@/features/content/tool-picker";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RequestCard } from "./request-card";
import { useRealRequests } from "./real-requests-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { TaxonomyPicker } from "@/features/content/taxonomy-picker";
import { useTagCatalog } from "@/features/tags/use-tag-catalog";
import { useTagPicker } from "@/features/prompts/use-tag-picker";
import { TagPicker } from "@/features/prompts/tag-picker";
import { TitleField, DescriptionField } from "@/features/content/core-fields";
import { RequestVisionAssist } from "./request-vision-assist";
import { MultiImagePicker } from "@/features/content/multi-image-picker";
import { multiImageItemFromMedia, toDeferredMediaInputs, type MultiImageItem } from "@/lib/supabase/media-input";
import { requestHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { KindDraftsButton } from "@/features/drafts/kind-drafts-button";
import { CreatePageHeader } from "@/features/content/create-page-header";
import { CreateFormActions } from "@/features/content/create-form-actions";
import { FormSection } from "@/features/content/form-section";
import type { ContentVisibility, PromptContentType, PromptRequest } from "@/types";


const TITLE_MIN = 10;
const TITLE_MAX = 100;
const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 500;

/**
 * Real, working request creation — a genuine row in `public.prompt_requests`,
 * visible to every visitor (CLAUDE.md's mock-data removal: every request is
 * a real Supabase row now, so publishing always requires a signed-in
 * account).
 */
export function CreateRequestForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addRequest, updateRequest, getCached, fetchById } = useRealRequests();
  const [draftNotice, setDraftNotice] = useState(false);
  const { user } = useAuth();
  const { profile: ownProfile } = useOwnProfile();

  const editId = searchParams.get("edit");
  const isEditMode = Boolean(editId);

  const { catalog: tagCatalog } = useTagCatalog();

  const [contentType, setContentType] = useState<PromptContentType>("image");
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creativeDirection, setCreativeDirection] = useState("");
  // Legacy free-text tool: no longer editable, only carried through unchanged so old requests keep it.
  const [preferredTool, setPreferredTool] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  // İstek başlığı+açıklaması birlikte analiz ediliyor (CLAUDE.md §12) —
  // isteğin kendi etiketleri, bir yanıtın etiketleriyle asla karıştırılmıyor
  // (bkz. create-prompt-form.tsx'in answerRequest modu).
  const tagPicker = useTagPicker({ title, content: description, catalog: tagCatalog });
  const [images, setImages] = useState<MultiImageItem[]>([]);
  const [visibility, setVisibility] = useState<ContentVisibility>("public");
  const [titleTouched, setTitleTouched] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [editingRequest, setEditingRequest] = useState<PromptRequest | null>(null);
  const isEditingDraft = isEditMode && Boolean(editingRequest?.isDraft);
  const [editForbidden, setEditForbidden] = useState(false);
  const [editChecked, setEditChecked] = useState(!isEditMode);
  const [fieldsSeeded, setFieldsSeeded] = useState(!isEditMode);

  // Fetch the real request being edited (cache-first, then a live fetch) —
  // same pattern as create-prompt-form.tsx's `?edit=` mode.
  useEffect(() => {
    if (!isEditMode || !editId) return;
    let cancelled = false;
    async function load() {
      const cached = getCached(editId!);
      const found = cached ?? (await fetchById(editId!));
      if (cancelled) return;
      // No shared/collaborative editing exists in this app — only the
      // real owner's own edit can ever succeed (RLS), so this is checked
      // up front for an honest message instead of a late RLS rejection.
      if (found && user && found.author.id === user.id) {
        setEditingRequest(found);
      } else if (found) {
        setEditForbidden(true);
      }
      setEditChecked(true);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, editId, user]);

  // Backfill the form once the real request loads (one-time seed, same
  // async-source pattern as create-prompt-form.tsx). content_type/status/
  // selection are deliberately never touched by editing (see
  // updateRealRequest's own doc comment) — reference images ARE editable.
  useEffect(() => {
    if (fieldsSeeded || !editingRequest) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time seed once the async source loads
    setContentType(editingRequest.contentType ?? "image");
    setCategory(editingRequest.category);
    setSubcategory(editingRequest.subcategory);
    setTitle(editingRequest.title);
    setDescription(editingRequest.description);
    setCreativeDirection(editingRequest.creativeDirection);
    setPreferredTool(editingRequest.preferredTool ?? "");
    setTools(editingRequest.tools ?? []);
    setImages(multiImageItemFromMedia(editingRequest.media));
    setVisibility(editingRequest.visibility ?? "public");
    editingRequest.tags.forEach((tag) => tagPicker.addManual(tag));
    setFieldsSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tagPicker.addManual is stable (useCallback)
  }, [editingRequest, fieldsSeeded]);

  const titleError =
    title.trim().length === 0
      ? t("request.titleEmptyError")
      : title.trim().length < TITLE_MIN
        ? t("request.titleTooShortError", { min: TITLE_MIN })
        : null;
  const descriptionError =
    description.trim().length === 0
      ? t("request.descriptionEmptyError")
      : description.trim().length < DESCRIPTION_MIN
        ? t("request.descriptionTooShortError", { min: DESCRIPTION_MIN })
        : null;
  const isValid = !titleError && !descriptionError;

  async function handleSaveDraft() {
    if (isSubmitting || !user || !ownProfile) return;
    if (!title.trim()) {
      setTitleTouched(true);
      setPublishError(t("draft.titleRequired"));
      return;
    }
    setPublishError(null);
    setDraftNotice(false);
    setIsSubmitting(true);
    const tagsInput = {
      tags: tagPicker.accepted.map((entry) => entry.tag),
      tagSources: Object.fromEntries(tagPicker.accepted.map((entry) => [entry.tag.slug, entry.source])),
    };
    try {
      if (isEditMode && editingRequest) {
        await updateRequest(editingRequest.id, {
          title,
          description,
          creativeDirection,
          category,
          subcategory,
          preferredTool: preferredTool || null,
          tools,
          ...tagsInput,
          images: toDeferredMediaInputs(images),
          visibility,
        });
        setDraftNotice(true);
        setIsSubmitting(false);
        return;
      }
      const draft = await addRequest(
        {
          title,
          description,
          creativeDirection,
          contentType,
          category,
          subcategory,
          preferredTool: preferredTool || null,
          tools,
          ...tagsInput,
          images: toDeferredMediaInputs(images),
          visibility,
          isDraft: true,
        },
        ownProfile,
      );
      router.push(`/requests/new?edit=${draft.id}`);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : t("draft.saveFailed"));
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTitleTouched(true);
    setDescriptionTouched(true);
    if (!isValid || isSubmitting || !user || !ownProfile) return;

    setPublishError(null);
    setIsSubmitting(true);
    try {
      if (isEditMode && editingRequest) {
        const updated = await updateRequest(editingRequest.id, {
          title,
          description,
          creativeDirection,
          category,
          subcategory,
          preferredTool: preferredTool || null,
          tools,
          tags: tagPicker.accepted.map((entry) => entry.tag),
          tagSources: Object.fromEntries(tagPicker.accepted.map((entry) => [entry.tag.slug, entry.source])),
          images: toDeferredMediaInputs(images),
          visibility,
          publish: isEditingDraft,
        });
        router.push(requestHref(updated));
        return;
      }

      const request = await addRequest(
        {
          title,
          description,
          creativeDirection,
          contentType,
          category,
          subcategory,
          preferredTool: preferredTool || null,
          tools,
          tags: tagPicker.accepted.map((entry) => entry.tag),
          tagSources: Object.fromEntries(tagPicker.accepted.map((entry) => [entry.tag.slug, entry.source])),
          images: toDeferredMediaInputs(images),
          visibility,
        },
        ownProfile,
      );
      router.push(requestHref(request));
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : t("request.publishFailed"));
      setIsSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("auth.loginRequiredTitle")}</h1>
        <p className="mb-4 text-sm text-text-muted">{t("request.loginToCreateMessage")}</p>
        <div className="flex justify-center gap-2">
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-dark"
          >
            {t("header.login")}
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
          >
            {t("auth.createAccount")}
          </Link>
        </div>
      </div>
    );
  }

  if (!editChecked) {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">{t("common.loading")}</div>;
  }

  if (editForbidden) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("request.noEditPermissionTitle")}</h1>
        <p className="mb-4 text-sm text-text-muted">{t("request.noEditPermissionBody")}</p>
        <Link
          href="/requests"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          {t("request.backToRequests")}
        </Link>
      </div>
    );
  }

  if (isEditMode && !editingRequest) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("request.requestNotFound")}</h1>
        <p className="mb-4 text-sm text-text-muted">{t("request.editSourceGoneBody")}</p>
        <Link
          href="/requests"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          {t("request.backToRequests")}
        </Link>
      </div>
    );
  }

  const previewRequest: PromptRequest = {
    id: "preview",
    author: ownProfile ?? {
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
    title: title || t("request.untitledRequest"),
    description: description || t("prompt.noDescriptionAdded"),
    creativeDirection,
    contentType,
    category,
    subcategory,
    preferredTool: preferredTool || null,
    tools,
    media: images.map((item, index) => ({ id: item.existingId ?? `preview-${index}`, url: item.url, width: item.width, height: item.height, alt: title })),
    referenceImage: images[0]
      ? { id: images[0].existingId ?? "preview-0", url: images[0].url, width: images[0].width, height: images[0].height, alt: title }
      : undefined,
    tags: tagPicker.accepted.map((entry) => entry.tag),
    status: "open",
    responseCount: 0,
    likeCount: 0,
    commentCount: 0,
    createdAt: new Date().toISOString(),
    deletedAt: null,
  };

  return (
    <div className="mx-auto max-w-5xl px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <CreatePageHeader
        title={isEditMode ? t("request.editRequestTitle") : t("request.createRequestTitle")}
        hint={isEditMode ? t("prompt.editPromptHint") : t("request.createRequestHint")}
        drafts={<KindDraftsButton kind="request" />}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={handleSubmit} className="min-w-0 space-y-4">
          <FormSection title={t("taxonomy.categoryLabel")}>
            <TaxonomyPicker
              bare
              value={{ contentType, category, subcategory }}
              onChange={(next) => {
                setContentType(next.contentType);
                setCategory(next.category);
                setSubcategory(next.subcategory);
              }}
              lockContentType={isEditMode}
              lockedHint={t("prompt.notEditableWhileEditing")}
            />
          </FormSection>

          <FormSection title={t("formSection.basics")}>
            <div className="space-y-4">
              <TitleField
                id="request-title"
                label={t("request.requestTitleLabel")}
                value={title}
                onChange={setTitle}
                onBlur={() => setTitleTouched(true)}
                placeholder={t("request.titlePlaceholder")}
                maxLength={TITLE_MAX}
                required
                showCounter
                error={titleTouched ? titleError : null}
              />

              <DescriptionField
                id="request-description"
                label={t("request.requestDescriptionLabel")}
                value={description}
                onChange={setDescription}
                onBlur={() => setDescriptionTouched(true)}
                placeholder={t("request.descriptionPlaceholder")}
                maxLength={DESCRIPTION_MAX}
                required
                showCounter
                error={descriptionTouched ? descriptionError : null}
              />
            </div>
          </FormSection>

          <FormSection title={t("request.referenceImage")}>
            <div className="space-y-4">
              <MultiImagePicker items={images} onChange={setImages} />

              {!isEditMode && contentType === "image" && (
                <RequestVisionAssist
                  onApplyDescription={(text) => setDescription((prev) => (prev.trim() ? `${prev}\n\n${text}` : text))}
                  onApplyCreativeDirection={(text) =>
                    setCreativeDirection((prev) => (prev.trim() ? `${prev} · ${text}` : text))
                  }
                />
              )}
            </div>
          </FormSection>

          <FormSection title={t("formSection.tool")}>
            <ToolPicker value={tools} onChange={setTools} contentType={contentType} category={category} />
          </FormSection>

          <FormSection title={t("request.creativeDirection")}>
            <textarea
              id="request-direction"
              aria-label={t("request.creativeDirection")}
              rows={3}
              value={creativeDirection}
              onChange={(event) => setCreativeDirection(event.target.value)}
              placeholder={t("request.creativeDirectionPlaceholder")}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
            />
          </FormSection>

          <FormSection title={t("forms.tags")}>
            <TagPicker picker={tagPicker} />
          </FormSection>

          <CreateFormActions
            visibility={visibility}
            onVisibilityChange={setVisibility}
            onSaveDraft={!isEditMode || isEditingDraft ? () => void handleSaveDraft() : undefined}
            busy={isSubmitting}
            publishLabel={
              isSubmitting
                ? isEditMode && !isEditingDraft
                  ? t("common.saving")
                  : t("prompt.publishing")
                : isEditMode && !isEditingDraft
                  ? t("common.save")
                  : t("common.share")
            }
          >
            {draftNotice && <p className="text-sm text-success">{t("draft.saved")}</p>}
            {publishError && (
              <p role="alert" className="text-sm text-danger">
                {publishError}
              </p>
            )}
          </CreateFormActions>
        </form>

        <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{t("forms.livePreview")}</p>
          <div className="pointer-events-none select-none">
            <RequestCard request={previewRequest} />
          </div>
        </div>
      </div>
    </div>
  );
}
