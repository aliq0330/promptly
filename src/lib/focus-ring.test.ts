import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/*
 * Keyboard focus must stay visible (docs/history/403-*). A class list that removes the browser outline (`outline-none`) must either draw its own indicator in
 * the same list (`focus-visible:…`, `focus:ring…`, `focus:border…`, `focus-within:…`, `focus-ring-inset`) or belong to a file where the outline is removed from
 * something that only receives focus programmatically (a dialog/sheet/stage with `tabIndex={-1}`) or whose WRAPPER draws `focus-within` (listed with the reason).
 */
const SRC = new URL("..", import.meta.url).pathname;
const EXEMPT: Record<string, string> = {
  "features/focus/focus-feed.tsx": "scroller with tabIndex=-1 (programmatic focus)",
  "features/focus/focus-sheet-frame.tsx": "sheet container, programmatic focus",
  "features/focus/focus-comments-sheet.tsx": "input inside a wrapper that draws focus-within",
  "features/stories/story-viewer-sheets.tsx": "sheet container, programmatic focus",
  "features/stories/story-viewer.tsx": "viewer stage, programmatic focus",
  "features/search/advanced-search-box.tsx": "input inside a wrapper that draws focus-within",
  "features/prompts/dna-constellation.tsx": "node group; the node child draws the ring",
  "features/messages/message-dock.tsx": "dock panel, programmatic focus",
  "features/messages/rooms/room-form-modal.tsx": "input inside a wrapper that draws focus-within",
  "features/messages/message-composer.tsx": "textarea inside the composer that draws focus-within",
  "features/messages/message-action-sheet.tsx": "sheet container, programmatic focus",
  "features/teams/board/board-comments.tsx": "field that keeps a permanent primary border",
};
const HAS_INDICATOR = /focus-visible:|focus:ring|focus:border|focus-within:|focus-ring-inset/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

test("outline-none kaldıran her sınıf listesi odak göstergesi çizer ya da gerekçeli istisnadır", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file);
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*(?<![\w-])(?:focus:)?outline-none(?![\w-])(?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
      if (HAS_INDICATOR.test(match[2])) continue;
      if (rel in EXEMPT) continue;
      offenders.push(`${rel}: ${match[2].slice(0, 80)}`);
    }
  }
  assert.deepEqual(offenders, [], "outline-none kaldırdı ama odak göstergesi yok:\n" + offenders.join("\n"));
});
