"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Plus, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-header";
import { usePageTitle } from "@/components/layout/page-title";
import { RequireAuth } from "@/features/auth/require-auth";
import { useTranslation } from "@/lib/i18n/language-provider";
import { buildReturnUrl, parseConnectInfo, parseConnectRequest, type ConnectInfo } from "@/lib/oauth-connect";
import { decideOauthRequest, fetchOauthRequestInfo } from "@/lib/supabase/oauth-grants";

type State = { kind: "loading" } | { kind: "ready"; info: ConnectInfo } | { kind: "working"; info: ConnectInfo } | { kind: "error" } | { kind: "leaving" };

/**
 * Promptly'nin KENDİ OAuth sunucusunun onay ekranı (docs/history/317-*): claude.ai / ChatGPT gibi bir bağlayıcı kullanıcıyı buraya yollar. Verilen belirteç hesabın
 * tamamı değil, SINIRLI bir `pmt_` anahtarıdır (okuma; istenirse özel taslak ekleme). Yazma izni varsayılan KAPALIdır ve açıkça işaretlenir. Uygulama adı/sitesi
 * kaydedenin yazdığı bilgidir — ekran bunu söyler ve dönüş alan adını ayrıca gösterir (kimlik avına karşı).
 */
function ConnectInner() {
  const { t } = useTranslation();
  usePageTitle(t("connect.title"));
  const params = useSearchParams();
  const request = parseConnectRequest(params.get("request"));
  const [state, setState] = useState<State>(request ? { kind: "loading" } : { kind: "error" });
  const [write, setWrite] = useState(false);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    fetchOauthRequestInfo(request)
      .then((raw) => {
        if (cancelled) return;
        const info = parseConnectInfo(raw);
        setState(info ? { kind: "ready", info } : { kind: "error" });
      })
      .catch(() => !cancelled && setState({ kind: "error" }));
    return () => {
      cancelled = true;
    };
  }, [request]);

  async function decide(approve: boolean) {
    if (state.kind !== "ready" || !request) return;
    const info = state.info;
    setState({ kind: "working", info });
    try {
      const target = buildReturnUrl(await decideOauthRequest(request, approve, approve && write));
      if (!target) return setState({ kind: "error" });
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

  const { info } = state;
  const busy = state.kind === "working";
  const initial = Array.from(info.clientName)[0]?.toUpperCase() ?? "?";
  return (
    <PageContainer className="mx-auto max-w-md space-y-5 py-8">
      <header data-oauth-connect="" className="space-y-4 text-center">
        <div aria-hidden className="flex items-center justify-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border-soft bg-secondary/10 font-display text-2xl font-bold text-secondary">{initial}</span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-border-strong" />
            <span className="h-1.5 w-1.5 rounded-full bg-border-strong" />
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary font-display text-2xl font-bold text-primary-foreground">P</span>
        </div>
        <h1 className="break-words font-display text-h1 text-text [overflow-wrap:anywhere]">{t("oauth.heading", { name: info.clientName })}</h1>
        <dl className="space-y-1 text-small text-text-secondary">
          {info.clientUri && (
            <div className="flex flex-wrap justify-center gap-x-2">
              <dt className="text-text-muted">{t("oauth.site")}</dt>
              <dd className="break-all">{info.clientUri}</dd>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-x-2">
            <dt className="text-text-muted">{t("oauth.returnTo")}</dt>
            <dd className="break-all font-medium text-text">{info.redirectHost ?? t("oauth.unknownHost")}</dd>
          </div>
        </dl>
      </header>

      <div className="divide-y divide-border-soft rounded-xl border border-border-soft bg-surface shadow-card">
        <div className="flex items-start gap-3 p-4">
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
            <Check size={16} strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="text-small font-semibold text-text">{t("connect.rowRead")}</p>
            <p className="text-caption leading-relaxed text-text-muted">{t("connect.canRead")}</p>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-3 p-4">
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Plus size={16} strokeWidth={2.5} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-small font-semibold text-text">{t("connect.writeLabel")}</span>
            <span className="block text-caption leading-relaxed text-text-muted">{t("connect.writeHint")}</span>
          </span>
          <input type="checkbox" role="switch" className="peer sr-only" checked={write} disabled={busy} onChange={(event) => setWrite(event.target.checked)} />
          <span
            aria-hidden
            className="relative h-7 w-12 shrink-0 rounded-full bg-border-strong transition-colors duration-200 ease-soft after:absolute after:left-0.5 after:top-0.5 after:h-6 after:w-6 after:rounded-full after:bg-surface-elevated after:shadow-sm after:transition-transform after:duration-200 peer-checked:bg-primary peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background peer-disabled:opacity-60"
          />
        </label>
        <div className="flex items-start gap-3 p-4">
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
            <X size={16} strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="text-small font-semibold text-text">{t("connect.rowNever")}</p>
            <p className="text-caption leading-relaxed text-text-muted">{t("connect.cannotBody")}</p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5 rounded-lg border border-warning/40 bg-warning/10 p-4">
        <p className="flex items-center gap-2 text-small font-semibold text-text">
          <ShieldAlert size={16} className="shrink-0 text-warning" />
          {t("connect.warnTitle")}
        </p>
        <p className="text-small leading-relaxed text-text-secondary">{t("connect.warnBody")}</p>
      </div>

      <div className="space-y-2">
        <Button type="button" size="lg" className="w-full" disabled={busy} onClick={() => void decide(true)}>
          {busy ? t("oauth.working") : t("oauth.allow")}
        </Button>
        <Button type="button" variant="ghost" size="lg" className="w-full" disabled={busy} onClick={() => void decide(false)}>
          {t("oauth.deny")}
        </Button>
      </div>
      <p className="text-center text-caption text-text-muted">{t("connect.revokeHint")}</p>
    </PageContainer>
  );
}

export function OAuthConnectRoute() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <ConnectInner />
      </Suspense>
    </RequireAuth>
  );
}
