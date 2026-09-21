"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, GitBranch, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PromptCard } from "@/features/prompts/prompt-card";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { useTagCatalog } from "@/features/tags/use-tag-catalog";
import { useTagPicker } from "@/features/prompts/use-tag-picker";
import { TagPicker } from "@/features/prompts/tag-picker";
import { PromptTextEditor, type DraftVariable } from "@/features/prompts/prompt-text-editor";
import { fetchVariablesForPrompt, replaceVariablesForPrompt } from "@/lib/supabase/prompt-variables";
import { placeholderArt } from "@/lib/placeholder-image";
import { cn, promptHref, requestHref, resizeImageToDataUrlFit } from "@/lib/utils";
import type { Prompt, PromptContentType, PromptRequest } from "@/types";

const CONTENT_TYPES: PromptContentType[] = ["image", "text", "video", "code", "music"];

const TOOL_SUGGESTIONS: Record<PromptContentType, string[]> = {
  image: ["Midjourney v6", "Stable Diffusion XL", "DALL-E 3", "NovelAI"],
  text: ["Claude", "GPT-4"],
  video: ["Sora", "Runway Gen-3"],
  code: ["Claude Code", "GPT-4"],
  music: ["Suno", "Udio"],
};

function LoginGate({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-2 text-lg font-semibold text-text">Giriş yapmalısın</h1>
      <p className="mb-4 text-sm text-text-muted">{message}</p>
      <div className="flex justify-center gap-2">
        <Link
          href="/login"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-dark"
        >
          Giriş Yap
        </Link>
        <Link
          href="/signup"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          Hesap Oluştur
        </Link>
      </div>
    </div>
  );
}

/**
 * Real, working prompt creation/remix/duplicate/answer form. Every prompt
 * and request is a real Supabase row now (CLAUDE.md's mock-data removal),
 * so publishing always requires a signed-in account — there is no more
 * anonymous preview-only mode.
 *
 * Four modes, chosen by the query string:
 *  - plain (`/create`): a fresh prompt, `origin: "original"`.
 *  - `?remix=<promptId>`: prefilled from a real source prompt, publishes
 *    with `origin: "remix"` pointing at it (`source_prompt_id`/
 *    `root_prompt_id`).
 *  - `?duplicate=<promptId>`: prefilled the same way but publishes as a
 *    fresh `origin: "original"` — no FK back to the source.
 *  - `?answerRequest=<requestId>`: prefilled from a real request, publishes
 *    with `origin: "request-response"` (`request_id` set), which
 *    increments the request's real `response_count`.
 */
export function CreatePromptForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { profile: ownProfile } = useOwnProfile();
  const { getCached: getCachedPrompt, fetchById: fetchPromptById, addPrompt, updatePrompt } = useRealPrompts();
  const { getCached: getCachedRequest, fetchById: fetchRequestById } = useRealRequests();

  const editId = searchParams.get("edit");
  const isEditMode = Boolean(editId);
  const remixSourceId = !isEditMode ? searchParams.get("remix") : null;
  const duplicateId = !isEditMode ? searchParams.get("duplicate") : null;
  const answerRequestId = !isEditMode ? searchParams.get("answerRequest") : null;
  const isAnswerMode = Boolean(answerRequestId);
  const isRemixMode = Boolean(remixSourceId);
  const isDuplicateMode = Boolean(duplicateId);

  const [sourcePrompt, setSourcePrompt] = useState<Prompt | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<Prompt | null>(null);
  const [answeredRequest, setAnsweredRequest] = useState<PromptRequest | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [editForbidden, setEditForbidden] = useState(false);
  const [sourceChecked, setSourceChecked] = useState(
    !isRemixMode && !isDuplicateMode && !isAnswerMode && !isEditMode,
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
      } else if (isRemixMode && remixSourceId) {
        const cached = getCachedPrompt(remixSourceId);
        const found = cached ?? (await fetchPromptById(remixSourceId));
        if (!cancelled) setSourcePrompt(found);
      } else if (isDuplicateMode && duplicateId) {
        const cached = getCachedPrompt(duplicateId);
        const found = cached ?? (await fetchPromptById(duplicateId));
        if (!cancelled) setDuplicateSource(found);
      } else if (isAnswerMode && answerRequestId) {
        const cached = getCachedRequest(answerRequestId);
        const found = cached ?? (await fetchRequestById(answerRequestId));
        if (!cancelled) setAnsweredRequest(found);
      }
      if (!cancelled) setSourceChecked(true);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, editId, isRemixMode, remixSourceId, isDuplicateMode, duplicateId, isAnswerMode, answerRequestId, user]);

  const [contentType, setContentType] = useState<PromptContentType>("image");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [promptText, setPromptText] = useState("");
  const [tool, setTool] = useState("");
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

  // The real source's fields arrive asynchronously — backfill the form the
  // first time one becomes available (same pattern as /profile/edit's
  // real-profile sync). Runs once per mode; the user is free to edit
  // afterwards without being overwritten again.
  useEffect(() => {
    if (fieldsSeeded) return;
    if (editingPrompt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time seed once the async source loads
      setContentType(editingPrompt.contentType);
      setTitle(editingPrompt.title);
      setDescription(editingPrompt.description);
      setPromptText(editingPrompt.promptText);
      setTool(editingPrompt.tool ?? "");
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
    const source = sourcePrompt ?? duplicateSource;
    if (source) {
      setContentType(source.contentType);
      setTitle(`${source.title} ${isRemixMode ? "(türetme)" : "(kopya)"}`);
      setDescription(source.description);
      setPromptText(source.promptText);
      setTool(source.tool ?? "");
      source.tags.forEach((tag) => tagPicker.addManual(tag));
      setFieldsSeeded(true);
      return;
    }
    if (answeredRequest) {
      setContentType(answeredRequest.contentType ?? "image");
      setTool(answeredRequest.preferredTool ?? "");
      // Deliberately NOT copying answeredRequest.tags here (CLAUDE.md §12)
      // — they're fed into useTagPicker as contextTags instead, which only
      // nudges the suggested tier; the answer's own live analysis (title +
      // promptText, once the user starts writing) decides what actually
      // gets accepted.
      setFieldsSeeded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tagPicker.addManual is stable (useCallback), not a reactive dependency worth re-running this one-time seed for
  }, [editingPrompt, sourcePrompt, duplicateSource, answeredRequest, fieldsSeeded, isRemixMode]);

  const [showOnProfile, setShowOnProfile] = useState(true);

  const [publishError, setPublishError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const notFound =
    sourceChecked &&
    ((isRemixMode && !sourcePrompt) ||
      (isDuplicateMode && !duplicateSource) ||
      (isAnswerMode && !answeredRequest) ||
      (isEditMode && !editingPrompt && !editForbidden));
  const isRequestClosed = isAnswerMode && Boolean(answeredRequest) && answeredRequest?.status !== "open";

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeImageToDataUrlFit(file, 1100);
      setUploadedImage(resized);
      setImageFile(file);
      setImageError(null);
    } catch {
      setImageError("Görsel yüklenemedi, lütfen başka bir dosya dene.");
    }
  }

  const origin: Prompt["origin"] = editingPrompt
    ? editingPrompt.origin
    : sourcePrompt
      ? {
          type: "remix",
          sourcePromptId: sourcePrompt.id,
          rootPromptId: sourcePrompt.origin.type === "remix" ? sourcePrompt.origin.rootPromptId : sourcePrompt.id,
        }
      : answeredRequest
        ? { type: "request-response", requestId: answeredRequest.id, responseId: "pending" }
        : { type: "original" };

  const existingMedia = editingPrompt?.media[0];
  const media =
    contentType === "image"
      ? [
          {
            id: "preview-media",
            url: uploadedImage?.url ?? existingMedia?.url ?? placeholderArt(title || "yeni-prompt", 900, 1100),
            width: uploadedImage?.width ?? existingMedia?.width ?? 900,
            height: uploadedImage?.height ?? existingMedia?.height ?? 1100,
            alt: title || "Önizleme görseli",
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
          tags: tagPicker.accepted.map((entry) => entry.tag),
          tagSources: Object.fromEntries(tagPicker.accepted.map((entry) => [entry.tag.slug, entry.source])),
          imageFile: contentType === "image" ? imageFile : undefined,
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
          contentType,
          tags: tagPicker.accepted.map((entry) => entry.tag),
          tagSources: Object.fromEntries(tagPicker.accepted.map((entry) => [entry.tag.slug, entry.source])),
          imageFile,
          fallbackImage:
            contentType === "image" ? { url: media[0].url, width: media[0].width, height: media[0].height } : null,
          requestId: answeredRequest?.id,
          showOnProfile: isAnswerMode || isRemixMode ? showOnProfile : true,
          remixOf: sourcePrompt
            ? {
                sourcePromptId: sourcePrompt.id,
                rootPromptId: sourcePrompt.origin.type === "remix" ? sourcePrompt.origin.rootPromptId : sourcePrompt.id,
              }
            : undefined,
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
      setPublishError(err instanceof Error ? err.message : "Yayınlanamadı, lütfen tekrar dene.");
      setIsSubmitting(false);
    }
  }

  const previewPrompt: Prompt = {
    id: "preview",
    author: ownProfile ?? {
      id: "preview",
      username: "sen",
      displayName: "Sen",
      avatarUrl: null,
      coverUrl: null,
      bio: null,
      website: null,
      followerCount: 0,
      followingCount: 0,
      createdAt: new Date().toISOString(),
    },
    title: title || "Başlıksız prompt",
    description: description || "Açıklama eklenmedi.",
    promptText: promptText || "Prompt metni buraya gelecek.",
    tool: tool || null,
    contentType,
    media,
    tags: tagPicker.accepted.map((entry) => entry.tag),
    origin,
    likeCount: 0,
    commentCount: 0,
    remixCount: 0,
    isLiked: false,
    isSaved: false,
    status: "draft",
    showOnProfile: isAnswerMode || isRemixMode ? showOnProfile : true,
    deletedAt: null,
    createdAt: new Date().toISOString(),
  };

  if (!user) {
    return (
      <LoginGate message="Bir prompt yayınlamak, düzenlemek (ya da bir remix/kopya/yanıt oluşturmak) için önce giriş yapmalısın." />
    );
  }

  if (!sourceChecked) {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">Yükleniyor…</div>;
  }

  if (editForbidden) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">Bu promptu düzenleme yetkin yok</h1>
        <p className="mb-4 text-sm text-text-muted">
          Bir promptu yalnızca kendi sahibi düzenleyebilir.
        </p>
        <Link
          href="/discover"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          Keşfet&apos;e Dön
        </Link>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">
          {isEditMode ? "Prompt bulunamadı" : isAnswerMode ? "İstek bulunamadı" : "Prompt bulunamadı"}
        </h1>
        <p className="mb-4 text-sm text-text-muted">
          {isEditMode
            ? "Düzenlemek istediğin prompt silinmiş veya artık erişilebilir değil."
            : isAnswerMode
              ? "Yanıtlamak istediğin istek silinmiş veya artık erişilebilir değil."
              : "Kaynak prompt silinmiş veya artık erişilebilir değil."}
        </p>
        <Link
          href={isAnswerMode ? "/requests" : "/discover"}
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          {isAnswerMode ? "Prompt İsteklerine Dön" : "Keşfet'e Dön"}
        </Link>
      </div>
    );
  }

  if (isRequestClosed && answeredRequest) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">Bu istek kapandı</h1>
        <p className="mb-4 text-sm text-text-muted">
          Bu istek kapandı, artık yeni yanıt kabul edilmiyor.
        </p>
        <Link
          href={requestHref(answeredRequest)}
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          İsteği Görüntüle
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-6">
      <h1 className="mb-1 text-lg font-semibold text-text">
        {isEditMode
          ? "Promptu Düzenle"
          : isAnswerMode
            ? "İsteğe Yanıt Ver"
            : isRemixMode
              ? "Türet"
              : isDuplicateMode
                ? "Kopyasını Oluştur"
                : "Prompt Oluştur"}
      </h1>
      <p className="mb-6 text-sm text-text-muted">
        {isEditMode
          ? "Değişikliklerini yaz, sağda anında önizlemesini gör. Kaydet'e bastığında gerçekten, kalıcı olarak güncellenir."
          : isAnswerMode
            ? "Yanıtını yaz, sağda anında önizlemesini gör. Yayınladığında gerçekten, kalıcı olarak Supabase'e yayınlanır ve istek sahibine görünür olur."
            : "Promptunu yaz, sağda anında önizlemesini gör. Paylaş'a bastığında gerçekten, kalıcı olarak yayınlanır."}
      </p>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <form onSubmit={handleSubmit} className="space-y-5">
          {isAnswerMode && answeredRequest && (
            <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-primary">Bu isteğe yanıt veriyorsun</span>
                <Link
                  href="/create"
                  title="Yanıt modundan çık"
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
                  isteği: &ldquo;{answeredRequest.title}&rdquo;
                </span>
              </div>
              <Link
                href={requestHref(answeredRequest)}
                className="inline-block font-medium text-primary underline"
              >
                İsteği görüntüle
              </Link>
            </div>
          )}

          {(isAnswerMode || isRemixMode) && (
            <div>
              <label className="mb-2 block text-sm font-medium text-text">
                {isAnswerMode ? "Bu yanıt profilimde görünsün mü?" : "Bu türetme profilimde görünsün mü?"}
              </label>
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
                    <span className="block font-medium text-text">Profilimde paylaş</span>
                    <span className="block text-xs text-text-muted">
                      {isAnswerMode
                        ? "Yanıtın istek sahibine gösterilir ve profilinde de normal gönderilerin gibi görünür."
                        : "Türettiğin içerik kaynağının Türetilen promptlar listesinde/Prompt geçmişinde görünmeye devam eder, ayrıca profilinde de normal gönderilerin gibi görünür."}
                    </span>
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
                    <span className="block font-medium text-text">Profilimde paylaşma</span>
                    <span className="block text-xs text-text-muted">
                      {isAnswerMode
                        ? "Yanıtın bu isteğin yanıtları arasında görünür. Profilinde ve normal gönderi akışında gösterilmez."
                        : "Türettiğin içerik kaynağının Türetilen promptlar listesinde/Prompt geçmişinde görünmeye devam eder. Profilinde ve normal gönderi akışında gösterilmez."}
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {sourcePrompt && (
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
              <GitBranch size={16} className="mt-0.5 shrink-0" />
              <p>
                <Link href={promptHref(sourcePrompt)} className="font-medium underline">
                  &ldquo;{sourcePrompt.title}&rdquo;
                </Link>{" "}
                içeriğin türetilen promptu olarak dolduruldu — dilediğin gibi düzenleyebilirsin, köken bağlantısı korunuyor.
              </p>
            </div>
          )}

          {duplicateSource && (
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
              <Copy size={16} className="mt-0.5 shrink-0" />
              <p>
                <Link href={promptHref(duplicateSource)} className="font-medium underline">
                  &ldquo;{duplicateSource.title}&rdquo;
                </Link>{" "}
                promptunun bir kopyası olarak dolduruldu — bu bir remix değil, kendi yeni promptun
                olarak dilediğin gibi düzenleyebilirsin.
              </p>
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-text">İçerik Türü</label>
            {isEditMode ? (
              <div className="flex items-center gap-1.5 text-sm text-text-muted">
                {(() => {
                  const Icon = CONTENT_TYPE_META[contentType].icon;
                  return <Icon size={14} />;
                })()}
                {CONTENT_TYPE_META[contentType].label}
                <span className="text-xs">(düzenlemede değiştirilemez)</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {CONTENT_TYPES.map((type) => {
                  const meta = CONTENT_TYPE_META[type];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setContentType(type)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                        contentType === type
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-surface text-text-muted hover:text-text",
                      )}
                    >
                      <Icon size={14} />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {contentType === "image" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-text">
                Görsel {isEditMode && <span className="text-text-muted">(opsiyonel)</span>}
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="block w-full text-sm text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-accent-surface/70"
              />
              <p className="mt-1 text-xs text-text-muted">
                {isEditMode
                  ? "Yeni bir dosya seçmezsen mevcut görsel değişmeden kalır."
                  : "Yüklemezsen sağdaki önizlemede otomatik oluşturulan bir görsel kullanılır."}
              </p>
              {imageError && <p className="mt-1 text-xs text-red-500">{imageError}</p>}
            </div>
          )}

          <div>
            <label htmlFor="prompt-title" className="mb-1.5 block text-sm font-medium text-text">
              Başlık
            </label>
            <input
              id="prompt-title"
              type="text"
              required
              maxLength={80}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Örn. Ay ışığında bekleyen kitsune"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
            />
          </div>

          <div>
            <label htmlFor="prompt-description" className="mb-1.5 block text-sm font-medium text-text">
              Kısa Açıklama
            </label>
            <textarea
              id="prompt-description"
              required
              maxLength={200}
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Bu prompt ne üretiyor, bir cümleyle özetle."
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted"
            />
          </div>

          <div>
            <label htmlFor="prompt-text" className="mb-1.5 block text-sm font-medium text-text">
              Prompt Metni
            </label>
            <PromptTextEditor
              id="prompt-text"
              value={promptText}
              onChange={setPromptText}
              variables={variables}
              onVariablesChange={setVariables}
              rows={5}
              placeholder="Kullandığın tam prompt metnini buraya yaz. {ortam} gibi değişkenler tanımlayabilirsin."
            />
          </div>

          <div>
            <label htmlFor="prompt-tool" className="mb-1.5 block text-sm font-medium text-text">
              Araç / Model <span className="text-text-muted">(opsiyonel)</span>
            </label>
            <input
              id="prompt-tool"
              list="tool-suggestions"
              type="text"
              value={tool}
              onChange={(event) => setTool(event.target.value)}
              placeholder="Örn. Midjourney v6"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
            />
            <datalist id="tool-suggestions">
              {TOOL_SUGGESTIONS[contentType].map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-text">Etiketler</label>
            <TagPicker picker={tagPicker} />
          </div>

          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={isSubmitting}>
            {isSubmitting
              ? isEditMode
                ? "Kaydediliyor..."
                : "Yayınlanıyor..."
              : isEditMode
                ? "Kaydet"
                : isAnswerMode
                  ? "Yanıtı Yayınla"
                  : "Paylaş"}
          </Button>

          {publishError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">
              {publishError}
            </div>
          )}
        </form>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Canlı Önizleme
          </p>
          <div className="pointer-events-none select-none">
            <PromptCard prompt={previewPrompt} />
          </div>
        </div>
      </div>
    </div>
  );
}
