"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check } from "@/components/icons/check";
import { Copy } from "@/components/icons/copy";
import { KeyRound } from "@/components/icons/key-round";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { OptionCheckbox, OptionGroup } from "@/components/ui/option-group";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  API_TOKEN_ACTIVE_LIMIT,
  API_TOKEN_DEFAULT_EXPIRY,
  API_TOKEN_EXPIRY_OPTIONS,
  API_TOKEN_NAME_MAX,
  apiTokenScopes,
  activeApiTokenCount,
  canCreateApiToken,
  isValidApiTokenName,
  type ApiTokenPreset,
  type ApiTokenRow,
} from "@/lib/api-tokens";
import { createApiToken, listMyApiTokens, type CreatedApiToken } from "@/lib/supabase/api-tokens";
import { copyTextToClipboard } from "@/lib/utils";

const labelClassName = "mb-1.5 block text-small text-text-secondary";

/**
 * Ayarlar → Geliştirici anahtarları (docs/history/314-*): kişisel API anahtarı oluştur / listele / iptal et. Ham anahtar yalnız oluşturma
 * yanıtında bir kez görünür (sunucuda yalnız özeti durur); bu bileşen onu yalnız bellekte tutar ve "kaydettim" denince atar.
 */
export function ApiKeysSection() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ApiTokenRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<ApiTokenPreset>("read");
  const [interact, setInteract] = useState(false);
  const [expiry, setExpiry] = useState<number | null>(API_TOKEN_DEFAULT_EXPIRY);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const [copied, setCopied] = useState(false);

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
      const token = await createApiToken({ name, scopes: apiTokenScopes(preset, interact), expiresInDays: expiry });
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

  return (
    <div className="space-y-4" data-api-keys="">

      {created && (
        <div role="status" className="space-y-3 rounded-lg border border-primary/40 bg-primary-soft p-4" data-api-key-reveal="">
          <div className="space-y-1">
            <p className="text-small font-semibold text-text">{t("apiKeys.revealTitle")}</p>
            <p className="text-caption leading-relaxed text-text-secondary">{t("apiKeys.revealBody")}</p>
          </div>
          <div className="relative rounded-lg card-flat">
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
          <Input
            id="api-key-name"
            type="text"
            value={name}
            maxLength={API_TOKEN_NAME_MAX}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("apiKeys.namePlaceholder")}
            autoComplete="off"
          />
          <p className="mt-1 text-caption text-text-muted">{t("apiKeys.nameHint")}</p>
        </div>

        <div className="space-y-2">
          <p id="api-key-access-label" className={labelClassName}>
            {t("apiKeys.accessLabel")}
          </p>
          <OptionGroup<ApiTokenPreset>
            labelledBy="api-key-access-label"
            value={preset}
            onChange={setPreset}
            options={[
              { key: "read", label: t("apiKeys.accessRead"), description: t("apiKeys.accessReadHint") },
              { key: "write", label: t("apiKeys.accessWrite"), description: t("apiKeys.accessWriteHint") },
            ]}
          />
          <OptionCheckbox checked={interact} onChange={setInteract} label={t("apiKeys.accessInteract")} description={t("apiKeys.accessInteractHint")} attrs={{ "data-api-key-interact": "" }} />
        </div>

        <div>
          <label htmlFor="api-key-expiry" className={labelClassName}>{t("apiKeys.expiryLabel")}</label>
          <Select
            id="api-key-expiry"
            value={expiry === null ? "never" : String(expiry)}
            onChange={(event) => setExpiry(event.target.value === "never" ? null : Number(event.target.value))}
          >
            {API_TOKEN_EXPIRY_OPTIONS.map((days) => (
              <option key={days ?? "never"} value={days === null ? "never" : String(days)}>
                {days === null ? t("apiKeys.expiryNever") : t("apiKeys.expiryDays", { count: days })}
              </option>
            ))}
          </Select>
          {expiry === null && <p className="mt-1 text-caption text-text-muted">{t("apiKeys.expiryNeverHint")}</p>}
        </div>

        {formError && <p role="alert" className="text-small text-danger">{formError}</p>}
        {rows !== null && !canCreate && <p className="text-caption text-text-muted">{t("apiKeys.limitReached")}</p>}
        <Button type="submit" size="sm" disabled={creating || !canCreate || !isValidApiTokenName(name)}>
          <KeyRound size={16} />
          {creating ? t("apiKeys.creating") : t("apiKeys.create")}
        </Button>
      </form>

      <p className="text-caption leading-relaxed text-text-muted" data-api-keys-count="">
        {rows !== null && <>{t("apiKeys.activeCount", { count: activeCount, max: API_TOKEN_ACTIVE_LIMIT })} · </>}
        <Link href="/settings/developer/" className="font-medium text-primary-text hover:underline">{t("devSettings.access.title")}</Link>
      </p>
      {loadFailed && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-small text-danger">{t("apiKeys.loadFailed")}</p>
          <Button type="button" size="sm" variant="outline" onClick={reload}>{t("apiKeys.retry")}</Button>
        </div>
      )}
    </div>
  );
}
