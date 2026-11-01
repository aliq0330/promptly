"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
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
  return (
    <PageContainer className="mx-auto max-w-lg space-y-6 py-10">
      <header data-oauth-connect="" className="space-y-2">
        <h1 className="break-words font-display text-h1 text-text [overflow-wrap:anywhere]">{t("oauth.heading", { name: info.clientName })}</h1>
        <dl className="space-y-1 text-small text-text-secondary">
          {info.clientUri && (
            <div className="flex gap-2">
              <dt className="text-text-muted">{t("oauth.site")}</dt>
              <dd className="break-all">{info.clientUri}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="text-text-muted">{t("oauth.returnTo")}</dt>
            <dd className="break-all font-medium text-text">{info.redirectHost ?? t("oauth.unknownHost")}</dd>
          </div>
        </dl>
      </header>

      <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-4">
        <p className="flex items-center gap-2 text-small font-semibold text-text">
          <ShieldAlert size={16} className="text-warning" />
          {t("connect.warnTitle")}
        </p>
        <p className="text-small leading-relaxed text-text-secondary">{t("connect.warnBody")}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-small font-semibold text-text">{t("connect.canTitle")}</h2>
        <ul className="list-disc space-y-1 pl-5 text-small leading-relaxed text-text-secondary marker:text-text-muted">
          <li>{t("connect.canRead")}</li>
        </ul>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border-soft bg-surface p-3">
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={write} disabled={busy} onChange={(event) => setWrite(event.target.checked)} />
          <span className="space-y-0.5">
            <span className="block text-small font-medium text-text">{t("connect.writeLabel")}</span>
            <span className="block text-caption leading-relaxed text-text-muted">{t("connect.writeHint")}</span>
          </span>
        </label>
        <h2 className="pt-1 text-small font-semibold text-text">{t("connect.cannotTitle")}</h2>
        <p className="text-small leading-relaxed text-text-secondary">{t("connect.cannotBody")}</p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={busy} onClick={() => void decide(true)}>
          {busy ? t("oauth.working") : t("oauth.allow")}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void decide(false)}>
          {t("oauth.deny")}
        </Button>
      </div>
      <p className="text-caption text-text-muted">{t("connect.revokeHint")}</p>
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
