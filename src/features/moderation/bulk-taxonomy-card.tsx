"use client";

import { useRef, useState } from "react";
import { Download, Loader2, Shapes, Undo2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { downloadTextFile } from "@/features/exchange/download-file";
import { ADMIN_IMPORT_LIMITS, detectCategorizedPromptsChat, parseCategorizedPromptsChat, planCategorization, type CategorizedParseResult, type TaxonomyPlan } from "@/lib/exchange";
import { contentTypeLabelKey, findCategory, taxonomyLabel } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { ContentTypeId } from "@/lib/taxonomy-seed";
import { applyTaxonomyChanges, fetchOwnTaxonomyRows, undoTaxonomyChanges, type TaxonomyApplyOutcome } from "@/lib/supabase/admin-bulk-taxonomy";
import type { TaxonomyRow } from "@/lib/exchange";

type Phase = "idle" | "loading" | "running";
type Problem = "not_categorized" | "too_large" | "read_failed" | "no_rows";
type Run = { kind: "apply" | "undo"; result: TaxonomyApplyOutcome };

const TYPES: ContentTypeId[] = ["text", "image", "audio", "video"];
const CATEGORY_ROWS = 12;

/**
 * Moderatör aracı: kategorili prompts.chat dosyasındaki Tür / Kategori / Alt kategori bilgisini KENDİ promptlarına yazar (docs/history/260-*).
 * Eşleştirme başlığa göredir ve tarayıcıda yapılır; önce ÖNİZLEME (kaç prompt hangi türe/kategoriye gidecek, bulunamayan/belirsiz olanlar), sonra
 * "Uygula". Yazım yalnız `admin_bulk_set_prompt_taxonomy` RPC'sinden geçer (100'erli, her parça atomik, yalnız kendi promptların). Varsayılan olarak
 * kategorisi dolu promptlar ezilmez. Uygulamadan önce eski değerlerin yedeği indirilebilir; uygulanan her şey "Geri al" ile eski türe/boş kategoriye döner.
 */
export function BulkTaxonomyCard() {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const stopRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [parsed, setParsed] = useState<CategorizedParseResult | null>(null);
  const [rows, setRows] = useState<TaxonomyRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<TaxonomyApplyOutcome | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [applied, setApplied] = useState<TaxonomyPlan["changes"] | null>(null);

  const busy = phase !== "idle";
  const plan: TaxonomyPlan | null = parsed && rows ? planCategorization(parsed.entries, rows, { overwrite }) : null;

  function typeName(type: ContentTypeId): string {
    return taxonomyLabel(contentTypeLabelKey(type), language);
  }
  function categoryName(type: ContentTypeId, slug: string): string {
    const category = findCategory(type, slug);
    return category ? taxonomyLabel(category.labelKey, language) : slug;
  }

  function reset() {
    setProblem(null);
    setParsed(null);
    setRows(null);
    setTruncated(false);
    setConfirming(false);
    setProgress(null);
    setRun(null);
    setApplied(null);
  }

  async function loadFile(file: File) {
    if (!user) return;
    reset();
    setFileName(file.name);
    setPhase("loading");
    try {
      if (file.size > ADMIN_IMPORT_LIMITS.fileBytes) return setProblem("too_large");
      const text = await file.text();
      if (!detectCategorizedPromptsChat(text)) return setProblem("not_categorized");
      const result = parseCategorizedPromptsChat(text);
      if (result.uncategorizedFile || result.entries.length === 0) return setProblem("not_categorized");
      const own = await fetchOwnTaxonomyRows(user.id);
      if (own.rows.length === 0) return setProblem("no_rows");
      setParsed(result);
      setRows(own.rows);
      setTruncated(own.truncated);
    } catch {
      setProblem("read_failed");
    } finally {
      setPhase("idle");
    }
  }

  async function refreshRows() {
    if (!user) return;
    try {
      const own = await fetchOwnTaxonomyRows(user.id);
      setRows(own.rows);
      setTruncated(own.truncated);
    } catch {
      setProblem("read_failed");
    }
  }

  function backupName(): string {
    return `promptly-kategori-yedek-${new Date().toISOString().slice(0, 10)}.json`;
  }

  function downloadBackup(changes: TaxonomyPlan["changes"]) {
    const body = changes.map((change) => ({ id: change.id, title: change.title, before: change.previous, after: { contentType: change.type, category: change.category, subcategory: change.subcategory } }));
    downloadTextFile(backupName(), JSON.stringify(body, null, 2), "application/json");
  }

  async function execute(kind: "apply" | "undo") {
    const changes = kind === "apply" ? plan?.changes : applied;
    if (!changes || changes.length === 0 || busy) return;
    stopRef.current = false;
    setConfirming(false);
    setRun(null);
    setPhase("running");
    setProgress({ done: 0, total: changes.length, affected: 0, skipped: 0, stoppedAt: null, error: null, invalid: 0, subcategoryDropped: 0, alreadyCategorized: 0 });
    // Yedek ayrı bir düğmedir ("Yedeği indir"): iOS Safari indirme sırasında devam eden isteği keserdi ("Load failed"), bu yüzden yazımla aynı anda indirilmez.
    if (kind === "apply") setApplied(changes);
    const options = { onProgress: setProgress, shouldStop: () => stopRef.current };
    const result = kind === "apply" ? await applyTaxonomyChanges(changes, overwrite, options) : await undoTaxonomyChanges(changes, options);
    setRun({ kind, result });
    setProgress(null);
    setPhase("idle");
    if (kind === "undo") setApplied(null);
    await refreshRows();
  }

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const videoAudio = plan ? plan.byType.video + plan.byType.audio : 0;
  const problemKey = {
    not_categorized: "exchange.taxonomy.notCategorized",
    too_large: "exchange.taxonomy.tooLarge",
    read_failed: "exchange.taxonomy.readFailed",
    no_rows: "exchange.taxonomy.noRows",
  } as const;

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4" data-testid="bulk-taxonomy">
      <div className="flex items-start gap-3">
        <Shapes size={18} className="mt-0.5 shrink-0 text-text-muted" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text">{t("exchange.taxonomy.title")}</h2>
          <p className="text-small text-text-secondary">{t("exchange.taxonomy.hint")}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-small text-text-secondary">
        <input
          ref={fileInput}
          type="file"
          accept=".md,.markdown"
          className="sr-only"
          data-testid="taxonomy-file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void loadFile(file);
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
          {phase === "loading" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {phase === "loading" ? t("exchange.taxonomy.reading") : t("exchange.taxonomy.chooseFile")}
        </Button>
        {fileName && <span className="min-w-0 truncate">{fileName}</span>}
      </div>

      {problem && (
        <p role="alert" className="text-small text-danger" data-testid="taxonomy-problem">
          {t(problemKey[problem])}
        </p>
      )}

      {parsed && plan && (
        <div className="space-y-3" data-testid="taxonomy-preview">
          <p className="text-small font-semibold text-text" data-testid="taxonomy-summary">
            {t("exchange.taxonomy.summary", { total: parsed.total, valid: parsed.entries.length, matched: plan.changes.length + plan.unchanged + plan.alreadyCategorized, write: plan.changes.length })}
          </p>
          {truncated && <p className="text-caption text-warning">{t("exchange.taxonomy.truncated")}</p>}

          <div className="flex flex-wrap gap-2">
            {TYPES.map((type) => (
              <span key={type} className="rounded-full border border-border-soft bg-surface-soft px-3 py-1 text-caption text-text-secondary" data-testid={`taxonomy-type-${type}`}>
                {typeName(type)}: <strong className="text-text">{plan.byType[type]}</strong>
              </span>
            ))}
          </div>

          {plan.byCategory.length > 0 && (
            <details className="text-caption text-text-secondary">
              <summary className="cursor-pointer">{t("exchange.taxonomy.byCategory", { count: plan.byCategory.length })}</summary>
              <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                {plan.byCategory.map((item) => (
                  <li key={`${item.type}:${item.category}`} className="flex justify-between gap-2">
                    <span className="truncate">{typeName(item.type)} – {categoryName(item.type, item.category)}</span>
                    <span className="shrink-0 font-semibold text-text">{item.count}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <ul className="space-y-0.5 text-caption text-text-secondary">
            {plan.unchanged > 0 && <li>{t("exchange.taxonomy.unchanged", { count: plan.unchanged })}</li>}
            {plan.alreadyCategorized > 0 && <li data-testid="taxonomy-already">{t("exchange.taxonomy.already", { count: plan.alreadyCategorized })}</li>}
            {plan.notFound.length > 0 && <li data-testid="taxonomy-notfound">{t("exchange.taxonomy.notFound", { count: plan.notFound.length })}</li>}
            {plan.ambiguous.length > 0 && <li data-testid="taxonomy-ambiguous">{t("exchange.taxonomy.ambiguous", { count: plan.ambiguous.length })}</li>}
            {parsed.problems.length > 0 && <li className="text-warning">{t("exchange.taxonomy.problems", { count: parsed.problems.length })}</li>}
            {parsed.subcategoryUnknown.length > 0 && <li>{t("exchange.taxonomy.subUnknown", { count: parsed.subcategoryUnknown.length })}</li>}
          </ul>
          {(plan.notFound.length > 0 || plan.ambiguous.length > 0 || parsed.problems.length > 0) && (
            <details className="text-caption text-text-secondary">
              <summary className="cursor-pointer">{t("exchange.taxonomy.showSkipped")}</summary>
              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
                {parsed.problems.slice(0, CATEGORY_ROWS * 2).map((item) => (
                  <li key={`p${item.index}`}>#{item.index} {item.title} — {item.value}</li>
                ))}
                {plan.ambiguous.slice(0, CATEGORY_ROWS * 2).map((item) => (
                  <li key={`a${item.title}`}>{item.title} ({item.entries}/{item.rows})</li>
                ))}
                {plan.notFound.slice(0, CATEGORY_ROWS * 2).map((item) => (
                  <li key={`n${item.title}`}>{item.title}</li>
                ))}
              </ul>
            </details>
          )}

          {videoAudio > 0 && (
            <p className="text-caption text-text-muted" data-testid="taxonomy-odak-note">
              {t("exchange.taxonomy.odakNote", { count: videoAudio })}
            </p>
          )}

          <label className="flex cursor-pointer items-start gap-2 text-small text-text">
            <input type="checkbox" checked={overwrite} onChange={(event) => { setOverwrite(event.target.checked); setConfirming(false); }} disabled={busy} className="mt-1 accent-primary" data-testid="taxonomy-overwrite" />
            <span>
              <span className="block font-semibold">{t("exchange.taxonomy.overwrite")}</span>
              <span className="block text-caption text-text-secondary">{t("exchange.taxonomy.overwriteHint")}</span>
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            {!confirming ? (
              <Button type="button" size="sm" onClick={() => setConfirming(true)} disabled={busy || plan.changes.length === 0} data-testid="taxonomy-apply">
                {t("exchange.taxonomy.apply", { count: plan.changes.length })}
              </Button>
            ) : (
              <>
                <span className="text-small text-text">{t("exchange.taxonomy.confirm", { count: plan.changes.length })}</span>
                <Button type="button" size="sm" onClick={() => void execute("apply")} disabled={busy} data-testid="taxonomy-confirm">
                  {t("exchange.taxonomy.confirmYes")}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
                  {t("common.cancel")}
                </Button>
              </>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => downloadBackup(plan.changes)} disabled={busy || plan.changes.length === 0} data-testid="taxonomy-backup">
              <Download size={14} />
              {t("exchange.taxonomy.backup")}
            </Button>
            {phase === "running" && (
              <Button type="button" size="sm" variant="ghost" onClick={() => (stopRef.current = true)} data-testid="taxonomy-stop">
                {t("exchange.admin.stop")}
              </Button>
            )}
          </div>
        </div>
      )}

      {progress && (
        <div className="space-y-1" data-testid="taxonomy-progress">
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 w-full overflow-hidden rounded-full bg-surface-soft">
            <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-caption text-text-secondary">{t("exchange.admin.progress", { done: progress.done, total: progress.total })}</p>
        </div>
      )}

      {run && (
        <div className="space-y-1 text-small" data-testid="taxonomy-outcome">
          <p className="text-text">
            {t(run.kind === "apply" ? "exchange.taxonomy.applyDone" : "exchange.taxonomy.undoDone", { affected: run.result.affected, skipped: run.result.skipped })}
          </p>
          {run.result.invalid > 0 && <p className="text-caption text-danger">{t("exchange.taxonomy.invalid", { count: run.result.invalid })}</p>}
          {run.result.subcategoryDropped > 0 && <p className="text-caption text-text-muted">{t("exchange.taxonomy.subDropped", { count: run.result.subcategoryDropped })}</p>}
          {run.result.stoppedAt !== null && (
            <p className="text-warning" data-testid="taxonomy-partial">
              {t("exchange.admin.partial", { done: run.result.done, total: run.result.total })}
            </p>
          )}
          {run.result.error && (
            <p role="alert" className="text-danger" data-testid="taxonomy-error">
              {run.result.error}
            </p>
          )}
          {run.kind === "apply" && applied && applied.length > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={() => void execute("undo")} disabled={busy} data-testid="taxonomy-undo">
              <Undo2 size={14} />
              {t("exchange.taxonomy.undo", { count: applied.length })}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
