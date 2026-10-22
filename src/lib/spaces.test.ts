import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultItemSize,
  extractSpaceErrorCode,
  isSpaceTab,
  matchesQuery,
  parseSpaceLinkToken,
  sourceStateOf,
  spaceCapabilities,
  spaceHref,
  spaceLinkHref,
} from "./spaces.ts";

test("addresses: overview has no tab param, link token lives in the URL fragment", () => {
  assert.equal(spaceHref("abc"), "/spaces/local?id=abc");
  assert.equal(spaceHref("abc", "overview"), "/spaces/local?id=abc");
  assert.equal(spaceHref("abc", "board"), "/spaces/local?id=abc&tab=board");
  assert.equal(spaceLinkHref("T".repeat(43)), `/spaces/link#${"T".repeat(43)}`);
  assert.equal(parseSpaceLinkToken(`#${"a_B-9".repeat(9)}`), "a_B-9".repeat(9));
  assert.equal(parseSpaceLinkToken("#short"), null);
  assert.equal(parseSpaceLinkToken("#<script>alert(1)</script>xxxxxxxxxxxx"), null);
  assert.ok(isSpaceTab("palette") && !isSpaceTab("settings") && !isSpaceTab(null));
});

test("capabilities: viewer reads only, editor edits but never manages, archive freezes everyone", () => {
  const viewer = spaceCapabilities("viewer", false);
  assert.ok(viewer.member && !viewer.edit && !viewer.share && viewer.leave);
  const editor = spaceCapabilities("editor", false);
  assert.ok(editor.edit && !editor.owner && !editor.manageMembers && !editor.share && !editor.delete);
  const owner = spaceCapabilities("owner", false);
  assert.ok(owner.edit && owner.manageMembers && owner.share && owner.delete && !owner.leave);
  const archived = spaceCapabilities("owner", true);
  assert.ok(!archived.edit && !archived.manageMembers && archived.archive && archived.delete);
  const stranger = spaceCapabilities(null, false);
  assert.ok(!stranger.member && !stranger.edit && !stranger.seePrivateNotes && !stranger.seeActivity);
});

test("defaultItemSize keeps an image's ratio with a 260 long side", () => {
  assert.deepEqual(defaultItemSize("image", { width: 1600, height: 900 }), { w: 260, h: 146 });
  assert.deepEqual(defaultItemSize("image", { width: 900, height: 1600 }), { w: 146, h: 260 });
  assert.deepEqual(defaultItemSize("image", null), { w: 240, h: 240 });
  assert.deepEqual(defaultItemSize("note"), { w: 220, h: 180 });
});

test("sourceStateOf: own / ok / unavailable / deleted", () => {
  const readable = (id: string) => id === "P";
  const base = { promptId: null, mediaUrl: null, isDraft: false, contentId: null };
  assert.equal(sourceStateOf({ ...base, kind: "note" }, readable), "own");
  assert.equal(sourceStateOf({ ...base, kind: "prompt", isDraft: true }, readable), "own");
  assert.equal(sourceStateOf({ ...base, kind: "image", mediaUrl: "https://x/storage/v1/object/public/space-media/s/f.jpg" }, readable), "own");
  assert.equal(sourceStateOf({ ...base, kind: "image", mediaUrl: "https://x/storage/v1/object/public/prompt-media/u/f.jpg" }, readable), "deleted");
  assert.equal(sourceStateOf({ ...base, kind: "image", promptId: "P", mediaUrl: "m" }, readable), "ok");
  assert.equal(sourceStateOf({ ...base, kind: "prompt", promptId: "Q" }, readable), "unavailable");
  assert.equal(sourceStateOf({ ...base, kind: "prompt" }, readable), "deleted");
  assert.equal(sourceStateOf({ ...base, kind: "content", contentId: "P" }, readable), "ok");
});

test("server error codes are recognised without prefix collisions; duplicates map to space_duplicate", () => {
  assert.equal(extractSpaceErrorCode({ message: "space_invite_exists" }), "space_invite_exists");
  assert.equal(extractSpaceErrorCode({ message: "ERROR: space_invite_not_found" }), "space_invite_not_found");
  assert.equal(extractSpaceErrorCode({ message: "space_not_found" }), "space_not_found");
  assert.equal(extractSpaceErrorCode({ code: "23505", message: "duplicate key value" }), "space_duplicate");
  assert.equal(extractSpaceErrorCode({ message: "something else" }), null);
  assert.equal(extractSpaceErrorCode(null), null);
});

test("matchesQuery ignores case, Turkish dotless i and accents", () => {
  assert.ok(matchesQuery("ışık", "Işık oyunu"));
  assert.ok(matchesQuery("ISIK", "ışık"));
  assert.ok(matchesQuery("cafe", null, "Café noir"));
  assert.ok(matchesQuery("  ", "anything"));
  assert.ok(!matchesQuery("ejderha", "kedi", undefined));
});
