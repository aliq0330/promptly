"use client";

import { forwardRef, useImperativeHandle, useState, type ReactNode } from "react";
import { AlertCircle, Check, ChevronRight, Globe, Loader2, Lock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { useAuth } from "@/features/auth/auth-provider";
import { pickCreateDestination, useCommunityContext } from "@/features/communities/community-return";
import { ANNOUNCE_NOTE_MAX, armPendingAnnounce, useAnnounceCommunities, useAnnounceSelection } from "@/features/communities/announce-picker";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { ContentVisibility } from "@/types";
import { DestinationPicker, useDestinationBlock } from "./share-destination-field";

export type Audience = "public" | "private" | "community";

export interface PublishProblem {
  key: string;
  label: string;
  /** Eksik alana götürür (odaklar). */
  onFix?: () => void;
}

export interface PublishPanelHandle {
  /** Üst çubuktaki "Paylaş": eksik varsa onu bildirir, yoksa yayınlar. */
  publish: () => void;
}

/**
 * Formun "Kim görsün?" bölümü (docs/history/244-*; 216'daki son kontrol penceresinin satır içi hâli): kart önizlemesi (`preview`, yalnız
 * `lg` altında — yanda canlı önizleme yoksa), "Kim görsün?" (Herkese açık / Sadece ben / Bir topluluk; topluluk seçimi `pickCreateDestination`
 * deposuna, görünürlük formun kendi durumuna), formun ek satırı (`extra`), "Topluluklarda da alıntıla" (yalnız yeni + herkese açık içerik;
 * seçim modül deposunda, "Paylaş" anında kurulur ve içerik oluşunca gönderilir — `runPendingAnnounce`), "ne olacak" cümlesi, bildirimler
 * (`children`) ve altta Taslak + Paylaş.
 *  - Eksik zorunlu alan varken (`problems`) Paylaş soluktur ama basılabilir: basınca `onBlocked` çalışır (form hataları gösterir ve ilkine
 *    odaklanır) ve `showProblems` açıkken eksikler bu bölümde de listelenir.
 *  - Seçilemeyen seçenek çizilmez (yanıtta "Sadece ben", düzenlemede "topluluk" yok).
 *  - `ref.publish()` üst çubuktaki Paylaş'ın aynı yolu kullanması içindir.
 */
export const PublishPanel = forwardRef<
  PublishPanelHandle,
  {
    onConfirm: () => void;
    onSaveDraft?: () => void;
    onBlocked?: (problem: PublishProblem) => void;
    busy?: boolean;
    confirmLabel: string;
    /** Yanıtta olduğu gibi her zaman herkese açık olan içerikte verilmez. */
    visibility?: ContentVisibility;
    onVisibilityChange?: (next: ContentVisibility) => void;
    /** Yayındaki içeriği düzenleme: yeri değişmez (topluluk seçeneği ve duyuru yok). */
    hideDestination?: boolean;
    extra?: ReactNode;
    preview?: ReactNode;
    problems?: PublishProblem[];
    showProblems?: boolean;
    children?: ReactNode;
  }
>(function PublishPanel(
  { onConfirm, onSaveDraft, onBlocked, busy = false, confirmLabel, visibility, onVisibilityChange, hideDestination = false, extra, preview, problems = [], showProblems = false, children },
  ref,
) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const community = useCommunityContext();
  const inCommunity = community.communityId !== null;
  const blockedReason = useDestinationBlock(hideDestination ? null : community.communityId);
  const canChooseVisibility = visibility !== undefined && onVisibilityChange !== undefined;
  const audience: Audience = inCommunity ? "community" : visibility === "private" ? "private" : "public";
  const allowCommunity = !hideDestination;
  const [pickerOpen, setPickerOpen] = useState(false);

  const canAnnounce = Boolean(user) && !hideDestination && audience === "public";
  const [selection, setSelection] = useAnnounceSelection();
  const communities = useAnnounceCommunities(canAnnounce);
  const names = new Map(communities.list.map((item) => [item.id, item.name]));
  const announceCount = canAnnounce ? selection.communityIds.length : 0;

  const summary =
    audience === "community"
      ? t("publish.summary.community", { name: community.name ?? "…" })
      : audience === "private"
        ? t("publish.summary.private")
        : announceCount > 0
          ? t("publish.summary.publicAnnounce", { count: announceCount })
          : t("publish.summary.public");

  function choose(next: Audience) {
    if (next === "community") {
      setPickerOpen(true);
      return;
    }
    pickCreateDestination(null);
    onVisibilityChange?.(next);
  }

  function toggleCommunity(id: string) {
    const has = selection.communityIds.includes(id);
    setSelection({ ...selection, communityIds: has ? selection.communityIds.filter((x) => x !== id) : [...selection.communityIds, id] }, names);
  }

  const options: { key: Audience; icon: typeof Globe; label: string }[] = [
    { key: "public", icon: Globe, label: t("publish.public") },
    ...(canChooseVisibility ? [{ key: "private" as const, icon: Lock, label: t("publish.private") }] : []),
    ...(allowCommunity ? [{ key: "community" as const, icon: Users, label: t("compose.aCommunity") }] : []),
  ];

  function publish() {
    if (busy) return;
    if (problems.length > 0) {
      onBlocked?.(problems[0]);
      return;
    }
    if (blockedReason !== null) return;
    armPendingAnnounce(canAnnounce && selection.communityIds.length > 0);
    onConfirm();
  }
  useImperativeHandle(ref, () => ({ publish }));


  return (
    <div data-publish-panel="" className="space-y-4">
      {preview && <div className="lg:hidden">{preview}</div>}

      {options.length > 1 && (
        <section className="space-y-2" data-audience-field={audience}>
          <div className="grid gap-2" role="radiogroup" aria-label={t("publish.whoSees")}>
            {options.map((option) => {
              const selected = option.key === audience;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy}
                  onClick={() => choose(option.key)}
                  data-audience-option={option.key}
                  className={cn(
                    "flex min-h-14 items-center gap-3 rounded-xl border px-3.5 text-left transition-colors disabled:opacity-60",
                    selected ? "border-primary bg-primary-soft text-text" : "border-border-strong bg-surface text-text-secondary hover:border-primary/50",
                  )}
                >
                  <span aria-hidden className={cn("h-5 w-5 shrink-0 rounded-full border-2", selected ? "border-[6px] border-primary" : "border-border-strong")} />
                  <option.icon size={18} strokeWidth={1.9} aria-hidden className="shrink-0" />
                  <span className="min-w-0 flex-1 text-body font-semibold">{option.label}</span>
                </button>
              );
            })}
          </div>
          {audience === "community" && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={busy}
              data-audience-community={community.communityId ?? ""}
              className="flex w-full items-center gap-3 rounded-xl border border-border-soft bg-background px-3 py-2 text-left"
            >
              <GroupAvatar name={community.name ?? ""} avatarUrl={community.avatarUrl} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-label font-semibold text-text">{community.name ?? t("common.loading")}</span>
                <span className="block text-caption text-text-muted">{t("publish.changeCommunity")}</span>
              </span>
              <ChevronRight size={16} aria-hidden className="shrink-0 text-text-muted" />
            </button>
          )}
          {blockedReason && audience === "community" && (
            <p role="status" data-share-blocked className="text-caption text-text-muted">
              {t(blockedReason)}
            </p>
          )}
        </section>
      )}

      {extra}

      {canAnnounce && (
        <section className="space-y-2" data-announce-picker="">
          <p className="flex items-baseline justify-between gap-2 text-label font-semibold text-text">
            {t("publish.announceTitle")}
            <span className="text-caption font-normal text-text-muted">{t("common.optional")}</span>
          </p>
          {communities.status === "error" ? (
            <p className="text-small text-danger">{t("communities.feed.pickLoadError")}</p>
          ) : communities.status !== "ready" ? (
            <p className="flex items-center gap-2 text-small text-text-muted">
              <Loader2 size={14} className="animate-spin" aria-hidden /> {t("common.loading")}
            </p>
          ) : communities.list.length === 0 ? (
            <p className="text-small text-text-muted">{t("share.announce.noCommunities")}</p>
          ) : (
            <>
              <div className="scrollbar-fine -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
                {communities.list.map((item) => {
                  const on = selection.communityIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={on}
                      disabled={busy || item.closed}
                      onClick={() => toggleCommunity(item.id)}
                      data-announce-community={item.id}
                      title={item.closed ? t("communities.detail.closedNotice") : undefined}
                      className={cn(
                        "flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-small font-semibold transition-colors disabled:opacity-50",
                        on ? "border-primary/50 bg-primary-soft text-primary" : "border-border bg-background text-text-secondary hover:border-border-strong",
                      )}
                    >
                      <GroupAvatar name={item.name} avatarUrl={item.avatarUrl} size={24} />
                      <span className="max-w-[10rem] truncate">{item.name}</span>
                      {on && <Check size={14} aria-hidden />}
                    </button>
                  );
                })}
              </div>
              {selection.communityIds.length > 0 && (
                <textarea
                  value={selection.note}
                  onChange={(event) => setSelection({ ...selection, note: event.target.value }, names)}
                  rows={2}
                  maxLength={ANNOUNCE_NOTE_MAX}
                  disabled={busy}
                  placeholder={t("share.announce.notePlaceholder")}
                  aria-label={t("communities.feed.noteLabel")}
                  data-announce-note=""
                  className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-small text-text placeholder:text-text-muted focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
                />
              )}
            </>
          )}
        </section>
      )}

      <p data-publish-summary={audience} className="text-small text-text-secondary">
        {summary}
      </p>
      {children}

      {showProblems && problems.length > 0 && (
        <section aria-label={t("compose.problemsTitle")} role="alert" className="space-y-2">
          <p className="text-label font-semibold text-text">{t("compose.problemsTitle")}</p>
          {problems.map((problem) => (
            <button
              key={problem.key}
              type="button"
              data-publish-problem={problem.key}
              onClick={() => problem.onFix?.()}
              className="flex w-full items-center gap-2.5 rounded-xl border border-danger/35 bg-danger/10 px-3 py-2.5 text-left text-small font-semibold text-text"
            >
              <AlertCircle size={17} aria-hidden className="shrink-0 text-danger" />
              <span className="min-w-0 flex-1">{problem.label}</span>
              {problem.onFix && <ChevronRight size={16} aria-hidden className="shrink-0 text-text-muted" />}
            </button>
          ))}
        </section>
      )}

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
        {onSaveDraft && !inCommunity && (
          <Button type="button" variant="outline" size="lg" disabled={busy} onClick={onSaveDraft} data-action="save-draft" className="shrink-0 px-6">
            {t("createActions.saveDraft")}
          </Button>
        )}
        <Button
          type="button"
          size="lg"
          disabled={busy}
          onClick={publish}
          data-action="publish"
          className={cn("min-w-0 sm:flex-1", (problems.length > 0 || blockedReason !== null) && "opacity-60")}
        >
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {confirmLabel}
        </Button>
      </div>

      {pickerOpen && (
        <DestinationPicker
          selectedId={community.communityId}
          onChoose={(next) => {
            pickCreateDestination(next);
            if (!next) onVisibilityChange?.("public");
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
});
