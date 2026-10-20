"use client";

import { useEffect, useState } from "react";
import { Clapperboard, Music, Play } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchResultById, fetchResultsForPrompt } from "@/lib/supabase/prompt-results";
import { useTranslation } from "@/lib/i18n/language-provider";
import { ResultTypePreview } from "@/features/prompts/result-type-preview";
import type { Prompt, PromptResult } from "@/types";
import { StorageImage } from "@/components/ui/storage-media";
import { DetailArtPlaceholder } from "@/features/content/detail-parts";

/**
 * The playable "output" of a video / audio prompt: the result its AUTHOR uploaded under it, in the prompt's own media type,
 * with a real file. `null` when there is none (or it can't be read). Shared by the detail page and Odak (`/focus`).
 */
export async function loadAuthorOutput(promptId: string, authorId: string, contentType: Prompt["contentType"]): Promise<PromptResult | null> {
  const { results } = await fetchResultsForPrompt(promptId, { limit: 12 });
  const own = results.find((r) => r.creator.id === authorId && r.mediaType === contentType);
  const full = own ? await fetchResultById(own.id) : null;
  return full && full.mediaUrl ? full : null;
}

/**
 * Prompt detay sayfasında video/ses promptlarının "Çıktı"sı: yazarın bu
 * prompt altına yüklediği kendi sonucu (Kullanıcı Sonuçları sistemi,
 * `prompt_results`) gerçek bir `<video>`/`<audio>` oynatıcısıyla gösterilir.
 * Yeni bir medya tablosu yok — mevcut sonuç sisteminin oynatıcısı
 * (`ResultTypePreview size="detail"`) aynen kullanılır.
 *
 * Yalnızca promptun YAZARININ, promptla aynı türde (video→video, ses→ses)
 * yüklediği sonuç "çıktı" sayılır; başka bir kullanıcının sonucu burada
 * yanıltıcı olurdu, o `PromptResultsSection`'da zaten ayrıca listelenir.
 * Sonuç yoksa promptun kapak görseli (varsa) sessizce gösterilir, hiçbir şey
 * yoksa kapak yerinde türün simgesi durur.
 */
export function PromptPlayableOutput({ prompt }: { prompt: Prompt }) {
  const { t } = useTranslation();
  const [result, setResult] = useState<PromptResult | null>(null);
  const [loading, setLoading] = useState(true);
  const poster = prompt.media[0];

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets when the prompt changes
    setLoading(true);
    loadAuthorOutput(prompt.id, prompt.author.id, prompt.contentType).then((full) => {
      if (cancelled) return;
      setResult(full);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [prompt.id, prompt.author.id, prompt.contentType]);

  // Shown as the detail page's album art (docs/history/201-*): no card around it.
  if (result) {
    return (
      <figure className="w-full max-w-md space-y-2 lg:w-[440px]">
        <ResultTypePreview result={result} size="detail" />
        <figcaption className="sr-only">{t("prompt.outputCaption")}</figcaption>
      </figure>
    );
  }

  if (poster) {
    const ratio = poster.width / poster.height;
    return (
      <figure
        className="relative w-full overflow-hidden rounded-[22px] bg-surface-soft shadow-pop [--hero-h:240px] md:[--hero-h:300px] lg:w-[460px]"
        style={{ aspectRatio: ratio, maxWidth: `min(100%, calc(var(--hero-h) * ${ratio}))` }}
      >
        <StorageImage src={poster.url} alt={poster.alt} fill sizes="(min-width: 768px) 520px, 100vw" className="object-cover" />
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white">
              <Play size={20} fill="currentColor" />
            </span>
          </span>
        )}
        <figcaption className="sr-only">{t("prompt.outputCaption")}</figcaption>
      </figure>
    );
  }
  if (loading) return <Skeleton className="h-48 w-full max-w-xl rounded-[22px]" />;

  // Nothing uploaded yet: the art still says what kind of post this is.
  return <DetailArtPlaceholder icon={prompt.contentType === "audio" ? Music : Clapperboard} />;
}
