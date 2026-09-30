import { absoluteUrl, workflowHref } from "@/lib/utils";

/**
 * Same idea as `generator-share-format.ts`: `messages` has no rich embed
 * column for a workflow (and this feature adds none — no new messaging
 * schema), so sharing one composes a recognizable plain-text block (its real
 * title + real link) into the existing `body`, composed at send time and
 * parsed at render time from this one source of truth so the message still
 * renders as a real card.
 */
const WORKFLOW_ID_LINE_PATTERN = /\/workflows\/local\?id=([0-9a-f-]{36})/i;

export function composeWorkflowShareBody(note: string, title: string, id: string): string {
  const line = `${title}\n${absoluteUrl(workflowHref({ id }))}`;
  return note ? `${note}\n\n${line}` : line;
}

export interface ParsedWorkflowShare {
  note: string | null;
  id: string;
}

export function parseWorkflowShareBody(body: string | null | undefined): ParsedWorkflowShare | null {
  if (!body) return null;
  const lines = body.split("\n");
  const urlLineIndex = lines.findIndex((line) => WORKFLOW_ID_LINE_PATTERN.test(line.trim()));
  if (urlLineIndex < 1) return null;
  const match = lines[urlLineIndex].trim().match(WORKFLOW_ID_LINE_PATTERN);
  const titleLine = lines[urlLineIndex - 1]?.trim();
  if (!match || !titleLine) return null;
  const note = lines.slice(0, urlLineIndex - 1).join("\n").trim();
  return { note: note || null, id: match[1] };
}
