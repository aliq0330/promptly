"use client";

import { Heart } from "lucide-react";
import { cn, formatCount } from "@/lib/utils";
import { LikeToggle } from "@/components/ui/like-toggle";
import { contentActionClassName } from "@/features/content/action-styles";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useLikeState } from "./use-like-state";
import type { LikeableContentType } from "@/lib/supabase/likes";

/** Real, working like toggle — genuinely persisted to Supabase; opens the login dialog instead while signed out. */
export function LikeButton({
  id,
  likeCount,
  contentType = "prompt",
  size = 16,
  className,
}: {
  id: string;
  likeCount: number;
  /** Defaults to "prompt" — every existing prompt call site keeps working unchanged. */
  contentType?: LikeableContentType;
  size?: number;
  className?: string;
}) {
  const { isLiked, likeCount: count, toggle, canLike } = useLikeState(id, likeCount, contentType);
  const { t } = useTranslation();
  const { requireAuth } = useAuthPrompt();

  const sharedClassName = contentActionClassName(false, cn(isLiked && "text-danger hover:text-danger", className));

  if (!canLike) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          requireAuth("like");
        }}
        aria-haspopup="dialog"
        title={t("prompt.loginToLike")}
        aria-label={t("prompt.loginToLikeAria", { count })}
        className={sharedClassName}
      >
        <Heart size={size} strokeWidth={1.75} />
        <span aria-hidden>{formatCount(count)}</span>
      </button>
    );
  }

  return (
    <LikeToggle
      liked={isLiked}
      count={count}
      size={size}
      onToggle={toggle}
      title={isLiked ? t("prompt.unlike") : t("prompt.like")}
      label={t(isLiked ? "prompt.unlikeAria" : "prompt.likeAria", { count })}
      className={sharedClassName}
    />
  );
}
