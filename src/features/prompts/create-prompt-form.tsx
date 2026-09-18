"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PromptCard } from "@/features/prompts/prompt-card";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { getUserById } from "@/mocks/users";
import { mockTags } from "@/mocks/tags";
import { placeholderArt } from "@/lib/placeholder-image";
import { cn } from "@/lib/utils";
import type { Prompt, PromptContentType, Tag } from "@/types";

const CONTENT_TYPES: PromptContentType[] = ["image", "text", "video", "code", "music"];

const TOOL_SUGGESTIONS: Record<PromptContentType, string[]> = {
  image: ["Midjourney v6", "Stable Diffusion XL", "DALL-E 3", "NovelAI"],
  text: ["Claude", "GPT-4"],
  video: ["Sora", "Runway Gen-3"],
  code: ["Claude Code", "GPT-4"],
  music: ["Suno", "Udio"],
};

/**
 * Real, working form (validation, image preview, live card preview) built
 * on top of mock data — there is no backend to publish to yet (CLAUDE.md
 * section 18-21), so submitting never claims the prompt was actually
 * saved. The honest, useful thing it *can* do is show exactly how the
 * post would render, using the same card components as the real feed.
 */
export function CreatePromptForm() {
  const me = getUserById("me")!;

  const [contentType, setContentType] = useState<PromptContentType>("image");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [promptText, setPromptText] = useState("");
  const [tool, setTool] = useState("");
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [uploadedImage, setUploadedImage] = useState<{ url: string; width: number; height: number } | null>(
    null,
  );
  const [submitted, setSubmitted] = useState(false);

  // Revoke the object URL when replaced or when the form unmounts.
  useEffect(() => {
    return () => {
      if (uploadedImage) URL.revokeObjectURL(uploadedImage.url);
    };
  }, [uploadedImage]);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setUploadedImage((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url, width: img.naturalWidth, height: img.naturalHeight };
      });
    };
    img.src = url;
  }

  function toggleTag(tag: Tag) {
    setSelectedTags((prev) =>
      prev.some((t) => t.slug === tag.slug) ? prev.filter((t) => t.slug !== tag.slug) : [...prev, tag],
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
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
    media:
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
        : [],
    tags: selectedTags,
    origin: { type: "original" },
    likeCount: 0,
    commentCount: 0,
    remixCount: 0,
    isLiked: false,
    isSaved: false,
    status: "draft",
    createdAt: new Date().toISOString(),
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-6">
      <h1 className="mb-1 text-lg font-semibold text-text">Prompt Oluştur</h1>
      <p className="mb-6 text-sm text-text-muted">
        Promptunu yaz, sağda anında önizlemesini gör. Gerçek paylaşım, Supabase entegrasyonu
        kurulduğunda aktif olacak (bkz. CLAUDE.md Bölüm 18–21).
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

          <Button type="submit" size="lg" className="w-full sm:w-auto">
            Paylaş
          </Button>

          {submitted && (
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
              <Sparkles size={16} className="mt-0.5 shrink-0" />
              <p>
                Önizlemeni sağda görebilirsin. Gerçek paylaşım için Supabase entegrasyonu henüz
                kurulmadı, bu yüzden prompt kalıcı olarak kaydedilmedi.
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
