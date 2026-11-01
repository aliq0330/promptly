import { test } from "node:test";
import assert from "node:assert/strict";
import { clipDescription, detailHrefFor, isShareKind, parseSharePath, shareLinkForHref, sharePathFor } from "./share-link.ts";

const ID = "3f0c9a52-7d0e-4c3a-9a55-0f2f1a2b3c4d";

test("detail hrefs of the seven shareable kinds become share paths", () => {
  assert.equal(shareLinkForHref(`/prompts/local?id=${ID}`), `/share/prompt/${ID}/`);
  assert.equal(shareLinkForHref(`/requests/local?id=${ID}`), `/share/request/${ID}/`);
  assert.equal(shareLinkForHref(`/workflows/local?id=${ID}`), `/share/workflow/${ID}/`);
  assert.equal(shareLinkForHref(`/presets/local?id=${ID}`), `/share/preset/${ID}/`);
  assert.equal(shareLinkForHref("/profile/real?username=ayse.k"), "/share/profile/ayse.k/");
  // docs/history/306-*: Space ve alıntı da kendi önizleme sayfasına sahip; ek parametreli (sekme, odak) bağlantılar olduğu gibi kalır.
  assert.equal(shareLinkForHref(`/spaces/local?id=${ID}`), `/share/space/${ID}/`);
  assert.equal(shareLinkForHref(`/quotes/local?id=${ID}`), `/share/quote/${ID}/`);
  assert.equal(shareLinkForHref(`/spaces/local?id=${ID}&tab=comments`), `/spaces/local?id=${ID}&tab=comments`);
  assert.deepEqual(parseSharePath(`/promptly/share/space/${ID}/`), { kind: "space", key: ID });
  assert.deepEqual(parseSharePath(`/share/quote/${ID}`), { kind: "quote", key: ID });
  assert.equal(detailHrefFor("space", ID), `/spaces/local?id=${ID}`);
  assert.equal(detailHrefFor("quote", ID), `/quotes/local?id=${ID}`);
});

test("anything else is returned unchanged (results, collections, tags, messages, odd params)", () => {
  for (const href of [
    `/results/local?id=${ID}`,
    `/collections/local?id=${ID}`,
    "/tags/local?tag=portre",
    `/messages/local?id=${ID}`,
    `/prompts/local?id=${ID}&x=1`,
    `/prompts/local?username=${ID}`,
    "/prompts/local",
    "/discover",
  ]) {
    assert.equal(shareLinkForHref(href), href, href);
  }
});

test("share paths round-trip through the 404 parser, with and without basePath/trailing slash", () => {
  for (const kind of ["prompt", "request", "workflow", "preset", "profile"] as const) {
    const key = kind === "profile" ? "ayse.k" : ID;
    for (const path of [sharePathFor(kind, key), `/promptly${sharePathFor(kind, key)}`, `/promptly${sharePathFor(kind, key)}`.replace(/\/$/, "")]) {
      assert.deepEqual(parseSharePath(path), { kind, key }, path);
    }
  }
});

test("the 404 parser ignores everything that is not a share path", () => {
  for (const p of ["/promptly/", "/promptly/discover/", "/promptly/share/", "/promptly/share/prompt/", "/promptly/share/unknown/x/", "/promptly/share/prompt/a/b/", "/share/prompt/%E0%A4%A/"]) {
    assert.equal(parseSharePath(p), null, p);
  }
});

test("a share path and the detail href point at the same row", () => {
  const parsed = parseSharePath(sharePathFor("workflow", ID));
  assert.ok(parsed);
  assert.equal(detailHrefFor(parsed.kind, parsed.key), `/workflows/local?id=${ID}`);
  assert.equal(detailHrefFor("profile", "ayse.k"), "/profile/real?username=ayse.k");
});

test("isShareKind", () => {
  assert.equal(isShareKind("prompt"), true);
  assert.equal(isShareKind("result"), false);
  assert.equal(isShareKind(""), false);
});

test("clipDescription flattens whitespace and clips with an ellipsis", () => {
  assert.equal(clipDescription("  a \n\n b\t c  "), "a b c");
  assert.equal(clipDescription(null), "");
  assert.equal(clipDescription(undefined), "");
  const long = "x".repeat(300);
  const clipped = clipDescription(long, 200);
  assert.equal(clipped.length, 200);
  assert.ok(clipped.endsWith("…"));
  assert.equal(clipDescription("short", 200), "short");
});
