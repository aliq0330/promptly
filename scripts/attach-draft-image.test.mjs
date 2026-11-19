import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, run } from "./attach-draft-image.mjs";

const KEY = "pmt_" + "A".repeat(43);
const PROMPT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ENV = { PROMPTLY_API_KEY: KEY, PROMPTLY_SUPABASE_URL: "https://ref.supabase.co/" };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 4, 0, 0, 0, 4, 0, 8, 6, 0, 0, 0]);
const OK = { promptId: PROMPT, mediaId: "m1", position: 0, imageCount: 1, width: 1024, height: 1024, duplicate: false, pipeline: { draftCheck: "success", imageSource: "success", storageUpload: "success", imageAttachment: "success", published: false } };
const base = ["--prompt-id", PROMPT, "--generation-id", "promptly_visual_trend_2026-11-19T10:00"];
const noSleep = async () => undefined;

test("parseArgs: known options only, each needs a value", () => {
  assert.deepEqual(parseArgs(["--file", "a.png", "--alt", "x"]), { file: "a.png", alt: "x" });
  assert.throws(() => parseArgs(["--nope", "1"]), /Unknown option/);
  assert.throws(() => parseArgs(["--file"]), /needs a value/);
  assert.throws(() => parseArgs(["--file", "--alt"]), /needs a value/);
  assert.throws(() => parseArgs(["stray"]), /Unexpected/);
});

test("usage errors exit 2 and never touch the network (missing key/url/ids/source, both sources, bad generation id)", async () => {
  let calls = 0;
  const fetchImpl = async () => (calls++, Response.json(OK));
  const read = async () => PNG;
  const code = async (argv, env = ENV) => (await run(argv, env, { fetchImpl, read, sleep: noSleep })).code;
  assert.equal(await code([...base, "--file", "a.png"], {}), 2);
  assert.equal(await code([...base, "--file", "a.png"], { PROMPTLY_API_KEY: "sk-nope", PROMPTLY_SUPABASE_URL: "https://x" }), 2);
  assert.equal(await code([...base, "--file", "a.png"], { PROMPTLY_API_KEY: KEY }), 2);
  assert.equal(await code(["--prompt-id", "nope", "--generation-id", "g", "--file", "a.png"]), 2);
  assert.equal(await code(["--prompt-id", PROMPT, "--file", "a.png"]), 2, "generation id is required");
  assert.equal(await code(["--prompt-id", PROMPT, "--generation-id", "has space", "--file", "a.png"]), 2);
  assert.equal(await code(base), 2, "no source");
  assert.equal(await code([...base, "--file", "a.png", "--url", "https://a.b/c.png"]), 2, "two sources");
  assert.equal(calls, 0);
  const missing = await run([...base, "--file", "gone.png"], ENV, { fetchImpl, read: async () => { throw new Error("ENOENT"); }, sleep: noSleep });
  assert.equal(missing.code, 2);
  const huge = await run([...base, "--file", "big.png"], ENV, { fetchImpl, read: async () => Buffer.alloc(8 * 1024 * 1024 + 1), sleep: noSleep });
  assert.equal(huge.code, 2);
});

test("--file: POSTs the BYTES to media-upload with the ids in the query and the key only in the Authorization header", async () => {
  let seen;
  const fetchImpl = async (url, init) => ((seen = { url: String(url), init }), Response.json(OK));
  const { code, result } = await run([...base, "--file", "out.png", "--alt", "A fox"], ENV, { fetchImpl, read: async () => PNG, sleep: noSleep });
  assert.equal(code, 0);
  assert.equal(result.pipeline.published, false);
  assert.equal(result.attempts, 1);
  const url = new URL(seen.url);
  assert.equal(`${url.origin}${url.pathname}`, "https://ref.supabase.co/functions/v1/media-upload");
  assert.equal(url.searchParams.get("prompt_id"), PROMPT);
  assert.equal(url.searchParams.get("generation_id"), "promptly_visual_trend_2026-11-19T10:00");
  assert.equal(url.searchParams.get("alt"), "A fox");
  assert.equal(seen.init.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(seen.init.headers["Content-Type"], "application/octet-stream");
  assert.deepEqual(Buffer.from(seen.init.body), PNG);
  assert.ok(!seen.url.includes(KEY), "the key is never put in the URL");
  assert.ok(!JSON.stringify(result).includes(KEY));
});

test("--url: sends a JSON body with the https address and the generation id", async () => {
  let seen;
  const fetchImpl = async (url, init) => ((seen = { url: String(url), init }), Response.json(OK));
  const { code } = await run([...base, "--url", "https://cdn.example.com/a.png"], ENV, { fetchImpl, sleep: noSleep });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(seen.init.body), { prompt_id: PROMPT, image_url: "https://cdn.example.com/a.png", generation_id: "promptly_visual_trend_2026-11-19T10:00", alt: null });
});

test("idempotent re-run: the server answers duplicate=true and that is a SUCCESS (exit 0)", async () => {
  const fetchImpl = async () => Response.json({ ...OK, duplicate: true, bytes: null, contentType: null, pipeline: { draftCheck: "success", imageSource: "skipped", storageUpload: "skipped", imageAttachment: "success", published: false } });
  const { code, result } = await run([...base, "--file", "out.png"], ENV, { fetchImpl, read: async () => PNG, sleep: noSleep });
  assert.equal(code, 0);
  assert.equal(result.duplicate, true);
});

test("transient failures (network, 502/503/504/429) are retried up to 3 times with the SAME generation id; permanent ones (4xx) are not", async () => {
  const urls = [];
  let n = 0;
  const flaky = async (url) => {
    urls.push(String(url));
    n++;
    if (n === 1) throw new TypeError("fetch failed");
    if (n === 2) return Response.json({ error: { code: "upstream", message: "x" } }, { status: 502 });
    return Response.json(OK);
  };
  const retried = await run([...base, "--file", "out.png"], ENV, { fetchImpl: flaky, read: async () => PNG, sleep: noSleep });
  assert.equal(retried.code, 0);
  assert.equal(retried.result.attempts, 3);
  assert.equal(new Set(urls).size, 1, "every attempt carries the same ids → a retry can never create a second attachment");

  let permanent = 0;
  const refused = await run([...base, "--file", "out.png"], ENV, {
    fetchImpl: async () => (permanent++, Response.json({ error: { code: "conflict", message: "Images can only be added to an unpublished draft.", stage: "draftCheck", pipeline: { draftCheck: "failed", imageSource: "skipped", storageUpload: "skipped", imageAttachment: "skipped", published: false } } }, { status: 409 })),
    read: async () => PNG,
    sleep: noSleep,
  });
  assert.equal(refused.code, 1);
  assert.equal(permanent, 1, "a 409 is not retried");
  assert.equal(refused.result.error.stage, "draftCheck");
  assert.equal(refused.result.error.pipeline.published, false);

  let down = 0;
  const dead = await run([...base, "--file", "out.png"], ENV, { fetchImpl: async () => (down++, Response.json({}, { status: 503 })), read: async () => PNG, sleep: noSleep });
  assert.equal(dead.code, 1);
  assert.equal(down, 3);
});
