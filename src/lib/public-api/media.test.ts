import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MEDIA_LIMITS,
  PublicApiError,
  AttachImageError,
  GENERATION_ID_PATTERN,
  assertFetchableImageUrl,
  attachImageToDraft,
  createMediaUploadClient,
  createMediaUploadHandler,
  createMeBackend,
  downloadImage,
  isPublicIp,
  sniffImage,
  type AttachDeps,
  type AttachImageResult,
  type MediaStorage,
  type MeDb,
  type MeTx,
} from "./index.ts";

const KEY = "pmt_" + "A".repeat(43);
const USER = "11111111-1111-4111-8111-111111111111";
const PROMPT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FILE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// --- Gerçek baytlar -------------------------------------------------------------------------------------------------------------------------------------------
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}
function jpeg(width: number, height: number): Uint8Array {
  // SOI + APP0 (16 bayt) + SOF0
  const b = new Uint8Array(2 + 18 + 19);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0, 0, 1, 0, 1, 0, 0]);
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1], 20);
  return b;
}
function webpLossy(width: number, height: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP"), ...Buffer.from("VP8 "), 0, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a]);
  // 12:'VP8 ' ... 23..25 imza → ofset 23'ten başlat
  b.fill(0);
  b.set(Buffer.from("RIFF"), 0);
  b.set(Buffer.from("WEBP"), 8);
  b.set(Buffer.from("VP8 "), 12);
  b.set([0x9d, 0x01, 0x2a], 23);
  b[26] = width & 255; b[27] = width >> 8; b[28] = height & 255; b[29] = height >> 8;
  return b;
}
function webpLossless(width: number, height: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set(Buffer.from("RIFF"), 0);
  b.set(Buffer.from("WEBP"), 8);
  b.set(Buffer.from("VP8L"), 12);
  b[20] = 0x2f;
  const w = width - 1, h = height - 1;
  b[21] = w & 255; b[22] = ((w >> 8) & 0x3f) | ((h & 3) << 6); b[23] = (h >> 2) & 255; b[24] = (h >> 10) & 0x0f;
  return b;
}
function webpExtended(width: number, height: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set(Buffer.from("RIFF"), 0);
  b.set(Buffer.from("WEBP"), 8);
  b.set(Buffer.from("VP8X"), 12);
  const w = width - 1, h = height - 1;
  b.set([w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255], 24);
  return b;
}

test("sniffImage reads the type and size from the BYTES (PNG, JPEG, WebP lossy/lossless/extended)", () => {
  assert.deepEqual(sniffImage(png(1024, 768)), { type: "image/png", ext: "png", width: 1024, height: 768 });
  assert.deepEqual(sniffImage(jpeg(1600, 900)), { type: "image/jpeg", ext: "jpg", width: 1600, height: 900 });
  assert.deepEqual(sniffImage(webpLossy(640, 480)), { type: "image/webp", ext: "webp", width: 640, height: 480 });
  assert.deepEqual(sniffImage(webpLossless(1234, 567)), { type: "image/webp", ext: "webp", width: 1234, height: 567 });
  assert.deepEqual(sniffImage(webpExtended(3000, 2000)), { type: "image/webp", ext: "webp", width: 3000, height: 2000 });
});

test("sniffImage refuses everything that is not a plain, sane PNG/JPEG/WebP", () => {
  assert.equal(sniffImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")), null, "SVG (script carrier)");
  assert.equal(sniffImage(new TextEncoder().encode("GIF89a\x01\x00\x01\x00")), null, "GIF is not accepted");
  assert.equal(sniffImage(new TextEncoder().encode("<html><script>alert(1)</script></html>")), null);
  assert.equal(sniffImage(new Uint8Array(0)), null);
  assert.equal(sniffImage(png(0, 10)), null, "zero width");
  assert.equal(sniffImage(png(MEDIA_LIMITS.maxDimension + 1, 10)), null, "absurd dimensions");
  assert.equal(sniffImage(jpeg(1, 1).subarray(0, 10)), null, "truncated JPEG");
});

test("isPublicIp rejects private, loopback, link-local (cloud metadata), CGNAT and IPv6 equivalents", () => {
  for (const ip of ["10.0.0.1", "127.0.0.1", "172.16.0.5", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1", "ff02::1", "2001:db8::1", "999.1.1.1"]) {
    assert.equal(isPublicIp(ip), false, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "104.18.2.3", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) assert.equal(isPublicIp(ip), true, ip);
});

test("assertFetchableImageUrl: https only, 443, no credentials, no IP literals or local names", () => {
  assert.equal(assertFetchableImageUrl("https://cdn.example.com/a.png?x=1").hostname, "cdn.example.com");
  for (const bad of [
    "http://cdn.example.com/a.png",
    "ftp://cdn.example.com/a.png",
    "data:image/png;base64,AAAA",
    "file:///etc/passwd",
    "https://user:pw@cdn.example.com/a.png",
    "https://cdn.example.com:8443/a.png",
    "https://127.0.0.1/a.png",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/a.png",
    "https://localhost/a.png",
    "https://printer.local/a.png",
    "https://db.internal/a.png",
    "https://intranet/a.png",
    "not a url",
    "",
    "https://example.com/" + "a".repeat(MEDIA_LIMITS.maxUrlChars),
  ]) {
    assert.throws(() => assertFetchableImageUrl(bad), (error: unknown) => error instanceof PublicApiError && error.code === "bad_request", bad.slice(0, 60));
  }
});

// --- downloadImage ----------------------------------------------------------------------------------------------------------------------------------------------
const body = (bytes: Uint8Array, headers: Record<string, string> = {}, status = 200) => new Response(bytes as BlobPart, { status, headers });

test("downloadImage checks the resolved addresses before connecting and never fetches a private host", async () => {
  let fetched = 0;
  const deps = { fetch: async () => (fetched++, body(png(2, 2))), resolve: async () => ["10.1.2.3"] };
  await assert.rejects(() => downloadImage("https://cdn.example.com/a.png", deps), /public host/);
  assert.equal(fetched, 0);
  const mixed = { fetch: deps.fetch, resolve: async () => ["8.8.8.8", "127.0.0.1"] };
  await assert.rejects(() => downloadImage("https://cdn.example.com/a.png", mixed), /public host/, "one private address among public ones is enough to refuse");
  const unresolved = { fetch: deps.fetch, resolve: async () => [] };
  await assert.rejects(() => downloadImage("https://cdn.example.com/a.png", unresolved), /resolved/);
  assert.equal(fetched, 0);
});

test("downloadImage follows redirects ONE hop at a time, re-checking each, with a hop limit", async () => {
  const seen: string[] = [];
  const resolve = async (host: string) => (host === "evil.example.com" ? ["169.254.169.254"] : ["8.8.8.8"]);
  const toEvil = {
    resolve,
    fetch: async (url: string) => (seen.push(url), url.includes("start") ? new Response(null, { status: 302, headers: { location: "https://evil.example.com/meta" } }) : body(png(2, 2))),
  };
  await assert.rejects(() => downloadImage("https://cdn.example.com/start", toEvil), /public host/);
  assert.deepEqual(seen, ["https://cdn.example.com/start"], "the redirect target was never contacted");

  const downgrade = { resolve, fetch: async () => new Response(null, { status: 301, headers: { location: "http://cdn.example.com/plain" } }) };
  await assert.rejects(() => downloadImage("https://cdn.example.com/a", downgrade), /https/);

  const loop = { resolve, fetch: async () => new Response(null, { status: 302, headers: { location: "https://cdn.example.com/again" } }) };
  await assert.rejects(() => downloadImage("https://cdn.example.com/a", loop), /too many times/);

  const relative = { resolve, fetch: async (url: string) => (url.endsWith("/final.png") ? body(png(2, 2)) : new Response(null, { status: 302, headers: { location: "/final.png" } })) };
  assert.equal((await downloadImage("https://cdn.example.com/a", relative)).length, 33);
});

test("downloadImage caps the size by Content-Length and while streaming; upstream errors become 502-class errors", async () => {
  const resolve = async () => ["8.8.8.8"];
  const declared = { resolve, fetch: async () => body(png(2, 2), { "content-length": String(MEDIA_LIMITS.maxBytes + 1) }) };
  await assert.rejects(() => downloadImage("https://cdn.example.com/a", declared), (e: unknown) => e instanceof PublicApiError && e.code === "unprocessable");
  const big = new Uint8Array(MEDIA_LIMITS.maxBytes + 10);
  const streamed = { resolve, fetch: async () => new Response(new ReadableStream({ start(c) { c.enqueue(big.subarray(0, 5_000_000)); c.enqueue(big.subarray(5_000_000)); c.close(); } })) };
  await assert.rejects(() => downloadImage("https://cdn.example.com/a", streamed), (e: unknown) => e instanceof PublicApiError && e.code === "unprocessable");
  const notFound = { resolve, fetch: async () => body(new Uint8Array(0), {}, 404) };
  await assert.rejects(() => downloadImage("https://cdn.example.com/a", notFound), (e: unknown) => e instanceof PublicApiError && e.code === "upstream");
  const boom = { resolve, fetch: async () => { throw new Error("secret internal detail 10.0.0.9"); } };
  await assert.rejects(() => downloadImage("https://cdn.example.com/a", boom), (e: unknown) => e instanceof PublicApiError && !String(e.message).includes("10.0.0.9"));
});

// --- attachImageToDraft -----------------------------------------------------------------------------------------------------------------------------------------
interface Call { sql: string; params: unknown[] }

function setup(options: { begin?: unknown; commit?: unknown; image?: Uint8Array; scopes?: string[]; putFails?: boolean } = {}) {
  const calls: Call[] = [];
  const puts: { path: string; type: string; size: number }[] = [];
  const removed: string[] = [];
  const db: MeDb = {
    async transaction<T>(fn: (tx: MeTx) => Promise<T>): Promise<T> {
      const tx: MeTx = async (sql, params = []) => {
        calls.push({ sql, params });
        if (sql.includes("_api_token_authenticate")) return [{ token_id: "tok-1", user_id: USER, scopes: options.scopes ?? ["read", "write"] }];
        if (sql.startsWith("set local role") || sql.includes("set_config") || sql.includes("api_me_throttle")) return [];
        if (sql.includes("api_me_media_begin")) return [{ r: options.begin ?? { ok: true, userId: USER, count: 0 } }];
        if (sql.includes("api_me_media_commit")) return [{ r: options.commit ?? { ok: true, mediaId: "m-1", position: 0, count: 1 } }];
        return [];
      };
      return fn(tx);
    },
  };
  const storage: MediaStorage = {
    async put(path, bytes, type) {
      if (options.putFails) throw new Error("storage 500");
      puts.push({ path, type, size: bytes.length });
    },
    async remove(path) { removed.push(path); },
    publicUrl: (path) => `https://x.supabase.co/storage/v1/object/public/prompt-media/${path}`,
  };
  const downloads: string[] = [];
  const deps: AttachDeps = {
    backend: createMeBackend({ db, siteUrl: "https://s" }),
    storage,
    resolve: async () => ["8.8.8.8"],
    fetch: async (url) => (downloads.push(url), body(options.image ?? png(800, 600))),
    newId: () => FILE_ID,
  };
  return { deps, calls, puts, removed, downloads };
}

test("attach: authenticates as a WRITE key, checks the draft BEFORE downloading, stores under the user's folder with the sniffed extension, then commits", async () => {
  const { deps, calls, puts, downloads } = setup({ image: jpeg(1600, 900) });
  const result = await attachImageToDraft(KEY, { promptId: PROMPT, imageUrl: "https://cdn.example.com/a.png", alt: " A fox " }, deps);
  assert.deepEqual(puts, [{ path: `${USER}/${FILE_ID}.jpg`, type: "image/jpeg", size: jpeg(1600, 900).length }], "extension comes from the bytes, not the URL");
  assert.deepEqual(downloads, ["https://cdn.example.com/a.png"]);
  const begin = calls.findIndex((c) => c.sql.includes("api_me_media_begin"));
  const commit = calls.findIndex((c) => c.sql.includes("api_me_media_commit"));
  assert.ok(begin >= 0 && commit > begin);
  const commitCall = calls[commit];
  assert.deepEqual(commitCall.params, [PROMPT, `${USER}/${FILE_ID}.jpg`, `https://x.supabase.co/storage/v1/object/public/prompt-media/${USER}/${FILE_ID}.jpg`, 1600, 900, "A fox", null]);
  assert.deepEqual(result, {
    promptId: PROMPT, mediaId: "m-1", position: 0, imageCount: 1, width: 1600, height: 900, bytes: jpeg(1600, 900).length, contentType: "image/jpeg",
    generationId: null, duplicate: false,
    pipeline: { draftCheck: "success", imageSource: "success", storageUpload: "success", imageAttachment: "success", published: false },
  });
});

test("attach: a read-only key cannot attach; nothing is downloaded or stored", async () => {
  const { deps, puts, downloads } = setup({ scopes: ["read"] });
  await assert.rejects(() => attachImageToDraft(KEY, { promptId: PROMPT, imageUrl: "https://cdn.example.com/a.png" }, deps), (e: unknown) => e instanceof PublicApiError && e.code === "insufficient_scope");
  assert.equal(downloads.length + puts.length, 0);
});

test("attach: database refusals map to clear errors and nothing is downloaded", async () => {
  const cases: [string, string][] = [["not_found", "not_found"], ["not_draft", "conflict"], ["not_image_prompt", "unprocessable"], ["too_many_images", "unprocessable"]];
  for (const [dbCode, apiCode] of cases) {
    const { deps, downloads, puts } = setup({ begin: { ok: false, code: dbCode } });
    await assert.rejects(() => attachImageToDraft(KEY, { promptId: PROMPT, imageUrl: "https://cdn.example.com/a.png" }, deps), (e: unknown) => e instanceof PublicApiError && e.code === apiCode, dbCode);
    assert.equal(downloads.length + puts.length, 0, dbCode);
  }
});

test("attach: a bad prompt id or URL is refused before any database or network work", async () => {
  const { deps, calls, downloads } = setup();
  await assert.rejects(() => attachImageToDraft(KEY, { promptId: "nope", imageUrl: "https://cdn.example.com/a.png" }, deps), /UUID/);
  await assert.rejects(() => attachImageToDraft(KEY, { promptId: PROMPT, imageUrl: "http://169.254.169.254/x" }, deps), (e: unknown) => e instanceof PublicApiError && e.code === "bad_request");
  assert.equal(calls.length + downloads.length, 0);
});

test("attach: a non-image download (HTML, SVG, GIF) is refused and never stored", async () => {
  for (const payload of ["<html></html>", "<svg/>", "GIF89a"]) {
    const { deps, puts } = setup({ image: new TextEncoder().encode(payload) });
    await assert.rejects(() => attachImageToDraft(KEY, { promptId: PROMPT, imageUrl: "https://cdn.example.com/a.png" }, deps), (e: unknown) => e instanceof PublicApiError && e.code === "unprocessable");
    assert.equal(puts.length, 0);
  }
});

test("attach: when the row cannot be written the uploaded file is removed again; a storage failure is a generic upstream error", async () => {
  const failed = setup({ commit: { ok: false, code: "file_missing" } });
  await assert.rejects(() => attachImageToDraft(KEY, { promptId: PROMPT, imageUrl: "https://cdn.example.com/a.png" }, failed.deps));
  assert.deepEqual(failed.removed, [`${USER}/${FILE_ID}.png`]);

  const broken = setup({ putFails: true });
  await assert.rejects(() => attachImageToDraft(KEY, { promptId: PROMPT, imageUrl: "https://cdn.example.com/a.png" }, broken.deps), (e: unknown) => e instanceof PublicApiError && e.code === "upstream" && !/storage 500/.test(e.message));
  assert.equal(broken.calls.filter((c) => c.sql.includes("api_me_media_commit")).length, 0);
});

// --- HTTP işleyici + istemci ------------------------------------------------------------------------------------------------------------------------------------
const post = (payload: unknown, key: string | null = KEY, method = "POST") =>
  new Request("https://x.supabase.co/functions/v1/media-upload", { method, headers: key ? { authorization: `Bearer ${key}`, "content-type": "application/json" } : {}, body: method === "POST" ? (typeof payload === "string" ? payload : JSON.stringify(payload)) : undefined });

test("media-upload handler: POST + bearer + JSON only; errors never leak internals", async () => {
  const { deps } = setup();
  const handler = createMediaUploadHandler({ ...deps, onError: () => undefined });
  assert.equal((await handler(post({}, KEY, "GET"))).status, 405);
  assert.equal((await handler(post({}, null))).status, 401);
  assert.equal((await handler(post({}, "not-a-key"))).status, 401);
  assert.equal((await handler(post("{nope"))).status, 400);
  assert.equal((await handler(post({ prompt_id: PROMPT }))).status, 400);
  assert.equal((await handler(post({ prompt_id: PROMPT, image_url: "https://cdn.example.com/a.png", alt: 5 }))).status, 400);
  assert.equal((await handler(post("x".repeat(9000)))).status, 400);
  const ok = await handler(post({ prompt_id: PROMPT, image_url: "https://cdn.example.com/a.png" }));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.equal(((await ok.json()) as { imageCount: number }).imageCount, 1);
  const bad = await handler(post({ prompt_id: PROMPT, image_url: "https://127.0.0.1/a.png" }));
  assert.equal(bad.status, 400);
});

test("media-upload handler: an unexpected failure is reported through onError and answered with a generic 502", async () => {
  const { deps } = setup();
  const errors: unknown[] = [];
  const handler = createMediaUploadHandler({ ...deps, fetch: async () => { throw new TypeError("x"); }, resolve: async () => { throw new Error("dns"); }, onError: (e) => errors.push(e) });
  const response = await handler(post({ prompt_id: PROMPT, image_url: "https://cdn.example.com/a.png" }));
  assert.equal(response.status, 400, "an unresolvable host is a client error");
  const crashing = createMediaUploadHandler({ ...deps, newId: () => { throw new Error("db password leaked"); }, onError: (e) => errors.push(e) });
  const r2 = await crashing(post({ prompt_id: PROMPT, image_url: "https://cdn.example.com/a.png" }));
  assert.equal(r2.status, 502);
  assert.ok(!(await r2.text()).includes("leaked"));
  assert.equal(errors.length, 1);
});

test("createMediaUploadClient forwards the key and turns error bodies back into PublicApiError", async () => {
  let seen: { url: string; auth: string | null; body: unknown } | null = null;
  const okClient = createMediaUploadClient({
    url: "https://x.supabase.co/functions/v1/media-upload",
    fetch: async (url, init) => {
      seen = { url: String(url), auth: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) };
      return Response.json({ promptId: PROMPT, mediaId: "m", position: 0, imageCount: 1, width: 1, height: 1, bytes: 1, contentType: "image/png" });
    },
  });
  assert.equal((await okClient(KEY, { promptId: PROMPT, imageUrl: "https://cdn.example.com/a.png" })).imageCount, 1);
  assert.deepEqual(seen, { url: "https://x.supabase.co/functions/v1/media-upload", auth: `Bearer ${KEY}`, body: { prompt_id: PROMPT, image_url: "https://cdn.example.com/a.png", generation_id: null, alt: null } });

  const failing = createMediaUploadClient({ url: "https://x/y", fetch: async () => Response.json({ error: { code: "conflict", message: "Images can only be added to an unpublished draft." } }, { status: 409 }) });
  await assert.rejects(() => failing(KEY, { promptId: PROMPT, imageUrl: "https://a.b/c" }), (e: unknown) => e instanceof PublicApiError && e.code === "conflict");
  const down = createMediaUploadClient({ url: "https://x/y", fetch: async () => { throw new Error("boom"); } });
  await assert.rejects(() => down(KEY, { promptId: PROMPT, imageUrl: "https://a.b/c" }), (e: unknown) => e instanceof PublicApiError && e.code === "upstream");
  const html = createMediaUploadClient({ url: "https://x/y", fetch: async () => new Response("<html>gateway</html>", { status: 502 }) });
  await assert.rejects(() => html(KEY, { promptId: PROMPT, imageUrl: "https://a.b/c" }), (e: unknown) => e instanceof PublicApiError && e.code === "upstream");
});

// --- docs/history/438-*: doğrudan bayt kaynağı, idempotens, aşama raporu, ikili yükleme --------------------------------------------------------------------------------
const stageOf = (e: unknown) => (e instanceof AttachImageError ? e.stage : undefined);

test("attach (bytes): the caller's own bytes are validated and stored with NO download and NO network", async () => {
  const { deps, puts, downloads, calls } = setup();
  const bytes = webpLossless(1024, 1024);
  const result = await attachImageToDraft(KEY, { promptId: PROMPT, imageBytes: bytes, generationId: "promptly_visual_trend_2026-11-19T10:00" }, deps);
  assert.equal(downloads.length, 0, "nothing is fetched when the bytes are given");
  assert.deepEqual(puts, [{ path: `${USER}/${FILE_ID}.webp`, type: "image/webp", size: bytes.length }]);
  assert.equal(result.generationId, "promptly_visual_trend_2026-11-19T10:00");
  assert.equal(result.duplicate, false);
  const commit = calls.find((c) => c.sql.includes("api_me_media_commit"));
  assert.equal(commit?.params[6], "promptly_visual_trend_2026-11-19T10:00");
  const begin = calls.find((c) => c.sql.includes("api_me_media_begin"));
  assert.deepEqual(begin?.params, [PROMPT, "promptly_visual_trend_2026-11-19T10:00"]);
});

test("attach (bytes): non-images, empty and oversized bytes are refused and never stored; exactly one source is required", async () => {
  const { deps, puts } = setup();
  await assert.rejects(() => attachImageToDraft(KEY, { promptId: PROMPT, imageBytes: new TextEncoder().encode("<svg/>") }, deps), (e: unknown) => e instanceof PublicApiError && e.code === "unprocessable" && stageOf(e) === "imageSource");
  await assert.rejects(() => attachImageToDraft(KEY, { promptId: PROMPT, imageBytes: new Uint8Array(0) }, deps), (e: unknown) => e instanceof PublicApiError && e.code === "unprocessable");
  await assert.rejects(() => attachImageToDraft(KEY, { promptId: PROMPT, imageBytes: new Uint8Array(MEDIA_LIMITS.maxBytes + 1) }, deps), (e: unknown) => e instanceof PublicApiError && e.code === "unprocessable");
  await assert.rejects(() => attachImageToDraft(KEY, { promptId: PROMPT }, deps), (e: unknown) => e instanceof PublicApiError && e.code === "bad_request");
  await assert.rejects(() => attachImageToDraft(KEY, { promptId: PROMPT, imageUrl: "https://cdn.example.com/a.png", imageBytes: png(10, 10) }, deps), (e: unknown) => e instanceof PublicApiError && e.code === "bad_request");
  assert.equal(puts.length, 0);
});

test("attach (idempotency): a generation_id that is already attached returns the FIRST attachment — nothing downloaded, stored or written", async () => {
  const existing = { mediaId: "m-first", position: 2, width: 1536, height: 1024 };
  const { deps, puts, downloads, calls } = setup({ begin: { ok: true, userId: USER, count: 4, existing } });
  const result = await attachImageToDraft(KEY, { promptId: PROMPT, imageUrl: "https://cdn.example.com/a.png", generationId: "job-1" }, deps);
  assert.equal(downloads.length + puts.length, 0);
  assert.equal(calls.filter((c) => c.sql.includes("api_me_media_commit")).length, 0, "no second row");
  assert.deepEqual(result, {
    promptId: PROMPT, mediaId: "m-first", position: 2, imageCount: 4, width: 1536, height: 1024, bytes: null, contentType: null, generationId: "job-1", duplicate: true,
    pipeline: { draftCheck: "success", imageSource: "skipped", storageUpload: "skipped", imageAttachment: "success", published: false },
  });
});

test("attach (idempotency): losing a race on the same generation_id returns the winner's attachment and deletes the file we just uploaded", async () => {
  const { deps, removed } = setup({ commit: { ok: true, duplicate: true, mediaId: "m-winner", position: 0, count: 1, width: 640, height: 480 } });
  const result = await attachImageToDraft(KEY, { promptId: PROMPT, imageUrl: "https://cdn.example.com/a.png", generationId: "job-2" }, deps);
  assert.equal(result.mediaId, "m-winner");
  assert.equal(result.duplicate, true);
  assert.deepEqual([result.width, result.height], [640, 480]);
  assert.equal(result.pipeline.storageUpload, "skipped");
  assert.deepEqual(removed, [`${USER}/${FILE_ID}.png`]);
});

test("attach: a malformed generation_id is refused before any database or network work", async () => {
  const { deps, calls, downloads } = setup();
  for (const bad of ["has space", "-leading", "x".repeat(121), "emoji🙂", "a/b", "semi;colon"]) {
    await assert.rejects(() => attachImageToDraft(KEY, { promptId: PROMPT, imageUrl: "https://cdn.example.com/a.png", generationId: bad }, deps), (e: unknown) => e instanceof PublicApiError && e.code === "bad_request", bad);
  }
  assert.equal(calls.length + downloads.length, 0);
  for (const good of ["a", "visual_trend_2026-11-19T10:00", "promptly:trend.1-2_3"]) assert.ok(GENERATION_ID_PATTERN.test(good), good);
});

test("attach: every failure names the stage that broke, earlier stages succeeded and later ones are skipped; published is ALWAYS false", async () => {
  const draft = setup({ begin: { ok: false, code: "not_draft" } });
  await assert.rejects(() => attachImageToDraft(KEY, { promptId: PROMPT, imageUrl: "https://cdn.example.com/a.png" }, draft.deps), (e: unknown) => {
    assert.ok(e instanceof AttachImageError);
    assert.equal(e.stage, "draftCheck");
    assert.deepEqual(e.pipeline, { draftCheck: "failed", imageSource: "skipped", storageUpload: "skipped", imageAttachment: "skipped", published: false });
    return true;
  });

  const source = setup({ image: new TextEncoder().encode("<html/>") });
  await assert.rejects(() => attachImageToDraft(KEY, { promptId: PROMPT, imageUrl: "https://cdn.example.com/a.png" }, source.deps), (e: unknown) => {
    assert.ok(e instanceof AttachImageError);
    assert.deepEqual(e.pipeline, { draftCheck: "success", imageSource: "failed", storageUpload: "skipped", imageAttachment: "skipped", published: false });
    return true;
  });

  const store = setup({ putFails: true });
  await assert.rejects(() => attachImageToDraft(KEY, { promptId: PROMPT, imageUrl: "https://cdn.example.com/a.png" }, store.deps), (e: unknown) => {
    assert.ok(e instanceof AttachImageError);
    assert.deepEqual(e.pipeline, { draftCheck: "success", imageSource: "success", storageUpload: "failed", imageAttachment: "skipped", published: false });
    return true;
  });

  const row = setup({ commit: { ok: false, code: "too_many_images" } });
  await assert.rejects(() => attachImageToDraft(KEY, { promptId: PROMPT, imageUrl: "https://cdn.example.com/a.png" }, row.deps), (e: unknown) => {
    assert.ok(e instanceof AttachImageError);
    assert.equal(e.stage, "imageAttachment");
    assert.deepEqual(e.pipeline, { draftCheck: "success", imageSource: "success", storageUpload: "success", imageAttachment: "failed", published: false });
    return true;
  });
});

const postBinary = (query: string, bytes: Uint8Array, type = "image/png", headers: Record<string, string> = {}) =>
  new Request(`https://x.supabase.co/functions/v1/media-upload${query}`, { method: "POST", headers: { authorization: `Bearer ${KEY}`, "content-type": type, ...headers }, body: bytes as BodyInit });

test("media-upload handler (binary): the image bytes go straight in — no download; params in the query; stage report in the answer", async () => {
  const { deps, puts, downloads } = setup();
  const handler = createMediaUploadHandler({ ...deps, onError: () => undefined });
  const ok = await handler(postBinary(`?prompt_id=${PROMPT}&generation_id=job-9&alt=A%20fox`, png(2048, 2048)));
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as AttachImageResult;
  assert.equal(body.generationId, "job-9");
  assert.equal(body.pipeline.published, false);
  assert.equal(downloads.length, 0);
  assert.equal(puts.length, 1);
  // application/octet-stream is accepted too (some HTTP tools cannot set image/*); the type comes from the BYTES either way.
  assert.equal((await handler(postBinary(`?prompt_id=${PROMPT}`, jpeg(100, 100), "application/octet-stream"))).status, 200);
  assert.equal(puts[1].type, "image/jpeg");
});

test("media-upload handler (binary): missing prompt_id, junk bytes, oversized bodies (declared or streamed) and bad stages answer clearly", async () => {
  const { deps, puts } = setup({ begin: { ok: false, code: "not_draft" } });
  const handler = createMediaUploadHandler({ ...deps, onError: () => undefined });
  assert.equal((await handler(postBinary("", png(1, 1)))).status, 400, "no prompt_id");

  const declared = await handler(postBinary(`?prompt_id=${PROMPT}`, png(1, 1), "image/png", { "content-length": String(MEDIA_LIMITS.maxBytes + 1) }));
  assert.equal(declared.status, 422);

  const ok = setup();
  const okHandler = createMediaUploadHandler({ ...ok.deps, onError: () => undefined });
  const junk = await okHandler(postBinary(`?prompt_id=${PROMPT}`, new TextEncoder().encode("GIF89a")));
  assert.equal(junk.status, 422);
  const junkBody = (await junk.json()) as { error: { stage: string; pipeline: { imageSource: string; storageUpload: string } } };
  assert.equal(junkBody.error.stage, "imageSource");
  assert.deepEqual([junkBody.error.pipeline.imageSource, junkBody.error.pipeline.storageUpload], ["failed", "skipped"]);
  assert.equal(ok.puts.length + puts.length, 0);

  const refused = await handler(postBinary(`?prompt_id=${PROMPT}`, png(10, 10)));
  assert.equal(refused.status, 409);
  assert.equal(((await refused.json()) as { error: { stage: string } }).error.stage, "draftCheck");
});

test("createMediaUploadClient: sends bytes as a binary POST with the params in the query, and rebuilds the stage report from the error body", async () => {
  let seen: { url: string; type: string | null; size: number } | null = null;
  const client = createMediaUploadClient({
    url: "https://x.supabase.co/functions/v1/media-upload",
    fetch: async (url, init) => {
      seen = { url: String(url), type: new Headers(init?.headers).get("content-type"), size: (init?.body as Uint8Array).length };
      return Response.json({ promptId: PROMPT, mediaId: "m", position: 0, imageCount: 1, width: 1, height: 1, bytes: 33, contentType: "image/png", generationId: "g1", duplicate: false, pipeline: { draftCheck: "success", imageSource: "success", storageUpload: "success", imageAttachment: "success", published: false } });
    },
  });
  await client(KEY, { promptId: PROMPT, imageBytes: png(4, 4), generationId: "g1", alt: "x" });
  assert.deepEqual(seen, { url: `https://x.supabase.co/functions/v1/media-upload?prompt_id=${PROMPT}&generation_id=g1&alt=x`, type: "application/octet-stream", size: png(4, 4).length });

  const failing = createMediaUploadClient({
    url: "https://x/y",
    fetch: async () => Response.json({ error: { code: "unprocessable", message: "nope", stage: "imageSource", pipeline: { draftCheck: "success", imageSource: "failed", storageUpload: "skipped", imageAttachment: "skipped", published: false } } }, { status: 422 }),
  });
  await assert.rejects(() => failing(KEY, { promptId: PROMPT, imageUrl: "https://a.b/c" }), (e: unknown) => e instanceof AttachImageError && e.stage === "imageSource" && e.pipeline.imageSource === "failed" && e.code === "unprocessable");
});
