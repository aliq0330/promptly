/**
 * Bildirim merkezinin gün grupları (Meydan, docs/history/190-*): yerel takvim gününe göre
 * Bugün · Dün · Bu hafta (son 7 gün) · Daha eski. Sıra korunur — liste zaten en yeni önce gelir,
 * gruplar yalnızca araya başlık koyar; boş grup döndürülmez.
 */
export type NotificationDayGroup = "today" | "yesterday" | "thisWeek" | "older";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function notificationDayGroup(createdAt: string, now: Date = new Date()): NotificationDayGroup {
  const today = startOfLocalDay(now);
  const time = new Date(createdAt).getTime();
  if (Number.isNaN(time) || time >= today) return "today";
  if (time >= today - DAY_MS) return "yesterday";
  if (time >= today - 6 * DAY_MS) return "thisWeek";
  return "older";
}

export function groupNotificationsByDay<T extends { createdAt: string }>(
  items: T[],
  now: Date = new Date(),
): { group: NotificationDayGroup; items: T[] }[] {
  const groups: { group: NotificationDayGroup; items: T[] }[] = [];
  for (const item of items) {
    const group = notificationDayGroup(item.createdAt, now);
    const last = groups[groups.length - 1];
    if (last && last.group === group) last.items.push(item);
    else groups.push({ group, items: [item] });
  }
  return groups;
}
