"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "@/components/icons/x";
import { Button } from "@/components/ui/button";
import { FLOATING_PANEL_CLASS } from "@/components/ui/floating";
import { iconButtonClassName } from "@/components/ui/icon-button";
import { useAuth } from "@/features/auth/auth-provider";
import { useMessageDock } from "@/features/messages/message-dock-provider";
import { useLiveToastsEnabled } from "./live-toast-pref";
import { CardAvatar, useHeadlineParts } from "./notification-parts";
import { useNotifications } from "./notifications-provider";
import { useMinWidth } from "./use-min-width";
import { fetchProfilesByIds } from "@/lib/supabase/chat-groups";
import { fetchIsFollowing, followUser } from "@/lib/supabase/follows";
import {
  LIVE_TOAST_DURATION_MS,
  LIVE_TOAST_EXIT_MS,
  LIVE_TOAST_SWIPE_PX,
  addLiveToast,
  dropLiveToast,
  leaveLiveToast,
  liveToastAction,
  liveToastReplyHref,
  liveToastSkipReason,
  toastCardFromRow,
  type IncomingNotificationRow,
  type LiveToastContext,
  type LiveToastEntry,
} from "@/lib/live-notification-toast";
import { quotedPreview, withoutQuotedPreview } from "@/lib/notification-card";
import { announceNotice } from "@/lib/app-notice";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/types";

/** Aktör profilleri oturum boyu önbellekte tutulur: aynı kişiden art arda gelen bildirimlerde her seferinde profil sorgusu yapılmaz. */
const actorCache = new Map<string, Promise<UserProfile | null>>();
function resolveActor(id: string): Promise<UserProfile | null> {
  let hit = actorCache.get(id);
  if (!hit) {
    hit = fetchProfilesByIds([id]).then((rows) => rows[0] ?? null);
    actorCache.set(id, hit);
  }
  return hit;
}

/**
 * Canlı bildirim kartı (docs/history/434-*): sitedeyken yeni bir bildirim gelince üst köşede kısa bir önizleme kartı çıkar ve birkaç saniye sonra kendiliğinden
 * kapanır. Bilgisayarda (≥ md) zil/üst çubuğun altında sağ üstte kayarak gelir; telefonda üstten iner, yukarı kaydırınca kapanır. Üstüne gelince ya da basılı
 * tutunca süre durur; kartın altındaki çizgi kalan süreyi gösterir. Aynı içeriğe gelen beğeni/takipler tek kartta birleşir ("Ali ve 2 kişi daha"), ekranda en
 * çok 3 kart durur. Kart yalnız gelen satırı gösterir: bildirimi yazan/gruplayan/sessize alan sunucudur (sessize alınmış ya da türü kapatılmış bildirim hiç
 * gelmez), kapanması gelen kutusunu etkilemez. Bildirimler sayfasındayken, o sohbetteyken, yazma ekranı/hikâye açıkken, zil paneli açıkken ya da sekme
 * arka plandayken çıkmaz (`liveToastSkipReason`). Kapatma anahtarı Ayarlar → Bildirimler'dedir (`live-toast-pref.ts`).
 */
export function LiveNotificationToasts() {
  const { user } = useAuth();
  const { subscribeIncoming } = useNotifications();
  const enabled = useLiveToastsEnabled();
  const wide = useMinWidth(768);
  const pathname = usePathname() ?? "";
  const dock = useMessageDock();
  const { t } = useTranslation();
  const [entries, setEntries] = useState<LiveToastEntry[]>([]);
  const userId = user?.id ?? null;
  const active = Boolean(userId) && enabled;

  // Kapatılınca (ya da çıkış yapılınca) ekrandaki kartlar hemen kalkar; açık kalmış zamanlayıcı yok.
  if (!active && entries.length > 0) setEntries([]);

  const dockConversationId = dock.open && dock.view.kind === "chat" ? dock.view.conversationId : null;
  const where = useRef({ pathname, dockConversationId });
  useEffect(() => {
    where.current = { pathname, dockConversationId };
  }, [pathname, dockConversationId]);

  useEffect(() => {
    if (!active || !userId) return;
    return subscribeIncoming((row: IncomingNotificationRow) => {
      const root = document.documentElement;
      const ctx: LiveToastContext = {
        pathname: where.current.pathname,
        search: window.location.search,
        visible: document.visibilityState === "visible",
        composeOpen: root.hasAttribute("data-compose-open"),
        storyOpen: root.hasAttribute("data-story-open"),
        popoverOpen: Boolean(document.querySelector("[data-notification-popover]")),
        dockConversationId: where.current.dockConversationId,
      };
      if (liveToastSkipReason(row, ctx)) return;
      void (async () => {
        const actor = row.actorId ? await resolveActor(row.actorId).catch(() => null) : null;
        const card = toastCardFromRow(row, actor);
        let canFollow = false;
        if (liveToastAction(card) === "follow" && actor && actor.id !== userId) canFollow = !(await fetchIsFollowing(userId, actor.id).catch(() => true));
        setEntries((prev) => addLiveToast(prev, card, canFollow));
      })();
    });
  }, [active, userId, subscribeIncoming]);

  const close = useCallback((id: string) => setEntries((prev) => leaveLiveToast(prev, id)), []);

  // Kapanmaya alınan her kart (süre doldu, ✕, kaydırma, yer açma) animasyon bitince DOM'dan kalkar.
  const scheduledDrops = useRef(new Set<string>());
  useEffect(() => {
    for (const entry of entries) {
      if (!entry.leaving || scheduledDrops.current.has(entry.id)) continue;
      scheduledDrops.current.add(entry.id);
      window.setTimeout(() => {
        scheduledDrops.current.delete(entry.id);
        setEntries((prev) => dropLiveToast(prev, entry.id));
      }, LIVE_TOAST_EXIT_MS);
    }
  }, [entries]);

  if (!active || entries.length === 0) return null;
  return (
    <div
      role="region"
      aria-label={t("nc.live.region")}
      aria-live="polite"
      data-live-toasts={wide ? "desk" : "phone"}
      className="pointer-events-none fixed inset-x-2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-(--z-toast) flex flex-col md:inset-x-auto md:right-6 md:top-[4.5rem] md:w-[21.25rem] lg:right-8"
    >
      {entries.map((entry) => (
        <LiveToast key={entry.id} entry={entry} mode={wide ? "desk" : "phone"} onClose={close} />
      ))}
    </div>
  );
}

function LiveToast({ entry, mode, onClose }: { entry: LiveToastEntry; mode: "desk" | "phone"; onClose: (id: string) => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { markRead } = useNotifications();
  const { card } = entry;
  const { names, text } = useHeadlineParts(card);
  const preview = quotedPreview(card.latestMessage)?.trim() || null;
  const action = liveToastAction(card);
  const [paused, setPaused] = useState(false);
  const [followed, setFollowed] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const remaining = useRef(LIVE_TOAST_DURATION_MS);
  const startedAt = useRef(0);

  // Süre: kalan süre izlenir; duraklatınca (üstüne gelme/basılı tutma/odak) biriken süre düşer, devam edince kalanla yeniden başlar. Birleşmede (`seq`) tam süreye döner.
  useEffect(() => {
    remaining.current = LIVE_TOAST_DURATION_MS;
  }, [entry.seq]);
  useEffect(() => {
    if (entry.leaving || paused) return;
    startedAt.current = performance.now();
    const timer = window.setTimeout(() => onClose(entry.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - startedAt.current));
    };
  }, [paused, entry.leaving, entry.seq, entry.id, onClose]);

  const dismiss = useCallback(() => onClose(entry.id), [entry.id, onClose]);

  const open = useCallback(
    (href: string) => {
      void markRead(card);
      dismiss();
      router.push(href);
    },
    [card, markRead, dismiss, router],
  );

  const follow = useCallback(async () => {
    const actor = card.latestActor;
    if (!user || !actor || followed) return;
    setFollowed(true);
    try {
      await followUser(user.id, actor.id);
      announceNotice(t("nc.followingToast", { name: actor.displayName }));
      void markRead(card);
      dismiss();
    } catch (err) {
      console.error("live toast follow", err);
      setFollowed(false);
      announceNotice(t("nc.actionFailed"));
    }
  }, [user, card, followed, markRead, dismiss, t]);

  // Telefon: yukarı kaydırarak kapat, dokununca aç, basılı tutunca süreyi durdur.
  const drag = useRef<{ startY: number; dy: number; moved: boolean } | null>(null);
  const phoneHandlers =
    mode === "phone"
      ? {
          onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
            if ((event.target as HTMLElement).closest("button, a")) return;
            drag.current = { startY: event.clientY, dy: 0, moved: false };
            event.currentTarget.setPointerCapture(event.pointerId);
            setPaused(true);
          },
          onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
            const state = drag.current;
            if (!state) return;
            const delta = event.clientY - state.startY;
            if (Math.abs(delta) > 6) state.moved = true;
            state.dy = Math.min(0, delta);
            const el = event.currentTarget;
            el.style.transition = "none";
            el.style.transform = `translateY(${state.dy}px)`;
            el.style.opacity = String(Math.max(0.2, 1 + state.dy / 140));
          },
          onPointerUp: (event: React.PointerEvent<HTMLElement>) => finishDrag(event.currentTarget, false),
          onPointerCancel: (event: React.PointerEvent<HTMLElement>) => finishDrag(event.currentTarget, true),
        }
      : {};
  function finishDrag(el: HTMLElement, cancelled: boolean) {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    setPaused(false);
    el.style.transition = "";
    if (state.dy < -LIVE_TOAST_SWIPE_PX) {
      dismiss();
      return;
    }
    el.style.transform = "";
    el.style.opacity = "";
    if (!state.moved && !cancelled) open(card.targetHref);
  }

  return (
    <div className="live-toast-slot" data-leaving={entry.leaving ? "" : undefined}>
      <div>
        <article
          ref={articleRef}
          tabIndex={0}
          data-live-toast={card.key}
          data-kind={card.type}
          onPointerEnter={(event) => event.pointerType === "mouse" && setPaused(true)}
          onPointerLeave={(event) => event.pointerType === "mouse" && !articleRef.current?.contains(document.activeElement) && setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setPaused(false)}
          onClick={mode === "desk" ? (event) => !(event.target as HTMLElement).closest("button") && open(card.targetHref) : undefined}
          onKeyDown={(event) => {
            if (event.key === "Escape") dismiss();
            else if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
              event.preventDefault();
              open(card.targetHref);
            }
          }}
          className={cn(
            "live-toast group pointer-events-auto relative grid cursor-pointer select-none grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 overflow-hidden p-3 pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            FLOATING_PANEL_CLASS,
            mode === "phone" && "touch-none",
          )}
          {...phoneHandlers}
        >
          <CardAvatar card={card} size={40} />
          <div className="min-w-0">
            <p className="text-small leading-snug text-text">
              {names && <span className="font-semibold">{names} </span>}
              <span className={cn(!names && "font-semibold")}>{withoutQuotedPreview(text)}</span>
            </p>
            {preview && <p className="mt-0.5 line-clamp-2 text-small text-text-muted [overflow-wrap:anywhere]">{preview}</p>}
            {mode === "desk" && action === "reply" && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" data-action="reply" onClick={() => open(liveToastReplyHref(card))}>
                  {t("nc.reply")}
                </Button>
              </div>
            )}
            {mode === "desk" && action === "follow" && entry.canFollow && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" data-action="follow" disabled={followed} onClick={() => void follow()}>
                  {t("nc.live.follow")}
                </Button>
              </div>
            )}
          </div>
          <span className="pt-0.5 text-caption text-text-muted transition-opacity group-focus-within:opacity-0 md:group-hover:opacity-0">{t("nc.live.now")}</span>
          {mode === "desk" && (
            <button
              type="button"
              aria-label={t("nc.live.close")}
              title={t("nc.live.close")}
              data-action="close"
              onClick={() => dismiss()}
              className={iconButtonClassName(false, "absolute right-1 top-1 bg-surface-soft opacity-0 group-focus-within:opacity-100 group-hover:opacity-100")}
            >
              <X size={16} aria-hidden />
            </button>
          )}
          <i
            key={entry.seq}
            aria-hidden
            data-live-toast-bar=""
            className={cn("live-toast-bar absolute inset-x-0 bottom-0 h-[3px]", card.type === "like" ? "bg-secondary" : "bg-primary")}
            style={{ animationDuration: `${LIVE_TOAST_DURATION_MS}ms`, animationPlayState: paused ? "paused" : "running" }}
          />
        </article>
      </div>
    </div>
  );
}
