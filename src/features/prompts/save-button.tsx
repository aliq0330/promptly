"use client";

import Link from "next/link";
import { Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSaveState } from "./use-save-state";

/**
 * Real, working save toggle — genuinely persisted to Supabase for a real
 * prompt with a signed-in viewer (CLAUDE.md Bölüm 21 Faz 3), falling back
 * to the original localStorage behavior (CLAUDE.md section 14) otherwise.
 * Drives the /saved page's real content either way.
 */
export function SaveButton({
  promptId,
  size = 14,
  className,
}: {
  promptId: string;
  size?: number;
  className?: string;
}) {
  const { isSaved, toggle, canSave } = useSaveState(promptId);

  const sharedClassName = cn(
    "flex items-center rounded-sm px-1 py-0.5 text-xs transition-colors hover:text-text",
    isSaved ? "text-primary" : "text-text-muted",
    className,
  );

  if (!canSave) {
    return (
      <Link
        href="/login"
        onClick={(event) => event.stopPropagation()}
        title="Kaydetmek için giriş yapmalısın"
        className={sharedClassName}
      >
        <Bookmark size={size} />
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
      aria-pressed={isSaved}
      title={isSaved ? "Kaydedilenlerden çıkar" : "Kaydet"}
      className={sharedClassName}
    >
      <Bookmark size={size} fill={isSaved ? "currentColor" : "none"} />
    </button>
  );
}
