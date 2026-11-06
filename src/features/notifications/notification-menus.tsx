"use client";

import { useState } from "react";
import { BellOff } from "@/components/icons/bell-off";
import { ChevronDown } from "@/components/icons/chevron-down";
import { Clock } from "@/components/icons/clock";
import { Bell } from "@/components/icons/bell";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { useNotifications } from "./notifications-provider";
import { useIsMuted } from "./mute-store";
import type { useNotificationCards } from "./use-notification-cards";
import { setNotificationTypePref } from "@/lib/supabase/notifications";
import { linkedCardFor } from "@/lib/supabase/notification-context";
import { cardPrefKey, muteOptions } from "@/lib/notification-actions";
import { notificationHrefBase } from "@/lib/notification-mirror";
import { snoozeTimes, type SnoozeOptionKey } from "@/lib/notification-snooze";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { NotificationCard } from "@/types";

type List = ReturnType<typeof useNotificationCards>;

const SNOOZE_LABEL = { tonight: "nc.snooze.tonight", tomorrow: "nc.snooze.tomorrow", nextWeek: "nc.snooze.nextWeek" } as const;

const FOOTER_BUTTON = "h-11 gap-2 text-small";

/**
 * Ayrıntı görünümünün alt satırı (docs/history/326-*): Sessize al · Yarın hatırlat · Bu tür bildirimleri kapat.
 * Üçü de iyimser + "Geri al" şeritli; sessize alma ve tür kapatma sunucuda ekleme anında uygulanır (BEFORE INSERT tetikleyicisi),
 * erteleme kartı listeden çıkarır ve süre dolunca okunmamış olarak geri getirir.
 */
export function DetailFooterActions({ card, list, onAfterHide }: { card: NotificationCard; list: List; onAfterHide?: () => void }) {
  const { t } = useTranslation();
  const { snooze, mute, unmute } = useNotifications();
  const [open, setOpen] = useState<"mute" | "snooze" | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const typeOff = useAsyncAction();
  const { pushUndo } = useNotifications();
  const options = muteOptions(card);
  const times = snoozeTimes(new Date());
  const prefKey = cardPrefKey(card);
  const linked = linkedCardFor(list.context, card);
  const contentLabel = linked?.title ?? card.latestMessage;
  const actor = card.latestActor;
  const contentTarget = options.content ? notificationHrefBase(card.targetHref) : null;
  const personMuted = useIsMuted("actor", options.person && actor ? actor.id : null).muted;
  const contentMuted = useIsMuted("content", contentTarget).muted;
  // Seçeneklerin hepsi zaten sessizdeyse düğme "Sesi aç" olur; biri bile sessiz değilse "Sessize al".
  const applicable = [...(options.person && actor ? [personMuted] : []), ...(options.content ? [contentMuted] : [])];
  const allMuted = applicable.length > 0 && applicable.every(Boolean);

  const togglePerson = async () => {
    if (!actor) return;
    setOpen(null);
    if (personMuted) await unmute("actor", actor.id, actor.displayName, t("nc.unmutedPerson", { name: actor.displayName }));
    else await mute("actor", actor.id, actor.displayName, t("nc.mutedPerson", { name: actor.displayName }));
  };
  const toggleContent = async () => {
    if (!contentTarget) return;
    setOpen(null);
    if (contentMuted) await unmute("content", contentTarget, contentLabel, t("nc.unmutedContent"));
    else await mute("content", contentTarget, contentLabel, t("nc.mutedContent"));
  };
  // Tek seçenek varsa ek bir adım gösterilmez: düğme doğrudan aç/kapar.
  const singleChoice = applicable.length === 1;

  const doSnooze = async (key: SnoozeOptionKey) => {
    const when = times[key];
    if (!when) return;
    setOpen(null);
    await snooze(card, when, t("nc.snoozedToast", { when: t(SNOOZE_LABEL[key]).toLocaleLowerCase() }));
    onAfterHide?.();
  };

  return (
    <div className="space-y-2 border-t border-border-soft pt-3" data-detail-footer="">
      <div className="flex flex-wrap items-center gap-2">
        {applicable.length > 0 && (
          <Button
            variant="outline"
            className={FOOTER_BUTTON}
            aria-expanded={singleChoice ? undefined : open === "mute"}
            onClick={() => {
              if (!singleChoice) setOpen(open === "mute" ? null : "mute");
              else if (options.person && actor) void togglePerson();
              else void toggleContent();
            }}
            data-action={allMuted ? "unmute" : "mute"}
          >
            {allMuted ? <Bell size={16} aria-hidden /> : <BellOff size={16} aria-hidden />}
            {allMuted ? t("nc.unmute") : t("nc.mute")}
            {!singleChoice && <ChevronDown size={14} aria-hidden className={cn("transition-transform", open === "mute" && "rotate-180")} />}
          </Button>
        )}
        <div className="inline-flex">
          <Button variant="outline" className={cn(FOOTER_BUTTON, "rounded-r-none border-r-0")} onClick={() => void doSnooze("tomorrow")} data-action="snooze">
            <Clock size={16} aria-hidden />
            {t("nc.snooze")}
          </Button>
          <Button variant="outline" className={cn(FOOTER_BUTTON, "rounded-l-none px-2.5")} aria-label={t("nc.snoozeMore")} aria-expanded={open === "snooze"} onClick={() => setOpen(open === "snooze" ? null : "snooze")} data-action="snooze-more">
            <ChevronDown size={14} aria-hidden className={cn("transition-transform", open === "snooze" && "rotate-180")} />
          </Button>
        </div>
        {prefKey && (
          <Button variant="outline" className={FOOTER_BUTTON} onClick={() => setConfirmOff(true)} data-action="type-off">
            {t("nc.typeOff")}
          </Button>
        )}
      </div>

      {open === "mute" && !singleChoice && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("nc.mute")} data-mute-options="">
          {options.person && actor && (
            <Button variant="secondary" className="h-11" onClick={() => void togglePerson()} data-action={personMuted ? "unmute-person" : "mute-person"}>
              {personMuted ? t("nc.unmutePerson", { name: actor.displayName }) : t("nc.mutePerson", { name: actor.displayName })}
            </Button>
          )}
          {options.content && (
            <Button variant="secondary" className="h-11" onClick={() => void toggleContent()} data-action={contentMuted ? "unmute-content" : "mute-content"}>
              {contentMuted ? t("nc.unmuteContent") : t("nc.muteContent")}
            </Button>
          )}
        </div>
      )}

      {open === "snooze" && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("nc.snooze")} data-snooze-options="">
          {(["tonight", "tomorrow", "nextWeek"] as const).map((key) =>
            times[key] ? (
              <Button key={key} variant="secondary" className="h-11" onClick={() => void doSnooze(key)} data-snooze={key}>
                {t(SNOOZE_LABEL[key])}
              </Button>
            ) : null,
          )}
        </div>
      )}

      {confirmOff && prefKey && (
        <ConfirmDialog
          id="notification-type-off-title"
          title={t("nc.typeOffTitle")}
          body={t("nc.typeOffBody", { type: t(`nc.pref.${prefKey}.title` as const) })}
          confirmLabel={t("nc.typeOffConfirm")}
          overLayers
          busy={typeOff.busy}
          error={typeOff.error}
          onConfirm={() =>
            void typeOff.run(async () => {
              await setNotificationTypePref(prefKey, false);
              setConfirmOff(false);
              pushUndo(t("nc.typeOffToast", { type: t(`nc.pref.${prefKey}.title` as const) }), () => setNotificationTypePref(prefKey, true));
            })
          }
          onCancel={() => {
            typeOff.setError(null);
            setConfirmOff(false);
          }}
        />
      )}
    </div>
  );
}
