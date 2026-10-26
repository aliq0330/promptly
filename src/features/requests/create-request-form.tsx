"use client";
import { useCommunityContext, useCommunityReturn } from "@/features/communities/community-return";
import { ToolPicker } from "@/features/content/tool-picker";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RequestCard } from "./request-card";
import { useRealRequests } from "./real-requests-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { TaxonomyPicker } from "@/features/content/taxonomy-picker";
import { useTagCatalog } from "@/features/tags/use-tag-catalog";
import { useTagPicker } from "@/features/prompts/use-tag-picker";
import { usePrefillTag } from "@/features/challenges/use-prefill-tag";
import { TagPicker } from "@/features/prompts/tag-picker";
import { RequestVisionAssist } from "./request-vision-assist";
import { MultiImagePicker } from "@/features/content/multi-image-picker";
import { multiImageItemFromMedia, toDeferredMediaInputs, type MultiImageItem } from "@/lib/supabase/media-input";
import { requestHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { KindDraftsButton } from "@/features/drafts/kind-drafts-button";
import { ComposeShell, PublishPreview, useComposeLeave, useDirty } from "@/features/content/compose";
import { ComposeAudienceLine, ComposeSection, FormDisclosure, FormField, formTextInputClassName, formTextareaClassName } from "@/features/content/compose-form";
import { ContentTypePicker, SuggestedTagsRow } from "@/features/content/compose-fields";
import { PublishPanel, type PublishPanelHandle, type PublishProblem } from "@/features/content/publish-panel";
import { taxonomyPathLabel } from "@/lib/content-taxonomy";
import { resolveToolRefs } from "@/lib/ai-tool-catalog";
import type { ContentVisibility, PromptContentType, PromptRequest } from "@/types";
import { MentionTextarea } from "@/features/mentions/mention-field";


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
  const { t, language } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnToCommunity = useCommunityReturn();
  const { communityId, name: communityName } = useCommunityContext();
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
  usePrefillTag(tagPicker.addManual, !isEditMode);
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

  // Tek sayfa form (docs/history/244-*): yayın bölümü (`PublishPanel`) ve ✕'teki "kaydedilsin mi?".
  const panelRef = useRef<PublishPanelHandle>(null);
  const canSaveDraft = !isEditMode || isEditingDraft;
  const dirty = useDirty(
    JSON.stringify([contentType, category, subcategory, title, description, creativeDirection, tools, images.map((item) => item.key), tagPicker.accepted.map((entry) => entry.tag.slug), visibility]),
    editChecked && fieldsSeeded,
  );
  const leave = useComposeLeave({ dirty, saveDraft: canSaveDraft ? () => handleSaveDraft(true) : undefined });

  /** `leaving`: ✕ → "Taslağa kaydet" — kaydedip çıkılır (yeni taslak düzenleme adresine gitmez). */
  async function handleSaveDraft(leaving = false): Promise<boolean> {
    if (isSubmitting || !user || !ownProfile) return false;
    if (!title.trim()) {
      setTitleTouched(true);
      setPublishError(t("draft.titleRequired"));
      if (leaving) document.getElementById("request-title")?.focus();
      return false;
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
        return true;
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
      if (!leaving) router.push(`/requests/new?edit=${draft.id}`);
      return true;
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : t("draft.saveFailed"));
      setIsSubmitting(false);
      return false;
    }
  }

  /** Son kontrol penceresinin "Paylaş"ı (yazma ekranının "Paylaş"ı yalnız pencereyi açar). */
  async function publish() {
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
          communityId,
        },
        ownProfile,
      );
      router.push((await returnToCommunity("request", request.id)) ?? requestHref(request));
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

  const isSaveMode = isEditMode && !isEditingDraft;
  const focusField = (id: string) => () => document.getElementById(id)?.focus();
  const problems: PublishProblem[] = [
    ...(titleError ? [{ key: "title", label: titleError, onFix: focusField("request-title") }] : []),
    ...(descriptionError ? [{ key: "description", label: descriptionError, onFix: focusField("request-description") }] : []),
  ];
  const categoryPath = category ? taxonomyPathLabel({ contentType, category, subcategory }, language, false) : "";
  const showTitleError = titleTouched && Boolean(titleError);
  const showDescriptionError = descriptionTouched && Boolean(descriptionError);
  const publishLabel = isSubmitting ? (isSaveMode ? t("common.saving") : t("prompt.publishing")) : isSaveMode ? t("common.save") : t("common.share");

  return (
    <ComposeShell
      title={isEditMode ? t("request.editRequestTitle") : t("compose.newRequest")}
      titleExtra={<KindDraftsButton kind="request" compact />}
      onClose={leave.requestClose}
      onPublish={() => panelRef.current?.publish()}
      publishLabel={isSaveMode ? t("common.save") : t("common.share")}
      publishDisabled={isSubmitting}
      publishDimmed={problems.length > 0}
      onSaveDraft={canSaveDraft && !communityId ? () => void handleSaveDraft() : undefined}
      aside={
        <>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{t("forms.livePreview")}</p>
          <div className="pointer-events-none select-none">
            <RequestCard request={previewRequest} />
          </div>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          panelRef.current?.publish();
        }}
        data-compose-body=""
        className="space-y-6"
      >
        {communityId && (
          <ComposeAudienceLine profile={ownProfile} label={communityName ?? t("compose.aCommunity")} onClick={() => document.getElementById("compose-publish")?.scrollIntoView({ behavior: "smooth", block: "center" })} />
        )}

        <ComposeSection title={t("formSection.basics")}>
          <FormField label={t("compose.whatMaking")} required>
            <ContentTypePicker
              value={contentType}
              onChange={(type) => {
                setContentType(type);
                setCategory(null);
                setSubcategory(null);
              }}
              locked={isEditMode}
            />
          </FormField>
          <FormField label={t("request.requestTitleLabel")} htmlFor="request-title" required error={showTitleError ? titleError : null}>
            <input
              id="request-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => setTitleTouched(true)}
              maxLength={TITLE_MAX}
              placeholder={t("request.titlePlaceholder")}
              aria-invalid={showTitleError}
              className={formTextInputClassName}
            />
          </FormField>
          <FormField label={t("request.requestDescriptionLabel")} htmlFor="request-description" required error={showDescriptionError ? descriptionError : null}>
            <textarea
              id="request-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              onBlur={() => setDescriptionTouched(true)}
              maxLength={DESCRIPTION_MAX}
              rows={4}
              placeholder={t("request.descriptionPlaceholder")}
              aria-invalid={showDescriptionError}
              className={formTextareaClassName}
            />
            <p className="text-right text-caption text-text-muted">{`${description.length}/${DESCRIPTION_MAX}`}</p>
          </FormField>
        </ComposeSection>

        <ComposeSection title={t("compose.sectionDirection")}>
          <FormField label={t("request.creativeDirection")} htmlFor="request-direction" optional>
            <MentionTextarea
              id="request-direction"
              rows={3}
              value={creativeDirection}
              onChange={setCreativeDirection}
              placeholder={t("request.creativeDirectionPlaceholder")}
              className={formTextareaClassName}
            />
          </FormField>
          <FormField label={t("compose.toolReference")} optional>
            <MultiImagePicker items={images} onChange={setImages} />
          </FormField>
          {!isEditMode && contentType === "image" && (
            <FormDisclosure id="vision" label={t("vision.helpTitle")} hint={t("compose.toolHelp")}>
              <RequestVisionAssist
                onApplyDescription={(text) => setDescription((prev) => (prev.trim() ? `${prev}\n\n${text}` : text))}
                onApplyCreativeDirection={(text) => setCreativeDirection((prev) => (prev.trim() ? `${prev} · ${text}` : text))}
              />
            </FormDisclosure>
          )}
        </ComposeSection>

        <ComposeSection title={t("compose.sectionDetails")}>
          <FormDisclosure id="tool" label={t("formSection.tool")} value={resolveToolRefs(tools)[0]?.label}>
            <ToolPicker value={tools} onChange={setTools} contentType={contentType} category={category} />
          </FormDisclosure>
          <FormDisclosure id="category" label={t("taxonomy.categoryLabel")} value={categoryPath}>
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
        </ComposeSection>

        <ComposeSection title={t("publish.whoSees")} id="compose-publish">
          <PublishPanel
            ref={panelRef}
            onConfirm={() => void publish()}
            onSaveDraft={canSaveDraft ? () => void handleSaveDraft() : undefined}
            onBlocked={(problem) => {
              setTitleTouched(true);
              setDescriptionTouched(true);
              problem.onFix?.();
            }}
            busy={isSubmitting}
            confirmLabel={publishLabel}
            hideDestination={isEditMode}
            visibility={visibility}
            onVisibilityChange={setVisibility}
            problems={problems}
            showProblems={titleTouched || descriptionTouched}
            preview={
              <PublishPreview
                thumbnail={images[0]?.url ?? null}
                icon={Sparkles}
                typeLabel={[t("request.title"), resolveToolRefs(tools)[0]?.label].filter(Boolean).join(" · ")}
                title={title.trim() || t("request.untitledRequest")}
                meta={[ownProfile ? `@${ownProfile.username}` : "", ...tagPicker.accepted.slice(0, 3).map((entry) => `#${entry.tag.label}`)].filter(Boolean).join(" · ")}
              />
            }
          >
            {draftNotice && <p className="text-sm text-success">{t("draft.saved")}</p>}
            {publishError && (
              <p role="alert" className="animate-pop-in text-sm text-danger">
                {publishError}
              </p>
            )}
          </PublishPanel>
        </ComposeSection>
      </form>
      {leave.dialog}
    </ComposeShell>
  );
}
