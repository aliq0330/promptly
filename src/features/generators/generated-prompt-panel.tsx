"use client";

import { useState } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyTextToClipboard } from "@/lib/utils";

/**
 * The real "Generated Prompt" block (§17/§22) — shown identically in the
 * builder's Live Preview and the real generator runtime. Positive/negative
 * are two independent, separately-copyable blocks (§30) when the generator
 * has negative-prompt support enabled; otherwise just the one.
 */
export function GeneratedPromptPanel({
  prompt,
  negativePrompt,
  onReset,
}: {
  prompt: string;
  negativePrompt?: string | null;
  onReset?: () => void;
}) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {negativePrompt !== undefined ? "Positive Prompt" : "Generated Prompt"}
      </p>
      <CopyableBlock text={prompt} />
      {negativePrompt !== undefined && negativePrompt !== null && negativePrompt.trim().length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Negative Prompt</p>
          <CopyableBlock text={negativePrompt} tone="muted" />
        </>
      )}
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
  );
}

function CopyableBlock({ text, tone = "default" }: { text: string; tone?: "default" | "muted" }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="space-y-2">
      <pre
        className={cnPre(tone)}
      >
        {text || "Alanları doldurdukça prompt burada oluşacak."}
      </pre>
      <Button type="button" variant="outline" size="sm" onClick={handleCopy} disabled={!text}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Kopyalandı" : "Kopyala"}
      </Button>
    </div>
  );
}

function cnPre(tone: "default" | "muted") {
  return `w-full whitespace-pre-wrap rounded-md border border-border p-3 font-mono text-sm ${
    tone === "muted" ? "bg-accent-surface/30 text-text-muted" : "bg-surface text-text"
  }`;
}
