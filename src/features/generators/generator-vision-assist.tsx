"use client";

/**
 * "✨ Görselden Alanları Doldur" — Ortak Image Analysis sisteminin
 * `generator_builder` modu. YALNIZCA Generator Builder'ın "Alanlar"
 * adımında render edilir (`generator-builder.tsx`) — Generator'ın gerçek
 * public runtime sayfasında (`/generators/local`, `GeneratorPlayground`)
 * ASLA görünmez; ikisi artık tamamen ayrı bileşenler (eski, undocumented
 * "AI Vision Generator" sürümü bunu `GeneratorPlayground`'ın kendi Form
 * sekmesine gömmüştü, bu yüzden yanlışlıkla runtime sayfasında da
 * görünüyordu — bu görevin düzelttiği tam olarak bu).
 *
 * Görsel yüklenip analiz edildiğinde iki ayrı, birbirinden bağımsız sonuç
 * kümesi gösterilir:
 *   - Eşleşen değerler: AI'nin GERÇEK, mevcut alanlarla (kendi `key`'leri
 *     üzerinden, Edge Function'a gönderilen gerçek liste sayesinde)
 *     eşleştirdiği değerler — kabul edilirse o alanın `defaultValue`'suna
 *     yazılır.
 *   - Önerilen yeni alanlar: mevcut şemanın kapsamadığı, görselde görülen
 *     yeni özellikler — kabul edilirse mevcut "Özel Alan Ekle" sistemiyle
 *     BİREBİR AYNI inşa yoluyla (`generator-builder.tsx`'in
 *     `handleInsertFields`'ı, `FieldCatalogPicker`'ın zaten kullandığı
 *     kod yolu) gerçek `GeneratorField`lere dönüştürülür.
 * Hiçbir şey otomatik/sessizce uygulanmıyor — kullanıcı her satırı
 * işaretleyip/işaretini kaldırıp "Seçilenleri Uygula"ya basmalı.
 */

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Camera, CheckCircle2, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { analyzeImageForGenerator } from "@/lib/supabase/image-analysis";
import { resolveGeneratorVisionMapping, sanitizeSuggestedFields, type CleanSuggestedField } from "@/lib/generator-vision-mapping";
import type { GeneratorMetaInput } from "@/lib/supabase/generators";
import type { GeneratorField } from "@/types";

type Status = "idle" | "loading" | "error";

interface MatchedValueRow {
  key: string;
  label: string;
  display: string;
  value: string | string[];
}

export function GeneratorVisionAssist({
  meta,
  fields,
  onApplyValues,
  onAddFields,
}: {
  meta: Pick<GeneratorMetaInput, "title" | "description" | "category">;
  fields: GeneratorField[];
  onApplyValues: (values: Record<string, string | string[]>) => void;
  onAddFields: (fields: CleanSuggestedField[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [matchedRows, setMatchedRows] = useState<MatchedValueRow[]>([]);
  const [suggestedFields, setSuggestedFields] = useState<CleanSuggestedField[]>([]);
  const [checkedValueKeys, setCheckedValueKeys] = useState<Set<string>>(new Set());
  const [checkedSuggestionLabels, setCheckedSuggestionLabels] = useState<Set<string>>(new Set());
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  function resetResult() {
    setMatchedRows([]);
    setSuggestedFields([]);
    setCheckedValueKeys(new Set());
    setCheckedSuggestionLabels(new Set());
    setAppliedMessage(null);
  }

  function setSelectedFile(next: File | null) {
    setFile(next);
    setErrorMessage(null);
    setStatus("idle");
    resetResult();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(next ? URL.createObjectURL(next) : null);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) setSelectedFile(dropped);
  }

  async function handleAnalyze() {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setStatus("loading");
    setErrorMessage(null);
    resetResult();

    const outcome = await analyzeImageForGenerator(file, {
      generator: { name: meta.title, description: meta.description, category: meta.category },
      fields: fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        options: f.options.map((o) => o.label),
      })),
    });
    busyRef.current = false;

    if (!outcome.ok) {
      setStatus("error");
      setErrorMessage(outcome.error.message);
      return;
    }

    setStatus("idle");
    const mapping = resolveGeneratorVisionMapping(fields, outcome.data);
    const fieldsByKey = new Map(fields.map((f) => [f.key, f]));
    const rows: MatchedValueRow[] = mapping.matchedFieldKeys.map((key) => {
      const field = fieldsByKey.get(key)!;
      const value = mapping.values[key];
      const display = Array.isArray(value)
        ? value.map((v) => field.options.find((o) => o.value === v)?.label ?? v).join(", ")
        : (field.options.find((o) => o.value === value)?.label ?? value);
      return { key, label: field.label, display, value };
    });
    const suggestions = sanitizeSuggestedFields(outcome.data.suggestedFields, fields);

    setMatchedRows(rows);
    setSuggestedFields(suggestions);
    setCheckedValueKeys(new Set(rows.map((r) => r.key)));
    setCheckedSuggestionLabels(new Set(suggestions.map((s) => s.label)));

    if (rows.length === 0 && suggestions.length === 0) {
      setAppliedMessage("Analiz tamamlandı — görselden bu generatorla eşleşen bir değer veya yeni alan önerisi çıkarılamadı.");
    }
  }

  function toggleValueKey(key: string) {
    setCheckedValueKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSuggestionLabel(label: string) {
    setCheckedSuggestionLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function handleApply() {
    const valuesToApply: Record<string, string | string[]> = {};
    for (const row of matchedRows) {
      if (checkedValueKeys.has(row.key)) valuesToApply[row.key] = row.value;
    }
    const fieldsToAdd = suggestedFields.filter((s) => checkedSuggestionLabels.has(s.label));

    if (Object.keys(valuesToApply).length > 0) onApplyValues(valuesToApply);
    if (fieldsToAdd.length > 0) onAddFields(fieldsToAdd);

    const parts: string[] = [];
    if (Object.keys(valuesToApply).length > 0) parts.push(`${Object.keys(valuesToApply).length} alanın değeri güncellendi`);
    if (fieldsToAdd.length > 0) parts.push(`${fieldsToAdd.length} yeni alan eklendi`);
    setAppliedMessage(parts.length > 0 ? `${parts.join(", ")}.` : "Hiçbir şey seçilmedi.");

    // Uygulanan satırları listeden çıkar — aynı sonucu tekrar uygulamak
    // istemesin diye, ama panel açık kalıp yeni bir görsel denenebilsin.
    setMatchedRows((prev) => prev.filter((r) => !checkedValueKeys.has(r.key)));
    setSuggestedFields((prev) => prev.filter((s) => !checkedSuggestionLabels.has(s.label)));
  }

  const hasResult = matchedRows.length > 0 || suggestedFields.length > 0;

  return (
    <div className="mb-4 rounded-md border border-dashed border-border bg-accent-surface/30">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="generator-vision-assist-body"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-text"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="flex-1">Görselden Alanları Doldur</span>
        <span className="text-xs font-normal text-text-muted">{expanded ? "Gizle" : "Göster"}</span>
      </button>

      {expanded && (
        <div id="generator-vision-assist-body" className="space-y-3 border-t border-border/60 px-3 pb-3 pt-3">
          <p className="text-xs text-text-muted">
            Bir referans görsel yükle — yapay zekâ görseli analiz edip mevcut alanlarını doldurmana ve eksik olabilecek
            yeni alanlar önermesine yardımcı olsun. Hiçbir şey senin onayın olmadan uygulanmaz.
          </p>

          {previewUrl ? (
            <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1 text-xs text-text-muted">
                <p className="truncate font-medium text-text">{file?.name}</p>
                <p>{file ? `${(file.size / 1024).toFixed(0)} KB` : null}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                aria-label="Görseli kaldır"
                className="rounded-full p-1 text-text-muted hover:bg-accent-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-center transition-colors",
                dragActive ? "border-primary bg-primary/5" : "border-border bg-surface",
              )}
            >
              <ImagePlus className="h-6 w-6 text-text-muted" aria-hidden="true" />
              <p className="text-xs text-text-muted">Görseli buraya sürükle bırak veya</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  Görsel seç
                </Button>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleInputChange}
                aria-label="Analiz edilecek görseli seç"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" onClick={handleAnalyze} disabled={!file || status === "loading"}>
              {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              {status === "loading" ? "Analiz ediliyor…" : "Analiz Et"}
            </Button>
            {status === "loading" && (
              <span role="status" className="text-xs text-text-muted">
                Bu birkaç saniye sürebilir.
              </span>
            )}
          </div>

          {status === "error" && errorMessage && (
            <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600">
              {errorMessage}
            </p>
          )}

          {hasResult && (
            <div className="space-y-3 rounded-md border border-border bg-surface p-3">
              {matchedRows.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Eşleşen Değerler</p>
                  {matchedRows.map((row) => (
                    <label key={row.key} className="flex cursor-pointer items-start gap-2 text-sm text-text">
                      <input
                        type="checkbox"
                        checked={checkedValueKeys.has(row.key)}
                        onChange={() => toggleValueKey(row.key)}
                        className="mt-0.5 h-4 w-4 rounded border-border text-primary"
                      />
                      <span>
                        <span className="font-medium">{row.label}:</span> {row.display}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {suggestedFields.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Önerilen Yeni Alanlar</p>
                  {suggestedFields.map((suggestion) => (
                    <label key={suggestion.label} className="flex cursor-pointer items-start gap-2 text-sm text-text">
                      <input
                        type="checkbox"
                        checked={checkedSuggestionLabels.has(suggestion.label)}
                        onChange={() => toggleSuggestionLabel(suggestion.label)}
                        className="mt-0.5 h-4 w-4 rounded border-border text-primary"
                      />
                      <span>
                        <span className="font-medium">+ {suggestion.label}</span>{" "}
                        <span className="text-text-muted">
                          ({suggestion.type === "select" ? "seçim" : suggestion.type === "multi_select" ? "çoklu seçim" : suggestion.type === "color" ? "renk" : suggestion.type === "number" ? "sayı" : "metin"}
                          {suggestion.options.length > 0 ? `: ${suggestion.options.map((o) => o.label).join(", ")}` : ""})
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleApply}
                disabled={checkedValueKeys.size === 0 && checkedSuggestionLabels.size === 0}
              >
                Seçilenleri Uygula
              </Button>
            </div>
          )}

          {appliedMessage && (
            <div className="flex items-start gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs text-text">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <p className="flex-1">{appliedMessage}</p>
              <button
                type="button"
                onClick={() => setAppliedMessage(null)}
                aria-label="Bu bilgiyi kapat"
                className="shrink-0 text-text-muted hover:text-text"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
