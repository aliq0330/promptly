"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/ui/page-header";
import { usePageTitle } from "@/components/layout/page-title";
import { RequireAuth } from "@/features/auth/require-auth";
import { useTranslation } from "@/lib/i18n/language-provider";
import { parseAuthorizationId, redirectHost, safeRedirectUrl, splitScopes } from "@/lib/oauth-consent";
import { supabase } from "@/lib/supabase/client";

interface Details {
  clientName: string;
  clientHost: string | null;
  redirectHost: string | null;
  scopes: string[];
}

type State = { kind: "loading" } | { kind: "ready"; details: Details } | { kind: "working"; details: Details } | { kind: "error" } | { kind: "leaving" };

/**
 * OAuth onay ekranı (docs/history/316-*): Supabase Auth'un OAuth 2.1 sunucusu (claude.ai / ChatGPT gibi bir istemci için) kullanıcıyı buraya yollar. Kullanıcı
 * İZİN VER / REDDET der; Supabase yönlendirme adresini verir. Verilen belirteç kullanıcının standart Supabase belirtecidir — bu yüzden ekran, iznin hesap
 * adına çalışacağını açıkça söyler ve istemci adını/adresini GÜVENMEDEN, yönlendirme alan adıyla birlikte gösterir (kimlik avına karşı).
 */
function ConsentInner() {
  const { t } = useTranslation();
  usePageTitle(t("oauth.title"));
  const params = useSearchParams();
  const authorizationId = parseAuthorizationId(params.get("authorization_id"));
  const [state, setState] = useState<State>(authorizationId ? { kind: "loading" } : { kind: "error" });

  useEffect(() => {
    if (!authorizationId) return;
    let cancelled = false;
    supabase.auth.oauth
      .getAuthorizationDetails(authorizationId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) return setState({ kind: "error" });
        // Daha önce izin verilmişse Supabase doğrudan yönlendirme adresini verir.
        if ("redirect_url" in data) {
          const target = safeRedirectUrl(data.redirect_url);
          if (!target) return setState({ kind: "error" });
          setState({ kind: "leaving" });
          window.location.assign(target);
          return;
        }
        setState({
          kind: "ready",
          details: {
            clientName: String(data.client?.name ?? "").slice(0, 80) || "—",
            clientHost: redirectHost(data.client?.uri),
            redirectHost: redirectHost(data.redirect_uri),
            scopes: splitScopes(data.scope),
          },
        });
      })
      .catch(() => !cancelled && setState({ kind: "error" }));
    return () => {
      cancelled = true;
    };
  }, [authorizationId]);

  async function decide(action: "approve" | "deny") {
    if (state.kind !== "ready" || !authorizationId) return;
    const details = state.details;
    setState({ kind: "working", details });
    try {
      const call = action === "approve" ? supabase.auth.oauth.approveAuthorization : supabase.auth.oauth.denyAuthorization;
      const { data, error } = await call.call(supabase.auth.oauth, authorizationId, { skipBrowserRedirect: true });
      const target = safeRedirectUrl(data?.redirect_url);
      if (error || !target) return setState({ kind: "error" });
      setState({ kind: "leaving" });
      window.location.assign(target);
    } catch {
      setState({ kind: "error" });
    }
  }

  if (state.kind === "loading" || state.kind === "leaving") {
    return (
      <PageContainer className="mx-auto max-w-lg py-16 text-center text-small text-text-muted">
        <p role="status">{state.kind === "leaving" ? t("oauth.leaving") : t("common.loading")}</p>
      </PageContainer>
    );
  }
  if (state.kind === "error") {
    return (
      <PageContainer className="mx-auto max-w-lg space-y-3 py-12">
        <h1 className="font-display text-h1 text-text">{t("oauth.errorTitle")}</h1>
        <p role="alert" className="text-body leading-relaxed text-text-secondary">{t("oauth.errorBody")}</p>
      </PageContainer>
    );
  }

  const { details } = state;
  const busy = state.kind === "working";
  return (
    <PageContainer className="mx-auto max-w-lg space-y-6 py-10">
      <header data-oauth-consent="" className="space-y-2">
        <h1 className="break-words font-display text-h1 text-text [overflow-wrap:anywhere]">{t("oauth.heading", { name: details.clientName })}</h1>
        <dl className="space-y-1 text-small text-text-secondary">
          {details.clientHost && (
            <div className="flex gap-2">
              <dt className="text-text-muted">{t("oauth.site")}</dt>
              <dd className="break-all">{details.clientHost}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="text-text-muted">{t("oauth.returnTo")}</dt>
            <dd className="break-all">{details.redirectHost ?? t("oauth.unknownHost")}</dd>
          </div>
        </dl>
      </header>

      <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-4">
        <p className="flex items-center gap-2 text-small font-semibold text-text">
          <ShieldAlert size={16} className="text-warning" />
          {t("oauth.warnTitle")}
        </p>
        <p className="text-small leading-relaxed text-text-secondary">{t("oauth.warnBody")}</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-small font-semibold text-text">{t("oauth.whatItDoes")}</h2>
        <p className="text-small leading-relaxed text-text-secondary">{t("oauth.whatItDoesBody")}</p>
        {details.scopes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-caption text-text-muted">{t("oauth.requestedScopes")}</span>
            {details.scopes.map((scope) => (
              <Badge key={scope} variant="outline">{scope}</Badge>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={busy} onClick={() => void decide("approve")}>
          {busy ? t("oauth.working") : t("oauth.allow")}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void decide("deny")}>
          {t("oauth.deny")}
        </Button>
      </div>
      <p className="text-caption text-text-muted">{t("oauth.revokeHint")}</p>
    </PageContainer>
  );
}

export function OAuthConsentRoute() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <ConsentInner />
      </Suspense>
    </RequireAuth>
  );
}
