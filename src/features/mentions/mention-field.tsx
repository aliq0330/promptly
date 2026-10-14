"use client";

import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { MentionSuggestions } from "./mention-suggestions";
import { useMentionAutocomplete } from "./use-mention-autocomplete";

type FieldValue = { value: string; onChange: (value: string) => void };

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
  ...rest
}: FieldValue & { wrapperClassName?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const { fieldProps, list } = useMentionAutocomplete({ value, onChange });
  return (
    <div className={wrapperClassName ?? "relative min-w-0 flex-1"}>
      <input {...rest} {...fieldProps} />
      <MentionSuggestions {...list} />
    </div>
  );
}
