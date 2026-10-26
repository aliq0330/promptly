import { test } from "node:test";
import assert from "node:assert/strict";
import {
  focusFeedCover,
  focusFeedExtraImages,
  focusFeedHasMedia,
  focusFeedIsNear,
  focusFeedLayout,
  focusFeedPlayable,
  focusFeedShouldLoadMore,
  focusFeedShown,
  focusFeedStartIndex,
} from "./focus-feed.ts";
import type { PostEntry } from "./supabase/feed";

const media = (id: string) => ({ id, url: `https://example.supabase.co/storage/v1/object/public/prompt-media/${id}.jpg`, width: 800, height: 600, alt: "" });

function prompt(contentType: "image" | "text" | "audio" | "video", mediaCount: number): PostEntry {
  return {
    kind: "prompt",
    data: { id: `p-${contentType}-${mediaCount}`, title: "Başlık", contentType, media: Array.from({ length: mediaCount }, (_, i) => media(`m${i}`)) },
  } as unknown as PostEntry;
}

test("an image prompt with media is image-first; without media it is a text slide", () => {
  assert.equal(focusFeedLayout(prompt("image", 2)), "visual");
  assert.equal(focusFeedCover(prompt("image", 2))?.url.endsWith("m0.jpg"), true);
  assert.equal(focusFeedCover(prompt("image", 1))?.alt, "Başlık");
  assert.equal(focusFeedExtraImages(prompt("image", 3)), 2);
  assert.equal(focusFeedLayout(prompt("image", 0)), "text");
  assert.equal(focusFeedLayout(prompt("text", 0)), "text");
  assert.equal(focusFeedCover(prompt("text", 0)), null);
});

test("video / audio prompts are playable slides (with or without a poster) and count as media", () => {
  assert.equal(focusFeedPlayable(prompt("video", 1)), true);
  assert.equal(focusFeedPlayable(prompt("audio", 0)), true);
  assert.equal(focusFeedPlayable(prompt("image", 1)), false);
  assert.equal(focusFeedLayout(prompt("video", 0)), "playable");
  assert.equal(focusFeedLayout(prompt("audio", 1)), "playable");
  assert.equal(focusFeedExtraImages(prompt("video", 3)), 0, "a video poster set is not a gallery");
  assert.equal(focusFeedHasMedia(prompt("audio", 0)), true);
  assert.equal(focusFeedHasMedia(prompt("image", 1)), true);
  assert.equal(focusFeedHasMedia(prompt("text", 0)), false);
});

test("workflow / preset / request keep their own structure unless they have a real picture", () => {
  const workflow = { kind: "workflow", data: { id: "w", title: "W", media: [] } } as unknown as PostEntry;
  const workflowWithCover = { kind: "workflow", data: { id: "w2", title: "W", media: [media("c")] } } as unknown as PostEntry;
  const preset = { kind: "preset", data: { id: "s", title: "S", coverUrl: null } } as unknown as PostEntry;
  const presetWithCover = { kind: "preset", data: { id: "s2", title: "S", coverUrl: "https://example.com/c.jpg" } } as unknown as PostEntry;
  const request = { kind: "request", data: { id: "r", title: "R", media: [] } } as unknown as PostEntry;
  assert.equal(focusFeedLayout(workflow), "workflow");
  assert.equal(focusFeedLayout(workflowWithCover), "visual");
  assert.equal(focusFeedLayout(preset), "preset");
  assert.equal(focusFeedLayout(presetWithCover), "visual");
  assert.equal(focusFeedExtraImages(presetWithCover), 0);
  assert.equal(focusFeedLayout(request), "request");
  assert.equal(focusFeedHasMedia(workflow), false);
  assert.equal(focusFeedHasMedia(presetWithCover), true);
});

test("the feed opens on the remembered post, else the top", () => {
  const keys = ["prompt-a", "workflow-b", "preset-c"];
  assert.equal(focusFeedStartIndex(keys, "preset-c"), 2);
  assert.equal(focusFeedStartIndex(keys, "gone"), 0);
  assert.equal(focusFeedStartIndex(keys, null), 0);
  assert.equal(focusFeedStartIndex([], "prompt-a"), 0);
});

test("only nearby slides load media; the next page is asked for near the end, once", () => {
  assert.equal(focusFeedIsNear(4, 3), true);
  assert.equal(focusFeedIsNear(5, 3), false);
  assert.equal(focusFeedIsNear(2, 3), true);
  const idle = { hasMore: true, loadingMore: false, failed: false };
  assert.equal(focusFeedShouldLoadMore(14, 18, idle), false);
  assert.equal(focusFeedShouldLoadMore(15, 18, idle), true);
  assert.equal(focusFeedShouldLoadMore(17, 18, { ...idle, loadingMore: true }), false);
  assert.equal(focusFeedShouldLoadMore(17, 18, { ...idle, failed: true }), false);
  assert.equal(focusFeedShouldLoadMore(17, 18, { ...idle, hasMore: false }), false);
  assert.equal(focusFeedShouldLoadMore(0, 0, idle), true, "an empty filtered list keeps paging while the server has more");
  assert.equal(focusFeedShouldLoadMore(0, 0, { ...idle, hasMore: false }), false);
});

test("the Medya switch hides prompts and workflows without anything to look at, never requests or presets", () => {
  const workflow = { kind: "workflow", data: { id: "w", title: "W", media: [] } } as unknown as PostEntry;
  const workflowWithCover = { kind: "workflow", data: { id: "w2", title: "W", media: [media("c")] } } as unknown as PostEntry;
  const preset = { kind: "preset", data: { id: "s", title: "S", coverUrl: null } } as unknown as PostEntry;
  const request = { kind: "request", data: { id: "r", title: "R", media: [] } } as unknown as PostEntry;
  assert.equal(focusFeedShown(prompt("text", 0), true), false);
  assert.equal(focusFeedShown(prompt("text", 0), false), true);
  assert.equal(focusFeedShown(prompt("image", 1), true), true);
  assert.equal(focusFeedShown(prompt("audio", 0), true), true, "a playable prompt stays");
  assert.equal(focusFeedShown(workflow, true), false);
  assert.equal(focusFeedShown(workflowWithCover, true), true);
  assert.equal(focusFeedShown(preset, true), true);
  assert.equal(focusFeedShown(request, true), true);
});

