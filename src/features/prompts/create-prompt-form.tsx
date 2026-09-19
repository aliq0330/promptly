"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Repeat2, Sparkles, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PromptCard } from "@/features/prompts/prompt-card";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { useLocalPrompts } from "@/features/prompts/local-prompts-provider";
import { useRealPrompts } from "@/features/prompts/real-prompts-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useRequests } from "@/features/requests/requests-provider";
import { useRealRequests } from "@/features/requests/real-requests-provider";
import { getUserById } from "@/mocks/users";
import { mockTags } from "@/mocks/tags";
import { getPromptById } from "@/mocks/prompts";
import { mockRequestResponses } from "@/mocks/request-responses";
import { placeholderArt } from "@/lib/placeholder-image";
import { cn, isUuid, promptHref, requestHref, resizeImageToDataUrlFit } from "@/lib/utils";
import type { Prompt, PromptContentType, PromptRequest, Tag } from "@/types";

const CONTENT_TYPES: PromptContentType[] = ["image", "text", "video", "code", "music"];

const TOOL_SUGGESTIONS: Record<PromptContentType, string[]> = {
  image: ["Midjourney v6", "Stable Diffusion XL", "DALL-E 3", "NovelAI"],
  text: ["Claude", "GPT-4"],
  video: ["Sora", "Runway Gen-3"],
  code: ["Claude Code", "GPT-4"],
  music: ["Suno", "Udio"],
};

/**
 * Real, working form (validation, image preview, live card preview) —
 * since CLAUDE.md Bölüm 21, plain "Prompt Oluştur" and "Kopyasını
 * Oluştur" (duplicate) submit for REAL when signed in: a genuine row in
 * Supabase's `prompts` table via `useRealPrompts().addPrompt`, visible to
 * every visitor, not a mock array or localStorage. Signed-out visitors can
 * still fill out and preview the form, but publishing requires an account
 * — the same way any real platform works, not a placeholder limitation.
 *
 * Also doubles as the remix entry point (CLAUDE.md section 8): arriving
 * via `?remix=<promptId>` or `?remixResponse=<responseId>` prefills the
 * form from that source and tracks it as the origin, preserving the
 * remix chain (root vs. immediate source) the same way the mock data does.
 * Remix stays preview-only even now that Supabase is connected — a real
 * remix needs `source_prompt_id` to point at an actual row in `prompts`,
 * and every remixable prompt today is mock/local data with no real row to
 * reference (remixing a genuinely real prompt will work once one exists,
 * but the source itself still can't be mock/local).
 *
 * `?duplicate=<promptId>` (CLAUDE.md section 14, profile content menu)
 * prefills from an existing prompt the same way, but keeps `origin:
 * "original"` instead of a remix origin — a duplicate isn't derived from
 * someone else's work the way a remix is, it's just a starting point for a
 * fresh prompt, most often your own. Since it doesn't reference the
 * source in the database at all, it has no FK problem and can publish for
 * real exactly like plain creation.
 *
 * `?answerRequest=<requestId>` (prompt-request module): answering a
 * mock/local request is unchanged — still `useLocalPrompts().addPrompt`,
 * no login required, exactly as before Bölüm 21 Faz 5. Answering a
 * genuinely real request (a UUID, from Supabase) is new in Faz 5: it
 * requires being signed in (there was no pre-existing "answer a real
 * request" feature to preserve, unlike request *creation* which already
 * worked without login) and publishes a real `prompts` row with
 * `origin_type: "request_response"` + `request_id` set, via
 * `useRealPrompts().addPrompt`'s `requestId` option — reusing Bölüm 19's
 * already-tested trigger that increments the request's `response_count`.
 */
export function CreatePromptForm() {
  const me = getUserById("me")!;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addPrompt } = useLocalPrompts();
  const { addPrompt: addRealPrompt } = useRealPrompts();
  const { user } = useAuth();
  const { profile: ownProfile } = useOwnProfile();
  const { getRequestById } = useRequests();
  const { getCached: getCachedRealRequest, fetchById: fetchRealRequestById } = useRealRequests();

  const remixSourceId = searchParams.get("remix");
  const remixResponseId = searchParams.get("remixResponse");
  const duplicateId = searchParams.get("duplicate");
  const answerRequestId = searchParams.get("answerRequest");
  const sourcePrompt = remixSourceId ? getPromptById(remixSourceId) : undefined;
  const sourceResponse = remixResponseId
    ? mockRequestResponses.find((response) => response.id === remixResponseId)
    : undefined;
  const duplicateSource = duplicateId ? getPromptById(duplicateId) : undefined;

  const isRealAnswerTarget = Boolean(answerRequestId && isUuid(answerRequestId));
  const [realAnsweredRequest, setRealAnsweredRequest] = useState<PromptRequest | null>(null);
  const [realAnswerChecked, setRealAnswerChecked] = useState(false);

  useEffect(() => {
    if (!isRealAnswerTarget || !answerRequestId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- not a real request id, nothing to fetch; resolves the "checked" state synchronously so the mock/local branch (already synchronous) doesn't wait an extra render
      setRealAnswerChecked(true);
      return;
    }
    const cached = getCachedRealRequest(answerRequestId);
    if (cached) {
      setRealAnsweredRequest(cached);
      setRealAnswerChecked(true);
      return;
    }
    let cancelled = false;
    fetchRealRequestById(answerRequestId).then((request) => {
      if (cancelled) return;
      setRealAnsweredRequest(request);
      setRealAnswerChecked(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRealAnswerTarget, answerRequestId]);

  const localAnsweredRequest =
    answerRequestId && !isRealAnswerTarget ? getRequestById(answerRequestId) : undefined;
  const answeredRequest = localAnsweredRequest ?? realAnsweredRequest ?? undefined;

  const [contentType, setContentType] = useState<PromptContentType>(
    () => sourcePrompt?.contentType ?? duplicateSource?.contentType ?? answeredRequest?.contentType ?? "image",
  );
  const [title, setTitle] = useState(() => {
    if (sourcePrompt) return `${sourcePrompt.title} (remix)`;
    if (sourceResponse?.title) return `${sourceResponse.title} (remix)`;
    if (duplicateSource) return `${duplicateSource.title} (kopya)`;
    return "";
  });
  const [description, setDescription] = useState(
    () => sourcePrompt?.description ?? sourceResponse?.description ?? duplicateSource?.description ?? "",
  );
  const [promptText, setPromptText] = useState(
    () => sourcePrompt?.promptText ?? sourceResponse?.promptText ?? duplicateSource?.promptText ?? "",
  );
  const [tool, setTool] = useState(
    () => sourcePrompt?.tool ?? duplicateSource?.tool ?? answeredRequest?.preferredTool ?? "",
  );
  const [selectedTags, setSelectedTags] = useState<Tag[]>(
    () => sourcePrompt?.tags ?? sourceResponse?.tags ?? duplicateSource?.tags ?? answeredRequest?.tags ?? [],
  );
  const [uploadedImage, setUploadedImage] = useState<{ url: string; width: number; height: number } | null>(
    null,
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  // The real target's contentType/preferredTool/tags arrive asynchronously,
  // after the lazy `useState` initializers above already ran — backfill
  // them once loaded (same pattern as /profile/edit's real-profile sync).
  useEffect(() => {
    if (!realAnsweredRequest) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing form fields once the real target request loads, since it wasn't available yet for the lazy useState initializers above
    setContentType(realAnsweredRequest.contentType ?? "image");
    setTool((prev) => prev || realAnsweredRequest.preferredTool || "");
    setSelectedTags((prev) => (prev.length > 0 ? prev : realAnsweredRequest.tags ?? []));
  }, [realAnsweredRequest]);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAnswerMode = Boolean(answerRequestId);
  const requestNotFound = isAnswerMode && realAnswerChecked && !answeredRequest;
  // Plain creation and duplicate both produce `origin: "original"` and have
  // no FK pointing at a source prompt — the only two modes that can
  // publish for real (see the doc comment above for why remix can't yet).
  const canPublishForReal = !isAnswerMode && !sourcePrompt && !sourceResponse;

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      // A real data URL, not a blob object URL — a blob URL stops working
      // the moment this form unmounts, which would break the image on
      // every real, persisted answer prompt (see local-prompts-provider.tsx).
      const resized = await resizeImageToDataUrlFit(file, 1100);
      setUploadedImage(resized);
      setImageFile(file);
      setImageError(null);
    } catch {
      setImageError("Görsel yüklenemedi, lütfen başka bir dosya dene.");
    }
  }

  function toggleTag(tag: Tag) {
    setSelectedTags((prev) =>
      prev.some((t) => t.slug === tag.slug) ? prev.filter((t) => t.slug !== tag.slug) : [...prev, tag],
    );
  }

  const origin: Prompt["origin"] = sourcePrompt
    ? {
        type: "remix",
        sourcePromptId: sourcePrompt.id,
        rootPromptId:
          sourcePrompt.origin.type === "remix" ? sourcePrompt.origin.rootPromptId : sourcePrompt.id,
      }
    : sourceResponse
      ? { type: "request-response", requestId: sourceResponse.requestId, responseId: sourceResponse.id }
      : answeredRequest
        ? { type: "request-response", requestId: answeredRequest.id, responseId: "pending" }
        : { type: "original" };

  const media =
    contentType === "image"
      ? [
          {
            id: "preview-media",
            url: uploadedImage?.url ?? placeholderArt(title || "yeni-prompt", 900, 1100),
            width: uploadedImage?.width ?? 900,
            height: uploadedImage?.height ?? 1100,
            alt: title || "Önizleme görseli",
          },
        ]
      : [];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return; // guards against double-submit from a double click

    if (isAnswerMode && answeredRequest) {
      if (isRealAnswerTarget && !user) {
        // No pre-existing "answer a real request without login" feature to
        // preserve here (unlike request creation) — same rule as plain
        // creation: publishing something real requires an account.
        setSubmitted(true);
        return;
      }

      if (isRealAnswerTarget && user) {
        if (!ownProfile) {
          setPublishError("Profilin henüz yüklenmedi, lütfen bir an bekleyip tekrar dene.");
          return;
        }
        setPublishError(null);
        setIsSubmitting(true);
        try {
          const published = await addRealPrompt(
            {
              title,
              description,
              promptText,
              tool: tool || null,
              contentType,
              tags: selectedTags,
              imageFile,
              fallbackImage:
                contentType === "image"
                  ? { url: media[0].url, width: media[0].width, height: media[0].height }
                  : null,
              requestId: answeredRequest.id,
            },
            ownProfile,
          );
          router.push(promptHref(published));
        } catch (err) {
          setPublishError(err instanceof Error ? err.message : "Yanıt yayınlanamadı, lütfen tekrar dene.");
          setIsSubmitting(false);
        }
        return;
      }

      setIsSubmitting(true);
      const published = addPrompt({
        title,
        description,
        promptText,
        tool: tool || null,
        contentType,
        media,
        tags: selectedTags,
        origin,
      });
      router.push(promptHref(published));
      return;
    }

    if (canPublishForReal && user) {
      if (!ownProfile) {
        setPublishError("Profilin henüz yüklenmedi, lütfen bir an bekleyip tekrar dene.");
        return;
      }
      setPublishError(null);
      setIsSubmitting(true);
      try {
        const published = await addRealPrompt(
          {
            title,
            description,
            promptText,
            tool: tool || null,
            contentType,
            tags: selectedTags,
            imageFile,
            fallbackImage:
              contentType === "image" ? { url: media[0].url, width: media[0].width, height: media[0].height } : null,
          },
          ownProfile,
        );
        router.push(promptHref(published));
      } catch (err) {
        setPublishError(err instanceof Error ? err.message : "Prompt yayınlanamadı, lütfen tekrar dene.");
        setIsSubmitting(false);
      }
      return;
    }

    setSubmitted(true);
  }

  const previewPrompt: Prompt = {
    id: "preview",
    author: me,
    title: title || "Başlıksız prompt",
    description: description || "Açıklama eklenmedi.",
    promptText: promptText || "Prompt metni buraya gelecek.",
    tool: tool || null,
    contentType,
    media,
    tags: selectedTags,
    origin,
    likeCount: 0,
    commentCount: 0,
    remixCount: 0,
    isLiked: false,
    isSaved: false,
    status: "draft",
    createdAt: new Date().toISOString(),
  };

  if (requestNotFound) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">İstek bulunamadı</h1>
        <p className="mb-4 text-sm text-text-muted">
          Yanıtlamak istediğin istek silinmiş veya artık erişilebilir değil, bu yüzden yanıtın
          yanlış bir isteğe bağlanmasın diye burada durduk.
        </p>
        <Link
          href="/requests"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          Prompt İsteklerine Dön
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-6">
      <h1 className="mb-1 text-lg font-semibold text-text">
        {isAnswerMode
          ? "İsteğe Yanıt Ver"
          : sourcePrompt || sourceResponse
            ? "Remix Oluştur"
            : duplicateSource
              ? "Kopyasını Oluştur"
              : "Prompt Oluştur"}
      </h1>
      <p className="mb-6 text-sm text-text-muted">
        {isAnswerMode
          ? isRealAnswerTarget
            ? user
              ? "Yanıtını yaz, sağda anında önizlemesini gör. Yayınladığında gerçekten, kalıcı olarak Supabase'e yayınlanır ve istek sahibine görünür olur."
              : "Bu gerçek bir isteğe yanıt veriyorsun. Yanıtını yaz, sağda anında önizlemesini gör — ama gerçekten yayınlamak için giriş yapmış olman gerekiyor."
            : "Yanıtını yaz, sağda anında önizlemesini gör. Yayınladığında gerçekten yayımlanır ve istek sahibine görünür olur."
          : canPublishForReal
            ? user
              ? "Promptunu yaz, sağda anında önizlemesini gör. Paylaş'a bastığında gerçekten, kalıcı olarak yayınlanır."
              : "Promptunu yaz, sağda anında önizlemesini gör. Gerçekten yayınlamak için giriş yapmış olman gerekiyor — giriş yapmadan da önizleme yapabilirsin."
            : "Promptunu yaz, sağda anında önizlemesini gör. Bu remixin kalıcı paylaşımı, kaynağın gerçek bir veritabanı kaydı olmasını gerektiriyor (mock/örnek içerikler henüz veritabanında değil) — şimdilik yalnızca önizleme yapılabiliyor."}
      </p>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <form onSubmit={handleSubmit} className="space-y-5">
          {isAnswerMode && answeredRequest && (
            <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-primary">Bu isteğe yanıt veriyorsun</span>
                <Link
                  href="/create?mode=prompt"
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

          {(sourcePrompt || sourceResponse) && (
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
              <Repeat2 size={16} className="mt-0.5 shrink-0" />
              <p>
                {sourcePrompt ? (
                  <>
                    <Link href={`/prompts/${sourcePrompt.id}`} className="font-medium underline">
                      &ldquo;{sourcePrompt.title}&rdquo;
                    </Link>{" "}
                    içeriğinin remixi olarak dolduruldu
                  </>
                ) : (
                  <>
                    <Link href={requestHref({ id: sourceResponse!.requestId })} className="font-medium underline">
                      bir istek yanıtı
                    </Link>{" "}
                    temel alınarak dolduruldu
                  </>
                )}
                {" "}— dilediğin gibi düzenleyebilirsin, köken bağlantısı önizlemede korunuyor.
              </p>
            </div>
          )}

          {duplicateSource && (
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
              <Copy size={16} className="mt-0.5 shrink-0" />
              <p>
                <Link href={`/prompts/${duplicateSource.id}`} className="font-medium underline">
                  &ldquo;{duplicateSource.title}&rdquo;
                </Link>{" "}
                promptunun bir kopyası olarak dolduruldu — bu bir remix değil, kendi yeni promptun
                olarak dilediğin gibi düzenleyebilirsin.
              </p>
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-text">İçerik Türü</label>
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
          </div>

          {contentType === "image" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-text">Görsel</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="block w-full text-sm text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-accent-surface/70"
              />
              <p className="mt-1 text-xs text-text-muted">
                Yüklemezsen sağdaki önizlemede otomatik oluşturulan bir görsel kullanılır.
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
            <textarea
              id="prompt-text"
              required
              rows={5}
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              placeholder="Kullandığın tam prompt metnini buraya yaz."
              className={cn(
                "w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted",
                contentType === "code" && "font-mono",
              )}
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
            <div className="flex flex-wrap gap-1.5">
              {mockTags.map((tag) => {
                const active = selectedTags.some((t) => t.slug === tag.slug);
                return (
                  <button
                    key={tag.slug}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface text-text-muted hover:text-text",
                    )}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={isSubmitting}>
            {isAnswerMode
              ? isSubmitting
                ? "Yayınlanıyor..."
                : "Yanıtı Yayınla"
              : canPublishForReal && user
                ? isSubmitting
                  ? "Yayınlanıyor..."
                  : "Paylaş"
                : "Paylaş"}
          </Button>

          {publishError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">
              {publishError}
            </div>
          )}

          {submitted && !isAnswerMode && canPublishForReal && !user && (
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
              <Sparkles size={16} className="mt-0.5 shrink-0" />
              <p>
                Önizlemeni sağda görebilirsin. Gerçekten yayınlamak için{" "}
                <Link href="/login" className="font-medium underline">
                  giriş yap
                </Link>{" "}
                ya da{" "}
                <Link href="/signup" className="font-medium underline">
                  hesap oluştur
                </Link>
                .
              </p>
            </div>
          )}

          {submitted && isAnswerMode && isRealAnswerTarget && !user && (
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
              <Sparkles size={16} className="mt-0.5 shrink-0" />
              <p>
                Önizlemeni sağda görebilirsin. Bu gerçek bir isteğe yanıtını gerçekten yayınlamak
                için{" "}
                <Link href="/login" className="font-medium underline">
                  giriş yap
                </Link>{" "}
                ya da{" "}
                <Link href="/signup" className="font-medium underline">
                  hesap oluştur
                </Link>
                .
              </p>
            </div>
          )}

          {submitted && !isAnswerMode && !canPublishForReal && (
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
              <Sparkles size={16} className="mt-0.5 shrink-0" />
              <p>
                Önizlemeni sağda görebilirsin. Bu bir remix olduğundan ve kaynağı henüz gerçek bir
                veritabanı kaydı olmadığından kalıcı olarak yayınlanamadı.
              </p>
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
