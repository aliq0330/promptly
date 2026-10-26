"use client";

import { useRef, useState } from "react";
import { Loader2, PackagePlus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FATAL_KEYS, FIELD_KEYS, issueKey } from "@/features/exchange/exchange-labels";
import {
  ADMIN_IMPORT_LIMITS,
  EXCHANGE_LIMITS,
  detectPromptsChat,
  formatFromFileName,
  parsePrompts,
  parsePromptsChat,
  type BulkOutcome,
  type BulkProgress,
  type ExchangeFatalCode,
  type ExchangePrompt,
  type ParseResult,
} from "@/lib/exchange";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { runAdminImport } from "@/lib/supabase/prompt-exchange";

const PROMPTS_CHAT_URL = "https://raw.githubusercontent.com/f/prompts.chat/main/PROMPTS.md";
const ALLOWED_URL_PREFIX = "https://raw.githubusercontent.com/";
const FETCH_TIMEOUT_MS = 90_000;

type Kind = "prompts-chat" | "json" | "markdown" | "csv";
type Phase = "idle" | "loading" | "running";
type Fatal = ExchangeFatalCode | "fetch_failed" | "bad_url";

const KIND_KEYS: Record<Kind, TranslationKey> = {
  "prompts-chat": "exchange.admin.kind.prompts-chat",
  json: "exchange.admin.kind.json",
  markdown: "exchange.admin.kind.markdown",
  csv: "exchange.admin.kind.csv",
};

function tagProblem(tag: string): boolean {
  return tag.length > EXCHANGE_LIMITS.tagLabel || /[<>\u0000-\u001f\u007f]/.test(tag);
}

/**
 * Moderatör aracı: dosyadan (ya da raw.githubusercontent.com adresinden) SINIRSIZ sayıda prompt yükler (docs/history/251-*).
 * Ayrıştırma tarayıcıda yapılır; yazım yalnız `admin_import_prompts` RPC'sinden geçer (50'şerli, her parça atomik). Varsayılan sonuç
 * moderatörün KENDİ özel taslağıdır; "Yayınla" açıkça seçilmedikçe hiçbir şey herkese açılmaz. Yarıda kalan yükleme tekrar çalıştırılınca
 * yinelenenleri atlayıp devam eder.
 */
export function BulkImportCard() {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const stopRef = useRef(false);
  const [url, setUrl] = useState(PROMPTS_CHAT_URL);
  const [tag, setTag] = useState("prompts.chat");
  const [publish, setPublish] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState("");
  const [kind, setKind] = useState<Kind | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [fatal, setFatal] = useState<Fatal | null>(null);
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [outcome, setOutcome] = useState<{ mode: "check" | "import"; result: BulkOutcome } | null>(null);

  const tagTrimmed = tag.trim();
  const tagInvalid = tagProblem(tagTrimmed);
  const items = parsed?.items ?? [];
  const busy = phase !== "idle";
  const skillLike = items.filter((item) => /^---\r?\nname:/.test(item.promptText)).length;

  function reset() {
    setParsed(null);
    setKind(null);
    setFatal(null);
    setProgress(null);
    setOutcome(null);
  }

  function load(text: string, name: string) {
    reset();
    setFileName(name);
    if (text.length > ADMIN_IMPORT_LIMITS.fileBytes) return setFatal("too_large");
    const limits = { maxItems: Number.MAX_SAFE_INTEGER, maxBytes: ADMIN_IMPORT_LIMITS.fileBytes };
    let detected: Kind;
    let result: ParseResult;
    if (detectPromptsChat(text)) {
      detected = "prompts-chat";
      result = parsePromptsChat(text);
    } else {
      const format = formatFromFileName(name);
      if (!format) return setFatal("unknown_format");
      detected = format;
      result = parsePrompts(text, format, limits);
    }
    if (result.fatal) return setFatal(result.fatal);
    setKind(detected);
    setParsed(result);
  }

  async function fromFile(file: File) {
    setPhase("loading");
    try {
      if (file.size > ADMIN_IMPORT_LIMITS.fileBytes) {
        reset();
        setFileName(file.name);
        return setFatal("too_large");
      }
      load(await file.text(), file.name);
    } catch {
      reset();
      setFatal("fetch_failed");
    } finally {
      setPhase("idle");
    }
  }

  async function fromUrl() {
    const address = url.trim();
    if (!address.startsWith(ALLOWED_URL_PREFIX)) {
      reset();
      return setFatal("bad_url");
    }
    setPhase("loading");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(address, { signal: controller.signal });
      if (!response.ok) throw new Error(String(response.status));
      load(await response.text(), address.split("?")[0].split("/").pop() ?? "file");
    } catch {
      reset();
      setFatal("fetch_failed");
    } finally {
      clearTimeout(timer);
      setPhase("idle");
    }
  }

  async function run(mode: "check" | "import") {
    if (!parsed || busy || tagInvalid) return;
    stopRef.current = false;
    setPhase("running");
    setOutcome(null);
    setProgress({ done: 0, total: items.length, newCount: 0, duplicates: 0, invalid: 0, created: 0, published: 0, warnings: 0 });
    const prepared: ExchangePrompt[] = tagTrimmed
      ? items.map((item) => (item.tags.some((x) => x.toLocaleLowerCase("tr") === tagTrimmed.toLocaleLowerCase("tr")) ? item : { ...item, tags: [...item.tags, tagTrimmed] }))
      : items;
    const result = await runAdminImport(prepared, {
      dryRun: mode === "check",
      publish: mode === "import" && publish,
      source: kind === "prompts-chat" ? "prompts.chat" : fileName.slice(0, 40) || "file",
      onProgress: setProgress,
      shouldStop: () => stopRef.current,
    });
    setOutcome({ mode, result });
    setProgress(null);
    setPhase("idle");
  }

  const fileIssues = parsed?.issues ?? [];
  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4" data-testid="bulk-import">
      <div className="flex items-start gap-3">
        <PackagePlus size={18} className="mt-0.5 shrink-0 text-text-muted" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text">{t("exchange.admin.title")}</h2>
          <p className="text-small text-text-secondary">{t("exchange.admin.hint")}</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-label font-semibold text-text" htmlFor="bulk-url">
          {t("exchange.admin.urlLabel")}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="bulk-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={busy}
            className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-small text-text"
            data-testid="bulk-url"
          />
          <Button type="button" size="sm" variant="outline" onClick={() => void fromUrl()} disabled={busy || url.trim() === ""} data-testid="bulk-fetch">
            {phase === "loading" ? <Loader2 size={14} className="animate-spin" /> : null}
            {phase === "loading" ? t("exchange.admin.fetching") : t("exchange.admin.fetch")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-small text-text-secondary">
          <span>{t("exchange.admin.orFile")}</span>
          <input
            ref={fileInput}
            type="file"
            accept=".md,.markdown,.json,.csv"
            className="sr-only"
            data-testid="bulk-file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void fromFile(file);
            }}
          />
          <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
            <Upload size={14} />
            {t("exchange.import.chooseFile")}
          </Button>
          {fileName && <span className="min-w-0 truncate">{fileName}</span>}
        </div>
      </div>

      {fatal && (
        <p role="alert" className="text-small text-danger" data-testid="bulk-fatal">
          {t(FATAL_KEYS[fatal])}
        </p>
      )}

      {parsed && kind && (
        <div className="space-y-3">
          <p className="text-small font-semibold text-text" data-testid="bulk-loaded">
            {t("exchange.admin.loaded", { kind: t(KIND_KEYS[kind]), total: parsed.total, valid: items.length, invalid: parsed.total - items.length })}
          </p>
          {skillLike > 0 && <p className="text-caption text-text-muted">{t("exchange.admin.skillHint", { count: skillLike })}</p>}
          {fileIssues.length > 0 && (
            <details className="text-caption text-text-secondary">
              <summary className="cursor-pointer">{t("exchange.admin.skipped")} ({fileIssues.length})</summary>
              <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                {fileIssues.slice(0, 50).map((issue, index) => (
                  <li key={index}>
                    {t("exchange.admin.skippedRow", { row: issue.row })}: {issue.field && FIELD_KEYS[issue.field] ? `${t(FIELD_KEYS[issue.field])} — ` : ""}
                    {t(issueKey(issue.code))}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="space-y-1">
            <label className="block text-label font-semibold text-text" htmlFor="bulk-tag">
              {t("exchange.admin.tagLabel")}
            </label>
            <input
              id="bulk-tag"
              type="text"
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              disabled={busy}
              maxLength={80}
              className="h-10 w-full max-w-xs rounded-md border border-border bg-background px-3 text-small text-text"
              data-testid="bulk-tag"
            />
            <p className={`text-caption ${tagInvalid ? "text-danger" : "text-text-muted"}`}>{tagInvalid ? t("exchange.admin.tagInvalid") : t("exchange.admin.tagHint")}</p>
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-small text-text">
            <input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} disabled={busy} className="mt-1 accent-primary" data-testid="bulk-publish" />
            <span>
              <span className="block font-semibold">{t("exchange.admin.publish")}</span>
              <span className="block text-caption text-text-secondary">{t("exchange.admin.publishWarn")}</span>
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void run("check")} disabled={busy || items.length === 0 || tagInvalid} data-testid="bulk-check">
              {t("exchange.admin.check")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={publish ? "danger" : "primary"}
              onClick={() => void run("import")}
              disabled={busy || items.length === 0 || tagInvalid}
              data-testid="bulk-run"
            >
              {t(publish ? "exchange.admin.runPublish" : "exchange.admin.runDraft", { count: items.length })}
            </Button>
            {phase === "running" && (
              <Button type="button" size="sm" variant="ghost" onClick={() => (stopRef.current = true)} data-testid="bulk-stop">
                {t("exchange.admin.stop")}
              </Button>
            )}
          </div>
        </div>
      )}

      {progress && (
        <div className="space-y-1" data-testid="bulk-progress">
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 w-full overflow-hidden rounded-full bg-surface-soft">
            <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-caption text-text-secondary">{t("exchange.admin.progress", { done: progress.done, total: progress.total })}</p>
        </div>
      )}

      {outcome && (
        <div className="space-y-1 text-small" data-testid="bulk-outcome">
          <p className="text-text">
            {outcome.mode === "check"
              ? t("exchange.admin.checkDone", { new: outcome.result.newCount, dup: outcome.result.duplicates, invalid: outcome.result.invalid })
              : t("exchange.admin.importDone", { created: outcome.result.created, published: outcome.result.published, dup: outcome.result.duplicates, invalid: outcome.result.invalid })}
          </p>
          {outcome.result.warnings > 0 && <p className="text-caption text-text-muted">{t("exchange.admin.warnings", { count: outcome.result.warnings })}</p>}
          {outcome.result.stoppedAt !== null && (
            <p className="text-warning" data-testid="bulk-partial">
              {t("exchange.admin.partial", { done: outcome.result.done, total: outcome.result.total })}
            </p>
          )}
          {outcome.result.error && (
            <p role="alert" className="text-danger" data-testid="bulk-error">
              {outcome.result.error}
            </p>
          )}
          {outcome.result.invalidItems.slice(0, 10).map((entry) => (
            <p key={entry.index} className="text-caption text-danger">
              {t("exchange.admin.skippedRow", { row: entry.index })} — {entry.title}: {t(issueKey(entry.code))}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
