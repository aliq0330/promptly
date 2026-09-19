import Link from "next/link";
import { Bell, Heart, Mail, MessageCircle, Repeat2, Sparkles, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { AppNotification, NotificationType } from "@/types";

const ICONS: Record<NotificationType, LucideIcon> = {
  follow: UserPlus,
  like: Heart,
  comment: MessageCircle,
  comment_reply: MessageCircle,
  remix: Repeat2,
  request_response: Sparkles,
  message: Mail,
  system: Bell,
};

export function NotificationRow({ notification }: { notification: AppNotification }) {
  const Icon = ICONS[notification.type];

  return (
    <Link
      href={notification.targetHref}
      className={cn(
        "flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-accent-surface/40",
        !notification.isRead && "bg-accent-surface/30",
      )}
    >
      {notification.actor ? (
        <Avatar src={notification.actor.avatarUrl} alt={notification.actor.displayName} size={40} />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-surface text-primary">
          <Icon size={18} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text">
          {notification.actor && (
            <span className="font-semibold">{notification.actor.displayName} </span>
          )}
          <span className="text-text-muted">{notification.message}</span>
        </p>
        <span className="text-xs text-text-muted">{formatRelativeTime(notification.createdAt)}</span>
      </div>
      {!notification.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
    </Link>
  );
}
