/**
 * "Yarın hatırlat" seçenekleri (docs/history/326-*): yerel saate göre erteleme anları. Saf; `now` verilir.
 * Sunucu en çok 60 gün ve geleceğe kabul eder (`notifications_group_snooze`).
 */
export type SnoozeOptionKey = "tonight" | "tomorrow" | "nextWeek";

const at = (base: Date, dayOffset: number, hour: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, hour, 0, 0, 0);

export function snoozeTimes(now: Date): Record<SnoozeOptionKey, Date | null> {
  // "Bu akşam" 18:00; 17:00'den sonra anlamsız (çok yakın) olduğundan sunulmaz.
  const tonight = now.getHours() < 17 ? at(now, 0, 18) : null;
  const tomorrow = at(now, 1, 9);
  // Gelecek hafta: bir sonraki pazartesi 09:00 (bugün pazartesiyse 7 gün sonra).
  const daysToMonday = ((8 - now.getDay()) % 7) || 7;
  const nextWeek = at(now, daysToMonday, 9);
  return { tonight, tomorrow, nextWeek };
}
