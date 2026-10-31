import type { PromptVariableSpec } from "@/types";

/** A not-yet-persisted variable living only in this form's own state — gets a real DB row (with a real `id`) only once the prompt itself is created/updated (see `replaceVariablesForPrompt`, `src/lib/supabase/prompt-variables.ts`). */
export interface DraftVariable extends PromptVariableSpec {
  tempId: string;
  name: string;
  defaultValue: string;
  description: string;
}

export function makeTempId(): string {
  return `var-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
