"use client";

import { useMemo, useRef, useState } from "react";
import { Braces, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  convertTemplateVariables,
  scanTemplateVariables,
  type TemplateConvertOutcome,
  type TemplateScan,
  type TemplateScope,
} from "@/lib/supabase/admin-template-variables";

const SHOW_STEP = 100;
/** Liste satırında en çok bu kadar değişken çipi gösterilir (gerisi "+N"). */
const CHIPS_SHOWN = 4;

/**
 * Moderatör aracı: `${Ad:Varsayılan}` / `${Ad}` şablon sözdizimini gerçek değişkene çevirir (docs/history/253-*). Önce tarar ve her promptun
 * ne olacağını listeler (önizleme yazmaz); seçilenler `admin_convert_template_variables` ile dönüşür. Varsayılan kapsam YALNIZ kendi promptların;
 * "Tüm promptlar" ayrı, uyarılı bir seçenektir ve onay ister (başkasının metnini değiştirir; yazara bildirim gitmez, sürüm geçmişinde kalır).
 */
export function TemplateVariablesCard() {
  const { t } = useTranslation();
  const stopRef = useRef(false);
  const [scope, setScope] = useState<TemplateScope>("own");
  const [scan, setScan] = useState<TemplateScan | null>(null);
  const [scannedScope, setScannedScope] = useState<TemplateScope>("own");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(SHOW_STEP);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<TemplateConvertOutcome | null>(null);
  const [outcome, setOutcome] = useState<TemplateConvertOutcome | null>(null);

  const busy = scanning || running;
  const items = useMemo(() => scan?.items ?? [], [scan]);
  const variableTotal = useMemo(() => items.reduce((sum, item) => sum + item.variables.filter((v) => !v.existing).length, 0), [items]);
  const selectedIds = useMemo(() => items.filter((item) => selected.has(item.id)).map((item) => item.id), [items, selected]);

  async function runScan(keepOutcome = false) {
    setScanning(true);
    setScanError(false);
    setConfirming(false);
    if (!keepOutcome) setOutcome(null);
    try {
      const result = await scanTemplateVariables(scope);
      setScan(result);
      setScannedScope(scope);
      setSelected(new Set(result.items.map((item) => item.id)));
      setShown(SHOW_STEP);
    } catch {
      setScanError(true);
    } finally {
      setScanning(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function start() {
    if (selectedIds.length === 0 || busy) return;
    if (scannedScope === "all" && !confirming) {
      setConfirming(true);
      return;
    }
    void execute();
  }

  async function execute() {
    stopRef.current = false;
    setConfirming(false);
    setOutcome(null);
    setRunning(true);
    setProgress({ done: 0, total: selectedIds.length, affected: 0, skipped: 0, stoppedAt: null, error: null, variables: 0, conflicts: 0 });
    const result = await convertTemplateVariables(selectedIds, scannedScope, { onProgress: setProgress, shouldStop: () => stopRef.current });
    setOutcome(result);
    setProgress(null);
    setRunning(false);
    // Dönüşenler artık listede olmamalı: yeniden tara (başarılı sonuç mesajı kalır).
    setScanning(true);
    try {
      const fresh = await scanTemplateVariables(scannedScope);
      setScan(fresh);
      setSelected(new Set(fresh.items.map((item) => item.id)));
      setShown(SHOW_STEP);
    } catch {
      setScanError(true);
    } finally {
      setScanning(false);
    }
  }

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4" data-testid="template-vars">
      <div className="flex items-start gap-3">
        <Braces size={18} className="mt-0.5 shrink-0 text-text-muted" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text">{t("exchange.template.title")}</h2>
          <p className="text-small text-text-secondary">{t("exchange.template.hint")}</p>
        </div>
      </div>

      <fieldset className="space-y-1.5" disabled={busy}>
        <legend className="text-label font-semibold text-text">{t("exchange.template.scopeLabel")}</legend>
        <label className="flex cursor-pointer items-start gap-2 text-small text-text">
          <input type="radio" name="template-scope" checked={scope === "own"} onChange={() => setScope("own")} className="mt-1 accent-primary" data-testid="template-scope-own" />
          <span>
            <span className="block font-semibold">{t("exchange.template.scopeOwn")}</span>
            <span className="block text-caption text-text-secondary">{t("exchange.template.scopeOwnHint")}</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-small text-text">
          <input type="radio" name="template-scope" checked={scope === "all"} onChange={() => setScope("all")} className="mt-1 accent-primary" data-testid="template-scope-all" />
          <span>
            <span className="block font-semibold">{t("exchange.template.scopeAll")}</span>
            <span className="block text-caption text-warning">{t("exchange.template.scopeAllHint")}</span>
          </span>
        </label>
      </fieldset>

      <Button type="button" size="sm" variant="outline" onClick={() => void runScan()} disabled={busy} data-testid="template-scan">
        {scanning && <Loader2 size={14} className="animate-spin" />}
        {scanning ? t("exchange.template.scanning") : t("exchange.template.scan")}
      </Button>

      {scanError && (
        <p role="alert" className="text-small text-danger" data-testid="template-scan-error">
          {t("exchange.template.scanFailed")}
        </p>
      )}

      {scan && (
        <div className="space-y-3">
          <p className="text-small font-semibold text-text" data-testid="template-summary">
            {scan.total === 0
              ? t("exchange.template.none")
              : t("exchange.template.summary", { prompts: scan.total, variables: variableTotal })}
          </p>
          {scan.total > items.length && <p className="text-caption text-warning">{t("exchange.template.truncated", { shown: items.length, total: scan.total })}</p>}

          {items.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setSelected(new Set(items.map((item) => item.id)))} data-testid="template-select-all">
                  {t("exchange.template.selectAll", { count: items.length })}
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={busy || selected.size === 0} onClick={() => setSelected(new Set())} data-testid="template-clear">
                  {t("exchange.manage.clear")}
                </Button>
              </div>

              <ul className="max-h-96 divide-y divide-border-soft overflow-y-auto rounded-lg border border-border-soft" data-testid="template-list">
                {items.slice(0, shown).map((item) => (
                  <li key={item.id} data-testid="template-row">
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2">
                      <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} disabled={busy} className="mt-1 accent-primary" />
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-small text-text">{item.title}</span>
                          {scannedScope === "all" && item.author && <span className="shrink-0 text-caption text-text-muted">@{item.author}</span>}
                          <span className={`shrink-0 text-caption font-semibold ${item.status === "draft" ? "text-text-muted" : "text-success"}`}>
                            {t(item.status === "draft" ? "exchange.manage.statusDraft" : "exchange.template.published")}
                          </span>
                        </span>
                        <span className="flex flex-wrap gap-1">
                          {item.variables.slice(0, CHIPS_SHOWN).map((variable) => (
                            <span
                              key={variable.name}
                              className={`max-w-full truncate rounded-md px-1.5 py-0.5 font-mono text-caption ${variable.existing ? "bg-surface-soft text-text-muted" : "bg-primary-soft text-primary"}`}
                              title={variable.existing ? t("exchange.template.existingVariable") : undefined}
                            >
                              {`{${variable.name}}`}
                              {variable.defaultValue ? ` = ${variable.defaultValue}` : ""}
                            </span>
                          ))}
                          {item.variables.length > CHIPS_SHOWN && <span className="text-caption text-text-muted">+{item.variables.length - CHIPS_SHOWN}</span>}
                          {item.conflicts > 0 && <span className="text-caption text-warning">{t("exchange.template.conflict")}</span>}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-2 text-caption text-text-muted">
                <span data-testid="template-showing">{t("exchange.manage.showing", { shown: Math.min(shown, items.length), total: items.length })}</span>
                {items.length > shown && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShown((n) => n + SHOW_STEP)} data-testid="template-more">
                    {t("exchange.manage.more")}
                  </Button>
                )}
              </div>

              <div className="space-y-2 border-t border-border-soft pt-3">
                {confirming ? (
                  <div role="alertdialog" className="space-y-2 rounded-lg border border-danger/40 bg-danger/5 p-3" data-testid="template-confirm">
                    <p className="text-small font-semibold text-text">{t("exchange.template.confirmAll", { count: selectedIds.length })}</p>
                    <p className="text-caption text-text-secondary">{t("exchange.template.confirmAllHint")}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="danger" onClick={() => void execute()} data-testid="template-confirm-yes">
                        {t("exchange.template.confirmYes", { count: selectedIds.length })}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)} data-testid="template-cancel">
                        {t("exchange.manage.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" onClick={start} disabled={busy || selectedIds.length === 0} data-testid="template-convert">
                      {running && <Loader2 size={14} className="animate-spin" />}
                      {t("exchange.template.convert", { count: selectedIds.length })}
                    </Button>
                    {running && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => (stopRef.current = true)} data-testid="template-stop">
                        {t("exchange.manage.stop")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {progress && (
        <div className="space-y-1" data-testid="template-progress">
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 w-full overflow-hidden rounded-full bg-surface-soft">
            <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-caption text-text-secondary">{t("exchange.template.progress", { done: progress.done, total: progress.total })}</p>
        </div>
      )}

      {outcome && (
        <div className="space-y-1 text-small" data-testid="template-outcome">
          <p className="text-text">{t("exchange.template.done", { affected: outcome.affected, variables: outcome.variables, skipped: outcome.skipped })}</p>
          {outcome.conflicts > 0 && <p className="text-caption text-warning">{t("exchange.template.doneConflicts", { count: outcome.conflicts })}</p>}
          {outcome.stoppedAt !== null && (
            <p className="text-warning" data-testid="template-partial">
              {t("exchange.manage.partial", { done: outcome.done, total: outcome.total })}
            </p>
          )}
          {outcome.error && (
            <p role="alert" className="text-danger" data-testid="template-error">
              {outcome.error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
