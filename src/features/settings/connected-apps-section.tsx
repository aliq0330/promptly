"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { supabase } from "@/lib/supabase/client";
import { listMyOauthGrants, revokeMyOauthGrant } from "@/lib/supabase/oauth-grants";
import { cn, formatRelativeTime } from "@/lib/utils";
import { redirectHost } from "@/lib/oauth-consent";

/** `own` = Promptly'nin kendi OAuth sunucusu (sınırlı `pmt_` belirteci, docs/history/317-*); `legacy` = daha önce Supabase'in OAuth'uyla verilmiş izin (hesabın TAMAMI, 316-*). */
interface Grant {
  key: string;
  source: "own" | "legacy";
  /** own: izin kimliği; legacy: Supabase istemci kimliği. */
  id: string;
  name: string;
  host: string | null;
  scopes: string[];
  grantedAt: string;
  lastUsedAt: string | null;
}

/**
 * Ayarlar → Bağlı uygulamalar (docs/history/319-*; kullanıcı mockup C'yi seçti): her uygulama kendi kartı — ad + "Bağlı" durumu, izin çipleri, verilme/son kullanım
 * satırı ve tam genişlik "İzni geri al" (iki adımlı onay; belirteçler hemen kapanır). Eski (Supabase OAuth) izinleri, OAuth sunucusu orada kapalıysa
 * listelenemez — bu durumda yalnız kendi izinlerimiz görünür. (Mockup'taki "kalan süre" çubuğu için listede erişim belirtecinin bitiş zamanı yok; eklenmedi.)
 */
export function ConnectedAppsSection() {
  const { t, language } = useTranslation();
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listMyOauthGrants().catch(() => null),
      supabase.auth.oauth
        .listGrants()
        .then(({ data, error: failure }) => (failure || !Array.isArray(data) ? [] : data))
        .catch(() => []),
    ]).then(([own, legacy]) => {
      if (cancelled) return;
      if (own === null && legacy.length === 0) return setGrants(null);
      const rows: Grant[] = [
        ...(own ?? []).map((grant): Grant => ({ key: `own:${grant.id}`, source: "own", id: grant.id, name: grant.name, host: grant.host, scopes: grant.scopes, grantedAt: grant.createdAt, lastUsedAt: grant.lastUsedAt })),
        ...legacy.map((grant): Grant => ({
          key: `legacy:${String(grant.client?.id ?? "")}`,
          source: "legacy",
          id: String(grant.client?.id ?? ""),
          name: String(grant.client?.name ?? "").slice(0, 80) || "—",
          host: redirectHost(grant.client?.uri),
          scopes: Array.isArray(grant.scopes) ? grant.scopes.map(String).slice(0, 20) : [],
          grantedAt: String(grant.granted_at ?? ""),
          lastUsedAt: null,
        })),
      ];
      setGrants(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function revoke(grant: Grant) {
    setBusyKey(grant.key);
    setError(null);
    try {
      if (grant.source === "own") await revokeMyOauthGrant(grant.id);
      else {
        const { error: failure } = await supabase.auth.oauth.revokeGrant({ clientId: grant.id });
        if (failure) throw failure;
      }
      setConfirmKey(null);
      setReloadKey((key) => key + 1);
    } catch {
      setError(t("apps.revokeFailed"));
    } finally {
      setBusyKey(null);
    }
  }

  if (grants === null) return null;
  return (
    <section className="space-y-3" data-connected-apps="">
      <div className="space-y-1 px-1">
        <h3 className="font-display text-h3 font-bold tracking-[-0.02em] text-text">{t("apps.title")}</h3>
        <p className="text-caption leading-relaxed text-text-muted">{t("apps.hint")}</p>
      </div>
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
      {grants.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-5 text-small text-text-muted">{t("apps.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {grants.map((grant) => (
            <li key={grant.key} className="space-y-3 rounded-lg border border-border-soft bg-surface p-4 shadow-card" data-connected-app={grant.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-[0.9375rem] font-semibold tracking-[-0.01em] text-text [overflow-wrap:anywhere]">{grant.name}</p>
                  {grant.host && <p className="break-all text-caption text-text-muted">{grant.host}</p>}
                </div>
                <span className="shrink-0 rounded-full bg-success/10 px-2.5 py-0.5 text-caption font-bold text-success">{t("apps.connected")}</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {grant.source === "legacy" ? (
                  <span className="rounded-full bg-warning/10 px-2.5 py-0.5 text-caption font-bold text-warning">{t("apps.legacy")}</span>
                ) : (
                  grant.scopes.map((scope) => (
                    <span
                      key={scope}
                      className={cn("rounded-full px-2.5 py-0.5 text-caption font-bold", scope === "write" ? "bg-secondary/10 text-secondary" : "bg-primary-soft text-primary")}
                    >
                      {scope === "write" ? t("apps.scope.write") : t("apps.scope.read")}
                    </span>
                  ))
                )}
              </div>

              <p className="text-caption leading-relaxed text-text-muted">
                {grant.grantedAt ? t("apps.grantedAt", { when: formatRelativeTime(grant.grantedAt, language) }) : ""}
                {grant.source === "own" && (grant.grantedAt ? " · " : "")}
                {grant.source === "own" && (grant.lastUsedAt ? t("apps.lastUsed", { when: formatRelativeTime(grant.lastUsedAt, language) }) : t("apps.neverUsed"))}
              </p>

              {confirmKey === grant.key ? (
                <div className="space-y-2.5 rounded-lg bg-danger/10 p-3">
                  <p className="text-caption leading-relaxed text-text-secondary">{t("apps.revokeConfirm")}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="danger" disabled={busyKey === grant.key} onClick={() => void revoke(grant)}>
                      {t("apps.revokeYes")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={busyKey === grant.key} onClick={() => setConfirmKey(null)}>
                      {t("apiKeys.revokeNo")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-danger/30 bg-danger/10 text-danger hover:border-danger/50 hover:bg-danger/15"
                  onClick={() => setConfirmKey(grant.key)}
                >
                  {t("apps.revoke")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
