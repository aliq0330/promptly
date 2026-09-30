"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { formatCount } from "@/lib/utils";
import { contentActionClassName } from "@/features/content/action-styles";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useLikeState } from "./use-like-state";
import type { LikeableContentType } from "@/lib/supabase/likes";

/** Real, working like toggle — genuinely persisted to Supabase; shows a login link instead while signed out. */
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

  const content = (
    <>
      <Heart size={size} fill={isLiked ? "currentColor" : "none"} strokeWidth={1.75} />
      <span aria-hidden>{formatCount(count)}</span>
    </>
  );

  const sharedClassName = contentActionClassName(isLiked, className);

  if (!canLike) {
    return (
      <Link
        href="/login"
        onClick={(event) => event.stopPropagation()}
        title={t("prompt.loginToLike")}
        aria-label={t("prompt.loginToLikeAria", { count })}
        className={sharedClassName}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle();
      }}
      aria-pressed={isLiked}
      title={isLiked ? t("prompt.unlike") : t("prompt.like")}
      aria-label={t("prompt.likeAria", { count })}
      className={sharedClassName}
    >
      {content}
    </button>
  );
}
