import { NotificationRow } from "./notification-row";
import type { AppNotification } from "@/types";

interface NotificationListProps {
  notifications: AppNotification[];
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
}

export function NotificationList({ notifications, onRead, onDelete }: NotificationListProps) {
  if (notifications.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-text-muted">Henüz bildirimin yok.</p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {notifications.map((notification) => (
        <NotificationRow
          key={notification.id}
          notification={notification}
          onRead={onRead}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
