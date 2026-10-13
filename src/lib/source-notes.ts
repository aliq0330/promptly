/**
 * Attribution lines ("Kaynak: …", "Görsel: …", "Source: …") that authors
 * (and the viral seed) append to a description. They are credit, not
 * description — detail pages show them as a muted note under the lede and
 * cards drop them from the clamped preview. Pure render-time split: nothing
 * is rewritten in the database.
 */
const NOTE_LINE = /^\s*(kaynak|görsel|gorsel|source|image(?: credit)?|credit|photo)\s*:/i;

export interface SplitDescription {
  /** The description without its trailing attribution block. */
  body: string;
  /** The attribution lines, in order. */
  notes: string[];
}

export function splitSourceNotes(text: string | null | undefined): SplitDescription {
  if (!text) return { body: "", notes: [] };
  const lines = text.split("\n");
  let end = lines.length;
  while (end > 0 && (lines[end - 1].trim() === "" || NOTE_LINE.test(lines[end - 1]))) end--;
  const notes = lines.slice(end).filter((line) => NOTE_LINE.test(line)).map((line) => line.trim());
  // Only treat it as attribution when it really trails the text; a lone
  // "Kaynak:" in the middle of a description stays where the author put it.
  if (notes.length === 0) return { body: text, notes: [] };
  return { body: lines.slice(0, end).join("\n").trimEnd(), notes };
}

/** Splits a note into plain text and http(s) links so the page can render real anchors. */
export function linkifyNote(note: string): { text: string; href?: string }[] {
  const parts: { text: string; href?: string }[] = [];
  const pattern = /https?:\/\/[^\s)]+/g;
  let last = 0;
  for (const match of note.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: note.slice(last, index) });
    parts.push({ text: match[0], href: match[0] });
    last = index + match[0].length;
  }
  if (last < note.length) parts.push({ text: note.slice(last) });
  return parts;
}
