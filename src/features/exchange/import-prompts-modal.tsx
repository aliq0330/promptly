"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { Button, buttonClassName } from "@/components/ui/button";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { EXCHANGE_LIMITS, formatFromFileName, parsePrompts, type ExchangeFatalCode, type ExchangeIssue, type ParseResult } from "@/lib/exchange";
import { useTranslation } from "@/lib/i18n/language-provider";
import { importPrompts, type ImportReport } from "@/lib/supabase/prompt-exchange";
import { FATAL_KEYS, FIELD_KEYS, SERVER_ERROR_KEYS, WARNING_KEYS, issueKey } from "./exchange-labels";

type Step = "pick" | "checking" | "review" | "importing" | "done";

/**
 * Dosyadan prompt içe aktarma (docs/history/250-*): dosyayı seç → tarayıcıda ayrıştır → `import_prompts` ile KURU ÇALIŞMA (hiçbir şey
 * yazılmaz) → sonucu göster → onaylayınca aynı RPC'yi gerçekten çalıştır. Eklenenler her zaman özel taslaktır.
 */
export function ImportPromptsModal({ onClose, onImported }: { onClose: () => void; onImported?: () => void }) {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("pick");
  const [fileName, setFileName] = useState("");
  const [fatal, setFatal] = useState<ExchangeFatalCode | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
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
    // `rate_limit` gibi kodlar istemci katmanında zaten okunur cümleye çevrilmiştir; bilinmeyen hata genel cümleyle gösterilir.
    return key ? t(key) : message && !/^[a-z_]+$/.test(message) ? message : t("exchange.import.failed");
  }

  async function handleFile(file: File) {
    reset();
    setFileName(file.name);
    const format = formatFromFileName(file.name);
    if (!format) return setFatal("unknown_format");
    if (file.size > EXCHANGE_LIMITS.fileBytes) return setFatal("too_large");
    let text: string;
    try {
      text = await file.text();
    } catch {
      return setFatal("empty");
    }
    const result = parsePrompts(text, format);
    if (result.fatal) return setFatal(result.fatal);
    setParsed(result);
    if (result.items.length === 0) {
      setStep("review");
      return;
    }
    setStep("checking");
    try {
      setReport(await importPrompts(result.items, true));
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
      const result = await importPrompts(parsed.items, false);
      setCreated(result.created);
      setStep("done");
      onImported?.();
    } catch (err) {
      // Atomik: hata olduysa hiçbir prompt eklenmemiştir.
      setError(serverMessage(err));
      setStep("review");
    }
  }

  const fileIssues = parsed ? groupIssuesByRow(parsed.issues) : [];
  const newCount = report?.items.filter((item) => item.status === "ok").length ?? 0;
  const duplicateCount = report?.items.filter((item) => item.status === "duplicate").length ?? 0;
  const invalidCount = (parsed?.total ?? 0) - (parsed?.items.length ?? 0) + (report?.items.filter((item) => item.status === "invalid").length ?? 0);
  const busy = step === "checking" || step === "importing";

  return (
    <SpaceDialog
      title={t("exchange.import.title")}
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
      <div className="space-y-4" data-testid="exchange-import">
        {step === "done" ? (
          <div className="flex items-start gap-3" data-testid="exchange-done">
            <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-success" aria-hidden />
            <div>
              <p className="text-small font-semibold text-text">{t("exchange.import.done", { count: created })}</p>
              <p className="text-small text-text-secondary">{t("exchange.import.doneHint")}</p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-small text-text-secondary">{t("exchange.import.intro")}</p>
            <p className="text-caption text-text-muted">{t("exchange.import.limits", { max: EXCHANGE_LIMITS.items })}</p>

            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInput}
                type="file"
                accept=".json,.md,.markdown,.csv"
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
                {t(FATAL_KEYS[fatal])}
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
