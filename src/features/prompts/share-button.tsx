"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { absoluteUrl } from "@/lib/utils";
import { contentActionClassName } from "@/features/content/action-styles";

/**
 * The actual native-share/clipboard mechanics, pulled out of `ShareButton`
 * so both it (still used as-is for profile sharing, CLAUDE.md Bölüm 9.52)
 * and `ShareModal`'s "Diğer uygulamalarla paylaş" option call the exact
 * same, un-rewritten logic — the Unified Share System task's own rule was
 * "aynı native share sistemini de yeniden yazma", so this function is a
 * pure extraction, not a reimplementation.
 */
export async function shareOrCopyLink(
  url: string,
  title: string,
): Promise<"shared" | "cancelled" | "copied" | "unavailable"> {
  const fullUrl = absoluteUrl(url);

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, url: fullUrl });
      return "shared";
    } catch {
      // user cancelled the native share sheet
      return "cancelled";
    }
  }

  try {
    await navigator.clipboard.writeText(fullUrl);
    return "copied";
  } catch {
    return "unavailable";
  }
}

/**
 * The only fully working social action on the card — uses the real Web
 * Share API (or clipboard as fallback), unlike like/save which would need
 * a backend to persist (see CLAUDE.md section 14, not built yet). Since
 * Bölüm 9.52 this is used ONLY for sharing a user's own profile
 * (`profile-actions.tsx`) — every prompt/generator/request card and detail
 * page instead opens `ShareModal` (`ShareTriggerButton`), which calls
 * `shareOrCopyLink` above for its own "Diğer uygulamalarla paylaş" option.
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
    const result = await shareOrCopyLink(url, title);
    if (result === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
