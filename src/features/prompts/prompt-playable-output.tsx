"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchResultById, fetchResultsForPrompt } from "@/lib/supabase/prompt-results";
import { useTranslation } from "@/lib/i18n/language-provider";
import { ResultTypePreview } from "@/features/prompts/result-type-preview";
import type { Prompt, PromptResult } from "@/types";

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
 * yoksa bileşen boş kalır.
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
    fetchResultsForPrompt(prompt.id, { limit: 12 }).then(async ({ results }) => {
      const own = results.find((r) => r.creator.id === prompt.author.id && r.mediaType === prompt.contentType);
      const full = own ? await fetchResultById(own.id) : null;
      if (cancelled) return;
      setResult(full && full.mediaUrl ? full : null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [prompt.id, prompt.author.id, prompt.contentType]);

  if (result) {
    return (
      <figure className="space-y-2">
        <div className="overflow-hidden rounded-xl border border-border-soft bg-surface-soft p-2 shadow-card sm:p-3">
          <ResultTypePreview result={result} size="detail" />
        </div>
        <figcaption className="text-caption text-text-muted">{t("prompt.outputCaption")}</figcaption>
      </figure>
    );
  }

  if (loading && poster) {
    return (
      <figure className="space-y-2">
        <div className="relative overflow-hidden rounded-xl border border-border-soft bg-surface-soft shadow-card" style={{ aspectRatio: poster.width / poster.height, maxWidth: 560 }}>
          <Image src={poster.url} alt={poster.alt} fill sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white">
              <Play size={20} fill="currentColor" />
            </span>
          </span>
        </div>
      </figure>
    );
  }
  if (loading) return <Skeleton className="h-48 w-full max-w-xl rounded-xl" />;

  if (poster) {
    return (
      <figure className="space-y-2">
        <div className="relative overflow-hidden rounded-xl border border-border-soft bg-surface-soft shadow-card" style={{ aspectRatio: poster.width / poster.height, maxWidth: 560 }}>
          <Image src={poster.url} alt={poster.alt} fill sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" />
        </div>
        <figcaption className="text-caption text-text-muted">{t("prompt.outputCaption")}</figcaption>
      </figure>
    );
  }
  return null;
}
