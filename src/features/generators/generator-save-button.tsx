"use client";

import Link from "next/link";
import { Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGeneratorSaveState } from "./use-generator-save-state";

/**
 * Kaydet — a direct toggle (unlike prompts' `SaveButton`, no modal): a
 * generator can only be saved to the caller's own default collection in
 * this phase (see `useGeneratorSaveState`'s doc comment for why a full
 * multi-collection picker was deliberately deferred), so there's nothing
 * to choose between — tapping the icon just saves/unsaves directly.
 */
export function GeneratorSaveButton({
  generatorId,
  size = 14,
  className,
}: {
  generatorId: string;
  size?: number;
  className?: string;
}) {
  const { isSaved, toggle, isToggling, canSave } = useGeneratorSaveState(generatorId);

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
        if (!isToggling) void toggle();
      }}
      disabled={isToggling}
      aria-pressed={isSaved}
      title={isSaved ? "Kaydedilenlerden çıkar" : "Kaydet"}
      className={cn(sharedClassName, isToggling && "opacity-60")}
    >
      <Bookmark size={size} fill={isSaved ? "currentColor" : "none"} />
    </button>
  );
}
