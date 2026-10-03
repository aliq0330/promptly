"use client";

import { useState } from "react";
import { Check, Copy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyTextToClipboard } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { ScrollablePrompt } from "@/features/content/scrollable-prompt";

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
  const { t } = useTranslation();
  return (
    <div className="space-y-3 rounded-md border border-border-soft bg-surface-soft p-3.5">
      <p className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
        {negativePrompt !== undefined ? t("generator.positivePrompt") : t("generator.generatedPrompt")}
      </p>
      <CopyableBlock text={prompt} />
      {negativePrompt !== undefined && negativePrompt !== null && negativePrompt.trim().length > 0 && (
        <>
          <p className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("generator.negativePrompt")}</p>
          <CopyableBlock text={negativePrompt} tone="muted" />
        </>
      )}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text"
        >
          <RotateCcw size={12} /> {t("generator.resetToDefaults")}
        </button>
      )}
    </div>
  );
}

function CopyableBlock({ text, tone = "default" }: { text: string; tone?: "default" | "muted" }) {
  const { t } = useTranslation();
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
      <ScrollablePrompt as="pre" className={cnPre(tone)}>
        {text || t("generator.promptWillAppearHere")}
      </ScrollablePrompt>
      <Button type="button" variant="outline" size="sm" onClick={handleCopy} disabled={!text}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? t("common.copied") : t("common.copy")}
      </Button>
    </div>
  );
}

function cnPre(tone: "default" | "muted") {
  return `w-full rounded-md border border-border-soft p-3 ${
    tone === "muted" ? "bg-surface-soft text-text-muted" : "bg-surface text-text"
  }`;
}
