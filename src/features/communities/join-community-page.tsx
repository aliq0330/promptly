"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Globe, Link2Off, Loader2, Lock } from "lucide-react";
import { Button, buttonClassName } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldControlClassName, fieldLabelClassName } from "@/components/ui/field";
import { useAuthStatus } from "@/features/auth/use-auth-status";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { RulesAcceptBox } from "./rules-accept";
import { joinCommunityViaLink, previewCommunityLink, type CommunityLinkPreview } from "@/lib/supabase/communities";
import { CATEGORY_LABEL_KEYS, communityHref } from "@/lib/communities";
import { Badge } from "@/components/ui/badge";
import { GROUP_REQUEST_MESSAGE_MAX, isValidGroupToken } from "@/lib/chat-groups";
import { authHref } from "@/lib/auth-redirect";
import { useTranslation } from "@/lib/i18n/language-provider";
import { memberCountText } from "@/lib/group-labels";

const TOKEN_STORAGE_KEY = "promptly-group-join-token";

/** Token'ı URL parçasından (`#…`) okur; giriş sayfasına gidip dönülürse kaybolmasın diye oturum depolamasına da yazılır. */
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

function clearToken() {
  try {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* yok say */
  }
}

type Loaded = { token: string; preview: CommunityLinkPreview | null; error: boolean };

/**
 * `/communities/join#<token>` (eski `/groups/join#<token>` de aynı sayfa): davet bağlantısının açılış sayfası. Token URL parçasındadır
 * (sunucuya/günlüklere gitmez). Bağlantı geçerliyse topluluğun kartını ve KURALLARINI gösterir; herkese açık toplulukta doğrudan katılır,
 * kapalı toplulukta başvuru gönderir (başvuru kimseyi üye YAPMAZ, bir yönetici onaylar). Kuralların kabulü zorunluysa onay kutusu
 * işaretlenmeden devam edilemez. Geçersiz/iptal/süresi dolmuş bağlantı hiçbir topluluk bilgisi vermez.
 */
export function JoinCommunityPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const status = useAuthStatus();
  const { refresh } = useRealMessages();
  // undefined = henüz okunmadı (sunucu çıktısıyla uyum için ilk boyamada okunmaz); null = geçerli token yok.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [message, setMessage] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [result, setResult] = useState<"requested" | "already_requested" | null>(null);
  const action = useAsyncAction();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL parçası yalnızca tarayıcıda okunabilir; bir kez, bağlandıktan sonra
    setToken(readToken());
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !token) return;
    let cancelled = false;
    previewCommunityLink(token)
      .then((preview) => {
        if (!cancelled) setLoaded({ token, preview, error: false });
      })
      .catch((err) => {
        console.error("previewCommunityLink", err);
        if (!cancelled) setLoaded({ token, preview: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [status, token]);

  async function submit() {
    if (!token) return;
    const outcome = await action.run(() => joinCommunityViaLink(token, message, accepted));
    if (!outcome) return;
    if (outcome.outcome === "joined" || outcome.outcome === "already_member") {
      clearToken();
      void refresh();
      if (outcome.groupId) router.push(communityHref(outcome.groupId));
      else router.push("/communities");
      return;
    }
    setResult(outcome.outcome === "already_requested" ? "already_requested" : "requested");
  }

  const shell = (children: React.ReactNode) => <div className="mx-auto w-full max-w-md px-3 py-10 sm:px-5">{children}</div>;

  if (token === undefined || (token && status === "loading")) {
    return shell(
      <p role="status" className="flex items-center justify-center gap-2 py-10 text-small text-text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("common.loading")}
      </p>,
    );
  }
  if (!token) {
    return shell(<EmptyState icon={Link2Off} title={t("groups.join.invalidTitle")} description={t("groups.join.invalidBody")} action={{ label: t("communities.join.toCommunities"), href: "/communities" }} />);
  }
  if (status === "loading") {
    return shell(
      <p role="status" className="flex items-center justify-center gap-2 py-10 text-small text-text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("common.loading")}
      </p>,
    );
  }
  if (status === "unauthenticated") {
    return shell(
      <div className="space-y-4 rounded-xl border border-border-soft bg-surface p-6 text-center shadow-card">
        <h1 className="text-h3 font-semibold text-text">{t("groups.join.loginTitle")}</h1>
        <p className="text-small text-text-muted">{t("groups.join.loginBody")}</p>
        <Link href={authHref("/login", "/communities/join")} className={buttonClassName({ size: "md" })}>
          {t("common.login")}
        </Link>
      </div>,
    );
  }

  const current = loaded && loaded.token === token ? loaded : null;
  if (!current) {
    return shell(
      <p role="status" className="flex items-center justify-center gap-2 py-10 text-small text-text-muted">
        <Loader2 size={16} className="animate-spin" /> {t("common.loading")}
      </p>,
    );
  }
  if (current.error) {
    return shell(
      <div className="space-y-3 rounded-xl border border-border-soft bg-surface px-6 py-10 text-center">
        <p role="alert" className="text-small text-danger">
          {t("groups.join.loadError")}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setLoaded(null)}>
          {t("common.retry")}
        </Button>
      </div>,
    );
  }
  const preview = current.preview;
  if (!preview) {
    return shell(<EmptyState icon={Link2Off} title={t("groups.join.invalidTitle")} description={t("groups.join.invalidBody")} action={{ label: t("communities.join.toCommunities"), href: "/communities" }} />);
  }

  const full = preview.memberCount >= preview.memberLimit;
  const isPrivate = preview.visibility === "private";

  return shell(
    <div className="space-y-5 rounded-xl border border-border-soft bg-surface p-6 shadow-card">
      <div className="flex items-start gap-3">
        <GroupAvatar name={preview.name} avatarUrl={preview.avatarUrl} size={56} badge />
        <div className="min-w-0 space-y-1">
          <h1 className="break-words text-h3 font-semibold text-text">{preview.name}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-muted">
            <Badge variant="neutral">{t(CATEGORY_LABEL_KEYS[preview.category])}</Badge>
            <span>{memberCountText(t, preview.memberCount)}</span>
            <span className="flex items-center gap-1">
              {isPrivate ? <Lock size={12} aria-hidden /> : <Globe size={12} aria-hidden />}
              {isPrivate ? t("groups.visibility.private") : t("groups.visibility.public")}
            </span>
          </p>
        </div>
      </div>
      {preview.description && <p className="break-words text-small text-text-secondary">{preview.description}</p>}
      {preview.closed && <p role="status" className="rounded-md bg-warning/10 px-3 py-2 text-small text-text">{t("communities.join.closedNote")}</p>}

      {preview.myStatus === "member" ? (
        <div className="space-y-3">
          <p className="text-small text-text-muted">{t("groups.join.alreadyMember")}</p>
          {preview.groupId && (
            <Link href={communityHref(preview.groupId)} className={buttonClassName({ size: "md", className: "w-full" })}>
              {t("groups.page.open")}
            </Link>
          )}
        </div>
      ) : preview.myStatus === "requested" || result ? (
        <p role="status" className="rounded-md bg-primary-soft/60 px-3 py-2.5 text-small text-text">
          {result === "already_requested" || preview.myStatus === "requested" ? t("groups.join.alreadyRequested") : t("groups.join.requested")}
        </p>
      ) : (
        <div className="space-y-3">
          {isPrivate && (
            <div>
              <label htmlFor="join-message" className={fieldLabelClassName}>
                {t("groups.join.messageLabel")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
              </label>
              <textarea
                id="join-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={3}
                maxLength={GROUP_REQUEST_MESSAGE_MAX}
                disabled={action.busy}
                placeholder={t("groups.join.messagePlaceholder")}
                className={`${fieldControlClassName} resize-none py-2.5`}
              />
              <p className="mt-1 text-caption text-text-muted">{t("groups.join.requestHelp")}</p>
            </div>
          )}
          {preview.rules && (
            preview.rulesRequired ? (
              <RulesAcceptBox rules={preview.rules} accepted={accepted} onChange={setAccepted} disabled={action.busy} />
            ) : (
              <div className="space-y-1.5">
                <h3 className="text-label font-semibold text-text">{t("communities.rules.title")}</h3>
                <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border-soft bg-background px-3.5 py-3 text-small text-text-secondary">{preview.rules}</div>
              </div>
            )
          )}
          {full && !isPrivate && (
            <p role="alert" className="text-small text-danger">
              {t("groups.error.member_limit_reached")}
            </p>
          )}
          {action.error && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
              {action.error}
            </p>
          )}
          <Button type="button" className="w-full" onClick={() => void submit()} disabled={action.busy || preview.closed || (full && !isPrivate) || (preview.rulesRequired && !accepted)}>
            {action.busy ? t("common.loading") : isPrivate ? t("groups.join.sendRequest") : t("groups.join.joinNow")}
          </Button>
        </div>
      )}
    </div>,
  );
}
