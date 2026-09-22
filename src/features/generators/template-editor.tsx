"use client";

import { useRef } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { insertTextAtRange } from "@/lib/prompt-variables";
import { extractVariablesFromText } from "@/lib/generator-template";
import type { GeneratorSchema, GeneratorTemplate, GeneratorTemplateSection } from "@/types";

export function emptySection(order: number): GeneratorTemplateSection {
  return {
    id: `section-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "Yeni bölüm",
    content: "",
    order,
    enabled: true,
  };
}

/**
 * The prompt template editor (§13-§17) — one or more real, independently
 * enable-able sections (§30's positive/negative-prompt idea generalizes
 * naturally into "just add a second section and rename it Negative Prompt"
 * rather than a hard-coded second field), each with `{{variable}}`
 * autocomplete-by-click (inserts at the real cursor position via
 * `insertTextAtRange`, reused unchanged from the Prompt Değişken Sistemi —
 * it was already a pure text-range operation, nothing `{name}`-specific
 * about it) and a live "unknown variable" warning for any `{{token}}` that
 * doesn't match a real field key (§28's publish-blocking rule, surfaced
 * here too so the author sees it immediately, not just at publish time).
 */
export function TemplateEditor({
  template,
  schema,
  onChange,
}: {
  template: GeneratorTemplate;
  schema: GeneratorSchema;
  onChange: (template: GeneratorTemplate) => void;
}) {
  const textareaRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const knownKeys = new Set(schema.fields.map((field) => field.key));
  const sorted = [...template.sections].sort((a, b) => a.order - b.order);

  function updateSection(id: string, patch: Partial<GeneratorTemplateSection>) {
    onChange({ sections: template.sections.map((section) => (section.id === id ? { ...section, ...patch } : section)) });
  }

  function addSection() {
    const nextOrder = sorted.length > 0 ? sorted[sorted.length - 1].order + 1 : 0;
    onChange({ sections: [...template.sections, emptySection(nextOrder)] });
  }

  function removeSection(id: string) {
    onChange({ sections: template.sections.filter((section) => section.id !== id) });
  }

  function moveSection(id: string, direction: -1 | 1) {
    const index = sorted.findIndex((section) => section.id === id);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    onChange({ sections: reordered.map((section, i) => ({ ...section, order: i })) });
  }

  function insertVariable(sectionId: string, key: string) {
    const textarea = textareaRefs.current.get(sectionId);
    const section = template.sections.find((s) => s.id === sectionId);
    if (!section) return;
    if (!textarea) {
      updateSection(sectionId, { content: `${section.content}${section.content && !section.content.endsWith(" ") ? " " : ""}{{${key}}}` });
      return;
    }
    const { text, cursor } = insertTextAtRange(section.content, textarea.selectionStart, textarea.selectionEnd, `{{${key}}}`);
    updateSection(sectionId, { content: text });
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div className="space-y-4">
      {sorted.map((section, index) => {
        const unknownTokens = extractVariablesFromText(section.content).filter((key) => !knownKeys.has(key));
        return (
          <div key={section.id} className="rounded-md border border-border bg-surface p-3">
            <div className="mb-2 flex items-center gap-2">
              <input
                value={section.title}
                onChange={(event) => updateSection(section.id, { title: event.target.value })}
                className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm font-medium text-text"
              />
              <button
                type="button"
                onClick={() => updateSection(section.id, { enabled: !section.enabled })}
                aria-label={section.enabled ? "Bölümü devre dışı bırak" : "Bölümü etkinleştir"}
                className={cn("rounded p-1.5", section.enabled ? "text-primary hover:bg-accent-surface" : "text-text-muted hover:bg-accent-surface")}
                title={section.enabled ? "Etkin — çıktıya dahil ediliyor" : "Devre dışı — çıktıya dahil edilmiyor"}
              >
                {section.enabled ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              <button type="button" onClick={() => moveSection(section.id, -1)} disabled={index === 0} className="rounded p-1.5 text-text-muted hover:bg-accent-surface disabled:opacity-30">
                ↑
              </button>
              <button type="button" onClick={() => moveSection(section.id, 1)} disabled={index === sorted.length - 1} className="rounded p-1.5 text-text-muted hover:bg-accent-surface disabled:opacity-30">
                ↓
              </button>
              {sorted.length > 1 && (
                <button type="button" onClick={() => removeSection(section.id)} aria-label="Bölümü sil" className="rounded p-1.5 text-text-muted hover:bg-accent-surface hover:text-red-600">
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            {schema.fields.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {schema.fields.map((field) => (
                  <button
                    key={field.id}
                    type="button"
                    onClick={() => insertVariable(section.id, field.key)}
                    className="rounded-full border border-dashed border-border px-2 py-0.5 font-mono text-[11px] text-text-muted hover:border-primary hover:text-primary"
                  >
                    {`{{${field.key}}}`}
                  </button>
                ))}
              </div>
            )}

            <textarea
              ref={(el) => {
                if (el) textareaRefs.current.set(section.id, el);
                else textareaRefs.current.delete(section.id);
              }}
              rows={4}
              value={section.content}
              onChange={(event) => updateSection(section.id, { content: event.target.value })}
              placeholder="Örn. {{subject}}, {{art_style}} tarzında, {{lighting}} ışıklandırmayla…"
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-text placeholder:text-text-muted"
            />
            {unknownTokens.length > 0 && (
              <p className="mt-1.5 text-xs text-red-500">
                Bilinmeyen değişken: {unknownTokens.map((key) => `{{${key}}}`).join(", ")} — bu isimde bir alan yok.
              </p>
            )}
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={addSection}>
        <Plus size={14} /> Bölüm ekle
      </Button>
    </div>
  );
}
