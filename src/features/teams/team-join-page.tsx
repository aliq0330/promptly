"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Link2Off } from "@/components/icons/link-2off";
import { Loader2 } from "@/components/icons/loader-2";
import { Button, buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuthStatus } from "@/features/auth/use-auth-status";
import { authHref } from "@/lib/auth-redirect";
import { isValidGroupToken } from "@/lib/chat-groups";
import { useTranslation } from "@/lib/i18n/language-provider";
import { joinTeamViaLink, previewTeamLink, type TeamActionError, type TeamLinkPreview } from "@/lib/supabase/teams";
import { teamLink } from "@/lib/teams";
import { RoleChip, TeamMark } from "./team-ui";

const TOKEN_STORAGE_KEY = "promptly-team-join-token";

function readToken(): string | null {
  const fromHash = window.location.hash.replace(/^#/, "");
  if (isValidGroupToken(fromHash)) {
    try {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, fromHash);
    } catch {
      /* depolama kapalı olabilir; bağlantı yine çalışır */
    }
    return fromHash;
  }
  try {
    const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    return stored && isValidGroupToken(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * `/team-join#<jeton>`: ekip davet bağlantısının açılış sayfası. Jeton URL parçasındadır (sunucuya/günlüğe gitmez). Geçersiz, iptal edilmiş ya da süresi dolmuş
 * bağlantı ekip bilgisi vermez. Alan adı/e-posta ile katılma yoktur: yalnız kullanıcı adına davet ve bu bağlantı.
 */
export function TeamJoinPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const status = useAuthStatus();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [preview, setPreview] = useState<TeamLinkPreview | null | "error">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL parçası yalnızca tarayıcıda okunabilir
    setToken(readToken());
  }, []);
  useEffect(() => {
    if (status !== "authenticated" || !token) return;
    let cancelled = false;
    previewTeamLink(token).then(
      (value) => !cancelled && setPreview(value),
      () => !cancelled && setPreview("error"),
    );
    return () => {
      cancelled = true;
    };
  }, [status, token]);

  const shell = (children: React.ReactNode) => <div className="mx-auto w-full max-w-md px-3 py-10 sm:px-5">{children}</div>;
  const loading = shell(
    <p role="status" className="flex items-center justify-center gap-2 py-10 text-small text-text-muted">
      <Loader2 size={16} className="animate-spin" /> {t("common.loading")}
    </p>,
  );

  if (token === undefined || status === "loading") return loading;
  if (!token) return shell(<EmptyState icon={Link2Off} title={t("tm.join.invalidTitle")} description={t("tm.join.invalidBody")} action={{ label: t("tm.page.backToTeams"), href: "/teams" }} />);
  if (status === "unauthenticated") {
    return shell(
      <div className="space-y-4 rounded-xl border border-border-soft bg-surface p-6 text-center shadow-card">
        <h1 className="text-h3 font-semibold">{t("tm.join.loginTitle")}</h1>
        <p className="text-small text-text-muted">{t("tm.join.loginBody")}</p>
        <Link href={authHref("/login", "/team-join")} className={buttonClassName({ size: "md" })}>
          {t("common.login")}
        </Link>
      </div>,
    );
  }
  if (preview === null) return loading;
  if (preview === "error" || !preview.valid) {
    return shell(<EmptyState icon={Link2Off} title={t("tm.join.invalidTitle")} description={t("tm.join.invalidBody")} action={{ label: t("tm.page.backToTeams"), href: "/teams" }} />);
  }

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await joinTeamViaLink(token);
      try {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      } catch {
        /* yok say */
      }
      router.push(teamLink(result.slug));
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };

  return shell(
    <div className="space-y-4 rounded-xl border border-border-soft bg-surface p-6 text-center shadow-card" data-testid="team-join">
      <div className="flex justify-center">
        <TeamMark name={preview.teamName} tone={preview.tone} size={64} />
      </div>
      <h1 className="text-h2">{preview.teamName}</h1>
      <p className="flex items-center justify-center gap-2 text-small text-text-secondary">
        {t("tm.card.members", { count: preview.memberCount })} · <RoleChip role={preview.role} />
      </p>
      {preview.alreadyMember ? (
        <Link href="/teams" className={buttonClassName({ size: "lg" })}>
          {t("tm.join.alreadyMember")}
        </Link>
      ) : (
        <Button type="button" size="lg" onClick={() => void join()} disabled={busy} data-team-join>
          {t("tm.join.button")}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
    </div>,
  );
}
