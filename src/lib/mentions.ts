/**
 * `@kullaniciadi` mentions in comments and a request's creative direction. The
 * rule MUST match `public.extract_mentioned_usernames` (migration 20260919890000):
 * usernames are `[a-z0-9_.]{3,30}` (profiles_username_format), the `@` may not follow a
 * letter / digit / `_` / `.` / `@` (so "mail@site.com" is not a mention) and a trailing
 * dot belongs to the sentence ("thanks @ali."), not to the name.
 */
export const MAX_MENTIONS = 5;
const MENTION_SOURCE = "(^|[^A-Za-z0-9_.@])@([A-Za-z0-9_.]{3,30})";

function cleanName(raw: string): string {
  return raw.replace(/\.+$/, "").toLowerCase();
}

/** Distinct mentioned usernames in order of first appearance (lower-cased), at most `max`. */
export function extractMentions(text: string, max = MAX_MENTIONS): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(new RegExp(MENTION_SOURCE, "g"))) {
    const name = cleanName(match[2]);
    if (name.length >= 3 && !names.includes(name)) names.push(name);
    if (names.length >= max) break;
  }
  return names;
}

export interface MentionSegment {
  text: string;
  /** Set when this segment is a `@username` mention (text includes the `@`). */
  username?: string;
}

/**
 * Splits text into plain and mention segments for rendering. Every `@name` that matches the
 * rule becomes a link candidate — whether the user exists is not known here (the profile page
 * answers "not found" itself), and mentions beyond the notification limit still render as links.
 */
export function splitMentions(text: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(new RegExp(MENTION_SOURCE, "g"))) {
    const lead = match[1];
    const raw = match[2];
    const name = cleanName(raw);
    if (name.length < 3) continue;
    const start = (match.index ?? 0) + lead.length;
    const end = start + 1 + raw.replace(/\.+$/, "").length;
    if (start > cursor) segments.push({ text: text.slice(cursor, start) });
    segments.push({ text: text.slice(start, end), username: name });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

/** The `@partial` being typed right before the caret, or null (used for the suggestion list). */
export function activeMentionQuery(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const match = /(^|[^A-Za-z0-9_.@])@([A-Za-z0-9_.]{0,30})$/.exec(before);
  if (!match) return null;
  return { start: before.length - match[2].length - 1, query: match[2].toLowerCase() };
}

/** Replaces the `@partial` that starts at `start` (ending at the caret) with `@username ` and returns the new caret. */
export function applyMention(value: string, start: number, caret: number, username: string): { value: string; caret: number } {
  const insert = `@${username} `;
  const after = value.slice(caret);
  // Don't double the space when the text already continues with one.
  const tail = after.startsWith(" ") ? after.slice(1) : after;
  return { value: value.slice(0, start) + insert + tail, caret: start + insert.length };
}
