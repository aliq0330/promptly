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
import { GroupAvatar } from "./group-avatar";
import { useAsyncAction } from "./use-async-action";
import { joinChatGroupViaLink, previewChatGroupLink, type GroupLinkPreview } from "@/lib/supabase/chat-groups";
import { GROUP_REQUEST_MESSAGE_MAX, isValidGroupToken } from "@/lib/chat-groups";
import { authHref } from "@/lib/auth-redirect";
import { messageHref } from "@/lib/utils";
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

type Loaded = { token: string; preview: GroupLinkPreview | null; error: boolean };

/**
 * `/groups/join#<token>`: davet bağlantısının açılış sayfası. Token URL parçasındadır (sunucuya/günlüklere gitmez).
 * Bağlantı geçerliyse grubun kartını gösterir; herkese açık grupta doğrudan katılır, kapalı grupta başvuru gönderir
 * (başvuru kimseyi üye YAPMAZ, bir yönetici onaylar). Geçersiz/iptal/süresi dolmuş bağlantı hiçbir grup bilgisi vermez.
 */
export function JoinGroupPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const status = useAuthStatus();
  const { refresh } = useRealMessages();
  // undefined = henüz okunmadı (sunucu çıktısıyla uyum için ilk boyamada okunmaz); null = geçerli token yok.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<"requested" | "already_requested" | null>(null);
  const action = useAsyncAction();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL parçası yalnızca tarayıcıda okunabilir; bir kez, bağlandıktan sonra
    setToken(readToken());
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !token) return;
    let cancelled = false;
    previewChatGroupLink(token)
      .then((preview) => {
        if (!cancelled) setLoaded({ token, preview, error: false });
      })
      .catch((err) => {
        console.error("previewChatGroupLink", err);
        if (!cancelled) setLoaded({ token, preview: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [status, token]);

  async function submit() {
    if (!token) return;
    const outcome = await action.run(() => joinChatGroupViaLink(token, message));
    if (!outcome) return;
    if (outcome.outcome === "joined" || outcome.outcome === "already_member") {
      clearToken();
      void refresh();
      if (outcome.groupId) router.push(messageHref({ id: outcome.groupId }));
      else router.push("/messages");
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
    return shell(<EmptyState icon={Link2Off} title={t("groups.join.invalidTitle")} description={t("groups.join.invalidBody")} action={{ label: t("groups.join.toGroups"), href: "/groups" }} />);
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
        <Link href={authHref("/login", "/groups/join")} className={buttonClassName({ size: "md" })}>
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
    return shell(<EmptyState icon={Link2Off} title={t("groups.join.invalidTitle")} description={t("groups.join.invalidBody")} action={{ label: t("groups.join.toGroups"), href: "/groups" }} />);
  }

  const full = preview.memberCount >= preview.memberLimit;
  const isPrivate = preview.visibility === "private";

  return shell(
    <div className="space-y-5 rounded-xl border border-border-soft bg-surface p-6 shadow-card">
      <div className="flex items-start gap-3">
        <GroupAvatar name={preview.name} avatarUrl={preview.avatarUrl} size={56} badge />
        <div className="min-w-0 space-y-1">
          <h1 className="break-words text-h3 font-semibold text-text">{preview.name}</h1>
          <p className="flex flex-wrap items-center gap-x-2 text-caption text-text-muted">
            <span>{memberCountText(t, preview.memberCount)}</span>
            <span className="flex items-center gap-1">
              {isPrivate ? <Lock size={12} aria-hidden /> : <Globe size={12} aria-hidden />}
              {isPrivate ? t("groups.visibility.private") : t("groups.visibility.public")}
            </span>
          </p>
        </div>
      </div>
      {preview.description && <p className="break-words text-small text-text-secondary">{preview.description}</p>}

      {preview.myStatus === "member" ? (
        <div className="space-y-3">
          <p className="text-small text-text-muted">{t("groups.join.alreadyMember")}</p>
          {preview.groupId && (
            <Link href={messageHref({ id: preview.groupId })} className={buttonClassName({ size: "md", className: "w-full" })}>
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
          <Button type="button" className="w-full" onClick={() => void submit()} disabled={action.busy || (full && !isPrivate)}>
            {action.busy ? t("common.loading") : isPrivate ? t("groups.join.sendRequest") : t("groups.join.joinNow")}
          </Button>
        </div>
      )}
    </div>,
  );
}
