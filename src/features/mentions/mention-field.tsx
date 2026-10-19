"use client";

import type { InputHTMLAttributes, Ref, RefObject, TextareaHTMLAttributes } from "react";
import { MentionSuggestions } from "./mention-suggestions";
import { useMentionAutocomplete } from "./use-mention-autocomplete";

type FieldValue = { value: string; onChange: (value: string) => void };

/** The hook keeps its own ref to the field; a caller may want one too (e.g. to focus it). */
function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (element: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(element);
      else if (ref) (ref as RefObject<T | null>).current = element;
    }
  };
}

/** `<textarea>` that suggests people while typing `@name` (comments, a request's creative direction). */
export function MentionTextarea({ value, onChange, ...rest }: FieldValue & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const { fieldProps, list } = useMentionAutocomplete({ value, onChange });
  return (
    <div className="relative">
      <textarea {...rest} {...fieldProps} />
      <MentionSuggestions {...list} />
    </div>
  );
}

/** `<input>` that suggests people while typing `@name`. Sits in a flex row, so the wrapper takes the field's flex share. */
export function MentionInput({
  value,
  onChange,
  wrapperClassName,
  suggestionsPlacement,
  ref,
  ...rest
}: FieldValue & { wrapperClassName?: string; suggestionsPlacement?: "below" | "above"; ref?: Ref<HTMLInputElement> } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const { fieldProps, list } = useMentionAutocomplete({ value, onChange });
  return (
    <div className={wrapperClassName ?? "relative min-w-0 flex-1"}>
      <input {...rest} {...fieldProps} ref={mergeRefs(fieldProps.ref, ref)} />
      <MentionSuggestions {...list} placement={suggestionsPlacement} />
    </div>
  );
}
