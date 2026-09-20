"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { fetchPromptById } from "@/lib/supabase/prompts";
import { diffPromptContent, promptToComparable, type FieldDiff } from "./prompt-diff";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Prompt } from "@/types";

export type ViewMode = "side-by-side" | "unified" | "changes-only";

/**
 * "Farkları Karşılaştır" (Aşama 25/26) — remix karşılaştırması: iki farklı
 * içerik kimliği arasında. Yalnızca bu ekranın açılması/görünüm modu
 * değişimi hiçbir bildirim/durum değişikliği üretmez (Aşama 32) — salt
 * okunur bir inceleme. `onRequestMerge` verilirse (yalnızca kullanıcı
 * kaynağın sahibiyse ve kaynak henüz kabul edilmiş bir merge'e bağlı
 * değilse) "Bu katkıyı merge talebi olarak gönder" görünür — bu buton
 * doğrudan merge YAPMAZ, yalnızca merge talebi oluşturma modalını açar.
 */
export function PromptDiffModal({
  subjectId,
  compareId,
  compareLabel,
  onClose,
  onRequestMerge,
}: {
  /** The remix being viewed (right-hand side in side-by-side). */
  subjectId: string;
  /** The direct source or root original being compared against (left-hand side). */
  compareId: string;
  compareLabel: "Doğrudan kaynak" | "Kök orijinal";
  onClose: () => void;
  onRequestMerge?: () => void;
}) {
  const [subject, setSubject] = useState<Prompt | null | undefined>(undefined);
  const [compare, setCompare] = useState<Prompt | null | undefined>(undefined);
  const [mode, setMode] = useState<ViewMode>("side-by-side");

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting to the loading state before fetching the newly-selected pair to compare
    setSubject(undefined);
    setCompare(undefined);
    fetchPromptById(subjectId).then((result) => {
      if (!cancelled) setSubject(result);
    });
    fetchPromptById(compareId).then((result) => {
      if (!cancelled) setCompare(result);
    });
    return () => {
      cancelled = true;
    };
  }, [subjectId, compareId]);

  const loading = subject === undefined || compare === undefined;
  const fields = subject && compare ? diffPromptContent(promptToComparable(compare), promptToComparable(subject)) : [];
  const supportedTypes = new Set(["text", "code"]);
  const unsupported = subject && !supportedTypes.has(subject.contentType) && subject.contentType === "image";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="diff-modal-title">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border border-border bg-surface shadow-lg">
        <div className="flex items-start justify-between gap-2 border-b border-border p-4">
          <div className="min-w-0">
            <h2 id="diff-modal-title" className="truncate text-base font-semibold text-text">
              {subject && compare ? `${subject.title || "Bu içerik"} ile ${compare.title || compareLabel} arasındaki farklar` : "Farkları karşılaştır"}
            </h2>
            <p className="text-xs text-text-muted">
              Karşılaştırma türü: <span className="font-medium text-text">{compareLabel}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="shrink-0 rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="py-10 text-center text-sm text-text-muted">Yükleniyor…</p>
          ) : !subject || !compare ? (
            <p className="py-10 text-center text-sm text-text-muted">
              {compareLabel === "Doğrudan kaynak" ? "Doğrudan kaynak" : "Kök orijinal"} artık mevcut değil ya da erişemiyorsun.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-4 text-xs text-text-muted">
                  <span className="flex items-center gap-1.5">
                    <Avatar src={compare.author.avatarUrl} alt={compare.author.displayName} size={20} />
                    {compare.author.displayName} · {formatRelativeTime(compare.createdAt)}
                  </span>
                  <span aria-hidden>→</span>
                  <span className="flex items-center gap-1.5">
                    <Avatar src={subject.author.avatarUrl} alt={subject.author.displayName} size={20} />
                    {subject.author.displayName} · {formatRelativeTime(subject.createdAt)}
                  </span>
                </div>
                <div className="flex gap-1 rounded-md border border-border p-0.5 text-xs">
                  {([
                    ["side-by-side", "Yan yana"],
                    ["unified", "Birleşik"],
                    ["changes-only", "Yalnızca değişiklikler"],
                  ] as [ViewMode, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setMode(key)}
                      aria-pressed={mode === key}
                      className={cn("rounded-sm px-2 py-1", mode === key ? "bg-primary text-primary-foreground" : "text-text-muted hover:bg-accent-surface")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {unsupported ? (
                <p className="rounded-md bg-accent-surface/60 px-3 py-3 text-sm text-text-muted">
                  Bu içerik türü için fark karşılaştırması desteklenmiyor (yalnızca metin/kod alanları karşılaştırılabilir; görsel çıktının kendisi karşılaştırılmıyor).
                </p>
              ) : (
                <div className="space-y-4">
                  {fields.map((field) => (
                    <FieldDiffBlock key={field.field} field={field} mode={mode} />
                  ))}
                </div>
              )}

              {onRequestMerge && (
                <div className="border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={onRequestMerge}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Bu katkıyı merge talebi olarak gönder →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FieldDiffBlock({ field, mode }: { field: FieldDiff; mode: ViewMode }) {
  if (mode === "changes-only" && !field.changed) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{field.label}</p>
        {!field.changed && <Badge variant="outline">Değişmedi</Badge>}
      </div>
      {mode === "unified" || mode === "changes-only" ? (
        <p className="rounded-md border border-border bg-background p-2.5 text-sm leading-relaxed">
          {field.ops.map((op, index) => (
            <span
              key={index}
              className={cn(
                op.type === "insert" && "rounded-sm bg-green-500/15 text-green-700 dark:text-green-400",
                op.type === "delete" && "rounded-sm bg-red-500/15 text-red-600 line-through dark:text-red-400",
              )}
            >
              {op.text}
            </span>
          ))}
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <p className="rounded-md border border-border bg-background p-2.5 text-sm leading-relaxed">
            {field.ops
              .filter((op) => op.type !== "insert")
              .map((op, index) => (
                <span key={index} className={cn(op.type === "delete" && "rounded-sm bg-red-500/15 text-red-600 line-through dark:text-red-400")}>
                  {op.text}
                </span>
              ))}
          </p>
          <p className="rounded-md border border-border bg-background p-2.5 text-sm leading-relaxed">
            {field.ops
              .filter((op) => op.type !== "delete")
              .map((op, index) => (
                <span key={index} className={cn(op.type === "insert" && "rounded-sm bg-green-500/15 text-green-700 dark:text-green-400")}>
                  {op.text}
                </span>
              ))}
          </p>
        </div>
      )}
    </div>
  );
}
