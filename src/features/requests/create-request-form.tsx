"use client";
import { ToolPicker } from "@/features/content/tool-picker";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RequestCard } from "./request-card";
import { useRealRequests } from "./real-requests-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { TaxonomyPicker } from "@/features/content/taxonomy-picker";
import { useTagCatalog } from "@/features/tags/use-tag-catalog";
import { useTagPicker } from "@/features/prompts/use-tag-picker";
import { TagPicker } from "@/features/prompts/tag-picker";
import { RequestVisionAssist } from "./request-vision-assist";
import { cn, requestHref, resizeImageToDataUrlFit } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { PromptContentType, PromptRequest } from "@/types";


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
  const [referenceImage, setReferenceImage] = useState<{ url: string; width: number; height: number } | null>(
    null,
  );
  const [referenceImageFile, setReferenceImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [titleTouched, setTitleTouched] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [editingRequest, setEditingRequest] = useState<PromptRequest | null>(null);
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
  // selection/reference image are deliberately never touched by editing
  // (see updateRealRequest's own doc comment) — only these fields are
  // seeded/submitted.
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

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeImageToDataUrlFit(file, 480);
      setReferenceImage(resized);
      setReferenceImageFile(file);
      setImageError(null);
    } catch {
      setImageError(t("prompt.imageUploadFailed"));
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
          imageFile: referenceImageFile,
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
    referenceImage: referenceImage
      ? { id: "reference", url: referenceImage.url, width: referenceImage.width, height: referenceImage.height, alt: title }
      : editingRequest?.referenceImage,
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
      <h1 className="mb-1 text-h1 font-semibold text-text">{isEditMode ? t("request.editRequestTitle") : t("request.createRequestTitle")}</h1>
      <p className="mb-6 text-sm text-text-muted">
        {isEditMode ? t("prompt.editPromptHint") : t("request.createRequestHint")}
      </p>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <form onSubmit={handleSubmit} className="space-y-5">
          <TaxonomyPicker
            value={{ contentType, category, subcategory }}
            onChange={(next) => {
              setContentType(next.contentType);
              setCategory(next.category);
              setSubcategory(next.subcategory);
            }}
            lockContentType={isEditMode}
            lockedHint={t("prompt.notEditableWhileEditing")}
          />

          {!isEditMode && contentType === "image" && (
            <RequestVisionAssist
              onApplyDescription={(text) => setDescription((prev) => (prev.trim() ? `${prev}\n\n${text}` : text))}
              onApplyCreativeDirection={(text) =>
                setCreativeDirection((prev) => (prev.trim() ? `${prev} · ${text}` : text))
              }
            />
          )}

          <div>
            <label htmlFor="request-title" className="mb-1.5 flex items-center justify-between text-sm font-medium text-text">
              {t("request.requestTitleLabel")}
              <span className="text-xs font-normal text-text-muted">
                {title.length}/{TITLE_MAX}
              </span>
            </label>
            <input
              id="request-title"
              type="text"
              maxLength={TITLE_MAX}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => setTitleTouched(true)}
              placeholder={t("request.titlePlaceholder")}
              className={cn(
                "h-10 w-full rounded-md border bg-background px-3 text-sm text-text placeholder:text-text-muted",
                titleTouched && titleError ? "border-danger" : "border-border",
              )}
            />
            {titleTouched && titleError && <p className="mt-1 text-xs text-danger">{titleError}</p>}
          </div>

          <div>
            <label htmlFor="request-description" className="mb-1.5 flex items-center justify-between text-sm font-medium text-text">
              {t("request.requestDescriptionLabel")}
              <span className="text-xs font-normal text-text-muted">
                {description.length}/{DESCRIPTION_MAX}
              </span>
            </label>
            <textarea
              id="request-description"
              maxLength={DESCRIPTION_MAX}
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              onBlur={() => setDescriptionTouched(true)}
              placeholder={t("request.descriptionPlaceholder")}
              className={cn(
                "w-full resize-none rounded-md border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted",
                descriptionTouched && descriptionError ? "border-danger" : "border-border",
              )}
            />
            {descriptionTouched && descriptionError && (
              <p className="mt-1 text-xs text-danger">{descriptionError}</p>
            )}
          </div>

          <div>
            <label htmlFor="request-direction" className="mb-1.5 block text-sm font-medium text-text">
              {t("request.creativeDirection")} <span className="text-text-muted">({t("common.optional")})</span>
            </label>
            <textarea
              id="request-direction"
              rows={2}
              value={creativeDirection}
              onChange={(event) => setCreativeDirection(event.target.value)}
              placeholder={t("request.creativeDirectionPlaceholder")}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted"
            />
          </div>

          {!isEditMode && (
            <div>
              <label className="mb-2 block text-sm font-medium text-text">
                {t("request.referenceImage")} <span className="text-text-muted">({t("common.optional")})</span>
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="block w-full text-sm text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-accent-surface/70"
              />
              {imageError && <p className="mt-1 text-xs text-danger">{imageError}</p>}
            </div>
          )}

          <ToolPicker
            label={t("tool.preferredLabel")}
            value={tools}
            onChange={setTools}
            contentType={contentType}
            category={category}
          />

          <div>
            <label className="mb-2 block text-sm font-medium text-text">
              {t("forms.tags")} <span className="text-text-muted">({t("common.optional")})</span>
            </label>
            <TagPicker picker={tagPicker} />
          </div>

          {publishError && <p className="text-sm text-danger">{publishError}</p>}

          <div className="flex gap-2">
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? (isEditMode ? t("common.saving") : t("prompt.publishing")) : isEditMode ? t("common.save") : t("request.publishRequest")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={() => router.push(isEditMode && editingRequest ? requestHref(editingRequest) : "/requests")}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </form>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{t("forms.livePreview")}</p>
          <div className="pointer-events-none select-none">
            <RequestCard request={previewRequest} />
          </div>
        </div>
      </div>
    </div>
  );
}
