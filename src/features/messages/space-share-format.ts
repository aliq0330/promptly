import { absoluteUrl } from "@/lib/utils";
import { spaceHref } from "@/lib/spaces";

/**
 * Same idea as `workflow-share-format.ts`: `messages` has no embed column for a Space (and no new messaging schema is added), so
 * sharing one composes a recognizable plain-text block (its real title + real link) into `body`, parsed at render time into a card.
 */
const SPACE_ID_LINE_PATTERN = /\/spaces\/local\?id=([0-9a-f-]{36})/i;

export function composeSpaceShareBody(note: string, title: string, id: string): string {
  const line = `${title}\n${absoluteUrl(spaceHref(id))}`;
  return note ? `${note}\n\n${line}` : line;
}

export interface ParsedSpaceShare {
  note: string | null;
  id: string;
  /** The shared item's title as written into the share block. */
  title: string;
}

export function parseSpaceShareBody(body: string | null | undefined): ParsedSpaceShare | null {
  if (!body) return null;
  const lines = body.split("\n");
  const urlLineIndex = lines.findIndex((line) => SPACE_ID_LINE_PATTERN.test(line.trim()));
  if (urlLineIndex < 1) return null;
  const match = lines[urlLineIndex].trim().match(SPACE_ID_LINE_PATTERN);
  const titleLine = lines[urlLineIndex - 1]?.trim();
  if (!match || !titleLine) return null;
  const note = lines.slice(0, urlLineIndex - 1).join("\n").trim();
  return { note: note || null, id: match[1], title: titleLine };
}
