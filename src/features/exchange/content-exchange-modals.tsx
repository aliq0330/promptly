"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, Loader2, Upload } from "lucide-react";
import { Button, buttonClassName } from "@/components/ui/button";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { CONTENT_LIMITS, EXCHANGE_LIMITS, contentFileName, parseContent, serializeContent, type ContentParseResult, type ExchangeContentItem, type ExchangeContentKind, type ExchangeIssue } from "@/lib/exchange";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { importContent, type ImportReport } from "@/lib/supabase/prompt-exchange";
import { downloadTextFile } from "./download-file";
import { FATAL_KEYS, FIELD_KEYS, SERVER_ERROR_KEYS, WARNING_KEYS, issueKey } from "./exchange-labels";

/**
 * İstek ve Hazır ayar dışa/içe aktarma pencereleri (docs/history/306-*). Prompt pencerelerinin (250) iki adımlı akışının aynısı:
 * dışa aktarma JSON indirir; içe aktarma dosyayı tarayıcıda ayrıştırır → `import_content` ile KURU ÇALIŞMA → sonucu gösterir →
 * onaylayınca gerçekten yazar. Eklenenler her zaman özel taslaktır. Yalnız JSON (alanlar yapılıdır).
 */

const KIND_KEYS: Record<ExchangeContentKind, { exportTitle: TranslationKey; exportCount: TranslationKey; exportEmpty: TranslationKey; exportNote: TranslationKey; importTitle: TranslationKey; importIntro: TranslationKey; importLimits: TranslationKey; importDone: TranslationKey }> = {
  request: {
    exportTitle: "exchange.content.export.title.request",
    exportCount: "exchange.content.export.count.request",
    exportEmpty: "exchange.content.export.empty.request",
    exportNote: "exchange.content.export.note.request",
    importTitle: "exchange.content.import.title.request",
    importIntro: "exchange.content.import.intro.request",
    importLimits: "exchange.content.import.limits.request",
    importDone: "exchange.content.import.done.request",
  },
  preset: {
    exportTitle: "exchange.content.export.title.preset",
    exportCount: "exchange.content.export.count.preset",
    exportEmpty: "exchange.content.export.empty.preset",
    exportNote: "exchange.content.export.note.preset",
    importTitle: "exchange.content.import.title.preset",
    importIntro: "exchange.content.import.intro.preset",
    importLimits: "exchange.content.import.limits.preset",
    importDone: "exchange.content.import.done.preset",
  },
  workflow: {
    exportTitle: "exchange.content.export.title.workflow",
    exportCount: "exchange.content.export.count.workflow",
    exportEmpty: "exchange.content.export.empty.workflow",
    exportNote: "exchange.content.export.note.workflow",
    importTitle: "exchange.content.import.title.workflow",
    importIntro: "exchange.content.import.intro.workflow",
    importLimits: "exchange.content.import.limits.workflow",
    importDone: "exchange.content.import.done.workflow",
  },
};

export function ExportContentModal<K extends ExchangeContentKind>({ kind, load, onClose }: { kind: K; load: () => Promise<ExchangeContentItem<K>[]>; onClose: () => void }) {
  const { t } = useTranslation();
  const keys = KIND_KEYS[kind];
  const [items, setItems] = useState<ExchangeContentItem<K>[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((loaded) => !cancelled && setItems(loaded))
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
    // `load` her render'da yeni bir fonksiyon olabilir; pencere açılırken bir kez çalışır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDownload() {
    if (!items || items.length === 0) return;
    downloadTextFile(contentFileName(kind), serializeContent(kind, items), "application/json");
    onClose();
  }

  const ready = items !== null && items.length > 0;
  return (
    <SpaceDialog
      title={t(keys.exportTitle)}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={handleDownload} disabled={!ready} data-testid="exchange-download">
            <Download size={16} />
            {t("exchange.export.download")}
          </Button>
        </>
      }
    >
      <div className="space-y-4" data-testid="exchange-export">
        {loadFailed ? (
          <p role="alert" className="text-small text-danger">
            {t("exchange.content.export.loadFailed")}
          </p>
        ) : items === null ? (
          <p className="flex items-center gap-2 text-small text-text-secondary">
            <Loader2 size={16} className="animate-spin" />
            {t("exchange.content.preparing")}
          </p>
        ) : items.length === 0 ? (
          <p className="text-small text-text-secondary">{t(keys.exportEmpty)}</p>
        ) : (
          <>
            <p className="text-small text-text-secondary">{t(keys.exportCount, { count: items.length })}</p>
            <p className="text-caption text-text-muted">{t(keys.exportNote)}</p>
          </>
        )}
      </div>
    </SpaceDialog>
  );
}

type Step = "pick" | "checking" | "review" | "importing" | "done";

export function ImportContentModal<K extends ExchangeContentKind>({ kind, onClose, onImported }: { kind: K; onClose: () => void; onImported?: () => void }) {
  const { t } = useTranslation();
  const keys = KIND_KEYS[kind];
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("pick");
  const [fileName, setFileName] = useState("");
  const [fatal, setFatal] = useState<keyof typeof FATAL_KEYS | null>(null);
  const [parsed, setParsed] = useState<ContentParseResult<K> | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(0);

  function reset() {
    setStep("pick");
    setFatal(null);
    setParsed(null);
    setReport(null);
    setError(null);
  }

  function serverMessage(err: unknown): string {
    const message = err instanceof Error ? err.message : "";
    const key = SERVER_ERROR_KEYS[message];
    return key ? t(key) : message && !/^[a-z_]+$/.test(message) ? message : t("exchange.import.failed");
  }

  async function handleFile(file: File) {
    reset();
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith(".json")) return setFatal("unknown_format");
    if (file.size > EXCHANGE_LIMITS.fileBytes) return setFatal("too_large");
    let text: string;
    try {
      text = await file.text();
    } catch {
      return setFatal("empty");
    }
    const result = parseContent(kind, text);
    if (result.fatal) return setFatal(result.fatal);
    setParsed(result);
    if (result.items.length === 0) {
      setStep("review");
      return;
    }
    setStep("checking");
    try {
      setReport(await importContent(kind, result.items, true));
      setStep("review");
    } catch (err) {
      setError(serverMessage(err));
      setStep("review");
    }
  }

  async function handleImport() {
    if (!parsed || !report?.ok) return;
    setStep("importing");
    setError(null);
    try {
      const result = await importContent(kind, parsed.items, false);
      setCreated(result.created);
      setStep("done");
      onImported?.();
    } catch (err) {
      // Atomik: hata olduysa hiçbir şey eklenmemiştir.
      setError(serverMessage(err));
      setStep("review");
    }
  }

  const fileIssues = parsed ? groupIssuesByRow(parsed.issues) : [];
  const newCount = report?.items.filter((item) => item.status === "ok").length ?? 0;
  const duplicateCount = report?.items.filter((item) => item.status === "duplicate").length ?? 0;
  const invalidCount = (parsed?.total ?? 0) - (parsed?.items.length ?? 0) + (report?.items.filter((item) => item.status === "invalid").length ?? 0);
  const busy = step === "checking" || step === "importing";
  const limits = CONTENT_LIMITS[kind];

  return (
    <SpaceDialog
      title={t(keys.importTitle)}
      onClose={onClose}
      busy={busy}
      wide
      footer={
        step === "done" ? (
          <>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.close")}
            </Button>
            <Link href="/my-content" className={buttonClassName({})} onClick={onClose}>
              {t("exchange.import.openDrafts")}
            </Link>
          </>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            {step === "review" && report && (
              <Button type="button" onClick={handleImport} disabled={!report.ok || newCount === 0} data-testid="exchange-run">
                {newCount === 0 ? t("exchange.import.nothingNew") : t("exchange.import.run", { count: newCount })}
              </Button>
            )}
          </>
        )
      }
    >
      <div className="space-y-4" data-testid="exchange-import" data-kind={kind} data-limit-title={limits.title}>
        {step === "done" ? (
          <div className="flex items-start gap-3" data-testid="exchange-done">
            <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-success" aria-hidden />
            <div>
              <p className="text-small font-semibold text-text">{t(keys.importDone, { count: created })}</p>
              <p className="text-small text-text-secondary">{t("exchange.import.doneHint")}</p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-small text-text-secondary">{t(keys.importIntro)}</p>
            <p className="text-caption text-text-muted">{t(keys.importLimits, { max: EXCHANGE_LIMITS.items })}</p>

            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInput}
                type="file"
                accept=".json"
                className="sr-only"
                data-testid="exchange-file-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void handleFile(file);
                }}
              />
              <Button type="button" variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
                <Upload size={16} />
                {step === "pick" && !fileName ? t("exchange.import.chooseFile") : t("exchange.import.chooseAnother")}
              </Button>
              {fileName && <span className="min-w-0 truncate text-small text-text-secondary">{fileName}</span>}
            </div>

            {fatal && (
              <p role="alert" className="text-small text-danger" data-testid="exchange-fatal">
                {fatal === "unknown_format" ? t("exchange.content.import.wrongFile") : t(FATAL_KEYS[fatal])}
              </p>
            )}
            {step === "checking" && (
              <p className="flex items-center gap-2 text-small text-text-secondary">
                <Loader2 size={16} className="animate-spin" />
                {t("exchange.import.checking")}
              </p>
            )}
            {step === "importing" && (
              <p className="flex items-center gap-2 text-small text-text-secondary">
                <Loader2 size={16} className="animate-spin" />
                {t("exchange.import.running")}
              </p>
            )}
            {error && (
              <p role="alert" className="text-small text-danger" data-testid="exchange-error">
                {error}
              </p>
            )}

            {parsed && step !== "checking" && (
              <div className="space-y-2">
                <p className="text-small font-semibold text-text" data-testid="exchange-summary">
                  {t("exchange.import.summary", { total: parsed.total, ok: newCount, dup: duplicateCount, bad: invalidCount })}
                </p>
                <ul className="divide-y divide-border-soft rounded-lg border border-border-soft">
                  {fileIssues.map(({ row, issues }) => (
                    <li key={`file-${row}`} className="flex items-start gap-3 px-3 py-2" data-status="invalid">
                      <span className="mt-0.5 shrink-0 text-caption font-semibold text-danger">{t("exchange.import.statusInvalid")}</span>
                      <span className="min-w-0 text-small text-text">
                        {t("exchange.import.row", { row })}
                        {issues.map((issue, index) => (
                          <span key={index} className="block text-caption text-text-secondary">
                            {issue.field && FIELD_KEYS[issue.field] ? `${t(FIELD_KEYS[issue.field])}: ` : ""}
                            {t(issueKey(issue.code))}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                  {report?.items.map((item) => (
                    <li key={`item-${item.index}`} className="flex items-start gap-3 px-3 py-2" data-status={item.status}>
                      <span className={`mt-0.5 shrink-0 text-caption font-semibold ${item.status === "ok" ? "text-success" : item.status === "duplicate" ? "text-warning" : "text-danger"}`}>
                        {t(item.status === "ok" ? "exchange.import.statusNew" : item.status === "duplicate" ? "exchange.import.statusDuplicate" : "exchange.import.statusInvalid")}
                      </span>
                      <span className="min-w-0 text-small text-text">
                        <span className="block break-words">{parsed.items[item.index - 1]?.title}</span>
                        {item.status === "invalid" && (
                          <span className="block text-caption text-text-secondary">
                            {item.field && FIELD_KEYS[item.field] ? `${t(FIELD_KEYS[item.field])}: ` : ""}
                            {t(issueKey(item.code))}
                          </span>
                        )}
                        {item.warnings?.map((warning) => (
                          <span key={warning} className="block text-caption text-text-secondary">
                            {WARNING_KEYS[warning] ? t(WARNING_KEYS[warning]) : warning}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
                {invalidCount > 0 && <p className="text-caption text-text-muted">{t("exchange.import.skipInvalid")}</p>}
              </div>
            )}
          </>
        )}
      </div>
    </SpaceDialog>
  );
}

function groupIssuesByRow(issues: ExchangeIssue[]): { row: number; issues: ExchangeIssue[] }[] {
  const byRow = new Map<number, ExchangeIssue[]>();
  for (const issue of issues) byRow.set(issue.row, [...(byRow.get(issue.row) ?? []), issue]);
  return [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([row, rowIssues]) => ({ row, issues: rowIssues }));
}
