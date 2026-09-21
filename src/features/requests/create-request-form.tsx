"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RequestCard } from "./request-card";
import { useRealRequests } from "./real-requests-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { useTagCatalog } from "@/features/tags/use-tag-catalog";
import { useTagPicker } from "@/features/prompts/use-tag-picker";
import { TagPicker } from "@/features/prompts/tag-picker";
import { cn, requestHref, resizeImageToDataUrlFit } from "@/lib/utils";
import type { PromptContentType, PromptRequest } from "@/types";

const CONTENT_TYPES: PromptContentType[] = ["image", "text", "video", "code", "music"];

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addRequest, updateRequest, getCached, fetchById } = useRealRequests();
  const { user } = useAuth();
  const { profile: ownProfile } = useOwnProfile();

  const editId = searchParams.get("edit");
  const isEditMode = Boolean(editId);

  const { catalog: tagCatalog } = useTagCatalog();

  const [contentType, setContentType] = useState<PromptContentType>("image");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creativeDirection, setCreativeDirection] = useState("");
  const [preferredTool, setPreferredTool] = useState("");
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
    setTitle(editingRequest.title);
    setDescription(editingRequest.description);
    setCreativeDirection(editingRequest.creativeDirection);
    setPreferredTool(editingRequest.preferredTool ?? "");
    editingRequest.tags.forEach((tag) => tagPicker.addManual(tag));
    setFieldsSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tagPicker.addManual is stable (useCallback)
  }, [editingRequest, fieldsSeeded]);

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
          preferredTool: preferredTool || null,
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
          preferredTool: preferredTool || null,
          tags: tagPicker.accepted.map((entry) => entry.tag),
          tagSources: Object.fromEntries(tagPicker.accepted.map((entry) => [entry.tag.slug, entry.source])),
          imageFile: referenceImageFile,
        },
        ownProfile,
      );
      router.push(requestHref(request));
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "İstek yayınlanamadı, lütfen tekrar dene.");
      setIsSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">Giriş yapmalısın</h1>
        <p className="mb-4 text-sm text-text-muted">
          Bir prompt isteği yayınlamak (ya da düzenlemek) için önce giriş yapmalısın.
        </p>
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

  if (!editChecked) {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">Yükleniyor…</div>;
  }

  if (editForbidden) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">Bu isteği düzenleme yetkin yok</h1>
        <p className="mb-4 text-sm text-text-muted">Bir isteği yalnızca kendi sahibi düzenleyebilir.</p>
        <Link
          href="/requests"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          İsteklere Dön
        </Link>
      </div>
    );
  }

  if (isEditMode && !editingRequest) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">İstek bulunamadı</h1>
        <p className="mb-4 text-sm text-text-muted">
          Düzenlemek istediğin istek silinmiş veya artık erişilebilir değil.
        </p>
        <Link
          href="/requests"
          className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text hover:bg-accent-surface"
        >
          İsteklere Dön
        </Link>
      </div>
    );
  }

  const previewRequest: PromptRequest = {
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
    title: title || "Başlıksız istek",
    description: description || "Açıklama eklenmedi.",
    creativeDirection,
    contentType,
    preferredTool: preferredTool || null,
    referenceImage: referenceImage
      ? { id: "reference", url: referenceImage.url, width: referenceImage.width, height: referenceImage.height, alt: title }
      : editingRequest?.referenceImage,
    tags: tagPicker.accepted.map((entry) => entry.tag),
    status: "open",
    responseCount: 0,
    createdAt: new Date().toISOString(),
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-6">
      <h1 className="mb-1 text-lg font-semibold text-text">{isEditMode ? "İsteği Düzenle" : "İstek Oluştur"}</h1>
      <p className="mb-6 text-sm text-text-muted">
        {isEditMode
          ? "Değişikliklerini yaz, sağda anında önizlemesini gör. Kaydet'e bastığında gerçekten, kalıcı olarak güncellenir."
          : "İhtiyacın olan promptu tanımla, topluluk sana yanıt versin. Yayınladığında istek gerçekten, kalıcı olarak Supabase'e kaydedilir ve herkese görünür olur."}
      </p>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <form onSubmit={handleSubmit} className="space-y-5">
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

          {!isEditMode && (
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
          )}

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
            <TagPicker picker={tagPicker} />
          </div>

          {publishError && <p className="text-sm text-red-500">{publishError}</p>}

          <div className="flex gap-2">
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? (isEditMode ? "Kaydediliyor..." : "Yayınlanıyor...") : isEditMode ? "Kaydet" : "İsteği Yayınla"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={() => router.push(isEditMode && editingRequest ? requestHref(editingRequest) : "/requests")}
            >
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
