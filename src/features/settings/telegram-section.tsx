"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "@/components/icons/bell";
import { BarChart3 } from "@/components/icons/bar-chart-3";
import { Check } from "@/components/icons/check";
import { Copy } from "@/components/icons/copy";
import { Send } from "@/components/icons/send";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/features/content/visibility-switch";
import { useTranslation } from "@/lib/i18n/language-provider";
import { TELEGRAM_LINK_LIMIT, formatLinkCode, telegramBotHandle, telegramDeepLink, telegramLinkLabel, type TelegramLinkRow } from "@/lib/telegram-link";
import { createTelegramLinkCode, listMyTelegramLinks, revokeMyTelegramLink, setMyTelegramNotify, type TelegramLinkCode } from "@/lib/supabase/telegram-links";
import { cn, copyTextToClipboard, formatRelativeTime } from "@/lib/utils";

const POLL_MS = 4000;

/**
 * Ayarlar → Geliştirici → Telegram botu (docs/history/323-*). Bağlama kodu BURADA üretilir ve bota gönderilir (tersi, başkasının Telegram'ını hesabına bağlatan bir
 * bağlantıya basmayı mümkün kılardı). Ham kod yalnız bu yanıtta görünür, bellekte tutulur; sunucuda yalnız özeti durur. Bot kullanıcı adı derlemede
 * `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` ile verilir: tanımlı DEĞİLSE ve hiç bağlantı yoksa bölüm hiç görünmez (çalışmayan düğme göstermemek için).
 * Gerçek Telegram'a/Supabase'e KARŞI DENENMEDİ: kod/bağlantı/bildirim kuralları sunucudadır (supabase/tests/telegram-bot.sql).
 */
export function TelegramSection() {
  const { t, language } = useTranslation();
  const handle = telegramBotHandle(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME);
  const [rows, setRows] = useState<TelegramLinkRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [write, setWrite] = useState(false);
  const [code, setCode] = useState<TelegramLinkCode | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [justLinked, setJustLinked] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const baseline = useRef(0);

  useEffect(() => {
    let cancelled = false;
    listMyTelegramLinks()
      .then((next) => {
        if (cancelled) return;
        setRows(next);
        setLoadFailed(false);
      })
      .catch((failure) => {
        console.error("listMyTelegramLinks", failure);
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Kod görünürken bağlantının kurulmasını bekle (yeni bir satır belirince bitir) ve süre dolunca kodu at.
  useEffect(() => {
    if (!code) return;
    const timer = window.setInterval(() => {
      if (Date.parse(code.expiresAt) <= Date.now()) {
        setCode(null);
        setExpired(true);
        return;
      }
      listMyTelegramLinks()
        .then((next) => {
          if (next.length > baseline.current) {
            setRows(next);
            setCode(null);
            setJustLinked(true);
          }
        })
        .catch(() => {});
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [code]);

  async function createCode() {
    setCreating(true);
    setError(null);
    setExpired(false);
    setJustLinked(false);
    try {
      baseline.current = rows?.length ?? 0;
      setCode(await createTelegramLinkCode(write));
    } catch (failure) {
      // Bilinen sunucu kodları (`link_limit`, `rate_limit`) istemci katmanında zaten çevrilmiş cümleye dönüşür (`server-errors.ts`).
      setError(failure instanceof Error && failure.message ? failure.message : t("tg.loadFailed"));
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await revokeMyTelegramLink(id);
      setConfirmId(null);
      setReloadKey((key) => key + 1);
    } catch {
      setError(t("tg.removeFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function toggle(row: TelegramLinkRow, field: "weekly" | "activity", value: boolean) {
    setBusyId(row.id);
    setError(null);
    try {
      await setMyTelegramNotify(row.id, field === "weekly" ? value : null, field === "activity" ? value : null);
      setReloadKey((key) => key + 1);
    } catch {
      setError(t("tg.saveFailed"));
    } finally {
      setBusyId(null);
    }
  }

  if (loadFailed && rows === null) {
    return (
      <section className="space-y-2" data-telegram="">
        <h3 className="px-1 font-display text-h3 font-bold tracking-[-0.02em] text-text">{t("tg.title")}</h3>
        <p role="alert" className="px-1 text-small text-danger">{t("tg.loadFailed")}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>{t("common.retry")}</Button>
      </section>
    );
  }
  if (rows === null) return null;
  if (!handle && rows.length === 0) return null;

  const atLimit = rows.length >= TELEGRAM_LINK_LIMIT;
  const deepLink = code ? telegramDeepLink(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME, code.code) : null;

  return (
    <section className="space-y-3" data-telegram="">
      <div className="space-y-1 px-1">
        <h3 className="font-display text-h3 font-bold tracking-[-0.02em] text-text">{t("tg.title")}</h3>
        <p className="text-caption leading-relaxed text-text-muted">{t("tg.hint")}</p>
      </div>
      {error && <p role="alert" className="px-1 text-small text-danger">{error}</p>}
      {justLinked && <p role="status" className="px-1 text-small font-semibold text-success">{t("tg.justLinked")}</p>}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-5 text-small text-text-muted">{t("tg.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="space-y-3 rounded-lg border border-border-soft bg-surface p-4 shadow-card" data-telegram-link={row.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                    <Send size={16} />
                  </span>
                  <p className="break-words text-[0.9375rem] font-semibold tracking-[-0.01em] text-text [overflow-wrap:anywhere]">{telegramLinkLabel(row)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-success/10 px-2.5 py-0.5 text-caption font-bold text-success">{t("tg.linkedBadge")}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {row.scopes.map((scope) => (
                  <span key={scope} className={cn("rounded-full px-2.5 py-0.5 text-caption font-bold", scope === "write" ? "bg-secondary/10 text-secondary" : "bg-primary-soft text-primary")}>
                    {scope === "write" ? t("apps.scope.write") : t("apps.scope.read")}
                  </span>
                ))}
              </div>
              <p className="text-caption leading-relaxed text-text-muted">
                {t("apps.grantedAt", { when: formatRelativeTime(row.createdAt, language) })} · {row.lastUsedAt ? t("apps.lastUsed", { when: formatRelativeTime(row.lastUsedAt, language) }) : t("apps.neverUsed")}
              </p>
              <div className="space-y-2">
                <SwitchRow checked={row.notifyWeekly} disabled={busyId === row.id} onChange={(next) => void toggle(row, "weekly", next)} icon={<BarChart3 size={18} />} title={t("tg.weekly")} description={t("tg.weeklyHint")} ariaLabel={t("tg.weekly")} />
                <SwitchRow checked={row.notifyActivity} disabled={busyId === row.id} onChange={(next) => void toggle(row, "activity", next)} icon={<Bell size={18} />} title={t("tg.activity")} description={t("tg.activityHint")} ariaLabel={t("tg.activity")} />
              </div>
              {confirmId === row.id ? (
                <div className="space-y-2.5 rounded-lg bg-danger/10 p-3">
                  <p className="text-caption leading-relaxed text-text-secondary">{t("tg.removeConfirm")}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="danger" disabled={busyId === row.id} onClick={() => void remove(row.id)}>{t("tg.removeYes")}</Button>
                    <Button type="button" size="sm" variant="outline" disabled={busyId === row.id} onClick={() => setConfirmId(null)}>{t("apiKeys.revokeNo")}</Button>
                  </div>
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full border-danger/30 bg-danger/10 text-danger hover:border-danger/50 hover:bg-danger/15" onClick={() => setConfirmId(row.id)}>
                  {t("tg.remove")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {handle && (
        <div className="space-y-3 rounded-lg border border-border-soft bg-surface p-4 shadow-card" data-telegram-connect="">
          <p className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-text">{t("tg.connectTitle")}</p>
          {atLimit ? (
            <p className="text-small text-text-muted">{t("tg.limit")}</p>
          ) : code ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">{t("tg.codeTitle")}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code data-telegram-code="" className="prompt-text rounded-lg bg-surface-soft px-3 py-2 text-lg font-bold tracking-[0.2em] text-text">{formatLinkCode(code.code)}</code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      if (await copyTextToClipboard(code.code)) {
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1800);
                      }
                    }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t("common.copied") : t("tg.copyCode")}
                  </Button>
                </div>
                <p className="text-caption text-text-muted">{t("tg.codeValid")}</p>
              </div>
              <ol className="list-decimal space-y-2 pl-5 text-small leading-relaxed text-text-secondary marker:text-text-muted">
                <li>
                  {t("tg.step1", { bot: handle })}
                  {deepLink && (
                    <>
                      {" "}
                      <a href={deepLink} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{t("tg.openBot")}</a>
                    </>
                  )}
                </li>
                <li>
                  {t("tg.step2")} <code className="prompt-text break-all rounded bg-surface-soft px-1.5 py-0.5">/baglan {code.code}</code>
                </li>
                <li>{t("tg.step3")}</li>
              </ol>
              <p className="text-caption text-text-muted" role="status">{t("tg.waiting")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <SwitchRow checked={write} onChange={setWrite} icon={<Send size={18} />} title={t("tg.writeLabel")} description={t("tg.writeHint")} ariaLabel={t("tg.writeLabel")} />
              {expired && <p className="text-small text-text-muted">{t("tg.codeExpired")}</p>}
              <Button type="button" className="w-full sm:w-auto" disabled={creating} onClick={() => void createCode()}>
                {creating ? t("tg.creating") : t("tg.createCode")}
              </Button>
            </div>
          )}
        </div>
      )}

      <p className="px-1 text-caption leading-relaxed text-text-muted">
        {t("tg.privacy")}{" "}
        <Link href="/privacy" className="font-medium text-primary hover:underline">{t("tg.privacyLink")}</Link>
      </p>
    </section>
  );
}
