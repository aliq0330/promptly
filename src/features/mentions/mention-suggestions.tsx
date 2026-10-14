"use client";

import { Avatar } from "@/components/ui/avatar";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { MentionCandidate } from "@/lib/supabase/profiles";

/** The suggestion list under a field using `useMentionAutocomplete` — put it inside a `relative` wrapper. */
export function MentionSuggestions({
  id,
  open,
  people,
  activeIndex,
  onPick,
  onHover,
}: {
  id: string;
  open: boolean;
  people: MentionCandidate[];
  activeIndex: number;
  onPick: (index: number) => void;
  onHover: (index: number) => void;
}) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <ul
      id={id}
      role="listbox"
      aria-label={t("mentions.suggestionsAria")}
      className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-surface-elevated py-1 shadow-pop animate-pop-in"
    >
      {people.map((person, index) => (
        <li
          key={person.username}
          id={`${id}-${index}`}
          role="option"
          aria-selected={index === activeIndex}
          // mouse-down (not click) so the field keeps focus and its caret
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(index);
          }}
          onMouseEnter={() => onHover(index)}
          className={cn("flex min-h-9 cursor-pointer items-center gap-2 px-3 py-1.5", index === activeIndex ? "bg-primary-soft" : "hover:bg-surface-soft")}
        >
          <Avatar src={person.avatarUrl} alt="" size={24} />
          <span className="min-w-0 truncate text-small font-medium text-text">{person.displayName}</span>
          <span className="shrink-0 text-caption text-text-muted">@{person.username}</span>
        </li>
      ))}
    </ul>
  );
}
