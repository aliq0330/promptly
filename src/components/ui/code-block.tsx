"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { copyTextToClipboard } from "@/lib/utils";

/** A copyable mono block. The copy button is the only control; the text stays selectable. */
export function CodeBlock({ text, label }: { text: string; label: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (await copyTextToClipboard(text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="relative rounded-lg border border-border-soft bg-surface-soft">
      <pre className="prompt-text overflow-x-auto whitespace-pre-wrap break-all px-3 py-3 pr-12 text-small text-text">{text}</pre>
      <button
        type="button"
        onClick={copy}
        aria-label={`${t("dev.copy")}: ${label}`}
        data-dev-copy=""
        className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface hover:text-text"
      >
        {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
        <span className="sr-only" aria-live="polite">
          {copied ? t("dev.copied") : ""}
        </span>
      </button>
    </div>
  );
}
