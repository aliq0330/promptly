import test from "node:test";
import assert from "node:assert/strict";
import { extrasColumns, extrasUpdateColumns, mapCommentAttachment, mapCommentMedia } from "./comment-extras-model.ts";

const U = "11111111-1111-4111-8111-111111111111";
const F = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("a GIF row maps to its GIPHY id; a photo row to its storage path", () => {
  assert.deepEqual(mapCommentMedia({ media_kind: "gif", media_ref: "3o7TKSjRrfIPjeiVyM", media_width: 200, media_height: 150 }), { kind: "gif", gifId: "3o7TKSjRrfIPjeiVyM", width: 200, height: 150 });
  assert.deepEqual(mapCommentMedia({ media_kind: "photo", media_ref: `${U}/${F}.jpg`, media_width: 800, media_height: 600 }), { kind: "photo", path: `${U}/${F}.jpg`, width: 800, height: 600 });
});

test("malformed or unknown media rows are treated as having no media (never turned into an address)", () => {
  assert.equal(mapCommentMedia({ media_kind: null, media_ref: null }), null);
  assert.equal(mapCommentMedia({ media_kind: "gif", media_ref: "../etc/passwd" }), null);
  assert.equal(mapCommentMedia({ media_kind: "gif", media_ref: "https://evil.test/a.gif" }), null);
  assert.equal(mapCommentMedia({ media_kind: "photo", media_ref: "../x.jpg" }), null);
  assert.equal(mapCommentMedia({ media_kind: "video", media_ref: "3o7TKSjRrfIPjeiVyM" }), null);
  assert.equal(mapCommentMedia({ media_kind: "gif", media_ref: "3o7TKSjRrfIPjeiVyM", media_width: null, media_height: null })?.width, null);
});

test("attachments: only the five content types with an id", () => {
  assert.deepEqual(mapCommentAttachment({ attach_type: "workflow", attach_id: "w1" }), { type: "workflow", id: "w1" });
  for (const type of ["prompt", "request", "preset", "space"]) assert.equal(mapCommentAttachment({ attach_type: type, attach_id: "x" })?.type, type);
  assert.equal(mapCommentAttachment({ attach_type: "comment", attach_id: "x" }), null);
  assert.equal(mapCommentAttachment({ attach_type: "prompt", attach_id: null }), null);
  assert.equal(mapCommentAttachment({ attach_type: null, attach_id: "x" }), null);
});

test("extrasColumns: nothing → {} (old behaviour byte for byte); GIF and photo and attachment write the right columns", () => {
  assert.deepEqual(extrasColumns(undefined), {});
  assert.deepEqual(extrasColumns({}), {});
  assert.deepEqual(extrasColumns({ media: null, attachment: null }), {});
  assert.deepEqual(extrasColumns({ media: { kind: "gif", gifId: "3o7TKSjRrfIPjeiVyM", width: 200, height: 150 } }), { media_kind: "gif", media_ref: "3o7TKSjRrfIPjeiVyM", media_width: 200, media_height: 150 });
  assert.deepEqual(extrasColumns({ media: { kind: "photo", path: `${U}/${F}.png`, width: 10, height: 20 }, attachment: { type: "space", id: "s1" } }), {
    media_kind: "photo",
    media_ref: `${U}/${F}.png`,
    media_width: 10,
    media_height: 20,
    attach_type: "space",
    attach_id: "s1",
  });
});

test("extrasUpdateColumns (editing): all six columns are always written — removed extras become null, kept ones are written again", () => {
  const empty = { media_kind: null, media_ref: null, media_width: null, media_height: null, attach_type: null, attach_id: null };
  assert.deepEqual(extrasUpdateColumns({}), empty);
  assert.deepEqual(extrasUpdateColumns({ media: null, attachment: null }), empty);
  assert.deepEqual(extrasUpdateColumns({ attachment: { type: "prompt", id: "p1" } }), { ...empty, attach_type: "prompt", attach_id: "p1" });
  assert.deepEqual(extrasUpdateColumns({ media: { kind: "gif", gifId: "3o7TKSjRrfIPjeiVyM", width: 1, height: 2 } }), { ...empty, media_kind: "gif", media_ref: "3o7TKSjRrfIPjeiVyM", media_width: 1, media_height: 2 });
});
