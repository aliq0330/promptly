"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { apiTokenStatus, type ApiTokenRow } from "@/lib/api-tokens";
import { redirectHost } from "@/lib/oauth-consent";
import { supabase } from "@/lib/supabase/client";
import { listMyApiTokens, revokeApiToken } from "@/lib/supabase/api-tokens";
import { listMyOauthGrants, revokeMyOauthGrant } from "@/lib/supabase/oauth-grants";
import { listMyTelegramLinks, revokeMyTelegramLink } from "@/lib/supabase/telegram-links";
import { telegramLinkLabel, type TelegramLinkRow } from "@/lib/telegram-link";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn, formatRelativeTime } from "@/lib/utils";

/**
 * Geliştirici → "Erişimlerim" (docs/history/433-*): hesabına erişebilen HER şey tek listede — OAuth ile bağlanan yapay zekâ araçları ve uzantı, kişisel API anahtarları,
 * Telegram bağlantıları ve (varsa) eski Supabase OAuth izinleri. Aynı satır biçimi, aynı üç izin etiketi, aynı iki adımlı geri alma. Veri yazma yolu değişmedi:
 * her tür kendi RPC'sini kullanır (`revokeMyOauthGrant`, `revokeApiToken`, `revokeMyTelegramLink`, eski izin için `auth.oauth.revokeGrant`).
 */

export type AccessKind = "ai" | "extension" | "key" | "telegram" | "legacy";

export interface AccessRow {
  key: string;
  kind: AccessKind;
  /** Silme/iptal için kaynak kimliği (izin, anahtar, telegram bağlantısı ya da eski istemci kimliği). */
  id: string;
  title: string;
  host: string | null;
  /** Anahtarın ilk karakterleri (yalnız `key`). */
  prefix: string | null;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  /** Yalnız `key`: bitiş zamanı (null = süresiz). */
  expiresAt: string | null;
  expired: boolean;
}

/** Uzantı kendini "Promptly Chrome uzantısı" adıyla kaydeder (`promptly-extension/shared/auth.js`); listede ayrı tür olarak gösterilir. */
const EXTENSION_CLIENT_NAME = /^promptly chrome (uzantısı|extension)$/i;

export function accessKindOfGrant(name: string): AccessKind {
  return EXTENSION_CLIENT_NAME.test(name.trim()) ? "extension" : "ai";
}

export interface DeveloperAccess {
  rows: AccessRow[] | null;
  /** Anahtar listesi okunamadı (diğer kaynaklar yine de gösterilir). */
  keysFailed: boolean;
  telegramFailed: boolean;
  reload: () => void;
  keyCount: number;
  telegramCount: number;
  aiCount: number;
  extensionConnected: boolean;
}

/** Üç kaynağı birlikte okur; biri düşerse diğerleri görünür. OAuth listesi okunamazsa (sunucu kapalı) sessizce boş sayılır — eski davranışla aynı. */
export function useDeveloperAccess(): DeveloperAccess {
  const [rows, setRows] = useState<AccessRow[] | null>(null);
  const [keysFailed, setKeysFailed] = useState(false);
  const [telegramFailed, setTelegramFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listMyOauthGrants().catch(() => null),
      supabase.auth.oauth
        .listGrants()
        .then(({ data, error }) => (error || !Array.isArray(data) ? [] : data))
        .catch(() => []),
      listMyApiTokens().catch((error) => {
        console.error("listMyApiTokens", error);
        return null;
      }),
      listMyTelegramLinks().catch((error) => {
        console.error("listMyTelegramLinks", error);
        return null;
      }),
    ]).then(([own, legacy, keys, links]) => {
      if (cancelled) return;
      const next: AccessRow[] = [];
      for (const grant of own ?? []) {
        next.push({ key: `own:${grant.id}`, kind: accessKindOfGrant(grant.name), id: grant.id, title: grant.name, host: grant.host, prefix: null, scopes: grant.scopes, createdAt: grant.createdAt, lastUsedAt: grant.lastUsedAt, expiresAt: null, expired: false });
      }
      for (const grant of legacy) {
        next.push({
          key: `legacy:${String(grant.client?.id ?? "")}`,
          kind: "legacy",
          id: String(grant.client?.id ?? ""),
          title: String(grant.client?.name ?? "").slice(0, 80) || "—",
          host: redirectHost(grant.client?.uri),
          prefix: null,
          scopes: Array.isArray(grant.scopes) ? grant.scopes.map(String).slice(0, 20) : [],
          createdAt: String(grant.granted_at ?? ""),
          lastUsedAt: null,
          expiresAt: null,
          expired: false,
        });
      }
      for (const row of (keys ?? []) as ApiTokenRow[]) {
        const status = apiTokenStatus(row);
        if (status === "revoked") continue;
        next.push({ key: `key:${row.id}`, kind: "key", id: row.id, title: row.name, host: null, prefix: row.prefix, scopes: row.scopes, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt, expiresAt: row.expiresAt, expired: status === "expired" });
      }
      for (const row of (links ?? []) as TelegramLinkRow[]) {
        next.push({ key: `tg:${row.id}`, kind: "telegram", id: row.id, title: telegramLinkLabel(row), host: null, prefix: null, scopes: row.scopes, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt, expiresAt: null, expired: false });
      }
      setKeysFailed(keys === null);
      setTelegramFailed(links === null);
      setRows(next);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const list = rows ?? [];
  return {
    rows,
    keysFailed,
    telegramFailed,
    reload,
    keyCount: list.filter((row) => row.kind === "key" && !row.expired).length,
    telegramCount: list.filter((row) => row.kind === "telegram").length,
    aiCount: list.filter((row) => row.kind === "ai" || row.kind === "legacy").length,
    extensionConnected: list.some((row) => row.kind === "extension"),
  };
}

const PERMISSIONS = ["read", "write", "interact"] as const;
const SCOPE_KEY = { read: "devSettings.perm.read", write: "devSettings.perm.write", interact: "devSettings.perm.interact" } as const;
const KIND_KEY: Record<AccessKind, TranslationKey> = {
  ai: "devSettings.access.kindAi",
  extension: "devSettings.access.kindExtension",
  key: "devSettings.access.kindKey",
  telegram: "devSettings.access.kindTelegram",
  legacy: "devSettings.access.kindLegacy",
};
const REVOKE_KEY: Record<AccessKind, TranslationKey> = { ai: "apps.revoke", extension: "apps.revoke", legacy: "apps.revoke", key: "apiKeys.revoke", telegram: "tg.remove" };
const CONFIRM_KEY: Record<AccessKind, TranslationKey> = { ai: "apps.revokeConfirm", extension: "apps.revokeConfirm", legacy: "apps.revokeConfirm", key: "apiKeys.revokeConfirm", telegram: "tg.removeConfirm" };
const YES_KEY: Record<AccessKind, TranslationKey> = { ai: "apps.revokeYes", extension: "apps.revokeYes", legacy: "apps.revokeYes", key: "apiKeys.revokeYes", telegram: "tg.removeYes" };

const HINT_KEY: Record<(typeof PERMISSIONS)[number], TranslationKey> = { read: "devSettings.perm.readHint", write: "devSettings.perm.writeHint", interact: "devSettings.perm.interactHint" };
const scopeClass = (scope: string) => (scope === "read" ? "bg-primary-soft text-primary" : "bg-secondary-soft text-secondary");

async function revokeRow(row: AccessRow): Promise<void> {
  if (row.kind === "key") await revokeApiToken(row.id);
  else if (row.kind === "telegram") await revokeMyTelegramLink(row.id);
  else if (row.kind === "legacy") {
    const { error } = await supabase.auth.oauth.revokeGrant({ clientId: row.id });
    if (error) throw error;
  } else await revokeMyOauthGrant(row.id);
}

/** Üç iznin anlamı, listenin üstünde BİR kez yazılır (kartlarda tekrar anlatılmaz). */
export function PermissionLegend() {
  const { t } = useTranslation();
  return (
    <dl className="grid gap-2 sm:grid-cols-3" data-permission-legend="">
      {PERMISSIONS.map((scope) => (
        <div key={scope} className="flex flex-col items-start gap-1 rounded-md bg-surface-soft p-3">
          <dt className={cn("rounded-full px-2.5 py-0.5 text-caption font-semibold", scopeClass(scope))}>{t(SCOPE_KEY[scope])}</dt>
          <dd className="text-caption leading-relaxed text-text-secondary">{t(HINT_KEY[scope])}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AccessList({ access }: { access: DeveloperAccess }) {
  const { t, language } = useTranslation();
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = access.rows;

  async function revoke(row: AccessRow) {
    setBusyKey(row.key);
    setError(null);
    try {
      await revokeRow(row);
      setConfirmKey(null);
      access.reload();
    } catch (failure) {
      console.error("revoke access", failure);
      setError(t(row.kind === "key" ? "apiKeys.revokeFailed" : row.kind === "telegram" ? "tg.removeFailed" : "apps.revokeFailed"));
    } finally {
      setBusyKey(null);
    }
  }

  const active = (rows ?? []).filter((row) => !row.expired).length;
  return (
    <section className="space-y-4" data-access-list="" aria-labelledby="access-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="access-title" className="font-display text-h3 font-bold tracking-[-0.02em] text-text">{t("devSettings.access.title")}</h2>
        {rows !== null && <span className="text-caption text-text-muted">{t("devSettings.access.count", { count: active })}</span>}
      </div>
      <p className="text-caption leading-relaxed text-text-muted">{t("devSettings.access.hint")}</p>
      <PermissionLegend />
      {rows === null && <p className="text-caption text-text-muted">{t("apiKeys.loading")}</p>}
      {(access.keysFailed || access.telegramFailed) && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-small text-danger">{t(access.keysFailed ? "apiKeys.loadFailed" : "tg.loadFailed")}</p>
          <Button type="button" size="sm" variant="outline" onClick={access.reload}>{t("apiKeys.retry")}</Button>
        </div>
      )}
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
      {rows !== null && rows.length === 0 && !access.keysFailed && !access.telegramFailed && (
        <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-5 text-small text-text-muted">{t("devSettings.access.empty")}</p>
      )}
      {rows !== null && rows.length > 0 && (
        <ul className="divide-y divide-border-soft rounded-lg card-flat">
          {rows.map((row) => (
            <li
              key={row.key}
              className="space-y-2 px-4 py-3"
              data-access-row={row.key}
              data-access-kind={row.kind}
              {...(row.kind === "key" ? { "data-api-key-row": row.id, "data-status": row.expired ? "expired" : "active" } : {})}
              {...(row.kind === "ai" || row.kind === "extension" || row.kind === "legacy" ? { "data-connected-app": row.key } : {})}
              {...(row.kind === "telegram" ? { "data-telegram-link": row.id } : {})}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className="min-w-0 break-words text-body font-semibold tracking-[-0.01em] text-text [overflow-wrap:anywhere]">{row.title}</span>
                <span className="rounded-full bg-surface-soft px-2.5 py-0.5 text-caption font-semibold text-text-secondary">
                  {t(KIND_KEY[row.kind])}
                  {row.host ? ` · ${row.host}` : ""}
                </span>
                {row.expired && <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-caption font-semibold text-warning">{t("apiKeys.statusExpired")}</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {row.kind === "legacy" ? (
                  <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-caption font-semibold text-warning">{t("apps.legacy")}</span>
                ) : (
                  row.scopes.map((scope) => (
                    <span key={scope} className={cn("rounded-full px-2.5 py-0.5 text-caption font-semibold", scopeClass(scope))}>
                      {t(SCOPE_KEY[scope as keyof typeof SCOPE_KEY] ?? SCOPE_KEY.read)}
                    </span>
                  ))
                )}
              </div>
              {row.prefix && <p className="prompt-text text-caption text-text-muted">{row.prefix}…</p>}
              <p className="text-caption leading-relaxed text-text-muted">
                {row.createdAt ? t("apps.grantedAt", { when: formatRelativeTime(row.createdAt, language) }) : ""}
                {row.kind === "key" ? ` · ${row.expiresAt ? t("apiKeys.expiresAt", { date: new Date(row.expiresAt).toLocaleDateString(language) }) : t("apiKeys.neverExpires")}` : ""}
                {row.kind !== "legacy" ? ` · ${row.lastUsedAt ? t("apps.lastUsed", { when: formatRelativeTime(row.lastUsedAt, language) }) : t("apps.neverUsed")}` : ""}
              </p>
              {!row.expired &&
                (confirmKey === row.key ? (
                  <div className="space-y-2 rounded-lg bg-danger-soft p-3">
                    <p className="text-caption leading-relaxed text-text-secondary">{t(CONFIRM_KEY[row.kind])}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="danger" disabled={busyKey === row.key} onClick={() => void revoke(row)}>
                        {t(YES_KEY[row.kind])}
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={busyKey === row.key} onClick={() => setConfirmKey(null)}>
                        {t("apiKeys.revokeNo")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button type="button" size="sm" variant="outline" className="border-danger/30 bg-danger-soft text-danger hover:border-danger/50 hover:bg-danger-soft" onClick={() => setConfirmKey(row.key)}>
                    {t(REVOKE_KEY[row.kind])}
                  </Button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
