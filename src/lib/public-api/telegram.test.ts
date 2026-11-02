import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMeBackend,
  createRestClient,
  createTelegramBot,
  createTelegramHttpHandler,
  isoWeekLabel,
  langOf,
  normalizeLinkCode,
  notificationText,
  notificationUrl,
  parseCommand,
  runTelegramNotifications,
  runTelegramSetup,
  sha256Hex,
  type MeDb,
  type MeTx,
  type RateLimitResult,
  type TelegramApi,
  type TelegramUpdate,
} from "./index.ts";

const SITE = "https://aliq0330.github.io/promptly";
const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const USER = "99999999-9999-4999-8999-999999999999";
const TG = 4242;

// --- sahte Telegram ---------------------------------------------------------------------------------------------------------------------------------
interface Call { method: string; params: Record<string, unknown> }
function fakeApi(responses: Record<string, (params: Record<string, unknown>) => { ok: true; result: unknown } | { ok: false; errorCode: number; description: string }> = {}) {
  const calls: Call[] = [];
  const api: TelegramApi = {
    async call<T>(method: string, params: Record<string, unknown>) {
      calls.push({ method, params });
      return (responses[method]?.(params) ?? { ok: true, result: true }) as { ok: true; result: T };
    },
  };
  const sent = () => calls.filter((call) => call.method === "sendMessage").map((call) => call.params);
  return { api, calls, sent, last: () => sent()[sent().length - 1] };
}

// --- sahte Supabase (anon) ---------------------------------------------------------------------------------------------------------------------------
function promptRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, title: "Işıklı <Portre>", description: "Açıklama", prompt_text: "A portrait of {subject} in {style} light & mood",
    content_type: "image", category: "art", subcategory: null, tool: null, tools: ["midjourney:v7"], like_count: 3, save_count: 2, comment_count: 1, copy_count: 9,
    created_at: "2026-10-01T10:00:00.000Z", profiles: { username: "ayse", display_name: "Ayşe" }, prompt_tags: [], ...overrides,
  };
}
const presetRow = { id: ID_A, title: "Sinematik", description: "d", category: null, subcategory: null, tools: [], like_count: 1, comment_count: 0, created_at: "2026-10-01T10:00:00Z", content_type: "image", selection: { lens: "135mm" }, save_count: 0, profiles: { username: "ayse", display_name: null }, preset_tags: [] };
const workflowRow = { id: ID_A, title: "Zincir", description: "", category: null, subcategory: null, tools: [], like_count: 1, comment_count: 0, created_at: "2026-10-01T10:00:00Z", content_types: ["text"], save_count: 0, profiles: { username: "ayse", display_name: null }, workflow_tags: [], workflow_steps: [{ id: "s1", position: 1, title: "Yaz", description: "", instructions: "Yaz <şunu>", prompt_id: null, inputs: [], outputs: [], created_at: "2026-10-01T10:00:00Z" }] };

function fakeSupabase(options: { prompts?: unknown[]; variables?: unknown[]; fail?: boolean } = {}) {
  const calls: { path: string; body: Record<string, unknown> | null }[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/rest/v1/", "");
    calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (options.fail) return new Response("{}", { status: 503 });
    const ids = (url.searchParams.get("id") ?? "").replace(/^in\.\(|\)$/g, "").split(",").filter(Boolean);
    const pick = <T extends { id: string }>(rows: T[]) => (ids.length ? rows.filter((row) => ids.includes(row.id)) : rows);
    if (path === "rpc/search_content") {
      const kind = (init?.body ? JSON.parse(String(init.body)).p_kind : "prompt") as string;
      const rows = kind === "prompt" ? (options.prompts ?? [promptRow(ID_A)]) : [{ id: ID_A }];
      return Response.json((rows as { id: string }[]).map((row) => ({ id: row.id, created_at: "2026-10-01T10:00:00Z", sort_rank: 0 })));
    }
    if (path === "prompts") return Response.json(pick((options.prompts ?? [promptRow(ID_A)]) as { id: string }[]));
    if (path === "prompt_variables") return Response.json(options.variables ?? [{ prompt_id: ID_A, name: "subject", default_value: "a fox", description: null, type: "text", options: [], config: {} }]);
    if (path === "presets") return Response.json(pick([presetRow]));
    if (path === "workflows") return Response.json(pick([workflowRow]));
    if (path === "prompt_requests") return Response.json([]);
    return new Response("nope", { status: 404 });
  };
  return { calls, client: createRestClient({ url: "https://x.supabase.co", anonKey: "eyJ.k", fetch: impl as typeof fetch, siteUrl: SITE }) };
}

// --- sahte kişisel veritabanı (bağlı Telegram kullanıcısı adına) ----------------------------------------------------------------------------------------------
interface Tx { sql: string; params: unknown[] }
function fakeMe(options: { linked?: boolean; scopes?: string[]; query?: (sql: string, params: unknown[]) => Record<string, unknown>[] | Error } = {}) {
  const txs: Tx[] = [];
  const db: MeDb = {
    async transaction<T>(fn: (tx: MeTx) => Promise<T>): Promise<T> {
      const tx: MeTx = async (sql, params = []) => {
        txs.push({ sql, params });
        if (sql.includes("_telegram_link_authenticate")) return options.linked === false ? [] : [{ link_id: "link-1", user_id: USER, scopes: options.scopes ?? ["read"] }];
        if (sql.startsWith("set local role") || sql.includes("set_config") || sql.includes("api_me_throttle")) return [];
        const out = options.query?.(sql, params) ?? [];
        if (out instanceof Error) throw out;
        return out;
      };
      return fn(tx);
    },
  };
  return { txs, backend: createMeBackend({ db, siteUrl: SITE }) };
}

// --- sahte sahip-rol SQL (bağlama + tercih + bildirim) -------------------------------------------------------------------------------------------------------
function fakeOwner(handlers: Record<string, (params: unknown[]) => Record<string, unknown>[] | Error>) {
  const calls: Tx[] = [];
  const owner = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    for (const [needle, handler] of Object.entries(handlers)) {
      if (sql.includes(needle)) {
        const out = handler(params);
        if (out instanceof Error) throw out;
        return out;
      }
    }
    return [];
  };
  return { calls, owner };
}

const allow: RateLimitResult = { allowed: true, limit: 30, remaining: 29, resetAt: 0, retryAfterSeconds: 1 };
const block: RateLimitResult = { allowed: false, limit: 30, remaining: 0, resetAt: 0, retryAfterSeconds: 30 };

function message(text: string, extra: { chat?: "private" | "group"; lang?: string; id?: number } = {}): TelegramUpdate {
  return { update_id: 1, message: { message_id: 7, chat: { id: extra.id ?? TG, type: extra.chat ?? "private" }, from: { id: extra.id ?? TG, first_name: "Ali", username: "ali_tg", language_code: extra.lang ?? "tr" }, text } };
}
function callback(data: string, lang = "tr"): TelegramUpdate {
  return { update_id: 2, callback_query: { id: "cb1", from: { id: TG, first_name: "Ali", language_code: lang }, data, message: { message_id: 8, chat: { id: TG, type: "private" } } } };
}

function setup(opts: { me?: ReturnType<typeof fakeMe>; owner?: ReturnType<typeof fakeOwner>; sb?: ReturnType<typeof fakeSupabase>; rate?: RateLimitResult; linkRate?: RateLimitResult; apiResponses?: Parameters<typeof fakeApi>[0]; errors?: unknown[] } = {}) {
  const tg = fakeApi(opts.apiResponses);
  const sb = opts.sb ?? fakeSupabase();
  const errors = opts.errors ?? [];
  const bot = createTelegramBot({
    api: tg.api, client: sb.client, siteUrl: SITE, botUsername: "PromptlyBot", me: opts.me?.backend, owner: opts.owner?.owner,
    rateLimiter: opts.rate ? { check: async () => opts.rate as RateLimitResult } : undefined,
    linkRateLimiter: opts.linkRate ? { check: async () => opts.linkRate as RateLimitResult } : undefined,
    onError: (error) => errors.push(error),
  });
  return { bot, tg, sb, errors };
}

// ====================================================================================================================================
// Yardımcılar
// ====================================================================================================================================
test("helpers: language from Telegram, command parsing (bot suffix), link code normalisation, ISO week", () => {
  assert.equal(langOf("tr"), "tr");
  assert.equal(langOf("tr-TR"), "tr");
  assert.equal(langOf("en"), "en");
  assert.equal(langOf(undefined), "en");
  assert.deepEqual(parseCommand("/ara@PromptlyBot neon logo", "PromptlyBot"), { name: "ara", args: "neon logo" });
  assert.equal(parseCommand("/ara@BaskaBot neon", "PromptlyBot"), null, "a command aimed at another bot is ignored");
  assert.deepEqual(parseCommand("/taslak Başlık\nmetin\nsatır2"), { name: "taslak", args: "Başlık\nmetin\nsatır2" });
  assert.equal(parseCommand("merhaba"), null);
  assert.equal(normalizeLinkCode("abcd-efgh"), "ABCDEFGH");
  assert.equal(normalizeLinkCode("ABCD EFGH"), "ABCDEFGH");
  assert.equal(normalizeLinkCode("ABCD0FGH"), null, "0/O/1/I are not in the alphabet");
  assert.equal(normalizeLinkCode("ABC"), null);
  assert.equal(isoWeekLabel(new Date("2026-11-02T10:00:00Z")), "2026-45");
  assert.equal(isoWeekLabel(new Date("2025-12-29T00:00:00Z")), "2026-01");
  assert.equal(isoWeekLabel(new Date("2027-01-03T12:00:00Z")), "2026-53");
  assert.equal(notificationUrl(SITE, "/prompts/local?id=1"), `${SITE}/prompts/local?id=1`);
  assert.equal(notificationUrl(SITE, "//evil.example/x"), SITE);
  assert.equal(notificationUrl(SITE, "https://evil.example"), SITE);
  assert.equal(notificationText("en", 'Paylaşımına yorum yaptı: "merhaba"'), 'commented on your post: "merhaba"');
  assert.equal(notificationText("tr", "Paylaşımına yorum yaptı"), "Paylaşımına yorum yaptı");
  assert.equal(notificationText("en", "Bilinmeyen cümle"), "Bilinmeyen cümle");
});

// ====================================================================================================================================
// 1) Herkese açık bot
// ====================================================================================================================================
test("/start: welcome in the user's language, with the bot name", async () => {
  const tr = setup();
  await tr.bot.handleUpdate(message("/start"));
  assert.match(String(tr.tg.last().text), /hoş geldin/);
  assert.match(String(tr.tg.last().text), /@PromptlyBot/);
  const en = setup();
  await en.bot.handleUpdate(message("/start", { lang: "en" }));
  assert.match(String(en.tg.last().text), /Welcome/);
  assert.equal(en.tg.last().parse_mode, "HTML");
});

test("/ara: lists results with escaped titles and one callback button each; a plain private message is a search too; group chatter is ignored", async () => {
  const t = setup();
  await t.bot.handleUpdate(message("/ara portre"));
  const sent = t.tg.last();
  assert.match(String(sent.text), /Işıklı &lt;Portre&gt;/, "user content is HTML-escaped");
  assert.ok(!String(sent.text).includes("<Portre>"));
  const keyboard = (sent.reply_markup as { inline_keyboard: { text: string; callback_data?: string; url?: string }[][] }).inline_keyboard;
  assert.equal(keyboard[0][0].callback_data, `p:${ID_A}`);
  assert.ok(keyboard[keyboard.length - 1][0].url?.startsWith(SITE));
  assert.equal(t.sb.calls.find((c) => c.path === "rpc/search_content")?.body?.p_kind, "prompt");

  const plain = setup();
  await plain.bot.handleUpdate(message("neon logo"));
  assert.equal(plain.sb.calls.find((c) => c.path === "rpc/search_content")?.body?.p_query, "neon logo");

  const group = setup();
  await group.bot.handleUpdate(message("neon logo", { chat: "group" }));
  assert.equal(group.tg.calls.length, 0, "plain text in a group is not a command");
});

test("/ara <tür>: request / preset / workflow searches use search_content with their own kind", async () => {
  for (const [word, kind] of [["istek", "request"], ["ayar", "preset"], ["workflow", "workflow"], ["request", "request"]] as const) {
    const t = setup();
    await t.bot.handleUpdate(message(`/ara ${word} logo`));
    assert.equal(t.sb.calls.find((c) => c.path === "rpc/search_content")?.body?.p_kind, kind, word);
  }
  const t = setup();
  await t.bot.handleUpdate(message("/ara ayar sinema"));
  const keyboard = (t.tg.last().reply_markup as { inline_keyboard: { callback_data?: string }[][] }).inline_keyboard;
  assert.equal(keyboard[0][0].callback_data, `c:a:${ID_A}`);
});

test("/ara with nothing found, and an upstream failure → friendly messages, no crash", async () => {
  const empty = setup({ sb: fakeSupabase({ prompts: [] }) });
  await empty.bot.handleUpdate(message("/ara hiçbirşey"));
  assert.match(String(empty.tg.last().text), /Sonuç bulunamadı/);
  const errors: unknown[] = [];
  const down = setup({ sb: fakeSupabase({ fail: true }), errors });
  await down.bot.handleUpdate(message("/ara x"));
  assert.match(String(down.tg.last().text), /sorun oluştu/);
  assert.equal(errors.length, 1, "the real error goes to onError, not to the user");
});

test("/prompt: title, attribution (author + Promptly link), escaped text in <pre>, variables, fill + open buttons", async () => {
  const t = setup();
  await t.bot.handleUpdate(message(`/prompt ${ID_A}`));
  const text = String(t.tg.last().text);
  assert.match(text, /<b>Işıklı &lt;Portre&gt;<\/b>/);
  assert.match(text, /@ayse · Promptly/);
  assert.match(text, /<pre>A portrait of \{subject\} in \{style\} light &amp; mood<\/pre>/);
  assert.match(text, /<code>\{subject\}<\/code>/);
  assert.match(text, new RegExp(`href="${SITE}/share/prompt/${ID_A}/"`));
  const keyboard = (t.tg.last().reply_markup as { inline_keyboard: { callback_data?: string; url?: string }[][] }).inline_keyboard;
  assert.equal(keyboard[0][0].callback_data, `f:${ID_A}`);
  assert.ok(keyboard[1][0].url?.includes("/share/prompt/"));
});

test("/prompt: a very long prompt is cut under Telegram's 4096 limit, never mid-entity", async () => {
  const long = "x < y & z > w ".repeat(1000);
  const t = setup({ sb: fakeSupabase({ prompts: [promptRow(ID_A, { prompt_text: long })], variables: [] }) });
  await t.bot.handleUpdate(message(`/prompt ${ID_A}`));
  const text = String(t.tg.last().text);
  assert.ok(text.length < 4096, `length ${text.length}`);
  assert.ok(!/&(?!amp;|lt;|gt;)/.test(text.replace(/<[^>]*>/g, "")), "no broken entity");
  assert.match(text, /devamı Promptly'de/);
});

test("/prompt: missing id, bad id and unknown prompt are explained", async () => {
  const t = setup();
  await t.bot.handleUpdate(message("/prompt"));
  assert.match(String(t.tg.last().text), /bir kimlik ver/i);
  await t.bot.handleUpdate(message("/prompt abc"));
  assert.match(String(t.tg.last().text), /geçerli bir kimlik değil/);
  await t.bot.handleUpdate(message(`/prompt ${ID_B}`));
  assert.match(String(t.tg.last().text), /Bulunamadı/);
});

test("/doldur: values from name=value lines; unfilled variables are listed; inline form works; a template button gives the lines to copy", async () => {
  const t = setup();
  await t.bot.handleUpdate(message(`/doldur ${ID_A}\nsubject=a cat\nstyle=soft`));
  assert.match(String(t.tg.last().text), /<pre>A portrait of a cat in soft light &amp; mood<\/pre>/);
  await t.bot.handleUpdate(message(`/doldur ${ID_A}\nsubject=a cat`));
  assert.match(String(t.tg.last().text), /Boş kalan: <code>\{style\}<\/code>/);
  await t.bot.handleUpdate(message(`/fill ${ID_A} subject=dog`, { lang: "en" }));
  assert.match(String(t.tg.last().text), /A portrait of dog/);
  await t.bot.handleUpdate(callback(`f:${ID_A}`));
  const template = String(t.tg.last().text);
  assert.match(template, new RegExp(`/doldur ${ID_A}`));
  assert.match(template, /subject=a fox/, "a variable's default is pre-filled");
  assert.ok(t.tg.calls.some((c) => c.method === "answerCallbackQuery"), "the button spinner is always answered");
});

test("/istek, /hazirayar, /workflow: show public content with attribution; workflow steps are escaped", async () => {
  const t = setup();
  await t.bot.handleUpdate(message(`/workflow ${ID_A}`));
  const wf = String(t.tg.last().text);
  assert.match(wf, /<b>Zincir<\/b>/);
  assert.match(wf, /1\. <b>Yaz<\/b>/);
  assert.match(wf, /Yaz &lt;şunu&gt;/);
  assert.match(wf, /@ayse · Promptly/);
  await t.bot.handleUpdate(message(`/hazirayar ${ID_A}`));
  assert.match(String(t.tg.last().text), /lens: 135mm/);
  await t.bot.handleUpdate(callback(`c:w:${ID_A}`));
  assert.match(String(t.tg.last().text), /Zincir/);
});

test("/populer: period words map to the API; default is the last month", async () => {
  const t = setup();
  await t.bot.handleUpdate(message("/populer hafta"));
  assert.match(String(t.tg.last().text), /week/);
  await t.bot.handleUpdate(message("/popular", { lang: "en" }));
  assert.match(String(t.tg.last().text), /month/);
});

test("commands aimed at another bot are ignored; ones aimed at this bot work; unknown commands get a hint", async () => {
  const t = setup();
  await t.bot.handleUpdate(message("/yardim@BaskaBot"));
  assert.equal(t.tg.calls.length, 0);
  await t.bot.handleUpdate(message("/yardim@PromptlyBot"));
  assert.match(String(t.tg.last().text), /Herkese açık/);
  await t.bot.handleUpdate(message("/bilinmeyen"));
  assert.match(String(t.tg.last().text), /tanımıyorum/);
});

// --- satır içi mod -------------------------------------------------------------------------------------------------------------------------------------
test("inline mode: results carry the FULL prompt text (so choosing pastes it) with attribution; empty query = popular; kinds via prefix", async () => {
  const t = setup();
  await t.bot.handleUpdate({ update_id: 3, inline_query: { id: "iq1", from: { id: TG, language_code: "tr" }, query: "portre" } });
  const answer = t.tg.calls.find((c) => c.method === "answerInlineQuery")!.params;
  const results = answer.results as { id: string; title: string; input_message_content: { message_text: string; parse_mode: string } }[];
  assert.equal(results.length, 1);
  assert.equal(results[0].id, ID_A);
  assert.match(results[0].input_message_content.message_text, /A portrait of \{subject\}/);
  assert.match(results[0].input_message_content.message_text, /@ayse · Promptly/);
  assert.equal(results[0].input_message_content.parse_mode, "HTML");
  assert.equal(answer.cache_time, 30);

  const popular = setup();
  await popular.bot.handleUpdate({ update_id: 4, inline_query: { id: "iq2", from: { id: TG }, query: "" } });
  assert.ok(popular.sb.calls.some((c) => c.path === "prompts"), "empty query lists popular prompts");

  const kind = setup();
  await kind.bot.handleUpdate({ update_id: 5, inline_query: { id: "iq3", from: { id: TG }, query: "ayar sinema" } });
  assert.equal(kind.sb.calls.find((c) => c.path === "rpc/search_content")?.body?.p_kind, "preset");
});

test("inline mode: a rate-limited user gets an empty, short-cached answer and no database work", async () => {
  const t = setup({ rate: block });
  await t.bot.handleUpdate({ update_id: 6, inline_query: { id: "iq4", from: { id: TG }, query: "x" } });
  const answer = t.tg.calls.find((c) => c.method === "answerInlineQuery")!.params;
  assert.deepEqual(answer.results, []);
  assert.equal(t.sb.calls.length, 0);
});

test("rate limit: a blocked user is warned once, then ignored silently", async () => {
  const t = setup({ rate: block });
  await t.bot.handleUpdate(message("/ara a"));
  await t.bot.handleUpdate(message("/ara b"));
  await t.bot.handleUpdate(message("/ara c"));
  assert.equal(t.tg.sent().length, 1);
  assert.match(String(t.tg.last().text), /Çok hızlı/);
  assert.equal(t.sb.calls.length, 0, "no lookups for a blocked user");
  const free = setup({ rate: allow });
  await free.bot.handleUpdate(message("/ara a"));
  assert.ok(free.sb.calls.length > 0);
});

// ====================================================================================================================================
// 2) Hesap bağlama
// ====================================================================================================================================
const CODE = "ABCD2345";

test("link: personal commands outside a private chat, or without a linked account, are refused with the right hint", async () => {
  const me = fakeMe({ linked: false });
  const t = setup({ me });
  await t.bot.handleUpdate(message("/benim", { chat: "group" }));
  assert.match(String(t.tg.last().text), /özel sohbette/);
  assert.equal(me.txs.length, 0, "nothing touched the database from a group");
  await t.bot.handleUpdate(message("/benim"));
  assert.match(String(t.tg.last().text), /Önce Promptly hesabını bağla/);
  await t.bot.handleUpdate(message("/ben", { lang: "en" }));
  assert.match(String(t.tg.last().text), /Link your Promptly account first/);
});

test("link: /baglan with a bad shape or unknown code never reaches consume; a valid code asks for confirmation naming the account", async () => {
  const owner = fakeOwner({ _telegram_code_peek: (params) => (params[0] === undefined ? [] : []) });
  const t = setup({ me: fakeMe(), owner });
  await t.bot.handleUpdate(message("/baglan"));
  assert.match(String(t.tg.last().text), /Kullanım: \/baglan KOD/);
  await t.bot.handleUpdate(message("/baglan 1234"));
  assert.match(String(t.tg.last().text), /geçersiz/);
  assert.equal(owner.calls.length, 0, "a malformed code is rejected before any query");
  await t.bot.handleUpdate(message(`/baglan ${CODE}`));
  assert.match(String(t.tg.last().text), /geçersiz/, "unknown code");

  const hash = await sha256Hex(CODE);
  const known = fakeOwner({ _telegram_code_peek: (params) => (params[0] === hash ? [{ user_id: USER, username: "aliq", display_name: "Ali <Q>", write: true }] : []) });
  const ok = setup({ me: fakeMe(), owner: known });
  await ok.bot.handleUpdate(message(`/baglan abcd-2345`));
  const text = String(ok.tg.last().text);
  assert.match(text, /<b>@aliq<\/b> \(Ali &lt;Q&gt;\)/);
  assert.match(text, /özel taslak ekleme/);
  const buttons = (ok.tg.last().reply_markup as { inline_keyboard: { callback_data: string }[][] }).inline_keyboard[0];
  assert.equal(buttons[0].callback_data, `lk:${CODE}`);
  assert.equal(buttons[1].callback_data, "lx");
  assert.ok(known.calls.every((c) => c.sql.includes("_telegram_code_peek")), "only peeked: nothing was linked yet");
});

test("link: the deep link /start link_CODE goes through the same confirmation; in a group it is refused", async () => {
  const hash = await sha256Hex(CODE);
  const owner = fakeOwner({ _telegram_code_peek: (p) => (p[0] === hash ? [{ user_id: USER, username: "aliq", display_name: "Ali", write: false }] : []) });
  const t = setup({ me: fakeMe(), owner });
  await t.bot.handleUpdate(message(`/start link_${CODE}`));
  assert.match(String(t.tg.last().text), /bağlamak üzeresin/);
  const group = setup({ me: fakeMe(), owner });
  await group.bot.handleUpdate(message(`/baglan ${CODE}`, { chat: "group" }));
  assert.match(String(group.tg.last().text), /özel sohbette/);
});

test("link: confirming consumes the code once with the Telegram identity; the confirmation message is replaced; failures are explained", async () => {
  const hash = await sha256Hex(CODE);
  const consumed: unknown[][] = [];
  const owner = fakeOwner({ _telegram_link_consume: (params) => { consumed.push(params); return [{ link_id: "L", username: "aliq", display_name: "Ali", scopes: ["read"] }]; } });
  const t = setup({ me: fakeMe(), owner });
  await t.bot.handleUpdate(callback(`lk:${CODE}`));
  assert.deepEqual(consumed[0], [hash, String(TG), String(TG), null, "Ali", "tr"]);
  const edit = t.tg.calls.find((c) => c.method === "editMessageText")!.params;
  assert.match(String(edit.text), /Bağlandı: <b>@aliq<\/b>/);
  assert.deepEqual(edit.reply_markup, { inline_keyboard: [] }, "the buttons are removed after use");

  for (const [reason, expected] of [["code_invalid", /geçersiz/], ["link_limit", /en çok 3/]] as const) {
    const failing = setup({ me: fakeMe(), owner: fakeOwner({ _telegram_link_consume: () => new Error(reason) }) });
    await failing.bot.handleUpdate(callback(`lk:${CODE}`));
    assert.match(String(failing.tg.last().text), expected, reason);
  }
  const garbage = setup({ me: fakeMe(), owner });
  await garbage.bot.handleUpdate(callback("lk:nope"));
  assert.match(String(garbage.tg.last().text), /geçersiz/);
  const cancel = setup({ me: fakeMe(), owner });
  await cancel.bot.handleUpdate(callback("lx"));
  assert.match(String(cancel.tg.calls.find((c) => c.method === "editMessageText")!.params.text), /Vazgeçildi/);
});

test("link: code attempts are rate-limited separately (brute force) — both asking and confirming", async () => {
  const owner = fakeOwner({ _telegram_code_peek: () => [], _telegram_link_consume: () => [{ link_id: "L", username: "u", display_name: "u", scopes: ["read"] }] });
  const t = setup({ me: fakeMe(), owner, linkRate: block });
  await t.bot.handleUpdate(message(`/baglan ${CODE}`));
  assert.match(String(t.tg.last().text), /Çok fazla yanlış deneme/);
  await t.bot.handleUpdate(callback(`lk:${CODE}`));
  assert.match(String(t.tg.last().text), /Çok fazla yanlış deneme/);
  assert.equal(owner.calls.length, 0, "no database call once the attempt limit is hit");
});

test("/ayril removes the link; saying so when there was none", async () => {
  let removed = true;
  const owner = fakeOwner({ _telegram_unlink: () => [{ removed }] });
  const t = setup({ me: fakeMe(), owner });
  await t.bot.handleUpdate(message("/ayril"));
  assert.match(String(t.tg.last().text), /Bağlantı kaldırıldı/);
  removed = false;
  await t.bot.handleUpdate(message("/unlink", { lang: "en" }));
  assert.match(String(t.tg.last().text), /no linked account/);
});

// ====================================================================================================================================
// 3) Kişisel komutlar (bağlı kullanıcı adına)
// ====================================================================================================================================
const myPromptRow = { id: ID_A, title: "Taslağım", description: "", prompt_text: "Gizli {metin}", content_type: "text", status: "draft", visibility: "private", tags: [], created_at: new Date("2026-10-01T00:00:00Z"), updated_at: new Date("2026-10-01T10:00:00.123Z"), created_cursor: "2026-10-01T00:00:00.000000Z" };

test("personal: runs as the linked user (authenticate → role → claims → throttle → work) and shows the account", async () => {
  const me = fakeMe({ scopes: ["read", "write"], query: (sql) => (sql.includes("api_me_whoami") ? [{ user_id: USER, username: "aliq", display_name: "Ali Q", avatar_url: null }] : []) });
  const t = setup({ me });
  await t.bot.handleUpdate(message("/ben"));
  assert.match(String(t.tg.last().text), /<b>@aliq<\/b> \(Ali Q\)/);
  assert.match(String(t.tg.last().text), /özel taslak ekleme/);
  const sqls = me.txs.map((x) => x.sql);
  assert.ok(sqls[0].includes("_telegram_link_authenticate") && sqls[1] === "set local role authenticated" && sqls[2].includes("request.jwt.claims"));
  assert.deepEqual(me.txs[0].params, [String(TG), "tr"], "the Telegram id and the language reach the authenticator");
});

test("personal: /benim lists the user's prompts with a button each; the button shows the text and an edit link", async () => {
  const me = fakeMe({ query: (sql) => (sql.includes("api_me_prompts(") ? [myPromptRow] : sql.includes("api_me_prompt($1") ? [myPromptRow] : []) });
  const t = setup({ me });
  await t.bot.handleUpdate(message("/benim taslak"));
  assert.match(String(t.tg.last().text), /Taslağım<\/b> \(taslak\)/);
  assert.equal(me.txs.find((x) => x.sql.includes("api_me_prompts("))?.params[3], "draft");
  await t.bot.handleUpdate(callback(`m:${ID_A}`));
  assert.match(String(t.tg.last().text), /<pre>Gizli \{metin\}<\/pre>/);
  assert.match(String(t.tg.last().text), /create\?edit=/);
});

test("personal: /taslak needs the WRITE scope; with it the draft goes through import_prompts and the answer links the editor", async () => {
  const readOnly = fakeMe({ scopes: ["read"] });
  const refused = setup({ me: readOnly });
  await refused.bot.handleUpdate(message("/taslak Başlık\nMetin"));
  assert.match(String(refused.tg.last().text), /yazma izni yok/);
  assert.ok(!readOnly.txs.some((x) => x.sql.includes("import_prompts")), "a read-only link never reaches the import");

  const sent: unknown[][] = [];
  const me = fakeMe({
    scopes: ["read", "write"],
    query: (sql, params) => {
      if (!sql.includes("import_prompts")) return [];
      sent.push(params);
      return [{ report: { dryRun: false, ok: true, created: 1, items: [{ index: 1, status: "ok", id: ID_B }] } }];
    },
  });
  const t = setup({ me });
  await t.bot.handleUpdate(message("/taslak Yeni fikir\nİlk satır {konu}\nİkinci satır"));
  const item = JSON.parse(String(sent[0][0]))[0];
  assert.equal(item.title, "Yeni fikir");
  assert.equal(item.promptText, "İlk satır {konu}\nİkinci satır");
  assert.equal(sent[0][1], false, "never a dry run, never a publish flag");
  assert.match(String(t.tg.last().text), new RegExp(`create\\?edit=${ID_B}`));

  await t.bot.handleUpdate(message("/taslak sadece başlık"));
  assert.match(String(t.tg.last().text), /Kullanım/);
});

test("personal: /taslak reports a duplicate and a refused draft honestly", async () => {
  const dup = setup({ me: fakeMe({ scopes: ["read", "write"], query: (sql) => (sql.includes("import_prompts") ? [{ report: { dryRun: false, ok: false, created: 0, items: [{ index: 1, status: "duplicate" }] } }] : []) }) });
  await dup.bot.handleUpdate(message("/taslak A\nB"));
  assert.match(String(dup.tg.last().text), /zaten var/);
  const bad = setup({ me: fakeMe({ scopes: ["read", "write"], query: (sql) => (sql.includes("import_prompts") ? [{ report: { dryRun: false, ok: false, created: 0, items: [{ index: 1, status: "invalid", field: "title", code: "too_long" }] } }] : []) }) });
  await bad.bot.handleUpdate(message("/taslak A\nB"));
  assert.match(String(bad.tg.last().text), /title · too_long/);
});

test("personal: /duzenle reads the current version in the SAME transaction and updates with it; only a draft changes; wrong field/kind combos are usage errors", async () => {
  const updates: unknown[][] = [];
  const me = fakeMe({
    scopes: ["read", "write"],
    query: (sql, params) => {
      if (sql.includes("api_me_prompt($1")) return [myPromptRow];
      if (sql.includes("api_me_update_draft")) {
        updates.push(params);
        return [{ result: { ok: true, id: ID_A, changed: ["title"], warnings: [], updatedAt: "2026-10-01T10:05:00.000Z" } }];
      }
      return [];
    },
  });
  const t = setup({ me });
  await t.bot.handleUpdate(message(`/duzenle prompt ${ID_A} baslik\nYeni başlık`));
  assert.deepEqual(updates[0].slice(0, 2), ["prompt", ID_A]);
  assert.deepEqual(JSON.parse(String(updates[0][2])), { title: "Yeni başlık" });
  assert.equal(updates[0][3], "2026-10-01T10:00:00.123Z", "the freshly read updatedAt is the conflict token");
  assert.match(String(t.tg.last().text), /Güncellendi \(title\)/);
  assert.equal(me.txs.filter((x) => x.sql.includes("_telegram_link_authenticate")).length, 1, "read + update share one transaction");

  const before = updates.length;
  await t.bot.handleUpdate(message(`/duzenle istek ${ID_A} metin\nx`));
  assert.match(String(t.tg.last().text), /Kullanım/, "'text' is a prompt-only field");
  await t.bot.handleUpdate(message(`/duzenle prompt ${ID_A} baslik`));
  assert.match(String(t.tg.last().text), /Kullanım/, "no new value");
  await t.bot.handleUpdate(message(`/duzenle prompt nope baslik\nx`));
  assert.match(String(t.tg.last().text), /geçerli bir kimlik değil/);
  assert.equal(updates.length, before, "none of the bad forms touched the database");
});

test("personal: editing a published item or a conflicting one is explained; nothing says it was published/deleted", async () => {
  const notDraft = setup({ me: fakeMe({ scopes: ["read", "write"], query: (sql) => (sql.includes("api_me_prompt($1") ? [myPromptRow] : sql.includes("api_me_update_draft") ? [{ result: { ok: false, code: "not_draft" } }] : []) }) });
  await notDraft.bot.handleUpdate(message(`/duzenle prompt ${ID_A} baslik\nx`));
  assert.match(String(notDraft.tg.last().text), /yayında/);
  const conflict = setup({ me: fakeMe({ scopes: ["read", "write"], query: (sql) => (sql.includes("api_me_prompt($1") ? [myPromptRow] : sql.includes("api_me_update_draft") ? [{ result: { ok: false, code: "conflict", currentUpdatedAt: "2026-10-01T11:00:00.000Z" } }] : []) }) });
  await conflict.bot.handleUpdate(message(`/duzenle prompt ${ID_A} baslik\nx`));
  assert.match(String(conflict.tg.last().text), /başka yerden değişti/);
});

test("notification preferences: /bildirim shows both, toggles flip exactly one flag, an unlinked user is told to link", async () => {
  let weekly = false;
  let activity = false;
  const owner = fakeOwner({
    _telegram_set_notify: (params) => {
      // Okuma çağrısında `null, null` SQL'e gömülüdür (parametre yok); değiştirme çağrısında yalnız biri doludur.
      if (params[1] != null) weekly = Boolean(params[1]);
      if (params[2] != null) activity = Boolean(params[2]);
      return [{ notify_weekly: weekly, notify_activity: activity }];
    },
  });
  const t = setup({ me: fakeMe(), owner });
  await t.bot.handleUpdate(message("/bildirim"));
  assert.match(String(t.tg.last().text), /Haftalık özet: kapalı/);
  await t.bot.handleUpdate(callback("n:a"));
  assert.deepEqual([weekly, activity], [false, true]);
  assert.match(String(t.tg.last().text), /Etkinlik \(yorum, yanıt, alıntı…\): açık/);
  await t.bot.handleUpdate(callback("n:w"));
  assert.deepEqual([weekly, activity], [true, true]);
  const none = setup({ me: fakeMe(), owner: fakeOwner({ _telegram_set_notify: () => [] }) });
  await none.bot.handleUpdate(message("/bildirim"));
  assert.match(String(none.tg.last().text), /Önce Promptly hesabını bağla/);
});

// ====================================================================================================================================
// 4) Bildirimler
// ====================================================================================================================================
function linkRow(overrides: Record<string, unknown> = {}) {
  return { link_id: "L1", chat_id: String(TG), telegram_user_id: String(TG), language: "tr", notify_weekly: false, notify_activity: true, last_weekly_week: null, ...overrides };
}
const pendingRows = [
  { id: "n1", type: "comment", message: 'Paylaşımına yorum yaptı: "<merhaba>"', target_href: "/prompts/local?id=a", actor_username: "ayse" },
  { id: "n2", type: "comment_reply", message: "Yorumuna yanıt verdi", target_href: "//evil.example", actor_username: null },
];

test("notify: activity goes out as ONE escaped message, the cursor moves to the LAST sent notification, links are site-only", async () => {
  const tg = fakeApi();
  const owner = fakeOwner({ _telegram_notify_links: () => [linkRow()], _telegram_pending: () => pendingRows });
  const report = await runTelegramNotifications({ api: tg.api, owner: owner.owner, me: fakeMe().backend, siteUrl: SITE, now: () => new Date("2026-11-02T12:00:00Z") });
  assert.equal(tg.sent().length, 1);
  const text = String(tg.last().text);
  assert.match(text, /@ayse Paylaşımına yorum yaptı: "&lt;merhaba&gt;"/);
  assert.match(text, new RegExp(`href="${SITE}/prompts/local\\?id=a"`));
  assert.ok(!text.includes("evil.example"), "an off-site target is replaced by the site root");
  assert.deepEqual(owner.calls.find((c) => c.sql.includes("_telegram_advance_to"))?.params, ["L1", "n2"]);
  assert.equal(report.activitySent, 2);
});

test("notify: English users get the known sentences in English (previews stay as written)", async () => {
  const tg = fakeApi();
  const owner = fakeOwner({ _telegram_notify_links: () => [linkRow({ language: "en" })], _telegram_pending: () => [pendingRows[0]] });
  await runTelegramNotifications({ api: tg.api, owner: owner.owner, me: fakeMe().backend, siteUrl: SITE });
  assert.match(String(tg.last().text), /@ayse commented on your post: "&lt;merhaba&gt;"/);
});

test("notify: a failed send does NOT move the cursor (retried next run); a blocked bot (403) unlinks; other links still go out", async () => {
  const owner = fakeOwner({ _telegram_notify_links: () => [linkRow({ link_id: "L1" }), linkRow({ link_id: "L2", chat_id: "777", telegram_user_id: "777" })], _telegram_pending: () => [pendingRows[0]] });
  const errors: unknown[] = [];
  const tg = fakeApi({
    sendMessage: (params) => (params.chat_id === TG ? { ok: false, errorCode: 500, description: "boom" } : { ok: false, errorCode: 403, description: "Forbidden: bot was blocked by the user" }),
  });
  const report = await runTelegramNotifications({ api: tg.api, owner: owner.owner, me: fakeMe().backend, siteUrl: SITE, onError: (e) => errors.push(e) });
  assert.ok(!owner.calls.some((c) => c.sql.includes("_telegram_advance_to")), "no cursor move after a failed send");
  assert.deepEqual(owner.calls.find((c) => c.sql.includes("_telegram_unlink_link"))?.params, ["L2"]);
  assert.deepEqual([report.failed, report.unlinked, report.activitySent], [1, 1, 0]);
  assert.equal(errors.length, 1);
  assert.ok(!JSON.stringify(errors.map(String)).includes("boom"), "Telegram's error text is not copied into our logs");
});

test("notify: nothing pending → nothing sent", async () => {
  const tg = fakeApi();
  const owner = fakeOwner({ _telegram_notify_links: () => [linkRow()], _telegram_pending: () => [] });
  const report = await runTelegramNotifications({ api: tg.api, owner: owner.owner, me: fakeMe().backend, siteUrl: SITE });
  assert.equal(tg.calls.length, 0);
  assert.equal(report.activitySent, 0);
});

test("notify weekly: sent once per ISO week after 06:00 UTC with the user's numbers, then marked; not before 06:00; not again in the same week", async () => {
  const summary = { copies: 12, reactions: 0, comments: 3, saves: 1, followers: 0 };
  const run = async (now: string, row: Record<string, unknown>) => {
    const tg = fakeApi();
    const owner = fakeOwner({ _telegram_notify_links: () => [linkRow({ notify_activity: false, notify_weekly: true, ...row })] });
    const me = fakeMe({ scopes: ["read"], query: (sql) => (sql.includes("creator_insights_summary") ? [summary] : []) });
    const report = await runTelegramNotifications({ api: tg.api, owner: owner.owner, me: me.backend, siteUrl: SITE, now: () => new Date(now) });
    return { tg, owner, report, me };
  };
  const ok = await run("2026-11-02T08:00:00Z", {});
  assert.match(String(ok.tg.last().text), /Haftalık özet/);
  assert.match(String(ok.tg.last().text), /12 kopyalama · 3 yorum · 1 kaydetme/);
  assert.ok(!String(ok.tg.last().text).includes("tepki"), "zero counts are left out");
  assert.deepEqual(ok.owner.calls.find((c) => c.sql.includes("_telegram_mark_weekly"))?.params, ["L1", "2026-45"]);
  assert.equal(ok.report.weeklySent, 1);

  const early = await run("2026-11-02T03:00:00Z", {});
  assert.equal(early.tg.calls.length, 0, "before 06:00 UTC nothing is sent");
  const again = await run("2026-11-02T09:00:00Z", { last_weekly_week: "2026-45" });
  assert.equal(again.tg.calls.length, 0, "already sent this week");

  const english = await run("2026-11-02T08:00:00Z", { language: "en" });
  assert.match(String(english.tg.last().text), /12 copies · 3 comments · 1 saves|Weekly summary/);
});

test("notify weekly: a quiet week sends nothing but is still marked (not recomputed all day)", async () => {
  const tg = fakeApi();
  const owner = fakeOwner({ _telegram_notify_links: () => [linkRow({ notify_activity: false, notify_weekly: true })] });
  const me = fakeMe({ query: (sql) => (sql.includes("creator_insights_summary") ? [{ copies: 0, reactions: 0, comments: 0, saves: 0, followers: 0 }] : []) });
  await runTelegramNotifications({ api: tg.api, owner: owner.owner, me: me.backend, siteUrl: SITE, now: () => new Date("2026-11-02T08:00:00Z") });
  assert.equal(tg.calls.length, 0);
  assert.ok(owner.calls.some((c) => c.sql.includes("_telegram_mark_weekly")));
});

// ====================================================================================================================================
// 5) HTTP kapısı
// ====================================================================================================================================
function httpHandler(opts: { webhook?: string; cron?: string } = {}) {
  const handled: TelegramUpdate[] = [];
  const bot = { handleUpdate: async (update: TelegramUpdate) => void handled.push(update) };
  let notified = 0;
  let setups = 0;
  const handler = createTelegramHttpHandler({
    bot,
    webhookSecret: opts.webhook ?? "hook-secret",
    cronSecret: opts.cron ?? "cron-secret",
    notify: async () => { notified += 1; return { links: 0, activitySent: 0, weeklySent: 0, unlinked: 0, failed: 0 }; },
    setup: async () => { setups += 1; return { webhook: "ok" }; },
  });
  return { handler, handled, counts: () => ({ notified, setups }) };
}
const post = (path: string, headers: Record<string, string>, body = "{}") => new Request(`https://x.supabase.co/functions/v1/telegram${path}`, { method: "POST", headers, body });

test("http webhook: only Telegram's secret opens it; garbage after auth is a quiet 200; not configured = closed", async () => {
  const h = httpHandler();
  assert.equal((await h.handler(post("", {}, JSON.stringify({ update_id: 1 })))).status, 401);
  assert.equal((await h.handler(post("", { "x-telegram-bot-api-secret-token": "wrong" }, JSON.stringify({ update_id: 1 })))).status, 401);
  assert.equal(h.handled.length, 0);
  const good = { "x-telegram-bot-api-secret-token": "hook-secret" };
  assert.equal((await h.handler(post("", good, JSON.stringify({ update_id: 1, message: { message_id: 1, chat: { id: 1, type: "private" } } })))).status, 200);
  assert.equal(h.handled.length, 1);
  assert.equal((await h.handler(post("", good, "not json"))).status, 200);
  assert.equal((await h.handler(post("", good, JSON.stringify({ nope: true })))).status, 200);
  assert.equal(h.handled.length, 1, "malformed updates are ignored");
  const closed = httpHandler({ webhook: "" });
  assert.equal((await closed.handler(post("", good, JSON.stringify({ update_id: 1 })))).status, 503);
});

test("http: /notify and /setup need the cron secret (not the webhook secret); GET gives a harmless banner; other methods 405", async () => {
  const h = httpHandler();
  assert.equal((await h.handler(post("/notify", { "x-telegram-bot-api-secret-token": "hook-secret" }))).status, 401, "the webhook secret does not open the cron endpoints");
  assert.equal((await h.handler(post("/notify", { "x-cron-secret": "nope" }))).status, 401);
  assert.equal(h.counts().notified, 0);
  const ok = await h.handler(post("/notify", { "x-cron-secret": "cron-secret" }));
  assert.equal(ok.status, 200);
  assert.equal(h.counts().notified, 1);
  assert.equal((await h.handler(post("/setup", { "x-cron-secret": "cron-secret" }))).status, 200);
  assert.equal(h.counts().setups, 1);
  assert.equal((await httpHandler({ cron: "" }).handler(post("/notify", { "x-cron-secret": "" }))).status, 503, "an empty secret never matches an empty header");
  const banner = await h.handler(new Request("https://x.supabase.co/functions/v1/telegram"));
  assert.equal(banner.status, 200);
  assert.ok(!JSON.stringify(await banner.json()).includes("secret"));
  assert.equal((await h.handler(new Request("https://x.supabase.co/functions/v1/telegram", { method: "DELETE" }))).status, 405);
});

test("setup: registers the webhook with the secret token and only the update types the bot handles, plus command lists (default + Turkish)", async () => {
  const tg = fakeApi();
  const result = await runTelegramSetup({ api: tg.api, webhookUrl: "https://x.supabase.co/functions/v1/telegram", webhookSecret: "hook-secret" });
  const hook = tg.calls.find((c) => c.method === "setWebhook")!.params;
  assert.equal(hook.secret_token, "hook-secret");
  assert.deepEqual(hook.allowed_updates, ["message", "callback_query", "inline_query"]);
  const lists = tg.calls.filter((c) => c.method === "setMyCommands");
  assert.equal(lists.length, 2);
  assert.ok(lists.every((c) => (c.params.commands as { command: string }[]).every((cmd) => /^[a-z0-9_]{1,32}$/.test(cmd.command))), "command names are Telegram-legal (no Turkish letters)");
  assert.deepEqual(result, { webhook: "ok", commands: "ok", commandsTr: "ok" });
  assert.ok(!JSON.stringify(result).includes("hook-secret"));
});
