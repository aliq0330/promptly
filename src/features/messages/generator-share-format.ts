import { absoluteUrl, generatorHref } from "@/lib/utils";

/**
 * A generator has no rich embed column in the `messages` schema (Bölüm 9.8
 * only added `shared_prompt_id`/`shared_request_id`) — Bölüm 9.52's
 * Unified Share System deliberately didn't add one either (its own "no new
 * messaging table/column/architecture" rule). Instead, sharing a generator
 * composes a recognizable plain-text line (its real title + real link)
 * into the message's already-existing `body`. That format is COMPOSED here
 * (send time, `local-conversation-view.tsx`'s `handleSubmit`) and PARSED
 * here (render time, `message-bubble.tsx`) from the exact same source of
 * truth, so a shared generator can still render as a real card — same as
 * a shared prompt/request — purely by recognizing its own link pattern in
 * plain text, with zero new database state.
 */
const GENERATOR_SLUG_LINE_PATTERN = /\/generators\/local\?slug=([a-z0-9-]+)/;

/** Builds the message body for sharing a generator — an optional user note, then the generator's title and real link on their own lines. */
export function composeGeneratorShareBody(note: string, title: string, slug: string): string {
  const line = `${title}\n${absoluteUrl(generatorHref({ slug }))}`;
  return note ? `${note}\n\n${line}` : line;
}

export interface ParsedGeneratorShare {
  /** Anything the sender typed before the generator's title+link block — null if they added no note. */
  note: string | null;
  slug: string;
}

/**
 * Recognizes `composeGeneratorShareBody`'s own format inside a message
 * body: a line matching the generator link pattern, immediately preceded
 * by a title line. Returns null for any body that isn't one of these
 * (a normal text message, or one sharing a prompt/request instead).
 */
export function parseGeneratorShareBody(body: string | null | undefined): ParsedGeneratorShare | null {
  if (!body) return null;
  const lines = body.split("\n");
  const urlLineIndex = lines.findIndex((line) => GENERATOR_SLUG_LINE_PATTERN.test(line.trim()));
  if (urlLineIndex < 1) return null;
  const match = lines[urlLineIndex].trim().match(GENERATOR_SLUG_LINE_PATTERN);
  const titleLine = lines[urlLineIndex - 1]?.trim();
  if (!match || !titleLine) return null;
  const note = lines.slice(0, urlLineIndex - 1).join("\n").trim();
  return { note: note || null, slug: match[1] };
}
