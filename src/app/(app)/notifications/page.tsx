import { NotificationList } from "@/features/notifications/notification-list";
import { mockNotifications } from "@/mocks/notifications";

export default function NotificationsPage() {
  const notifications = [...mockNotifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="px-4 py-6 lg:px-6">
      <h1 className="mb-4 text-base font-semibold text-text">Bildirimler</h1>
      <NotificationList notifications={notifications} />
    </div>
  );
}
