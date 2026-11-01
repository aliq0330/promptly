import test from "node:test";
import assert from "node:assert/strict";
import { dedupeGifs, fetchGifs, gifIdFromPath, gifPath, giphyUrl, GiphyError, isGiphyHost, isGiphyId, parseGif, splitColumns, type GifItem } from "./giphy.ts";

const gif = (id: string, width = 100, height = 100): GifItem => ({ id, title: "", previewUrl: `https://media.giphy.com/media/${id}/200w.gif`, stillUrl: `https://media.giphy.com/media/${id}/200w_s.gif`, width, height });

test("GIPHY ids: only the characters the database CHECK allows", () => {
  for (const ok of ["3o7TKSjRrfIPjeiVyM", "xT0xeJpnrWC4XWblEk", "a_b-c1", "abcd"]) assert.equal(isGiphyId(ok), true, ok);
  for (const bad of ["", "abc", "ab/cd", "../etc", "a.b.c.d", "https://x.test/a.gif", "ab cd", "x".repeat(65), 42, null, undefined]) assert.equal(isGiphyId(bad), false, String(bad));
});

test("giphyUrl builds only GIPHY addresses and refuses a malformed id", () => {
  assert.equal(giphyUrl("3o7TKSjRrfIPjeiVyM"), "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/200w.gif");
  assert.equal(giphyUrl("3o7TKSjRrfIPjeiVyM", "still"), "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/200w_s.gif");
  assert.equal(giphyUrl("3o7TKSjRrfIPjeiVyM", "original"), "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif");
  assert.equal(giphyUrl("../evil"), null);
  assert.equal(giphyUrl("a/b/c/d/e"), null);
});

test("message attachment path round-trips and a photo path is never taken for a GIF", () => {
  assert.equal(gifPath("3o7TKSjRrfIPjeiVyM"), "giphy:3o7TKSjRrfIPjeiVyM");
  assert.equal(gifIdFromPath("giphy:3o7TKSjRrfIPjeiVyM"), "3o7TKSjRrfIPjeiVyM");
  assert.equal(gifIdFromPath("c1/u1/photo.jpg"), null);
  assert.equal(gifIdFromPath("giphy:../x"), null);
  assert.equal(gifIdFromPath("giphy:"), null);
});

test("isGiphyHost accepts https giphy.com hosts only", () => {
  assert.equal(isGiphyHost("https://media0.giphy.com/media/x/200w.gif"), true);
  assert.equal(isGiphyHost("https://giphy.com/a.gif"), true);
  assert.equal(isGiphyHost("http://media.giphy.com/a.gif"), false);
  assert.equal(isGiphyHost("https://evil-giphy.com/a.gif"), false);
  assert.equal(isGiphyHost("https://giphy.com.evil.test/a.gif"), false);
  assert.equal(isGiphyHost("not a url"), false);
});

test("parseGif keeps good rows and drops rows with a bad id, foreign host or empty size", () => {
  const good = { id: "3o7TKSjRrfIPjeiVyM", title: "clap", images: { fixed_width_small: { url: "https://media2.giphy.com/media/a/100w.gif", width: "100", height: "75" }, fixed_width_small_still: { url: "https://media2.giphy.com/media/a/100w_s.gif" } } };
  assert.deepEqual(parseGif(good), { id: "3o7TKSjRrfIPjeiVyM", title: "clap", previewUrl: "https://media2.giphy.com/media/a/100w.gif", stillUrl: "https://media2.giphy.com/media/a/100w_s.gif", width: 100, height: 75 });
  assert.equal(parseGif({ ...good, id: "../x" }), null);
  assert.equal(parseGif({ ...good, images: { fixed_width_small: { url: "https://evil.test/a.gif", width: "100", height: "75" } } }), null);
  assert.equal(parseGif({ ...good, images: { fixed_width_small: { url: "https://media2.giphy.com/a.gif", width: "0", height: "75" } } }), null);
  assert.equal(parseGif({ id: "3o7TKSjRrfIPjeiVyM" }), null);
});

test("dedupeGifs drops ids already shown and repeats inside one page", () => {
  const shown = [gif("aaaa1"), gif("bbbb2")];
  assert.deepEqual(dedupeGifs(shown, [gif("bbbb2"), gif("cccc3"), gif("cccc3")]).map((g) => g.id), ["cccc3"]);
});

test("splitColumns balances columns and never moves a GIF when more are appended", () => {
  const items = [gif("g1", 100, 200), gif("g2", 100, 100), gif("g3", 100, 100), gif("g4", 100, 300), gif("g5", 100, 50)];
  const before = splitColumns(items.slice(0, 3), 2);
  const after = splitColumns(items, 2);
  for (let c = 0; c < 2; c += 1) assert.deepEqual(after[c].slice(0, before[c].length).map((g) => g.id), before[c].map((g) => g.id));
  assert.equal(after.flat().length, items.length);
  assert.deepEqual(splitColumns([], 2), [[], []]);
});

function withFetch(handler: (url: string) => Response | Promise<Response>, body: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => handler(String(input))) as typeof fetch;
  return body().finally(() => {
    globalThis.fetch = original;
  });
}

test("fetchGifs without an API key fails with not_configured (and never calls the network)", async () => {
  delete process.env.NEXT_PUBLIC_GIPHY_API_KEY;
  await withFetch(
    () => {
      throw new Error("network must not be called");
    },
    async () => {
      await assert.rejects(fetchGifs(""), (err: unknown) => err instanceof GiphyError && err.code === "not_configured");
    },
  );
});

test("fetchGifs: empty query = trending, text query = search, paging offset and rating are sent", async () => {
  process.env.NEXT_PUBLIC_GIPHY_API_KEY = "test-key";
  const urls: string[] = [];
  const row = (id: string) => ({ id, title: "t", images: { fixed_width_small: { url: `https://media.giphy.com/media/${id}/100w.gif`, width: "100", height: "100" } } });
  await withFetch(
    (url) => {
      urls.push(url);
      return new Response(JSON.stringify({ data: [row("aaaa1"), row("bad/id"), row("bbbb2")], pagination: { total_count: 100, count: 3, offset: 0 } }));
    },
    async () => {
      const trending = await fetchGifs("", 0);
      assert.ok(urls[0].includes("/v1/gifs/trending?"));
      assert.deepEqual(trending.items.map((g) => g.id), ["aaaa1", "bbbb2"]); // the malformed id row is dropped
      assert.equal(trending.nextOffset, 3); // 3 rows received (incl. the dropped one) → next page starts there
      const search = await fetchGifs("  alkış ", 24);
      assert.ok(urls[1].includes("/v1/gifs/search?"));
      assert.ok(urls[1].includes("q=alk%C4%B1%C5%9F"));
      assert.ok(urls[1].includes("offset=24"));
      assert.ok(urls[1].includes("rating=pg"));
      assert.ok(urls[1].includes("api_key=test-key"));
    },
  );
});

test("fetchGifs: last page ends the list; 429 and other failures map to GiphyError codes", async () => {
  process.env.NEXT_PUBLIC_GIPHY_API_KEY = "test-key";
  await withFetch(
    () => new Response(JSON.stringify({ data: [], pagination: { total_count: 0, count: 0, offset: 0 } })),
    async () => assert.equal((await fetchGifs("zzz")).nextOffset, null),
  );
  await withFetch(() => new Response("{}", { status: 429 }), async () => {
    await assert.rejects(fetchGifs("x"), (err: unknown) => err instanceof GiphyError && err.code === "rate_limited");
  });
  await withFetch(() => new Response("oops", { status: 500 }), async () => {
    await assert.rejects(fetchGifs("x"), (err: unknown) => err instanceof GiphyError && err.code === "failed");
  });
  await withFetch(
    () => {
      throw new TypeError("offline");
    },
    async () => {
      await assert.rejects(fetchGifs("x"), (err: unknown) => err instanceof GiphyError && err.code === "failed");
    },
  );
  delete process.env.NEXT_PUBLIC_GIPHY_API_KEY;
});
