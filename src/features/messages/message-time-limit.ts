/**
 * Client-side mirror of the 15-minute edit/"herkesten sil" window — the
 * actual, unbypassable rule lives entirely in Postgres (`with check
 * (auth.uid() = sender_id and created_at > now() - interval '15 minutes')`
 * on `messages`' UPDATE policy, supabase/migrations/
 * 20260919200000_messaging_content_and_edit.sql). This constant exists
 * only so the menu can decide which options to SHOW without a round trip;
 * changing a device's clock, editing this constant, or calling the API
 * directly all still hit the same server-side check and get rejected
 * there (Aşama 5/6's "yalnızca arayüzde uygulanmasın" requirement) — this
 * file changes nothing about what the backend allows. Keep this value in
 * sync with the migration's `interval '15 minutes'` if that's ever
 * revisited; the two are not otherwise linked.
 */
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

export function canEditOrDeleteMessage(createdAt: string, now: number): boolean {
  return now - new Date(createdAt).getTime() < MESSAGE_EDIT_WINDOW_MS;
}
