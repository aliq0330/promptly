"use client";

import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { extractVariableTokenNames, insertTextAtRange, isValidVariableName, normalizeVariableName } from "@/lib/prompt-variables";
import type { StudioSnapshot } from "@/lib/studio-diff";
import { PromptVariableInputs } from "@/features/prompts/prompt-variable-inputs";
import type { PromptVariable } from "@/types";

type Update = (fn: (draft: StudioSnapshot) => StudioSnapshot, key?: string | null) => void;

/** Studio's prompt editor: the draft title + text, and the existing `{variable}` system (same tokens, same inputs as the prompt page). */
export function PromptPane({ draft, baseline, edit }: { draft: StudioSnapshot; baseline: StudioSnapshot; edit: Update }) {
  const { t } = useTranslation();
  const prompt = draft.prompt;
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const pseudoVariables = useMemo<PromptVariable[]>(
    () =>
      (prompt?.variables ?? []).map((v, index) => ({
        id: v.name,
        promptId: "",
        name: v.name,
        defaultValue: baseline.prompt?.variables.find((b) => b.name === v.name)?.value ?? "",
        description: null,
        sortOrder: index,
        createdAt: "",
        updatedAt: "",
      })),
    [prompt?.variables, baseline.prompt?.variables],
  );
  const values = useMemo(() => Object.fromEntries((prompt?.variables ?? []).map((v) => [v.name, v.value])), [prompt?.variables]);
  const isCustomized = (prompt?.variables ?? []).some((v) => v.value !== (baseline.prompt?.variables.find((b) => b.name === v.name)?.value ?? ""));
  const undefinedTokens = useMemo(() => {
    const defined = new Set((prompt?.variables ?? []).map((v) => v.name));
    return extractVariableTokenNames(prompt?.text ?? "").filter((name) => !defined.has(name));
  }, [prompt?.text, prompt?.variables]);

  if (!prompt) return null;

  function setText(text: string) {
    edit((d) => (d.prompt ? { ...d, prompt: { ...d.prompt, text } } : d), "prompt-text");
  }

  function setValue(name: string, value: string) {
    edit((d) => (d.prompt ? { ...d, prompt: { ...d.prompt, variables: d.prompt.variables.map((v) => (v.name === name ? { ...v, value } : v)) } } : d), `var-${name}`);
  }

  function defineVariable(name: string, insertToken: boolean) {
    const normalized = normalizeVariableName(name);
    if (!isValidVariableName(normalized)) {
      setNameError(t("studio.variableInvalid"));
      return;
    }
    if ((prompt?.variables ?? []).some((v) => v.name === normalized)) {
      setNameError(t("studio.variableExists"));
      return;
    }
    setNameError(null);
    const area = textRef.current;
    edit((d) => {
      if (!d.prompt) return d;
      let text = d.prompt.text;
      if (insertToken) {
        const start = area?.selectionStart ?? text.length;
        const end = area?.selectionEnd ?? text.length;
        text = insertTextAtRange(text, start, end, `{${normalized}}`).text;
      }
      return { ...d, prompt: { ...d.prompt, text, variables: [...d.prompt.variables, { name: normalized, value: "" }] } };
    });
    setNewName("");
  }

  function resetValues() {
    edit((d) =>
      d.prompt ? { ...d, prompt: { ...d.prompt, variables: d.prompt.variables.map((v) => ({ ...v, value: baseline.prompt?.variables.find((b) => b.name === v.name)?.value ?? v.value })) } } : d,
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="studio-prompt-title" className="mb-1.5 block text-small font-medium text-text">
          {t("studio.promptTitle")}
        </label>
        <input
          id="studio-prompt-title"
          value={prompt.title}
          onChange={(event) => edit((d) => (d.prompt ? { ...d, prompt: { ...d.prompt, title: event.target.value } } : d), "prompt-title")}
          className="h-11 w-full min-w-0 rounded-md border border-border bg-background px-3 text-body text-text focus:border-primary"
        />
      </div>

      <div>
        <label htmlFor="studio-prompt-text" className="mb-1.5 flex items-center justify-between gap-2 text-small font-medium text-text">
          {t("studio.promptText")}
          <span className="text-caption font-normal text-text-muted">{t("studio.promptTextHint")}</span>
        </label>
        <textarea
          id="studio-prompt-text"
          ref={textRef}
          value={prompt.text}
          onChange={(event) => setText(event.target.value)}
          rows={10}
          spellCheck={false}
          className="prompt-text max-h-[28rem] min-h-40 w-full min-w-0 resize-y rounded-md border border-border bg-background p-3 text-small text-text focus:border-primary"
        />
      </div>

      {undefinedTokens.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-surface-soft p-3 text-small text-text-secondary">
          <p className="mb-2">{t("studio.undefinedTokens")}</p>
          <div className="flex flex-wrap gap-2">
            {undefinedTokens.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => defineVariable(name, false)}
                className="inline-flex h-9 items-center gap-1 rounded-full border border-border bg-surface px-3 text-caption font-medium text-text hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {`{${name}}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {pseudoVariables.length > 0 && <PromptVariableInputs variables={pseudoVariables} values={values} isCustomized={isCustomized} onChange={setValue} onReset={resetValues} />}

      <div>
        <label htmlFor="studio-new-variable" className="mb-1.5 block text-small font-medium text-text">
          {t("studio.newVariable")}
        </label>
        <div className="flex gap-2">
          <input
            id="studio-new-variable"
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
              setNameError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                defineVariable(newName, true);
              }
            }}
            placeholder={t("studio.newVariablePlaceholder")}
            aria-invalid={Boolean(nameError)}
            className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-body text-text placeholder:text-text-muted focus:border-primary"
          />
          <Button type="button" variant="outline" onClick={() => defineVariable(newName, true)} disabled={!newName.trim()} className="h-11 shrink-0">
            <Plus className="h-4 w-4" aria-hidden />
            {t("studio.addVariable")}
          </Button>
        </div>
        {nameError && <p className="mt-1.5 text-caption text-danger">{nameError}</p>}
      </div>
    </div>
  );
}
