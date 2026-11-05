"use client";

import { Paperclip } from "@/components/icons/paperclip";
import { Avatar } from "@/components/ui/avatar";
import { CompactContentCard } from "@/features/content/compact-content-card";
import { CommentMediaView } from "@/features/prompts/comment-extras";
import { attachmentStateIn, type CommentContext } from "@/lib/supabase/notification-context";
import { extrasPlan } from "@/lib/notification-extras";
import { ReactionIcon } from "@/features/reactions/reaction-icon";
import { NOTIFICATION_ICONS, getNotificationIconKey } from "@/lib/notification-utils";
import { QUOTED_PREVIEW_TYPES, groupedHeadline, milestoneInfo, withoutQuotedPreview } from "@/lib/notification-card";
import { localizeNotificationMessage } from "@/lib/notification-message";
import { REACTION_LABEL, type ReactionKey } from "@/lib/reactions";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { AppNotification, NotificationCard } from "@/types";
import type { NotificationContext } from "@/lib/supabase/notification-context";

/** Kartın rozet simgesinin anahtarı: mevcut satır rozetiyle AYNI eşleme (tür + `hl`). */
export function cardIconKey(card: NotificationCard) {
  return getNotificationIconKey({ type: card.type, targetHref: card.targetHref } as AppNotification);
}

/** Sol avatar: tek aktör → avatar + rozet; aktörsüz → simge dairesi; ≥2 kişi → üst üste avatarlar ayrıca `StackedAvatars` ile gösterilir. */
export function CardAvatar({ card, size = 40 }: { card: NotificationCard; size?: number }) {
  const Icon = NOTIFICATION_ICONS[cardIconKey(card)];
  const actor = card.latestActor ?? card.actors[0] ?? null;
  const reaction = card.rowCount === 1 ? (Object.keys(card.reactionCounts)[0] as ReactionKey | undefined) : undefined;
  const { t } = useTranslation();
  if (!actor) {
    return (
      <span className="flex shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary" style={{ width: size, height: size }} data-card-avatar="icon">
        <Icon size={Math.round(size * 0.45)} aria-hidden />
      </span>
    );
  }
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }} data-card-avatar="person">
      <Avatar src={actor.avatarUrl} alt={actor.displayName} size={size} />
      {reaction ? (
        <span title={t(REACTION_LABEL[reaction])} className="absolute -bottom-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border-2 border-surface bg-surface-elevated">
          <ReactionIcon reaction={reaction} size={15} />
        </span>
      ) : (
        <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-surface bg-primary text-primary-foreground">
          <Icon size={11} aria-hidden />
        </span>
      )}
    </span>
  );
}

/** Üst üste en çok 3 avatar + "+N" (gruplu sayı kartları). */
export function StackedAvatars({ card, size = 28 }: { card: NotificationCard; size?: number }) {
  const shown = card.actors.slice(0, 3);
  const extra = Math.max(0, card.rowCount - shown.length);
  return (
    <span className="flex items-center" data-stacked-avatars="">
      {shown.map((actor, index) => (
        <span key={actor.id} className={cn("rounded-full border-2 border-surface", index > 0 && "-ml-2")}>
          <Avatar src={actor.avatarUrl} alt={actor.displayName} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span className="-ml-2 flex items-center justify-center rounded-full border-2 border-surface bg-surface-soft text-[0.6875rem] font-bold text-text-secondary" style={{ width: size, height: size }}>
          +{extra}
        </span>
      )}
    </span>
  );
}

/** Başlık cümlesinin parçaları: kalın kısım (kişi adları) + devamı. */
export function useHeadlineParts(card: NotificationCard): { names: string; text: string } {
  const { t, language } = useTranslation();
  const grouped = groupedHeadline(card, t);
  if (grouped) return grouped;
  const milestone = milestoneInfo(card.latestMessage);
  if (milestone) return { names: "", text: t(milestone.kind === "copies" ? "nc.milestone.copies" : "nc.milestone.reactions", { count: milestone.count }) };
  const text = localizeNotificationMessage(card.latestMessage, language, t);
  // Alıntı kutusu metni ayrıca gösterir: başlıkta tekrarlanmaz.
  return { names: card.latestActor?.displayName ?? "", text: QUOTED_PREVIEW_TYPES.includes(card.type) ? withoutQuotedPreview(text) : text };
}

/** Kartın başlık cümlesi: ≥2 kişilik sayı kartında kurulan cümle, aksi hâlde sunucu cümlesi (yerelleştirilmiş) + kalın aktör adı. */
export function CardHeadline({ card, className, as: Tag = "p", plain = false }: { card: NotificationCard; className?: string; as?: "p" | "span"; plain?: boolean }) {
  const { names, text } = useHeadlineParts(card);
  return (
    <Tag className={cn("text-sm text-text", className)}>
      {names && <span className="font-semibold">{names} </span>}
      <span className={cn(plain ? "" : "text-text-secondary", !names && "font-semibold !text-text")}>{text}</span>
    </Tag>
  );
}

type ExtraItem = { kind: "media" } | { kind: "attachment" };

/** Yorum/yanıtın ekleri (fotoğraf · GIF · içerik, docs/history/327-*). Kart: 1 ek → "1 ek var" + önizleme, 2 ek → iki önizleme, 3+ → "N ek var" + ilk ikisi; `all` (Ayrıntı): hepsi, tam boy. */
export function CommentExtrasStrip({ comment, context, all = false, className }: { comment: CommentContext | undefined; context: NotificationContext; all?: boolean; className?: string }) {
  const { t } = useTranslation();
  if (!comment || comment.deleted) return null;
  const items: ExtraItem[] = [...(comment.media ? [{ kind: "media" as const }] : []), ...(comment.attachment ? [{ kind: "attachment" as const }] : [])];
  const plan = extrasPlan(items, all);
  if (plan.previews.length === 0) return null;
  return (
    <div className={cn("space-y-2", className)} data-comment-extras-strip={items.length}>
      {plan.labelCount != null && (
        <p className="flex items-center gap-1.5 text-caption font-semibold text-text-muted" data-extras-label="">
          <Paperclip size={13} aria-hidden />
          {t(plan.labelCount === 1 ? "nc.extras.one" : "nc.extras.many", { count: plan.labelCount })}
        </p>
      )}
      <div className="flex flex-wrap items-start gap-2">
        {plan.previews.map((item) =>
          item.kind === "media" && comment.media ? (
            <CommentMediaView key="media" media={comment.media} className={all ? undefined : "w-32"} />
          ) : item.kind === "attachment" && comment.attachment ? (
            <CompactContentCard key="attachment" attachment={comment.attachment} state={attachmentStateIn(context, comment.attachment)} />
          ) : null,
        )}
      </div>
    </div>
  );
}

/** Yorumun ek sayısı (kısa görünümde metin yoksa satırda gösterilir). */
export function commentExtrasCount(comment: CommentContext | undefined): number {
  if (!comment || comment.deleted) return 0;
  return (comment.media ? 1 : 0) + (comment.attachment ? 1 : 0);
}
