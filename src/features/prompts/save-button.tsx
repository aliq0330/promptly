"use client";

import { Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSave } from "./like-save-provider";

/**
 * Real, working save toggle (see CLAUDE.md section 14) — persisted to
 * localStorage via SaveProvider. Drives the /saved page's real content.
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
  const { isSaved, toggleSave } = useSave();
  const saved = isSaved(promptId);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleSave(promptId);
      }}
      aria-pressed={saved}
      title={saved ? "Kaydedilenlerden çıkar" : "Kaydet"}
      className={cn(
        "flex items-center rounded-sm px-1 py-0.5 text-xs transition-colors hover:text-text",
        saved ? "text-primary" : "text-text-muted",
        className,
      )}
    >
      <Bookmark size={size} fill={saved ? "currentColor" : "none"} />
    </button>
  );
}
