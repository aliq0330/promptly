"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RequestCard } from "./request-card";
import { useRequests } from "./requests-provider";
import { useRealRequests } from "./real-requests-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { mockTags } from "@/mocks/tags";
import { getUserById } from "@/mocks/users";
import { cn, requestHref, resizeImageToDataUrlFit } from "@/lib/utils";
import type { PromptContentType, PromptRequest, Tag } from "@/types";

const CONTENT_TYPES: PromptContentType[] = ["image", "text", "video", "code", "music"];

const TITLE_MIN = 10;
const TITLE_MAX = 100;
const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 500;

/**
 * Real, working request creation — unlike CreatePromptForm's plain "Prompt
 * oluştur" mode, this genuinely, persistently publishes either way (CLAUDE.md
 * §2/17-21) — the difference since Bölüm 21 Faz 5 is WHERE: signed in with
 * a real Supabase account, it's a real row in `public.prompt_requests`,
 * visible to every visitor; signed out, it stays exactly what it always
 * was — a real `PromptRequest` saved via `RequestsProvider`
 * (localStorage-only, authored as "me"). Unlike `CreatePromptForm`'s plain
 * "Prompt Oluştur" mode, signing in is never *required* here — that would
 * take away a feature that already worked before Faz 5, not just add one.
 */
export function CreateRequestForm() {
  const router = useRouter();
  const { addRequest } = useRequests();
  const { addRequest: addRealRequest } = useRealRequests();
  const { user } = useAuth();
  const { profile: ownProfile } = useOwnProfile();
  const me = getUserById("me")!;

  const [contentType, setContentType] = useState<PromptContentType>("image");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creativeDirection, setCreativeDirection] = useState("");
  const [preferredTool, setPreferredTool] = useState("");
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [referenceImage, setReferenceImage] = useState<{ url: string; width: number; height: number } | null>(
    null,
  );
  const [referenceImageFile, setReferenceImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [titleTouched, setTitleTouched] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const titleError =
    title.trim().length === 0
      ? "Başlık boş bırakılamaz."
      : title.trim().length < TITLE_MIN
        ? `Başlık en az ${TITLE_MIN} karakter olmalı.`
        : null;
  const descriptionError =
    description.trim().length === 0
      ? "Açıklama boş bırakılamaz."
      : description.trim().length < DESCRIPTION_MIN
        ? `Açıklama en az ${DESCRIPTION_MIN} karakter olmalı — ne istediğini biraz daha ayrıntılandır.`
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
      setImageError("Görsel yüklenemedi, lütfen başka bir dosya dene.");
    }
  }

  function toggleTag(tag: Tag) {
    setSelectedTags((prev) =>
      prev.some((t) => t.slug === tag.slug) ? prev.filter((t) => t.slug !== tag.slug) : [...prev, tag],
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTitleTouched(true);
    setDescriptionTouched(true);
    if (!isValid || isSubmitting) return;

    if (user) {
      if (!ownProfile) {
        setPublishError("Profilin henüz yüklenmedi, lütfen bir an bekleyip tekrar dene.");
        return;
      }
      setPublishError(null);
      setIsSubmitting(true);
      try {
        const request = await addRealRequest(
          {
            title,
            description,
            creativeDirection,
            contentType,
            preferredTool: preferredTool || null,
            tags: selectedTags,
            imageFile: referenceImageFile,
          },
          ownProfile,
        );
        router.push(requestHref(request));
      } catch (err) {
        setPublishError(err instanceof Error ? err.message : "İstek yayınlanamadı, lütfen tekrar dene.");
        setIsSubmitting(false);
      }
      return;
    }

    setIsSubmitting(true);
    const request = addRequest({
      title,
      description,
      creativeDirection,
      contentType,
      preferredTool: preferredTool || null,
      tags: selectedTags,
      referenceImage: referenceImage
        ? { id: "reference", url: referenceImage.url, width: referenceImage.width, height: referenceImage.height, alt: title }
        : undefined,
    });
    router.push(requestHref(request));
  }

  const previewRequest: PromptRequest = {
    id: "preview",
    author: user && ownProfile ? ownProfile : me,
    title: title || "Başlıksız istek",
    description: description || "Açıklama eklenmedi.",
    creativeDirection,
    contentType,
    preferredTool: preferredTool || null,
    referenceImage: referenceImage
      ? { id: "reference", url: referenceImage.url, width: referenceImage.width, height: referenceImage.height, alt: title }
      : undefined,
    tags: selectedTags,
    status: "open",
    responseCount: 0,
    createdAt: new Date().toISOString(),
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-6">
      <h1 className="mb-1 text-lg font-semibold text-text">İstek Oluştur</h1>
      <p className="mb-6 text-sm text-text-muted">
        {user
          ? "İhtiyacın olan promptu tanımla, topluluk sana yanıt versin. Yayınladığında istek gerçekten, kalıcı olarak Supabase'e kaydedilir ve herkese görünür olur."
          : "İhtiyacın olan promptu tanımla, topluluk sana yanıt versin. Yayınladığında istek gerçekten kaydedilir ve herkese görünür olur (giriş yapmadan bu tarayıcıda, giriş yaparsan kalıcı olarak Supabase'de)."}
      </p>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <form onSubmit={handleSubmit} className="space-y-5">
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

          <div>
            <label htmlFor="request-title" className="mb-1.5 flex items-center justify-between text-sm font-medium text-text">
              İstek Başlığı
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
              placeholder="Örn. Bilim kurgu film afişi için sinematik prompt arıyorum"
              className={cn(
                "h-10 w-full rounded-md border bg-background px-3 text-sm text-text placeholder:text-text-muted",
                titleTouched && titleError ? "border-red-500" : "border-border",
              )}
            />
            {titleTouched && titleError && <p className="mt-1 text-xs text-red-500">{titleError}</p>}
          </div>

          <div>
            <label htmlFor="request-description" className="mb-1.5 flex items-center justify-between text-sm font-medium text-text">
              İstek Açıklaması
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
              placeholder="Ne istediğini ayrıntılı şekilde anlat: atmosfer, stil, ışık, kompozisyon..."
              className={cn(
                "w-full resize-none rounded-md border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted",
                descriptionTouched && descriptionError ? "border-red-500" : "border-border",
              )}
            />
            {descriptionTouched && descriptionError && (
              <p className="mt-1 text-xs text-red-500">{descriptionError}</p>
            )}
          </div>

          <div>
            <label htmlFor="request-direction" className="mb-1.5 block text-sm font-medium text-text">
              Yaratıcı Yön <span className="text-text-muted">(opsiyonel)</span>
            </label>
            <textarea
              id="request-direction"
              rows={2}
              value={creativeDirection}
              onChange={(event) => setCreativeDirection(event.target.value)}
              placeholder="Örn. Sürreal ama fotogerçekçi bir denge olsun, gün batımı ışığı tercih ederim."
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-text">
              Referans Görsel <span className="text-text-muted">(opsiyonel)</span>
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="block w-full text-sm text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-accent-surface/70"
            />
            {imageError && <p className="mt-1 text-xs text-red-500">{imageError}</p>}
          </div>

          <div>
            <label htmlFor="request-tool" className="mb-1.5 block text-sm font-medium text-text">
              Tercih Edilen Araç <span className="text-text-muted">(opsiyonel)</span>
            </label>
            <input
              id="request-tool"
              type="text"
              value={preferredTool}
              onChange={(event) => setPreferredTool(event.target.value)}
              placeholder="Örn. Midjourney"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-text">
              Etiketler <span className="text-text-muted">(opsiyonel)</span>
            </label>
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

          {publishError && <p className="text-sm text-red-500">{publishError}</p>}

          <div className="flex gap-2">
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "Yayınlanıyor..." : "İsteği Yayınla"}
            </Button>
            <Button type="button" variant="ghost" size="lg" onClick={() => router.push("/requests")}>
              Vazgeç
            </Button>
          </div>
        </form>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Canlı Önizleme
          </p>
          <div className="pointer-events-none select-none">
            <RequestCard request={previewRequest} />
          </div>
        </div>
      </div>
    </div>
  );
}
