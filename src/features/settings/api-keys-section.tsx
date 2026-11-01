"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChoiceCard, fieldInputClassName } from "@/components/ui/field";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  API_TOKEN_ACTIVE_LIMIT,
  API_TOKEN_DEFAULT_EXPIRY,
  API_TOKEN_EXPIRY_OPTIONS,
  API_TOKEN_NAME_MAX,
  API_TOKEN_PRESET_SCOPES,
  activeApiTokenCount,
  apiTokenStatus,
  canCreateApiToken,
  isValidApiTokenName,
  type ApiTokenPreset,
  type ApiTokenRow,
} from "@/lib/api-tokens";
import { createApiToken, listMyApiTokens, revokeApiToken, type CreatedApiToken } from "@/lib/supabase/api-tokens";
import { copyTextToClipboard, formatRelativeTime } from "@/lib/utils";

const labelClassName = "mb-1.5 block text-small text-text-secondary";

/**
 * Ayarlar → Geliştirici anahtarları (docs/history/314-*): kişisel API anahtarı oluştur / listele / iptal et. Ham anahtar yalnız oluşturma
 * yanıtında bir kez görünür (sunucuda yalnız özeti durur); bu bileşen onu yalnız bellekte tutar ve "kaydettim" denince atar.
 */
export function ApiKeysSection() {
  const { t, language } = useTranslation();
  const [rows, setRows] = useState<ApiTokenRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<ApiTokenPreset>("read");
  const [expiry, setExpiry] = useState<number | null>(API_TOKEN_DEFAULT_EXPIRY);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // Yeniden yükleme anahtarı: oluşturma/iptal/"Tekrar dene" bunu artırır; okuma efekt içinde, durum yalnız cevap gelince yazılır.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((key) => key + 1);

  useEffect(() => {
    let cancelled = false;
    listMyApiTokens()
      .then((next) => {
        if (cancelled) return;
        setRows(next);
        setLoadFailed(false);
      })
      .catch((error) => {
        console.error("listMyApiTokens", error);
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const canCreate = rows !== null && canCreateApiToken(rows);
  const activeCount = rows ? activeApiTokenCount(rows) : 0;

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (creating || !isValidApiTokenName(name)) return;
    setCreating(true);
    setFormError(null);
    try {
      const token = await createApiToken({ name, scopes: API_TOKEN_PRESET_SCOPES[preset], expiresInDays: expiry });
      setCreated(token);
      setCopied(false);
      setName("");
      reload();
    } catch (error) {
      setFormError(error instanceof Error && error.message ? error.message : t("apiKeys.loadFailed"));
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    if (!created) return;
    if (await copyTextToClipboard(created.token)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    setListError(null);
    try {
      await revokeApiToken(id);
      setConfirmId(null);
      reload();
    } catch (error) {
      console.error("revokeApiToken", error);
      setListError(t("apiKeys.revokeFailed"));
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="space-y-4" data-api-keys="">
      <p className="rounded-lg bg-surface-soft px-3.5 py-2.5 text-xs leading-relaxed text-text-secondary">{t("apiKeys.preview")}</p>

      {created && (
        <div role="status" className="space-y-3 rounded-lg border border-primary/40 bg-primary-soft p-4" data-api-key-reveal="">
          <div className="space-y-1">
            <p className="text-small font-semibold text-text">{t("apiKeys.revealTitle")}</p>
            <p className="text-xs leading-relaxed text-text-secondary">{t("apiKeys.revealBody")}</p>
          </div>
          <div className="relative rounded-lg border border-border-soft bg-surface">
            <pre aria-label={t("apiKeys.revealLabel")} className="prompt-text overflow-x-auto whitespace-pre-wrap break-all px-3 py-3 pr-12 text-small text-text">{created.token}</pre>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={`${t("apiKeys.copy")}: ${t("apiKeys.revealLabel")}`}
              className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-soft hover:text-text"
            >
              {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
              <span className="sr-only" aria-live="polite">{copied ? t("apiKeys.copied") : ""}</span>
            </button>
          </div>
          <Button type="button" size="sm" onClick={() => setCreated(null)}>
            {t("apiKeys.revealDone")}
          </Button>
        </div>
      )}

      <form onSubmit={handleCreate} className="space-y-4 rounded-lg border border-border-soft p-4">
        <h4 className="text-small font-semibold text-text">{t("apiKeys.newTitle")}</h4>
        <div>
          <label htmlFor="api-key-name" className={labelClassName}>{t("apiKeys.nameLabel")}</label>
          <input
            id="api-key-name"
            type="text"
            value={name}
            maxLength={API_TOKEN_NAME_MAX}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("apiKeys.namePlaceholder")}
            autoComplete="off"
            className={fieldInputClassName}
          />
          <p className="mt-1 text-caption text-text-muted">{t("apiKeys.nameHint")}</p>
        </div>

        <fieldset className="space-y-2">
          <legend className={labelClassName}>{t("apiKeys.accessLabel")}</legend>
          <ChoiceCard>
            <input type="radio" name="api-key-access" checked={preset === "read"} onChange={() => setPreset("read")} className="mt-0.5" />
            <span>
              <span className="font-medium">{t("apiKeys.accessRead")}</span>
              <span className="block text-xs text-text-muted">{t("apiKeys.accessReadHint")}</span>
            </span>
          </ChoiceCard>
          <ChoiceCard>
            <input type="radio" name="api-key-access" checked={preset === "write"} onChange={() => setPreset("write")} className="mt-0.5" />
            <span>
              <span className="font-medium">{t("apiKeys.accessWrite")}</span>
              <span className="block text-xs text-text-muted">{t("apiKeys.accessWriteHint")}</span>
            </span>
          </ChoiceCard>
        </fieldset>

        <div>
          <label htmlFor="api-key-expiry" className={labelClassName}>{t("apiKeys.expiryLabel")}</label>
          <select
            id="api-key-expiry"
            value={expiry === null ? "never" : String(expiry)}
            onChange={(event) => setExpiry(event.target.value === "never" ? null : Number(event.target.value))}
            className={fieldInputClassName}
          >
            {API_TOKEN_EXPIRY_OPTIONS.map((days) => (
              <option key={days ?? "never"} value={days === null ? "never" : String(days)}>
                {days === null ? t("apiKeys.expiryNever") : t("apiKeys.expiryDays", { count: days })}
              </option>
            ))}
          </select>
          {expiry === null && <p className="mt-1 text-caption text-text-muted">{t("apiKeys.expiryNeverHint")}</p>}
        </div>

        {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
        {rows !== null && !canCreate && <p className="text-xs text-text-muted">{t("apiKeys.limitReached")}</p>}
        <Button type="submit" size="sm" disabled={creating || !canCreate || !isValidApiTokenName(name)}>
          <KeyRound size={14} />
          {creating ? t("apiKeys.creating") : t("apiKeys.create")}
        </Button>
      </form>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-small font-semibold text-text">{t("apiKeys.listTitle")}</h4>
          {rows !== null && <span className="text-caption text-text-muted">{t("apiKeys.activeCount", { count: activeCount, max: API_TOKEN_ACTIVE_LIMIT })}</span>}
        </div>
        {rows === null && !loadFailed && <p className="text-xs text-text-muted">{t("apiKeys.loading")}</p>}
        {loadFailed && (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="text-sm text-danger">{t("apiKeys.loadFailed")}</p>
            <Button type="button" size="sm" variant="outline" onClick={reload}>{t("apiKeys.retry")}</Button>
          </div>
        )}
        {rows !== null && rows.length === 0 && <p className="text-xs text-text-muted">{t("apiKeys.empty")}</p>}
        {listError && <p role="alert" className="text-sm text-danger">{listError}</p>}
        {rows !== null && rows.length > 0 && (
          <ul className="divide-y divide-border-soft rounded-lg border border-border-soft">
            {rows.map((row) => {
              const status = apiTokenStatus(row);
              return (
                <li key={row.id} className="space-y-2 px-3.5 py-3" data-api-key-row={row.id} data-status={status}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-words text-small font-medium text-text">{row.name}</span>
                    <Badge variant={status === "active" ? "success" : status === "expired" ? "warning" : "neutral"}>
                      {t(status === "active" ? "apiKeys.statusActive" : status === "expired" ? "apiKeys.statusExpired" : "apiKeys.statusRevoked")}
                    </Badge>
                    {row.scopes.map((scope) => (
                      <Badge key={scope} variant="outline">{t(scope === "write" ? "apiKeys.scopeWrite" : "apiKeys.scopeRead")}</Badge>
                    ))}
                  </div>
                  <p className="prompt-text text-caption text-text-muted">{row.prefix}…</p>
                  <p className="text-caption text-text-muted">
                    {t("apiKeys.createdAt", { when: formatRelativeTime(row.createdAt, language) })} ·{" "}
                    {row.expiresAt ? t("apiKeys.expiresAt", { date: new Date(row.expiresAt).toLocaleDateString(language) }) : t("apiKeys.neverExpires")} ·{" "}
                    {row.lastUsedAt ? t("apiKeys.lastUsed", { when: formatRelativeTime(row.lastUsedAt, language) }) : t("apiKeys.neverUsed")}
                  </p>
                  {status === "active" &&
                    (confirmId === row.id ? (
                      <div className="space-y-2">
                        <p className="text-xs text-text-secondary">{t("apiKeys.revokeConfirm")}</p>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="danger" disabled={revokingId === row.id} onClick={() => void handleRevoke(row.id)}>
                            {revokingId === row.id ? t("apiKeys.revoking") : t("apiKeys.revokeYes")}
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={revokingId === row.id} onClick={() => setConfirmId(null)}>
                            {t("apiKeys.revokeNo")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={() => setConfirmId(row.id)}>
                        {t("apiKeys.revoke")}
                      </Button>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
