"use client";

import { useState } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyTextToClipboard } from "@/lib/utils";
import type { GeneratorOutput } from "@/types";

/**
 * The real, structured JSON output panel (§14/§19 of the JSON Output
 * Engine architecture correction) — a pretty-printed
 * `JSON.stringify(output, null, 2)` of `buildGeneratorOutput()`'s result,
 * plus a real "JSON'u Kopyala" button. This IS the generator's real,
 * primary output (§1) — `prompt`/`negative_prompt` are just two properties
 * among however many the creator's own `jsonPath`s define; nothing here
 * assumes any other top-level key exists.
 */
export function GeneratorJsonPanel({ output, onReset }: { output: GeneratorOutput; onReset?: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(output, null, 2);

  async function handleCopy() {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">JSON Çıktısı</p>
      <pre className="max-h-96 w-full overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface p-3 font-mono text-xs text-text">
        {text}
      </pre>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Kopyalandı" : "JSON'u Kopyala"}
        </Button>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text"
          >
            <RotateCcw size={12} /> Varsayılanlara dön
          </button>
        )}
      </div>
    </div>
  );
}
