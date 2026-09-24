"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { absoluteUrl } from "@/lib/utils";
import { contentActionClassName } from "@/features/content/action-styles";

/**
 * The only fully working social action on the card — uses the real Web
 * Share API (or clipboard as fallback), unlike like/save which would need
 * a backend to persist (see CLAUDE.md section 14, not built yet).
 */
export function ShareButton({
  url,
  title,
  label,
  className,
}: {
  url: string;
  title: string;
  /** Optional visible text next to the icon (used by the profile action row's pill button). */
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    const fullUrl = absoluteUrl(url);

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url: fullUrl });
      } catch {
        // user cancelled the native share sheet — no-op
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — nothing else we can do without a backend
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label="Paylaş"
      title={copied ? "Bağlantı kopyalandı" : "Paylaş"}
      className={contentActionClassName(copied, className)}
    >
      <Share2 size={16} strokeWidth={1.75} />
      {label && <span>{copied ? "Kopyalandı" : label}</span>}
    </button>
  );
}
