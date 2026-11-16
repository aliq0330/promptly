"use client";

import { useMemo } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";

const MAX_LINES = 1500;

/** Satır numaralı, salt okunur kod görünümü (Skill dosya gezgini). Uzun satırlar kaydırmadan sarılır; çok uzun dosyada ilk 1500 satır çizilir. */
export function SkillCodeView({ text }: { text: string }) {
  const { t } = useTranslation();
  const lines = useMemo(() => text.replace(/\n$/, "").split("\n"), [text]);
  const shown = lines.length > MAX_LINES ? lines.slice(0, MAX_LINES) : lines;
  return (
    <div className="prompt-text py-3 text-small text-text" data-skill-code="">
      {shown.map((line, index) => (
        <div key={index} className="flex gap-3 px-3 leading-6">
          <span className="w-8 shrink-0 select-none text-right text-text-muted" aria-hidden>
            {index + 1}
          </span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{line || " "}</span>
        </div>
      ))}
      {lines.length > MAX_LINES && <p className="px-3 pt-3 text-caption text-text-muted">{t("skill.pkg.codeTruncated", { count: String(MAX_LINES) })}</p>}
    </div>
  );
}
