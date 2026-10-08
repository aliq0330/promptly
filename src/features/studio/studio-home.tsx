"use client";

import { useEffect, useState } from "react";
import { ChevronRight, FlaskConical, History, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { useAuthStatus } from "@/features/auth/use-auth-status";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { deleteStudioSession, listStudioSessions, type StudioSessionSummary } from "@/lib/supabase/studio-sessions";
import { formatRelativeTime } from "@/lib/utils";
import { KIND_ICONS } from "./studio-meta";
import { STUDIO_KINDS, type StudioKind } from "./studio-model";

/**
 * Studio's front door: the user's recent sessions and a way to start a new one
 * (empty, or straight from a source type). Guests can start a workspace; the
 * session list needs an account.
 */
export function StudioHome({ onNew, onOpen, onContinue }: { onNew: (startWith?: StudioKind) => void; onOpen: (id: string) => void; onContinue?: () => void }) {
  const { t, language } = useTranslation();
  const status = useAuthStatus();
  const { user } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const [sessions, setSessions] = useState<StudioSessionSummary[] | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void listStudioSessions(user.id).then((list) => {
      if (!cancelled) setSessions(list);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function remove(id: string) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setError(false);
    try {
      await deleteStudioSession(id);
      setSessions((list) => (list ?? []).filter((s) => s.id !== id));
    } catch (err) {
      console.error("delete studio session", err);
      setError(true);
    }
    setConfirmId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-soft bg-primary-soft text-primary shadow-xs">
            <FlaskConical className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-h1 text-text">{t("studio.title")}</h1>
            <p className="text-small text-text-secondary">{t("studio.homeSubtitle")}</p>
          </div>
        </div>
        <Button type="button" onClick={() => onNew()} className="h-11">
          <Plus className="h-4 w-4" aria-hidden />
          {t("studio.newStudio")}
        </Button>
      </div>

      {onContinue && (
        <button
          type="button"
          onClick={onContinue}
          className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-primary/50 bg-primary-soft/50 px-4 py-3 text-left text-small font-medium text-text hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t("studio.continueWorkspace")}
          <ChevronRight className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        </button>
      )}

      <section aria-label={t("studio.startFrom")} className="space-y-2">
        <h2 className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("studio.startFrom")}</h2>
        <div className="grid grid-cols-2 gap-2 @min-[520px]:grid-cols-4">
          {STUDIO_KINDS.map((kind) => {
            const Icon = KIND_ICONS[kind];
            return (
              <button
                key={kind}
                type="button"
                onClick={() => onNew(kind)}
                className="flex min-h-14 items-center gap-2.5 rounded-xl border border-border-soft bg-surface px-3 py-2 text-left text-small font-medium text-text shadow-xs transition-colors hover:border-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
                <span className="min-w-0 truncate">{t(`studio.kind.${kind}` as const)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label={t("studio.recentSessions")} className="space-y-2">
        <h2 className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("studio.recentSessions")}</h2>
        {status === "loading" || (user && sessions === null) ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !user ? (
          <div className="rounded-xl border border-dashed border-border-strong bg-surface p-5 text-center">
            <p className="text-small text-text-secondary">{t("studio.homeGuest")}</p>
            <Button type="button" variant="outline" onClick={() => requireAuth("create")} className="mt-3 h-11">
              {t("common.login")}
            </Button>
          </div>
        ) : sessions && sessions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong bg-surface p-5 text-center text-small text-text-secondary">{t("studio.homeEmpty")}</p>
        ) : (
          <ul className="grid gap-2 @min-[620px]:grid-cols-2">
            {sessions?.map((session) => (
              <li key={session.id} className="flex min-w-0 items-stretch rounded-xl border border-border-soft bg-surface shadow-card transition-colors hover:border-primary/60">
                <button
                  type="button"
                  onClick={() => onOpen(session.id)}
                  className="flex min-h-20 min-w-0 flex-1 flex-col justify-center gap-1 rounded-lg px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="truncate text-body font-semibold text-text">{session.title || t("studio.untitledSession")}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-secondary">
                    <span className="flex items-center gap-1">
                      {STUDIO_KINDS.filter((k) => session.refs[k]).map((k) => {
                        const Icon = KIND_ICONS[k];
                        return <Icon key={k} className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} aria-label={t(`studio.kind.${k}` as const)} />;
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <History className="h-3.5 w-3.5" aria-hidden />
                      {t("studio.versionCount", { count: session.versionCount })}
                    </span>
                    <span>{formatRelativeTime(session.updatedAt, language)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void remove(session.id)}
                  onBlur={() => setConfirmId((current) => (current === session.id ? null : current))}
                  aria-label={confirmId === session.id ? t("studio.deleteSessionConfirm") : t("studio.deleteSession")}
                  className="flex w-12 shrink-0 items-center justify-center rounded-r-lg text-text-muted hover:bg-surface-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {confirmId === session.id ? <Badge variant="danger">{t("studio.deleteSessionShort")}</Badge> : <Trash2 className="h-4 w-4" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p role="alert" className="text-caption text-danger">{t("studio.saveError")}</p>}
      </section>
    </div>
  );
}
