import Link from "next/link";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { NOTIFICATION_ICONS, getNotificationIconKey } from "@/lib/notification-utils";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { AppNotification } from "@/types";

interface NotificationRowProps {
  notification: AppNotification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * One notification — an avatar (or, lacking an actor, a plain icon circle)
 * with a small colored badge overlaid on it carrying the event's OWN icon
 * (Aşama 2: never a single generic bell for every row), the full Turkish
 * description + content preview (both already composed server-side into
 * `message`, see the 20260919230000 migration), a relative timestamp, and
 * an unread marker that isn't color-only (a subtle background tint AND a
 * dot, plus a screen-reader-only "Okunmadı" label — Aşama 8's "ikonlar
 * yalnızca renkle anlamlandırılmasın" applies just as much to unread state).
 */
export function NotificationRow({ notification, onRead, onDelete }: NotificationRowProps) {
  const iconKey = getNotificationIconKey(notification);
  const Icon = NOTIFICATION_ICONS[iconKey];

  return (
    <Link
      href={notification.targetHref}
      onClick={() => onRead(notification.id)}
      className={cn(
        "flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-accent-surface/40",
        !notification.isRead && "bg-accent-surface/30",
      )}
    >
      {/* `data-notification-icon` names which of NOTIFICATION_ICONS this row picked — same test/debug purpose as `data-message-id` (Bölüm 9.8), since two lucide icons can render visually identical <svg> markup in a snapshot. */}
      <div className="relative shrink-0" data-notification-icon={iconKey}>
        {notification.actor ? (
          <Avatar src={notification.actor.avatarUrl} alt={notification.actor.displayName} size={40} />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-surface text-primary">
            <Icon size={18} />
          </span>
        )}
        {notification.actor && (
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-primary text-primary-foreground">
            <Icon size={11} />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm text-text">
          {notification.actor && (
            <span className="font-semibold">{notification.actor.displayName} </span>
          )}
          <span className="text-text-muted">{notification.message}</span>
        </p>
        <span className="text-xs text-text-muted">{formatRelativeTime(notification.createdAt)}</span>
      </div>
      {!notification.isRead && (
        <span className="flex shrink-0 items-center gap-1">
          <span className="sr-only">Okunmadı</span>
          <span aria-hidden className="h-2 w-2 rounded-full bg-primary" />
        </span>
      )}
      <button
        type="button"
        aria-label="Bildirimi sil"
        title="Bildirimi sil"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDelete(notification.id);
        }}
        className="shrink-0 rounded-md p-1.5 text-text-muted transition-colors hover:bg-background hover:text-text"
      >
        <X size={16} />
      </button>
    </Link>
  );
}
