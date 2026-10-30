"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { PromptCard } from "@/features/prompts/prompt-card";
import { studioChipClassName } from "@/features/content/compose-form";
import { countVariableUsages, segmentPromptText } from "@/lib/prompt-variables";
import { effectiveVariableValues } from "@/lib/prompt-variable-types";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { Prompt } from "@/types";
import type { DraftVariable } from "./prompt-text-editor";
import { isWideVariable, VariableField } from "./variable-field";

const LABEL_CLASS = "text-[0.6875rem] font-bold uppercase tracking-[0.07em] text-text-muted";

/**
 * Prompt formunun canlı önizlemesi (docs/history/286-*): sağ sütun (`lg`+) ve telefondaki "Önizleme" sayfası aynı içeriği çizer —
 * akıştaki gerçek kart (`PromptCard`, sahte kimlikle; tıklanamaz), "kopyalanacak metin" (değerler vurgulu) ve "Değerler" (her değişken
 * için tipine uygun girdi). Değerler formda tutulur (`previewValues`); koşullu değişkenler (`effectiveVariableValues`) canlı
 * prompttakiyle aynı mantıkla gizlenir. Kalem/çöp kutusu/"Yeni" düzenleyicinin akışlarını açar (`PromptTextEditorHandle`).
 */
export function PromptLivePreview({
  prompt,
  finalText,
  promptText,
  variables,
  values,
  onValuesChange,
  onEdit,
  onDelete,
  onCreate,
  columns = 2,
  showCreate = true,
}: {
  /** Formdaki alanlardan kurulan taslak prompt (kartın verisi). */
  prompt: Prompt;
  /** Kopyalanacak biçim (ek ayarlar eklenmiş, değişkenler HENÜZ çözülmemiş). */
  finalText: string;
  /** Ham metin: değişkenin kaç yerde kullanıldığını sayar. */
  promptText: string;
  variables: DraftVariable[];
  values: Record<string, string>;
  onValuesChange: (values: Record<string, string>) => void;
  onEdit: (variable: DraftVariable) => void;
  onDelete: (variable: DraftVariable) => void;
  onCreate: () => void;
  /** Telefondaki sayfa tek sütundur. */
  columns?: 1 | 2;
  /** Sayfanın kendi "Yeni değişken" düğmesi varsa (telefondaki önizleme sayfası) başlıktaki çip çizilmez. */
  showCreate?: boolean;
}) {
  const { t } = useTranslation();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const { values: effective, visible } = effectiveVariableValues(variables, values);
  const segments = finalText.trim() ? segmentPromptText(finalText, effective) : [];
  const shown = variables.filter((variable) => visible[variable.name] !== false);

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={LABEL_CLASS}>{t("forms.livePreview")}</span>
        <span className="text-[0.75rem] text-text-muted">{t("studio.inFeed")}</span>
      </div>

      <div data-live-card="" inert className="select-none">
        <PromptCard prompt={prompt} />
      </div>

      <span className={cn(LABEL_CLASS, "mt-0.5")}>{t("studio.copiedText")}</span>
      <div data-live-text="" className="whitespace-pre-wrap break-words rounded-[14px] border border-border bg-surface px-3.5 py-3 font-mono text-[0.78rem] leading-[1.8] text-text-secondary">
        {segments.length > 0 ? (
          segments.map((segment, index) =>
            segment.isVariable ? (
              <mark key={index} className="rounded-[4px] bg-secondary/15 px-[3px] text-text">
                {segment.text}
              </mark>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )
        ) : (
          <span className="text-text-muted">{t("studio.emptyText")}</span>
        )}
      </div>

      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className={LABEL_CLASS}>{t("studio.values")}</span>
        {showCreate && (
          <button type="button" onClick={onCreate} data-testid="live-add-variable" className={studioChipClassName(true)}>
            <Plus size={14} aria-hidden /> {t("studio.newShort")}
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-border-strong px-3.5 py-3 text-[0.78rem] text-text-muted">{t("studio.noValues")}</p>
      ) : (
        <div data-live-values="" className={cn("grid gap-2", columns === 2 ? "grid-cols-2" : "grid-cols-1")}>
          {shown.map((variable) => {
            const usage = countVariableUsages(promptText, variable.name);
            const confirming = confirmingId === variable.tempId;
            return (
              <div
                key={variable.tempId}
                data-live-variable={variable.name}
                className={cn("flex min-w-0 flex-col gap-1.5 rounded-[14px] border border-border bg-surface px-[11px] py-[9px]", columns === 2 && isWideVariable(variable) && "col-span-2")}
              >
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 truncate font-mono text-[0.78rem] font-medium text-primary">{`{${variable.name}}`}</span>
                  <span className="ml-auto shrink-0 whitespace-nowrap text-[0.6875rem] text-text-muted">{usage === 0 ? t("studio.unused") : t("studio.usedIn", { count: usage })}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingId(null);
                      onEdit(variable);
                    }}
                    aria-label={t("variable.editAriaLabel", { name: variable.name })}
                    className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
                  >
                    <Pencil size={13} aria-hidden />
                  </button>
                  {confirming ? (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingId(null);
                        onDelete(variable);
                      }}
                      className="shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-[0.6875rem] font-semibold text-danger hover:bg-danger/20"
                    >
                      {usage > 0 ? t("variable.deleteWithUsagesConfirm", { count: usage }) : t("variable.deleteConfirm")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(variable.tempId)}
                      aria-label={t("variable.deleteAriaLabel", { name: variable.name })}
                      className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={13} aria-hidden />
                    </button>
                  )}
                </div>
                <VariableField
                  hideLabel
                  variable={{ ...variable, id: `live-${variable.tempId}` }}
                  value={values[variable.name] ?? variable.defaultValue}
                  onChange={(next) => onValuesChange({ ...values, [variable.name]: next })}
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
