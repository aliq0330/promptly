"use client";
import { ToolPicker } from "@/features/content/tool-picker";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Blocks, Copy, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PromptCard } from "@/features/prompts/prompt-card";
import { TaxonomyPicker } from "@/features/content/taxonomy-picker";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { useTagCatalog } from "@/features/tags/use-tag-catalog";
import { useTagPicker } from "@/features/prompts/use-tag-picker";
import { TagPicker } from "@/features/prompts/tag-picker";
import { PromptTextEditor, type DraftVariable } from "@/features/prompts/prompt-text-editor";
import { PromptVisionAssist } from "@/features/prompts/prompt-vision-assist";
import { fetchVariablesForPrompt, replaceVariablesForPrompt } from "@/lib/supabase/prompt-variables";
import { fetchGeneratorById, fetchGeneratorRun } from "@/lib/supabase/generators";
import { placeholderArt } from "@/lib/placeholder-image";
import { cn, copyTextToClipboard, generatorHref, promptHref, requestHref, resizeImageToDataUrlFit } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Generator, GeneratorRun, Prompt, PromptContentType, PromptRequest } from "@/types";


function LoginGate({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-2 text-h2 font-semibold text-text">{t("auth.loginRequiredTitle")}</h1>
      <p className="mb-4 text-sm text-text-muted">{message}</p>
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

/**
 * `prompts` has no `negative_prompt` column (Bölüm 9's schema wasn't
 * extended for it — a generator's negative-prompt output has nowhere real
 * to live on a published Prompt), so a generator run's negative prompt is
 * never silently dropped OR force-appended into `promptText` with invented
 * formatting — it's shown as an honest, read-only reference the author can
 * manually fold into the prompt text (or a tool's own negative-prompt
 * field) however makes sense for their own use case.
 */
function NegativePromptReference({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-accent-surface/30 p-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t("prompt.negativePromptOutput")}</p>
      <p className="whitespace-pre-wrap font-mono text-xs text-text-muted">{text}</p>
      <button
        type="button"
        onClick={async () => {
          if (await copyTextToClipboard(text)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
        className="text-xs font-medium text-primary hover:underline"
      >
        {copied ? t("common.copied") : t("common.copy")}
      </button>
      <p className="text-xs text-text-muted">{t("prompt.negativePromptHint")}</p>
    </div>
  );
}

/**
 * Real, working prompt creation/duplicate/answer form. Every prompt and
 * request is a real Supabase row now (CLAUDE.md's mock-data removal), so
 * publishing always requires a signed-in account — there is no more
 * anonymous preview-only mode.
 *
 * Modes, chosen by the query string:
 *  - plain (`/create`): a fresh prompt, `origin: "original"`.
 *  - `?duplicate=<promptId>`: prefilled from a real source prompt but
 *    publishes as a fresh `origin: "original"` — no FK back to the source.
 *  - `?answerRequest=<requestId>`: prefilled from a real request, publishes
 *    with `origin: "request-response"` (`request_id` set), which
 *    increments the request's real `response_count`.
 *  - `?generatorRun=<runId>`: prefilled from a real generator run's
 *    generated prompt text (Generator Builder's "Prompt Olarak Aç" bridge).
 *  - `?edit=<promptId>`: editing an existing prompt the caller owns.
 *
 * Remix creation (a former `?remix=<promptId>` mode) was fully removed from
 * this platform (kullanıcının açık talebi) — a "Kopyasını Oluştur"
 * (duplicate) is not a remix and was never affected by that removal.
 */
export function CreatePromptForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { profile: ownProfile } = useOwnProfile();
  const { getCached: getCachedPrompt, fetchById: fetchPromptById, addPrompt, updatePrompt } = useRealPrompts();
  const { getCached: getCachedRequest, fetchById: fetchRequestById } = useRealRequests();

  const editId = searchParams.get("edit");
  const isEditMode = Boolean(editId);
  const duplicateId = !isEditMode ? searchParams.get("duplicate") : null;
  const answerRequestId = !isEditMode ? searchParams.get("answerRequest") : null;
  const generatorRunId = !isEditMode ? searchParams.get("generatorRun") : null;
  const isAnswerMode = Boolean(answerRequestId);
  const isDuplicateMode = Boolean(duplicateId);
  const isGeneratorRunMode = Boolean(generatorRunId);

  const [duplicateSource, setDuplicateSource] = useState<Prompt | null>(null);
  const [answeredRequest, setAnsweredRequest] = useState<PromptRequest | null>(null);
  const [generatorRun, setGeneratorRun] = useState<GeneratorRun | null>(null);
  const [sourceGenerator, setSourceGenerator] = useState<Generator | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [editForbidden, setEditForbidden] = useState(false);
  const [sourceChecked, setSourceChecked] = useState(
    !isDuplicateMode && !isAnswerMode && !isEditMode && !isGeneratorRunMode,
  );
  const { catalog: tagCatalog } = useTagCatalog();

  // Fetch whichever real source this mode needs (cache-first, then a live fetch).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (isEditMode && editId) {
        const cached = getCachedPrompt(editId);
        const found = cached ?? (await fetchPromptById(editId));
        if (!cancelled) {
          // No shared/collaborative editing exists in this app (CLAUDE.md
          // "Prompt Değişken Sistemi" §11) — RLS itself only lets the real
          // author's own UPDATE succeed, but this check gives an honest,
          // immediate message instead of letting a non-owner fill out the
          // whole form only to hit an RLS rejection on submit.
          if (found && user && found.author.id === user.id) {
            setEditingPrompt(found);
          } else if (found) {
            setEditForbidden(true);
          }
        }
      } else if (isDuplicateMode && duplicateId) {
        const cached = getCachedPrompt(duplicateId);
        const found = cached ?? (await fetchPromptById(duplicateId));
        if (!cancelled) setDuplicateSource(found);
      } else if (isAnswerMode && answerRequestId) {
        const cached = getCachedRequest(answerRequestId);
        const found = cached ?? (await fetchRequestById(answerRequestId));
        if (!cancelled) setAnsweredRequest(found);
      } else if (isGeneratorRunMode && generatorRunId) {
        // RLS already restricts `generator_runs` SELECT to the run's own
        // `user_id` (see the migration) — a run that isn't this signed-in
        // user's own simply comes back `null` here, which falls through to
        // the same honest "not found" screen every other mode already has,
        // no separate ownership check needed.
        const run = await fetchGeneratorRun(generatorRunId);
        if (!cancelled) setGeneratorRun(run);
        if (run) {
          const gen = await fetchGeneratorById(run.generatorId);
          if (!cancelled) setSourceGenerator(gen);
        }
      }
      if (!cancelled) setSourceChecked(true);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEditMode,
    editId,
    isDuplicateMode,
    duplicateId,
    isAnswerMode,
    answerRequestId,
    isGeneratorRunMode,
    generatorRunId,
    user,
  ]);

  const [contentType, setContentType] = useState<PromptContentType>("image");
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [promptText, setPromptText] = useState("");
  // Legacy free-text tool: only carried through unchanged; the picker below writes `tools`.
  const [tool, setTool] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  // CLAUDE.md §12: answering a request must NOT just copy the request's own
  // tags — they're only passed as soft `contextTags` (nudge into the
  // `suggested` tier, never auto-accepted); the answer's own title/prompt
  // text genuinely drives what gets auto-tagged.
  const tagPicker = useTagPicker({
    title,
    content: promptText,
    catalog: tagCatalog,
    contextTags: isAnswerMode ? answeredRequest?.tags : undefined,
  });
  const [uploadedImage, setUploadedImage] = useState<{ url: string; width: number; height: number } | null>(
    null,
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [fieldsSeeded, setFieldsSeeded] = useState(false);
  const [variables, setVariables] = useState<DraftVariable[]>([]);
  const [showOnProfile, setShowOnProfile] = useState(true);

  // The real source's fields arrive asynchronously — backfill the form the
  // first time one becomes available (same pattern as /profile/edit's
  // real-profile sync). Runs once per mode; the user is free to edit
  // afterwards without being overwritten again.
  useEffect(() => {
    if (fieldsSeeded) return;
    if (editingPrompt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time seed once the async source loads
      setContentType(editingPrompt.contentType);
      setCategory(editingPrompt.category);
      setSubcategory(editingPrompt.subcategory);
      setTitle(editingPrompt.title);
      setDescription(editingPrompt.description);
      setPromptText(editingPrompt.promptText);
      setTool(editingPrompt.tool ?? "");
      setTools(editingPrompt.tools ?? []);
      if (editingPrompt.origin.type === "request-response") {
        setShowOnProfile(editingPrompt.showOnProfile);
      }
      editingPrompt.tags.forEach((tag) => tagPicker.addManual(tag));
      setFieldsSeeded(true);
      fetchVariablesForPrompt(editingPrompt.id).then((real) => {
        setVariables(
          real.map((variable) => ({
            tempId: variable.id,
            name: variable.name,
            defaultValue: variable.defaultValue,
            description: variable.description ?? "",
          })),
        );
      });
      return;
    }
    if (duplicateSource) {
      setContentType(duplicateSource.contentType);
      setCategory(duplicateSource.category);
      setSubcategory(duplicateSource.subcategory);
      setTitle(`${duplicateSource.title} ${t("common.copySuffix")}`);
      setDescription(duplicateSource.description);
      setPromptText(duplicateSource.promptText);
      setTool(duplicateSource.tool ?? "");
      setTools(duplicateSource.tools ?? []);
      duplicateSource.tags.forEach((tag) => tagPicker.addManual(tag));
      setFieldsSeeded(true);
      return;
    }
    if (answeredRequest) {
      setContentType(answeredRequest.contentType ?? "image");
      setCategory(answeredRequest.category);
      setSubcategory(answeredRequest.subcategory);
      setTool(answeredRequest.preferredTool ?? "");
      setTools(answeredRequest.tools ?? []);
      // Deliberately NOT copying answeredRequest.tags here (CLAUDE.md §12)
      // — they're fed into useTagPicker as contextTags instead, which only
      // nudges the suggested tier; the answer's own live analysis (title +
      // promptText, once the user starts writing) decides what actually
      // gets accepted.
      setFieldsSeeded(true);
      return;
    }
    if (generatorRun && sourceChecked) {
      // Gated on `sourceChecked` (only set once the OTHER effect's load()
      // has awaited BOTH the run and its generator) rather than on
      // `generatorRun` alone — `setGeneratorRun`/`setSourceGenerator` are
      // two separate `setState` calls straddling an `await` in that other
      // effect, so `generatorRun` alone can already be truthy for a render
      // where `sourceGenerator` hasn't arrived yet; seeding (and marking
      // `fieldsSeeded`) on that earlier render would permanently skip the
      // title/content-type fill once the generator DOES arrive a moment
      // later, since this effect only ever runs once per `fieldsSeeded`.
      if (sourceGenerator) {
        setContentType(sourceGenerator.contentType);
        setCategory(sourceGenerator.category);
        setSubcategory(sourceGenerator.subcategory);
        setTitle(sourceGenerator.title);
      }
      setPromptText(generatorRun.generatedPrompt);
      setFieldsSeeded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tagPicker.addManual is stable (useCallback), not a reactive dependency worth re-running this one-time seed for
  }, [editingPrompt, duplicateSource, answeredRequest, generatorRun, sourceGenerator, sourceChecked, fieldsSeeded]);

  const [publishError, setPublishError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const notFound =
    sourceChecked &&
    ((isDuplicateMode && !duplicateSource) ||
      (isAnswerMode && !answeredRequest) ||
      (isGeneratorRunMode && !generatorRun) ||
      (isEditMode && !editingPrompt && !editForbidden));
  const isRequestClosed = isAnswerMode && Boolean(answeredRequest) && answeredRequest?.status !== "open";
  /**
   * A request's `status` alone doesn't reflect a soft-delete (Bölüm 9.5's
   * comment-delete mantığı, `prompt_requests` için — bkz. 20260919350000)
   * — the trigger deliberately leaves `status` untouched, so a
   * soft-deleted request can still read `status === "open"`. Checked
   * BEFORE `isRequestClosed` so a deleted request always shows its own,
   * more accurate message instead of the generic "kapandı" one. The
   * server-side `validate_prompt_response_target()` trigger is the real,
   * atomic guarantee (this is only an earlier, friendlier UI check).
   */
  const isRequestDeleted = isAnswerMode && Boolean(answeredRequest?.deletedAt);
  // Editing an existing answer to a request needs the same profile-visibility
  // choice a fresh answer gets (isAnswerMode) — an `original` prompt has no
  // such concept and never reaches this branch since it's not `edit`-able
  // from a request context.
  const isEditingResponse = isEditMode && editingPrompt?.origin.type === "request-response";
  const showsVisibilityChoice = isAnswerMode || isEditingResponse;

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeImageToDataUrlFit(file, 1100);
      setUploadedImage(resized);
      setImageFile(file);
      setImageError(null);
    } catch {
      setImageError(t("prompt.imageUploadFailed"));
    }
  }

  const origin: Prompt["origin"] = editingPrompt
    ? editingPrompt.origin
    : answeredRequest
      ? { type: "request-response", requestId: answeredRequest.id, responseId: "pending" }
      : { type: "original" };

  const generatedFrom =
    !isEditMode && generatorRun && sourceGenerator
      ? {
          generatorId: sourceGenerator.id,
          generatorVersionId: generatorRun.generatorVersionId,
          generatorRunId: generatorRun.id,
          generatorTitle: sourceGenerator.title,
          generatorSlug: sourceGenerator.slug,
        }
      : null;

  const existingMedia = editingPrompt?.media[0];
  const media =
    contentType === "image"
      ? [
          {
            id: "preview-media",
            url: uploadedImage?.url ?? existingMedia?.url ?? placeholderArt(title || "yeni-prompt", 900, 1100),
            width: uploadedImage?.width ?? existingMedia?.width ?? 900,
            height: uploadedImage?.height ?? existingMedia?.height ?? 1100,
            alt: title || t("prompt.previewImageAlt"),
          },
        ]
      : [];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting || !user || !ownProfile) return;

    setPublishError(null);
    setIsSubmitting(true);
    const variableDrafts = variables.map((variable) => ({
      name: variable.name,
      defaultValue: variable.defaultValue,
      description: variable.description || null,
    }));
    try {
      if (isEditMode && editingPrompt) {
        const updated = await updatePrompt(editingPrompt.id, {
          title,
          description,
          promptText,
          tool: tool || null,
          tools,
          category,
          subcategory,
          tags: tagPicker.accepted.map((entry) => entry.tag),
          tagSources: Object.fromEntries(tagPicker.accepted.map((entry) => [entry.tag.slug, entry.source])),
          imageFile: contentType === "image" ? imageFile : undefined,
          showOnProfile: isEditingResponse ? showOnProfile : undefined,
        });
        // Soft-fail, same precedent as tags (createRealPrompt) — the edit
        // itself already succeeded and is already live; a variable-save
        // hiccup shouldn't be reported as "the edit failed".
        try {
          await replaceVariablesForPrompt(updated.id, variableDrafts);
        } catch (variableErr) {
          console.error("replaceVariablesForPrompt", variableErr);
        }
        router.push(promptHref(updated));
        return;
      }

      const published = await addPrompt(
        {
          title,
          description,
          promptText,
          tool: tool || null,
          tools,
          contentType,
          category,
          subcategory,
          tags: tagPicker.accepted.map((entry) => entry.tag),
          tagSources: Object.fromEntries(tagPicker.accepted.map((entry) => [entry.tag.slug, entry.source])),
          imageFile,
          fallbackImage:
            contentType === "image" ? { url: media[0].url, width: media[0].width, height: media[0].height } : null,
          requestId: answeredRequest?.id,
          showOnProfile: isAnswerMode ? showOnProfile : true,
          generatedFrom: generatedFrom ?? undefined,
        },
        ownProfile,
      );
      try {
        await replaceVariablesForPrompt(published.id, variableDrafts);
      } catch (variableErr) {
        console.error("replaceVariablesForPrompt", variableErr);
      }
      router.push(promptHref(published));
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : t("prompt.publishFailed"));
      setIsSubmitting(false);
    }
  }

  const previewPrompt: Prompt = {
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
    title: title || t("prompt.untitledPrompt"),
    description: description || t("prompt.noDescriptionAdded"),
    promptText: promptText || t("prompt.promptTextPlaceholderPreview"),
    tool: tool || null,
          tools,
    contentType,
    category,
    subcategory,
    media,
    tags: tagPicker.accepted.map((entry) => entry.tag),
    origin,
    likeCount: 0,
    commentCount: 0,
    isLiked: false,
    isSaved: false,
    status: "draft",
    showOnProfile: showsVisibilityChoice ? showOnProfile : true,
    deletedAt: null,
    generatedFrom,
    createdAt: new Date().toISOString(),
  };

  if (!user) {
    return <LoginGate message={t("prompt.loginToCreateMessage")} />;
  }

  if (!sourceChecked) {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">{t("common.loading")}</div>;
  }

  if (editForbidden) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("prompt.noEditPermissionTitle")}</h1>
        <p className="mb-4 text-sm text-text-muted">{t("prompt.noEditPermissionBody")}</p>
        <Link
          href="/discover"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          {t("common.backToDiscover")}
        </Link>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">
          {isEditMode
            ? t("prompt.promptNotFound")
            : isAnswerMode
              ? t("request.requestNotFound")
              : isGeneratorRunMode
                ? t("generator.runNotFound")
                : t("prompt.promptNotFound")}
        </h1>
        <p className="mb-4 text-sm text-text-muted">
          {isEditMode
            ? t("prompt.editSourceGoneBody")
            : isAnswerMode
              ? t("request.answerSourceGoneBody")
              : isGeneratorRunMode
                ? t("generator.runNotFoundBody")
                : t("prompt.duplicateSourceGoneBody")}
        </p>
        <Link
          href={isAnswerMode ? "/requests" : isGeneratorRunMode ? "/generators" : "/discover"}
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          {isAnswerMode ? t("common.backToRequests") : isGeneratorRunMode ? t("common.backToGenerators") : t("common.backToDiscover")}
        </Link>
      </div>
    );
  }

  if (isRequestDeleted && answeredRequest) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("request.thisRequestDeletedTitle")}</h1>
        <p className="mb-4 text-sm text-text-muted">{t("request.requestDeletedNoNewReplies")}</p>
        <Link
          href="/requests"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          {t("common.backToRequests")}
        </Link>
      </div>
    );
  }

  if (isRequestClosed && answeredRequest) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">{t("request.thisRequestClosedTitle")}</h1>
        <p className="mb-4 text-sm text-text-muted">{t("request.requestClosedNoNewReplies")}</p>
        <Link
          href={requestHref(answeredRequest)}
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          {t("request.viewRequest")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <h1 className="mb-1 text-h1 font-semibold text-text">
        {isEditMode
          ? t("prompt.editPromptTitle")
          : isAnswerMode
            ? t("prompt.answerRequestTitle")
            : isDuplicateMode
              ? t("prompt.duplicateTitle")
              : isGeneratorRunMode
                ? t("prompt.openAsPromptTitle")
                : t("prompt.createPromptTitle")}
      </h1>
      <p className="mb-6 text-sm text-text-muted">
        {isEditMode
          ? t("prompt.editPromptHint")
          : isAnswerMode
            ? t("prompt.answerRequestHint")
            : isGeneratorRunMode
              ? t("prompt.generatorRunHint")
              : t("prompt.createPromptHint")}
      </p>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <form onSubmit={handleSubmit} className="space-y-5">
          {isAnswerMode && answeredRequest && (
            <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-primary">{t("prompt.answeringThisRequest")}</span>
                <Link
                  href="/create"
                  title={t("prompt.exitAnswerMode")}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-muted hover:text-text"
                >
                  <X size={14} />
                </Link>
              </div>
              <div className="flex items-center gap-2">
                <Avatar
                  src={answeredRequest.author.avatarUrl}
                  alt={answeredRequest.author.displayName}
                  size={24}
                />
                <span className="text-text-muted">
                  <span className="font-medium text-text">{answeredRequest.author.displayName}</span>{" "}
                  {t("prompt.requestColon")} &ldquo;{answeredRequest.title}&rdquo;
                </span>
              </div>
              <Link
                href={requestHref(answeredRequest)}
                className="inline-block font-medium text-primary underline"
              >
                {t("request.viewRequest")}
              </Link>
            </div>
          )}

          {showsVisibilityChoice && (
            <div>
              <label className="mb-2 block text-sm font-medium text-text">{t("prompt.showOnProfileQuestion")}</label>
              <div className="space-y-2">
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-md border p-3 text-sm transition-colors",
                    showOnProfile ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-accent-surface/40",
                  )}
                >
                  <input
                    type="radio"
                    name="show-on-profile"
                    checked={showOnProfile}
                    onChange={() => setShowOnProfile(true)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-medium text-text">{t("prompt.shareOnProfile")}</span>
                    <span className="block text-xs text-text-muted">{t("prompt.shareOnProfileHint")}</span>
                  </span>
                </label>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-md border p-3 text-sm transition-colors",
                    !showOnProfile ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-accent-surface/40",
                  )}
                >
                  <input
                    type="radio"
                    name="show-on-profile"
                    checked={!showOnProfile}
                    onChange={() => setShowOnProfile(false)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-medium text-text">{t("prompt.dontShareOnProfile")}</span>
                    <span className="block text-xs text-text-muted">{t("prompt.dontShareOnProfileHint")}</span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {duplicateSource && (
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
              <Copy size={16} className="mt-0.5 shrink-0" />
              <p>
                <Link href={promptHref(duplicateSource)} className="font-medium underline">
                  &ldquo;{duplicateSource.title}&rdquo;
                </Link>{" "}
                {t("prompt.duplicatePrefillHint")}
              </p>
            </div>
          )}

          {generatorRun && (
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
              <Blocks size={16} className="mt-0.5 shrink-0" />
              <p>
                {sourceGenerator ? (
                  <>
                    <Link href={generatorHref(sourceGenerator)} className="font-medium underline">
                      &ldquo;{sourceGenerator.title}&rdquo;
                    </Link>{" "}
                    {t("prompt.generatorRunPrefillWithSource")}
                  </>
                ) : (
                  t("prompt.generatorRunPrefillNoSource")
                )}{" "}
                {t("prompt.generatorRunPrefillHint")}
              </p>
            </div>
          )}

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

          {contentType === "image" && (
            <PromptVisionAssist
              onApplyPrompt={(text, mode) =>
                setPromptText((prev) => (mode === "replace" || !prev.trim() ? text : `${prev}\n\n${text}`))
              }
            />
          )}

          {contentType === "image" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-text">
                {t("prompt.imageLabel")} {isEditMode && <span className="text-text-muted">({t("common.optional")})</span>}
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="block w-full text-sm text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-accent-surface/70"
              />
              <p className="mt-1 text-xs text-text-muted">
                {isEditMode ? t("prompt.imageEditHint") : t("prompt.imageUploadHint")}
              </p>
              {imageError && <p className="mt-1 text-xs text-danger">{imageError}</p>}
            </div>
          )}

          <div>
            <label htmlFor="prompt-title" className="mb-1.5 block text-sm font-medium text-text">
              {t("forms.title")}
            </label>
            <input
              id="prompt-title"
              type="text"
              required
              maxLength={80}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("prompt.titlePlaceholder")}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
            />
          </div>

          <div>
            <label htmlFor="prompt-description" className="mb-1.5 block text-sm font-medium text-text">
              {t("forms.shortDescription")}
            </label>
            <textarea
              id="prompt-description"
              required
              maxLength={200}
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("prompt.descriptionPlaceholder")}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted"
            />
          </div>

          <div>
            <label htmlFor="prompt-text" className="mb-1.5 block text-sm font-medium text-text">
              {t("prompt.promptTextHeading")}
            </label>
            <PromptTextEditor
              id="prompt-text"
              value={promptText}
              onChange={setPromptText}
              variables={variables}
              onVariablesChange={setVariables}
              rows={5}
              placeholder={t("prompt.promptTextPlaceholder")}
            />
          </div>

          {generatorRun?.generatedNegativePrompt && (
            <NegativePromptReference text={generatorRun.generatedNegativePrompt} />
          )}

          <ToolPicker
            label={t("tool.recommendedLabel")}
            value={tools}
            onChange={setTools}
            contentType={contentType}
            category={category}
          />

          <div>
            <label className="mb-2 block text-sm font-medium text-text">{t("forms.tags")}</label>
            <TagPicker picker={tagPicker} />
          </div>

          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={isSubmitting}>
            {isSubmitting
              ? isEditMode
                ? t("common.saving")
                : t("prompt.publishing")
              : isEditMode
                ? t("common.save")
                : isAnswerMode
                  ? t("prompt.publishReply")
                  : t("common.share")}
          </Button>

          {publishError && (
            <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
              {publishError}
            </div>
          )}
        </form>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{t("forms.livePreview")}</p>
          <div className="pointer-events-none select-none">
            <PromptCard prompt={previewPrompt} />
          </div>
        </div>
      </div>
    </div>
  );
}
