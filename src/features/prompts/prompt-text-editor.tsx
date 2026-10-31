"use client";

import { useRef, useState } from "react";
import { Braces, Maximize2 } from "lucide-react";
import { parseDoc } from "@/lib/prompt-doc";
import { extractVariableTokenNames } from "@/lib/prompt-variables";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { PromptVariableSpec } from "@/types";
import { PromptFullscreenEditor } from "./prompt-fullscreen-editor";

/** A not-yet-persisted variable living only in this form's own state — gets a real DB row (with a real `id`) only once the prompt itself is created/updated (see `replaceVariablesForPrompt`, `src/lib/supabase/prompt-variables.ts`). */
export interface DraftVariable extends PromptVariableSpec {
  tempId: string;
  name: string;
  defaultValue: string;
  description: string;
}

/**
 * Formdaki prompt metni alanı (docs/history/288-*, kullanıcının seçtiği mockup): formda yalnız TEK kart — metin (`{değişken}`ler çip olarak) +
 * değişken sayısı + "Tam ekran yaz". Karta dokunmak yazma katmanını açar (`PromptFullscreenEditor`): değişken ekleme/dönüştürme/düzenleme,
 * önizleme, hazır ayar/ek alan ve "Görselden yardım" hepsi orada. Altta kalan şey ham düz metindir (`{ad}` jetonlu, `prompts.prompt_text`
 * ile aynı biçim) ve değişken satırları `prompt_variables`'a yazılır — kaydet/yeniden aç sonrası yapı birebir korunur. Generator şablonlarıyla
 * hiçbir veri modeli paylaşılmaz; yalnızca `PromptDocEditor` altyapısı ortaktır.
 */
export function PromptTextEditor({
  id = "prompt-text",
  value,
  onChange,
  variables,
  onVariablesChange,
  placeholder,
  className,
  visionFile,
  extraCount = 0,
  onOpenExtra,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  variables: DraftVariable[];
  onVariablesChange: (variables: DraftVariable[]) => void;
  placeholder?: string;
  className?: string;
  /** The image the author already picked in the form (feeds "Görselden yardım" without a second upload). */
  visionFile?: File | null;
  /** Uygulanmış hazır ayar/ek alan sayısı (tam ekrandaki "Ek alanlar" düğmesinde rozet). */
  extraCount?: number;
  /** Tam ekrandaki "Hazır ayarlar" / "Ek alanlar" düğmeleri: formdaki hazır ayar panelini ilgili sekmede açar. */
  onOpenExtra: (tab: "community" | "fields") => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLButtonElement>(null);
  const definedNames = new Set(variables.map((variable) => variable.name));
  const orphanTokens = extractVariableTokenNames(value).filter((name) => !definedNames.has(name));

  function close() {
    setOpen(false);
    // Odak karta döner (klavye/ekran okuyucu kullanıcısı kaldığı yeri bulur).
    window.setTimeout(() => cardRef.current?.focus({ preventScroll: true }), 0);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <button
        ref={cardRef}
        type="button"
        data-prompt-card=""
        aria-haspopup="dialog"
        aria-label={t("promptEdit.cardAria")}
        onClick={() => setOpen(true)}
        className="block w-full rounded-xl border border-border-strong bg-surface p-3.5 text-left shadow-xs transition-colors duration-200 ease-soft hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="line-clamp-6 min-h-[3.5rem] whitespace-pre-wrap break-words font-mono text-small leading-[1.85] text-text">
          {value ? (
            parseDoc(value).map((segment) =>
              segment.type === "token" ? (
                <span
                  key={`${segment.start}-t`}
                  className={cn("rounded-[5px] px-1.5 py-px text-[0.9em]", definedNames.has(segment.name) ? "bg-primary-soft text-primary" : "bg-warning/15 text-warning")}
                >
                  {`{${segment.name}}`}
                </span>
              ) : (
                <span key={`${segment.start}-x`}>{segment.text}</span>
              ),
            )
          ) : (
            <span className="text-text-muted">{placeholder}</span>
          )}
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-border-soft pt-2.5 text-caption text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Braces size={14} aria-hidden /> {t("promptEdit.cardVariables", { count: variables.length })}
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
            <Maximize2 size={14} aria-hidden /> {t("promptEdit.cardFullscreen")}
          </span>
        </div>
      </button>
      <p className="text-caption text-text-muted">{t("promptEdit.cardHint")}</p>
      {orphanTokens.length > 0 && (
        <p className="text-caption text-warning">{t("variable.orphanTokensWarning", { tokens: orphanTokens.map((name) => `{${name}}`).join(", ") })}</p>
      )}

      {open && (
        <PromptFullscreenEditor
          id={id}
          value={value}
          onChange={onChange}
          variables={variables}
          onVariablesChange={onVariablesChange}
          placeholder={placeholder}
          visionFile={visionFile}
          extraCount={extraCount}
          onOpenExtra={onOpenExtra}
          onClose={close}
        />
      )}
    </div>
  );
}
