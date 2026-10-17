"use client";

import { useId, useState } from "react";
import { ChevronDown, PenLine } from "lucide-react";
import { linkifyNote } from "@/lib/source-notes";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/** "CC BY 4.0", "CC BY-SA 4.0", "CC0" … — the licence named in the credit lines, if any (shown as a badge on the collapsed row). */
const LICENSE_PATTERN = /\bCC[ -]?(?:BY(?:[- ](?:SA|NC|ND))*|0)(?: ?\d\.\d)?/i;

export function detectLicense(notes: string[]): string | null {
  for (const note of notes) {
    const match = note.match(LICENSE_PATTERN);
    if (match) return match[0].toUpperCase().replace(/^CC[ -]?/, "CC ").replace(/\s+/g, " ");
  }
  return null;
}

/**
 * Credit lines split off a description (`splitSourceNotes`): one compact, collapsed "Kaynak ve lisans" row (with the licence as a badge when
 * the notes name one); opening it lists the lines with real links. Same row on every detail page — long credit text never pushes the content down.
 */
export function SourceNotes({ notes }: { notes: string[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (notes.length === 0) return null;
  const license = detectLicense(notes);

  return (
    <div className="border-y border-border-soft" data-testid="source-notes">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-10 w-full items-center gap-2 py-1.5 text-left text-label font-medium text-text transition-colors hover:text-primary"
      >
        <PenLine size={15} className="shrink-0 text-text-secondary" aria-hidden />
        <span className="min-w-0 truncate">{t("source.heading")}</span>
        <ChevronDown size={15} aria-hidden className={cn("shrink-0 text-text-muted transition-transform duration-200", open && "rotate-180")} />
        {license && (
          <span className="ml-auto inline-flex shrink-0 items-center rounded-md border border-border-soft bg-surface px-1.5 py-0.5 text-caption font-medium text-text-secondary">{license}</span>
        )}
      </button>
      {open && (
        <ul id={panelId} className="max-w-2xl space-y-1 pb-2.5 text-caption leading-relaxed text-text-muted">
          {notes.map((note) => (
            <li key={note} className="break-words [overflow-wrap:anywhere]">
              {linkifyNote(note).map((part, i) =>
                part.href ? (
                  <a key={i} href={part.href} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-border-strong underline-offset-2 hover:text-text">
                    {part.text}
                  </a>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
