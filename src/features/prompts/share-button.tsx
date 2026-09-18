"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The only fully working social action on the card — uses the real Web
 * Share API (or clipboard as fallback), unlike like/save which would need
 * a backend to persist (see CLAUDE.md section 14, not built yet).
 */
export function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    const fullUrl = typeof window !== "undefined" ? `${window.location.origin}${url}` : url;

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
      className={cn(
        "flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs transition-colors hover:text-text",
        copied ? "text-primary" : "text-text-muted",
      )}
    >
      <Share2 size={14} />
    </button>
  );
}
