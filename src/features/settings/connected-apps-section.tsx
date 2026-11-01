"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/language-provider";
import { supabase } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/utils";
import { redirectHost } from "@/lib/oauth-consent";

interface Grant {
  clientId: string;
  name: string;
  host: string | null;
  scopes: string[];
  grantedAt: string;
}

/**
 * Ayarlar → Bağlı uygulamalar (docs/history/316-*): OAuth ile izin verilen uygulamalar; izin geri alınabilir (Supabase o istemcinin oturumlarını kapatır).
 * OAuth sunucusu projede kapalıysa liste okunamaz — bu durumda bölüm HİÇ görünmez (kapalı bir özelliği "bağlı uygulama yok" diye göstermek yalan olur).
 */
export function ConnectedAppsSection() {
  const { t, language } = useTranslation();
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.oauth
      .listGrants()
      .then(({ data, error: failure }) => {
        if (cancelled) return;
        if (failure || !Array.isArray(data)) return setHidden(true);
        setGrants(
          data.map((grant) => ({
            clientId: String(grant.client?.id ?? ""),
            name: String(grant.client?.name ?? "").slice(0, 80) || "—",
            host: redirectHost(grant.client?.uri),
            scopes: Array.isArray(grant.scopes) ? grant.scopes.map(String).slice(0, 20) : [],
            grantedAt: String(grant.granted_at ?? ""),
          })),
        );
      })
      .catch(() => !cancelled && setHidden(true));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function revoke(clientId: string) {
    setBusyId(clientId);
    setError(null);
    try {
      const { error: failure } = await supabase.auth.oauth.revokeGrant({ clientId });
      if (failure) throw failure;
      setConfirmId(null);
      setReloadKey((key) => key + 1);
    } catch {
      setError(t("apps.revokeFailed"));
    } finally {
      setBusyId(null);
    }
  }

  if (hidden || grants === null) return null;
  return (
    <div className="space-y-4 rounded-xl border border-border-soft bg-surface p-4 shadow-card sm:p-5" data-connected-apps="">
      <div className="space-y-1">
        <h3 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-text">{t("apps.title")}</h3>
        <p className="text-xs leading-relaxed text-text-muted">{t("apps.hint")}</p>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {grants.length === 0 ? (
        <p className="text-xs text-text-muted">{t("apps.empty")}</p>
      ) : (
        <ul className="divide-y divide-border-soft rounded-lg border border-border-soft">
          {grants.map((grant) => (
            <li key={grant.clientId} className="space-y-2 px-3.5 py-3" data-connected-app={grant.clientId}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 break-words text-small font-medium text-text">{grant.name}</span>
                {grant.host && <span className="break-all text-caption text-text-muted">{grant.host}</span>}
                {grant.scopes.map((scope) => (
                  <Badge key={scope} variant="outline">{scope}</Badge>
                ))}
              </div>
              {grant.grantedAt && <p className="text-caption text-text-muted">{t("apps.grantedAt", { when: formatRelativeTime(grant.grantedAt, language) })}</p>}
              {confirmId === grant.clientId ? (
                <div className="space-y-2">
                  <p className="text-xs text-text-secondary">{t("apps.revokeConfirm")}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="danger" disabled={busyId === grant.clientId} onClick={() => void revoke(grant.clientId)}>
                      {t("apps.revokeYes")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={busyId === grant.clientId} onClick={() => setConfirmId(null)}>
                      {t("apiKeys.revokeNo")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmId(grant.clientId)}>
                  {t("apps.revoke")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
