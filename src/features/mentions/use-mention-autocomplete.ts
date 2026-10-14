"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type SyntheticEvent } from "react";
import { activeMentionQuery, applyMention } from "@/lib/mentions";
import { searchMentionCandidates, type MentionCandidate } from "@/lib/supabase/profiles";

const DEBOUNCE_MS = 150;

type MentionField = HTMLInputElement | HTMLTextAreaElement;

/**
 * `@name` suggestions for a text field. Spread `fieldProps` on the `<input>`/`<textarea>`
 * (it carries `value` and `onChange` too, so the field is driven by the `value`/`onChange`
 * you pass in here) and render `<MentionSuggestions {...list} />` inside a `relative` wrapper
 * next to it.
 *
 * Typing `@bo` right before the caret asks for people whose username starts with "bo";
 * ArrowUp/Down move, Enter/Tab pick, Escape closes, and a click/tap picks. Picking swaps the
 * partial for `@username ` and puts the caret after it.
 */
export function useMentionAutocomplete({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const listId = useId();
  const fieldRef = useRef<MentionField | null>(null);
  const [caret, setCaret] = useState(0);
  const [results, setResults] = useState<{ query: string; people: MentionCandidate[] } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const active = activeMentionQuery(value, caret);
  const queryKey = active ? `${active.start}:${active.query}` : null;
  const activeQuery = active?.query;
  const people = useMemo(
    () => (activeQuery && results?.query === activeQuery ? results.people : []),
    [activeQuery, results],
  );
  const open = Boolean(active) && people.length > 0 && dismissedKey !== queryKey;

  const wanted = active && active.query.length >= 1 ? active.query : null;
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchMentionCandidates(wanted).then((found) => {
        if (cancelled) return;
        setResults({ query: wanted, people: found });
        setActiveIndex(0);
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [wanted]);

  const syncCaret = useCallback((event: SyntheticEvent<MentionField>) => {
    setCaret(event.currentTarget.selectionStart ?? 0);
  }, []);

  const pick = useCallback(
    (index: number) => {
      const person = people[index];
      if (!person || !active) return;
      const next = applyMention(value, active.start, caret, person.username);
      onChange(next.value);
      setCaret(next.caret);
      setResults(null);
      const el = fieldRef.current;
      if (el) requestAnimationFrame(() => el.setSelectionRange(next.caret, next.caret));
    },
    [people, active, value, caret, onChange],
  );

  const onKeyDown = (event: KeyboardEvent<MentionField>) => {
    if (!open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (index + step + people.length) % people.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      pick(activeIndex);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDismissedKey(queryKey);
    }
  };

  return {
    /** Spread on the field. */
    fieldProps: {
      ref: (el: MentionField | null) => {
        fieldRef.current = el;
      },
      value,
      onChange: (event: ChangeEvent<MentionField>) => {
        setCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length);
        onChange(event.currentTarget.value);
      },
      onKeyDown,
      onKeyUp: syncCaret,
      onClick: syncCaret,
      onSelect: syncCaret,
      onBlur: () => setDismissedKey(queryKey),
      "aria-autocomplete": "list" as const,
      "aria-expanded": open,
      "aria-controls": open ? listId : undefined,
      "aria-activedescendant": open ? `${listId}-${activeIndex}` : undefined,
    },
    /** Props for `<MentionSuggestions />`. */
    list: { id: listId, open, people, activeIndex, onPick: pick, onHover: setActiveIndex },
  };
}
