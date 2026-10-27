/**
 * Guard (docs/history/255-*): every "Daha fazla yükle" in the app must also load by itself when it scrolls near the screen. The button is only the
 * fallback; the shared `LoadMoreButton` / `LoadMore` (`features/feed/load-more.tsx`) carries the auto-load. A bare `<Button>` labelled "load more"
 * means a list that stops until someone presses it — use the shared component instead.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

/** A visible label that says "load more / older / more" (translation keys end in loadMore, loadOlder or archive.more). */
const LOAD_MORE_LABEL = /t\(\s*"[\w.]*(?:loadMore|loadOlder|archive\.more)"/;

test("every load-more control is the shared auto-loading component, not a bare button", () => {
  const offenders = tsxFiles(ROOT)
    .filter((file) => !file.endsWith("features/feed/load-more.tsx"))
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      return LOAD_MORE_LABEL.test(source) && !/<LoadMore(?:Button)?\b/.test(source);
    })
    .map((file) => file.slice(ROOT.length));
  assert.deepEqual(offenders, [], `use LoadMoreButton / LoadMore (auto-loads near the viewport): ${offenders.join(", ")}`);
});

test("the shared component auto-loads (IntersectionObserver) and does not loop on failure", () => {
  const source = readFileSync(join(ROOT, "features/feed/load-more.tsx"), "utf8");
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /if \(!auto \|\| loading \|\| error \|\| disabled/, "an error stops the automatic loading (a retry is the user's click)");
});
