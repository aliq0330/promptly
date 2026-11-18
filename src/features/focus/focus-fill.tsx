"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { assemblyProgress, resolvePromptText } from "@/lib/prompt-variables";
import { effectiveVariableValues } from "@/lib/prompt-variable-types";
import type { Prompt, PromptVariable } from "@/types";
import { usePromptVariables } from "./use-focus-data";

/**
 * The values the viewer typed into a prompt's `{variables}` in Odak (docs/history/435-*), kept per prompt for the whole visit: the
 * strip's value chips, the stage's tappable words, the picker and the sheet's fields are all views of the SAME values, so a value
 * set in one is in every other and in what "Kopyala" copies. Purely local, throwaway state — the stored prompt is never touched
 * (the detail page's own rule, `PromptDetailView`).
 */
interface FillStore {
  overrides: Record<string, Record<string, string>>;
  set: (promptId: string, name: string, value: string) => void;
  reset: (promptId: string) => void;
}

const FillContext = createContext<FillStore | null>(null);

export function FocusFillProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({});
  const set = useCallback((promptId: string, name: string, value: string) => setOverrides((prev) => ({ ...prev, [promptId]: { ...prev[promptId], [name]: value } })), []);
  const reset = useCallback(
    (promptId: string) =>
      setOverrides((prev) => {
        const { [promptId]: _dropped, ...rest } = prev;
        void _dropped;
        return rest;
      }),
    [],
  );
  const store = useMemo(() => ({ overrides, set, reset }), [overrides, set, reset]);
  return <FillContext.Provider value={store}>{children}</FillContext.Provider>;
}

export interface PromptFill {
  variables: PromptVariable[];
  /** Effective value per variable name (defaults + the viewer's own, hidden conditional ones empty). */
  values: Record<string, string>;
  visible: Record<string, boolean>;
  isCustomized: boolean;
  progress: { filled: number; total: number; complete: boolean };
  /** The prompt with the values substituted — exactly what "Kopyala" copies. */
  text: string;
  loading: boolean;
  setValue: (name: string, value: string) => void;
  reset: () => void;
}

const NO_OVERRIDES: Record<string, string> = {};

/** A prompt's variables + the viewer's values (`null` for a post that is not a prompt). `enabled` = near the active post (the definitions load then). */
export function usePromptFill(prompt: Prompt | null, enabled: boolean): PromptFill | null {
  const store = useContext(FillContext);
  const promptId = prompt?.id ?? null;
  const { data, loading } = usePromptVariables(promptId, enabled && prompt !== null);
  const variables = useMemo(() => data ?? [], [data]);
  const overrides = (promptId && store?.overrides[promptId]) || NO_OVERRIDES;
  const { values, visible } = useMemo(() => effectiveVariableValues(variables, overrides), [variables, overrides]);
  const progress = useMemo(() => assemblyProgress(variables, values, visible), [variables, values, visible]);
  const template = prompt?.promptText ?? "";
  const text = useMemo(() => (variables.length > 0 ? resolvePromptText(template, values) : template), [variables.length, template, values]);
  const isCustomized = variables.some((variable) => variable.name in overrides && overrides[variable.name] !== variable.defaultValue);
  const setValue = useCallback((name: string, value: string) => (promptId ? store?.set(promptId, name, value) : undefined), [store, promptId]);
  const reset = useCallback(() => (promptId ? store?.reset(promptId) : undefined), [store, promptId]);
  if (!prompt) return null;
  return { variables, values, visible, isCustomized, progress, text, loading, setValue, reset };
}
