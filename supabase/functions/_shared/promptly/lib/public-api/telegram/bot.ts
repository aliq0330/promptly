/**
 * Telegram botu — komutlar, satır içi mod, hesap bağlama, kişisel komutlar (docs/history/323-*). Bütün veri işi mevcut çekirdektedir
 * (`prompts.ts`, `public-content.ts`, `me.ts`, `me-content.ts`); burası yalnız Telegram'a bağlar. Yeni sorgu, yeni kural yok.
 *
 * KURALLAR
 * - Herkese açık komutlar yalnız anon anahtarla (sitenin oturumsuz ziyaretçisinin yetkisi). Her prompt mesajı yazarı ve Promptly bağlantısını taşır (Kullanım Koşulları: atıf).
 * - Kişisel komutlar YALNIZ özel sohbette ve yalnız önceden BAĞLANMIŞ Telegram kullanıcısı için çalışır (`MeBackend.withTelegram`: RLS/askı/hız sınırı kullanıcınınkiyle aynı).
 *   Yazma = yalnız ÖZEL TASLAK ekleme/düzenleme; yayınlama ve silme YOKTUR.
 * - Hesap bağlama kodu SİTEDEN üretilir ve bota gönderilir (tersi, saldırganın Telegram'ını kurbanın hesabına bağlatırdı). Bağlamadan önce kişiye hangi hesaba bağlanacağı
 *   gösterilir ve onayı istenir; kod tek kullanımlıktır, denemeler hız sınırlıdır.
 * - Kullanıcı içeriği her zaman HTML-kaçırılır; modele/komuta çevrilmez.
 */
import { serializeJson } from "../../exchange/json.ts";
import { extractVariableTokenNames } from "../../prompt-variables.ts";
import { editUrl, getMyContent, getWhoami, updateMyDraft, type MeDraftKind } from "../me-content.ts";
import { getMyPrompt, importMyPrompts, listMyPrompts, type MeBackend, type MeScope } from "../me.ts";
import { fillPrompt, getPrompt, getPrompts, popularPrompts, searchPrompts, type PublicPrompt, type PublicPromptSummary } from "../prompts.ts";
import { getPublicContent, searchPublicContent, type PublicContent, type PublicContentKind, type PublicContentSummary } from "../public-content.ts";
import { sha256Hex } from "../rate-limit.ts";
import { PublicApiError } from "../rest.ts";
import {
  CALLBACK_KIND,
  KIND_CALLBACK,
  SAFE_TEXT_BUDGET,
  buttonLabel,
  clipEscaped,
  escapeHtml,
  isId,
  link,
  normalizeLinkCode,
  parseAssignments,
  parseCommand,
  splitKind,
  type SearchKind,
} from "./format.ts";
import { langOf, msg } from "./messages.ts";
import type { Lang, TelegramBotOptions, TelegramCallbackQuery, TelegramInlineQuery, TelegramMessage, TelegramUpdate, TelegramUser } from "./types.ts";

interface Ctx {
  lang: Lang;
  chatId: number;
  userId: number;
  isPrivate: boolean;
  from: TelegramUser;
}

type Keyboard = { inline_keyboard: Record<string, unknown>[][] };

const SEARCH_LIMIT = 5;
const INLINE_LIMIT = 8;
const PERIODS: Record<string, "week" | "month" | "year" | "all"> = {
  hafta: "week", week: "week", ay: "month", month: "month", yil: "year", year: "year", tumu: "all", all: "all",
};
const EDIT_FIELDS: Record<string, "title" | "description" | "promptText" | "creativeDirection"> = {
  baslik: "title", title: "title", aciklama: "description", description: "description",
  metin: "promptText", text: "promptText", prompt: "promptText", yon: "creativeDirection", direction: "creativeDirection",
};

export interface TelegramBot {
  handleUpdate(update: TelegramUpdate): Promise<void>;
}

export function createTelegramBot(options: TelegramBotOptions): TelegramBot {
  const { api, client, siteUrl } = options;
  const botName = options.botUsername;

  // --- Telegram'a gönderim (hata fırlatmaz: kullanıcıya ulaşamamak webhook'u 500 yapıp yeniden yağdırmasın) ---
  async function send(chatId: number, text: string, extra: Record<string, unknown> = {}): Promise<void> {
    const result = await api.call("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
    if (!result.ok) options.onError?.(new Error(`telegram sendMessage failed (${result.errorCode})`));
  }
  async function answerCallback(id: string, text?: string): Promise<void> {
    await api.call("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
  }
  const openButton = (label: string, url: string) => ({ text: label, url });

  // --- Biçim ---------------------------------------------------------------------------------------------------------------------------------------------
  const byline = (_lang: Lang, author: string, credit?: string | null) => `<i>${escapeHtml(credit?.trim() || `@${author} · Promptly`)}</i>`;

  function promptText(lang: Lang, prompt: PublicPrompt): { text: string; keyboard: Keyboard } {
    const names = extractVariableTokenNames(prompt.promptText);
    const head = `<b>${escapeHtml(prompt.title)}</b>\n${byline(lang, prompt.author.username, prompt.source?.credit)}\n\n`;
    const tail =
      (names.length ? `\n\n${msg(lang, "variables", names.map((n) => `<code>{${escapeHtml(n)}}</code>`).join(", "))}` : "") + `\n${link(prompt.url, msg(lang, "openOnSite"))}`;
    const budget = Math.max(200, SAFE_TEXT_BUDGET - head.length - tail.length - 40);
    const clip = clipEscaped(prompt.promptText, budget);
    const body = `<pre>${clip.html}</pre>${clip.clipped ? `\n${escapeHtml(msg(lang, "truncated"))}` : ""}`;
    const rows: Record<string, unknown>[][] = [];
    if (names.length) rows.push([{ text: msg(lang, "fillButton"), callback_data: `f:${prompt.id}` }]);
    rows.push([openButton(msg(lang, "openOnSite"), prompt.url)]);
    return { text: head + body + tail, keyboard: { inline_keyboard: rows } };
  }

  function contentText(lang: Lang, content: PublicContent): { text: string; keyboard: Keyboard } {
    const lines: string[] = [`<b>${escapeHtml(content.title)}</b>`, byline(lang, content.author.username, `@${content.author.username} · Promptly`)];
    if (content.description) lines.push("", escapeHtml(content.description));
    if (content.kind === "request") {
      if (content.requestStatus) lines.push("", escapeHtml(msg(lang, "requestStatus", content.requestStatus)));
      if (content.creativeDirection) lines.push("", `<b>${escapeHtml(msg(lang, "direction"))}</b>`, `<pre>${clipEscaped(content.creativeDirection, 1500).html}</pre>`);
    } else if (content.kind === "preset") {
      const entries = Object.entries(content.selection ?? {}).slice(0, 30).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`);
      if (entries.length) lines.push("", `<b>${escapeHtml(msg(lang, "selection"))}</b>`, `<pre>${clipEscaped(entries.join("\n"), 1500).html}</pre>`);
    } else {
      const steps = content.steps ?? [];
      lines.push("", `<b>${escapeHtml(msg(lang, "stepsTitle"))}</b> — ${escapeHtml(msg(lang, "steps", steps.length))}`);
      let used = lines.join("\n").length;
      for (const step of steps) {
        const prompt = step.prompt ? ` · ${link(step.prompt.url, step.prompt.title)}` : "";
        const line = `${step.position}. <b>${escapeHtml(step.title || "—")}</b>${prompt}${step.instructions ? `\n   ${clipEscaped(step.instructions, 220).html}` : ""}`;
        if (used + line.length > 2800) {
          lines.push("…");
          break;
        }
        lines.push(line);
        used += line.length + 1;
      }
    }
    lines.push("", link(content.url, msg(lang, "openOnSite")));
    return { text: lines.join("\n"), keyboard: { inline_keyboard: [[openButton(msg(lang, "openOnSite"), content.url)]] } };
  }

  type ListItem = { id: string; callback: string; title: string; author: string; note: string };
  function listText(lang: Lang, heading: string, items: ListItem[]): { text: string; keyboard: Keyboard } {
    const lines = [heading, ""];
    items.forEach((item, index) => {
      lines.push(`${index + 1}. <b>${escapeHtml(item.title)}</b> — @${escapeHtml(item.author)}`);
      if (item.note) lines.push(`   <i>${clipEscaped(item.note.replace(/\s+/g, " "), 110).html}</i>`);
    });
    const rows: Record<string, unknown>[][] = items.map((item, index) => [{ text: buttonLabel(`${index + 1}. ${item.title}`), callback_data: item.callback }]);
    rows.push([openButton(msg(lang, "openOnSite"), `${siteUrl}/discover`)]);
    return { text: lines.join("\n"), keyboard: { inline_keyboard: rows } };
  }

  const promptItem = (p: PublicPromptSummary): ListItem => ({ id: p.id, callback: `p:${p.id}`, title: p.title, author: p.author.username, note: p.description || p.promptPreview });
  const contentItem = (kind: PublicContentKind, c: PublicContentSummary): ListItem => ({
    id: c.id, callback: `c:${KIND_CALLBACK[kind]}:${c.id}`, title: c.title, author: c.author.username, note: c.description,
  });

  // --- Hata → kullanıcıya düz cümle ---------------------------------------------------------------------------------------------------------------------
  async function fail(ctx: Ctx, error: unknown): Promise<void> {
    if (error instanceof PublicApiError) {
      switch (error.code) {
        case "not_found": return send(ctx.chatId, msg(ctx.lang, "notFound"));
        case "bad_request": return send(ctx.chatId, msg(ctx.lang, "badInput", escapeHtml(error.message)));
        case "rate_limited": return send(ctx.chatId, msg(ctx.lang, "tooFast"));
        case "unauthorized": return send(ctx.chatId, msg(ctx.lang, "notLinked"));
        case "insufficient_scope": return send(ctx.chatId, msg(ctx.lang, "needWrite"));
        case "conflict": return send(ctx.chatId, msg(ctx.lang, "editConflict"));
        case "unprocessable":
          return send(ctx.chatId, /published/i.test(error.message) ? msg(ctx.lang, "editNotDraft") : msg(ctx.lang, "editRefused", escapeHtml(error.message.replace(/ Nothing was written\.?$/, ""))));
        default: break;
      }
    }
    options.onError?.(error);
    return send(ctx.chatId, msg(ctx.lang, "error"));
  }

  // --- Kişisel komutlar için ortak sarmalayıcı -------------------------------------------------------------------------------------------------------
  async function personal<T>(ctx: Ctx, need: MeScope, run: (tx: Parameters<Parameters<MeBackend["withTelegram"]>[2]>[0], identity: Parameters<Parameters<MeBackend["withTelegram"]>[2]>[1]) => Promise<T>): Promise<T | undefined> {
    if (!ctx.isPrivate) {
      await send(ctx.chatId, msg(ctx.lang, "privateOnly"));
      return undefined;
    }
    if (!options.me) {
      await send(ctx.chatId, msg(ctx.lang, "error"));
      return undefined;
    }
    try {
      return await options.me.withTelegram({ telegramUserId: String(ctx.userId), language: ctx.lang }, need, run);
    } catch (error) {
      await fail(ctx, error);
      return undefined;
    }
  }

  // --- Herkese açık komutlar ---------------------------------------------------------------------------------------------------------------------------
  async function cmdSearch(ctx: Ctx, args: string): Promise<void> {
    const { kind, query } = splitKind(args);
    if (kind === "prompt") {
      const page = await searchPrompts(client, { query, limit: SEARCH_LIMIT });
      if (!page.items.length) return send(ctx.chatId, msg(ctx.lang, "searchEmpty"));
      const heading = query ? msg(ctx.lang, "searchTitle", escapeHtml(query)) : msg(ctx.lang, "searchNewest");
      const view = listText(ctx.lang, heading, page.items.map(promptItem));
      return send(ctx.chatId, view.text, { reply_markup: view.keyboard });
    }
    const page = await searchPublicContent(client, kind, { query, limit: SEARCH_LIMIT });
    if (!page.items.length) return send(ctx.chatId, msg(ctx.lang, "searchEmpty"));
    const heading = query ? msg(ctx.lang, "searchTitle", escapeHtml(query)) : msg(ctx.lang, "searchNewest");
    const view = listText(ctx.lang, heading, page.items.map((item) => contentItem(kind, item)));
    return send(ctx.chatId, view.text, { reply_markup: view.keyboard });
  }

  async function cmdPopular(ctx: Ctx, args: string): Promise<void> {
    const period = PERIODS[args.trim().toLowerCase()] ?? "month";
    const items = await popularPrompts(client, { period, by: "copies", limit: SEARCH_LIMIT });
    if (!items.length) return send(ctx.chatId, msg(ctx.lang, "searchEmpty"));
    const view = listText(ctx.lang, msg(ctx.lang, "popularTitle", period), items.map(promptItem));
    return send(ctx.chatId, view.text, { reply_markup: view.keyboard });
  }

  async function showPrompt(ctx: Ctx, id: string): Promise<void> {
    if (!isId(id)) return send(ctx.chatId, msg(ctx.lang, "badId"));
    const view = promptText(ctx.lang, await getPrompt(client, id));
    return send(ctx.chatId, view.text, { reply_markup: view.keyboard });
  }

  async function showContent(ctx: Ctx, kind: PublicContentKind, id: string): Promise<void> {
    if (!isId(id)) return send(ctx.chatId, msg(ctx.lang, "badId"));
    const view = contentText(ctx.lang, await getPublicContent(client, kind, id));
    return send(ctx.chatId, view.text, { reply_markup: view.keyboard });
  }

  async function cmdFill(ctx: Ctx, args: string): Promise<void> {
    const [first, ...rest] = args.split(/\r?\n/);
    const [id, ...inline] = (first ?? "").trim().split(/\s+/);
    if (!id) return send(ctx.chatId, msg(ctx.lang, "fillUsage"));
    if (!isId(id)) return send(ctx.chatId, msg(ctx.lang, "badId"));
    const prompt = await getPrompt(client, id);
    const values = parseAssignments([inline.join(" "), ...rest].join("\n"));
    const result = fillPrompt(prompt, values);
    const head = `<b>${escapeHtml(prompt.title)}</b>\n${byline(ctx.lang, prompt.author.username, prompt.source?.credit)}\n\n`;
    const tail = (result.missing.length ? `\n\n${msg(ctx.lang, "fillMissing", result.missing.map((n) => `<code>{${escapeHtml(n)}}</code>`).join(", "))}` : "") + `\n${link(prompt.url, msg(ctx.lang, "openOnSite"))}`;
    const clip = clipEscaped(result.text, Math.max(200, SAFE_TEXT_BUDGET - head.length - tail.length - 40));
    return send(ctx.chatId, `${head}<pre>${clip.html}</pre>${clip.clipped ? `\n${escapeHtml(msg(ctx.lang, "truncated"))}` : ""}${tail}`);
  }

  async function fillTemplate(ctx: Ctx, id: string): Promise<void> {
    if (!isId(id)) return send(ctx.chatId, msg(ctx.lang, "badId"));
    const prompt = await getPrompt(client, id);
    const names = extractVariableTokenNames(prompt.promptText);
    if (!names.length) return send(ctx.chatId, msg(ctx.lang, "fillNoVars"));
    const defaults = new Map(prompt.variables.map((v) => [v.name, v.defaultValue]));
    const lines = [`/doldur ${prompt.id}`, ...names.map((n) => `${n}=${defaults.get(n) ?? ""}`)];
    return send(ctx.chatId, msg(ctx.lang, "fillTemplate", escapeHtml(lines.join("\n"))));
  }

  // --- Hesap bağlama -----------------------------------------------------------------------------------------------------------------------------------
  async function cmdLink(ctx: Ctx, rawCode: string): Promise<void> {
    if (!ctx.isPrivate) return send(ctx.chatId, msg(ctx.lang, "privateOnly"));
    if (!options.owner || !options.me) return send(ctx.chatId, msg(ctx.lang, "error"));
    if (!rawCode.trim()) return send(ctx.chatId, msg(ctx.lang, "linkUsage"));
    // Deneme sınırı HER denemeyi sayar (doğru kod da): kaba kuvvetle kod tahminini kapatır.
    const attempt = await options.linkRateLimiter?.check(String(ctx.userId));
    if (attempt && !attempt.allowed) return send(ctx.chatId, msg(ctx.lang, "linkTooMany"));
    const code = normalizeLinkCode(rawCode);
    if (!code) return send(ctx.chatId, msg(ctx.lang, "linkInvalid"));
    const [row] = await options.owner("select user_id, username, display_name, write from public._telegram_code_peek($1)", [await sha256Hex(code)]);
    if (!row) return send(ctx.chatId, msg(ctx.lang, "linkInvalid"));
    const scope = msg(ctx.lang, row.write ? "scopeWrite" : "scopeRead");
    return send(ctx.chatId, msg(ctx.lang, "linkConfirm", escapeHtml(String(row.username)), escapeHtml(String(row.display_name ?? row.username)), escapeHtml(scope)), {
      reply_markup: { inline_keyboard: [[{ text: msg(ctx.lang, "linkYes"), callback_data: `lk:${code}` }, { text: msg(ctx.lang, "linkNo"), callback_data: "lx" }]] },
    });
  }

  async function confirmLink(ctx: Ctx, query: TelegramCallbackQuery, code: string): Promise<void> {
    if (!ctx.isPrivate || !options.owner) return;
    const attempt = await options.linkRateLimiter?.check(String(ctx.userId));
    if (attempt && !attempt.allowed) return send(ctx.chatId, msg(ctx.lang, "linkTooMany"));
    const normalized = normalizeLinkCode(code);
    if (!normalized) return send(ctx.chatId, msg(ctx.lang, "linkInvalid"));
    const name = [query.from.first_name, query.from.last_name].filter(Boolean).join(" ");
    let row: Record<string, unknown> | undefined;
    try {
      [row] = await options.owner("select link_id, username, display_name, scopes from public._telegram_link_consume($1, $2::bigint, $3::bigint, $4, $5, $6)", [
        await sha256Hex(normalized), String(ctx.userId), String(ctx.chatId), query.from.username ?? null, name || null, ctx.lang,
      ]);
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      if (/link_limit/.test(text)) return send(ctx.chatId, msg(ctx.lang, "linkLimit"));
      if (/code_invalid/.test(text)) return send(ctx.chatId, msg(ctx.lang, "linkInvalid"));
      throw error;
    }
    if (!row) return send(ctx.chatId, msg(ctx.lang, "linkInvalid"));
    const done = msg(ctx.lang, "linkDone", escapeHtml(String(row.username)));
    if (query.message) {
      const edited = await api.call("editMessageText", { chat_id: ctx.chatId, message_id: query.message.message_id, text: done, parse_mode: "HTML", reply_markup: { inline_keyboard: [] } });
      if (edited.ok) return;
    }
    return send(ctx.chatId, done);
  }

  async function cmdUnlink(ctx: Ctx): Promise<void> {
    if (!ctx.isPrivate) return send(ctx.chatId, msg(ctx.lang, "privateOnly"));
    if (!options.owner) return send(ctx.chatId, msg(ctx.lang, "error"));
    const [row] = await options.owner("select public._telegram_unlink($1::bigint) as removed", [String(ctx.userId)]);
    return send(ctx.chatId, msg(ctx.lang, row?.removed ? "unlinked" : "notLinkedNothing"));
  }

  // --- Kişisel komutlar ----------------------------------------------------------------------------------------------------------------------------------
  async function cmdMe(ctx: Ctx): Promise<void> {
    const who = await personal(ctx, "read", (tx, identity) => getWhoami(tx, identity, siteUrl));
    if (!who) return;
    const scope = msg(ctx.lang, who.scopes.includes("write") ? "scopeWrite" : "scopeRead");
    return send(ctx.chatId, msg(ctx.lang, "me", escapeHtml(who.user.username ?? "—"), escapeHtml(who.user.displayName ?? who.user.username ?? "—"), escapeHtml(scope)));
  }

  async function cmdMine(ctx: Ctx, args: string): Promise<void> {
    const word = args.trim().toLowerCase();
    const status = ["taslak", "draft"].includes(word) ? "draft" : ["yayinda", "published"].includes(word) ? "published" : null;
    const page = await personal(ctx, "read", (tx) => listMyPrompts(tx, siteUrl, { limit: 8, status }));
    if (!page) return;
    if (!page.items.length) return send(ctx.chatId, msg(ctx.lang, "mineEmpty"));
    const lines = [msg(ctx.lang, "mineTitle"), ""];
    page.items.forEach((item, index) => lines.push(`${index + 1}. <b>${escapeHtml(item.title)}</b> (${escapeHtml(msg(ctx.lang, item.status === "draft" ? "statusDraft" : "statusPublished"))})`));
    const rows = page.items.map((item, index) => [{ text: buttonLabel(`${index + 1}. ${item.title}`), callback_data: `m:${item.id}` }]);
    return send(ctx.chatId, lines.join("\n"), { reply_markup: { inline_keyboard: rows } });
  }

  async function showMine(ctx: Ctx, id: string): Promise<void> {
    if (!isId(id)) return send(ctx.chatId, msg(ctx.lang, "badId"));
    const prompt = await personal(ctx, "read", (tx) => getMyPrompt(tx, siteUrl, id));
    if (!prompt) return;
    const url = editUrl(siteUrl, "prompt", prompt.id);
    const head = `<b>${escapeHtml(prompt.title)}</b> (${escapeHtml(msg(ctx.lang, prompt.status === "draft" ? "statusDraft" : "statusPublished"))})\n\n`;
    const tail = `\n${link(url, msg(ctx.lang, "editOnSite"))}`;
    const clip = clipEscaped(prompt.promptText, Math.max(200, SAFE_TEXT_BUDGET - head.length - tail.length - 40));
    return send(ctx.chatId, `${head}<pre>${clip.html}</pre>${clip.clipped ? `\n${escapeHtml(msg(ctx.lang, "truncated"))}` : ""}${tail}`);
  }

  async function cmdDraft(ctx: Ctx, args: string): Promise<void> {
    const [titleLine, ...rest] = args.split(/\r?\n/);
    const title = (titleLine ?? "").trim();
    const text = rest.join("\n").trim();
    if (!title || !text) return send(ctx.chatId, msg(ctx.lang, "draftUsage"));
    const item = { title: title.slice(0, 200), description: "", promptText: text, contentType: "text" as const, category: null, subcategory: null, tools: [], tags: [], variables: [] };
    const report = await personal(ctx, "write", (tx) => importMyPrompts(tx, serializeJson([item]), false));
    if (!report) return;
    const first = (report.items[0] ?? {}) as { status?: string; id?: string; field?: string; code?: string };
    if (report.ok && first.status === "ok" && first.id) {
      return send(ctx.chatId, `${escapeHtml(msg(ctx.lang, "draftSaved"))}\n${link(editUrl(siteUrl, "prompt", first.id), msg(ctx.lang, "editOnSite"))}`);
    }
    if (first.status === "duplicate") return send(ctx.chatId, msg(ctx.lang, "draftDuplicate"));
    return send(ctx.chatId, msg(ctx.lang, "draftRefused", escapeHtml([first.field, first.code, first.status].filter(Boolean).join(" · ") || "?")));
  }

  async function cmdEdit(ctx: Ctx, args: string): Promise<void> {
    const [head, ...rest] = args.split(/\r?\n/);
    const value = rest.join("\n").trim();
    const [kindWord, id, fieldWord] = (head ?? "").trim().split(/\s+/);
    const parsedKind = kindWord ? splitKind(kindWord) : null;
    const field = fieldWord ? EDIT_FIELDS[fieldWord.toLowerCase()] : undefined;
    // `splitKind` bilinmeyen sözcüğü sorgu sayar; burada sözcüğün gerçekten bir tür adı olması şart.
    const kind: SearchKind | null = parsedKind && parsedKind.query === "" ? parsedKind.kind : null;
    if (!kind || !id || !field || !value) return send(ctx.chatId, msg(ctx.lang, "editUsage"));
    if (!isId(id)) return send(ctx.chatId, msg(ctx.lang, "badId"));
    if ((field === "promptText" && kind !== "prompt") || (field === "creativeDirection" && kind !== "request")) return send(ctx.chatId, msg(ctx.lang, "editUsage"));
    const result = await personal(ctx, "write", async (tx) => {
      // Aynı işlemde güncel sürüm okunur ve çakışma belirteci olarak kullanılır (`api_me_update_draft` kaydı kilitleyip yine de doğrular).
      const current = kind === "prompt" ? await getMyPrompt(tx, siteUrl, id) : await getMyContent(tx, siteUrl, kind, id);
      return updateMyDraft(tx, siteUrl, kind as MeDraftKind, id, { [field]: value }, String((current as { updatedAt?: unknown }).updatedAt ?? ""));
    });
    if (!result) return;
    return send(ctx.chatId, `${escapeHtml(msg(ctx.lang, "editDone", result.changed.join(", ")))}\n${link(result.editUrl, msg(ctx.lang, "editOnSite"))}`);
  }

  // --- Bildirim tercihleri -------------------------------------------------------------------------------------------------------------------------------
  async function notifyView(ctx: Ctx, change?: "weekly" | "activity"): Promise<void> {
    if (!ctx.isPrivate) return send(ctx.chatId, msg(ctx.lang, "privateOnly"));
    if (!options.owner) return send(ctx.chatId, msg(ctx.lang, "error"));
    const uid = String(ctx.userId);
    // `null` = dokunma → mevcut değerleri okumanın yolu (bağlı değilse satır dönmez).
    let [row] = await options.owner("select notify_weekly, notify_activity from public._telegram_set_notify($1::bigint, null, null)", [uid]);
    if (!row) return send(ctx.chatId, msg(ctx.lang, "notLinked"));
    if (change) {
      const weekly = change === "weekly" ? !row.notify_weekly : null;
      const activity = change === "activity" ? !row.notify_activity : null;
      [row] = await options.owner("select notify_weekly, notify_activity from public._telegram_set_notify($1::bigint, $2, $3)", [uid, weekly, activity]);
    }
    const w = Boolean(row?.notify_weekly);
    const a = Boolean(row?.notify_activity);
    const state = (on: boolean) => msg(ctx.lang, on ? "on" : "off");
    return send(ctx.chatId, msg(ctx.lang, "notifyStatus", state(w), state(a)), {
      reply_markup: { inline_keyboard: [[{ text: msg(ctx.lang, "toggleWeekly", state(!w)), callback_data: "n:w" }], [{ text: msg(ctx.lang, "toggleActivity", state(!a)), callback_data: "n:a" }]] },
    });
  }

  // --- Satır içi mod -------------------------------------------------------------------------------------------------------------------------------------
  async function onInline(query: TelegramInlineQuery): Promise<void> {
    const lang = langOf(query.from.language_code);
    const limited = await options.rateLimiter?.check(String(query.from.id));
    if (limited && !limited.allowed) {
      await api.call("answerInlineQuery", { inline_query_id: query.id, results: [], cache_time: 5, is_personal: true });
      return;
    }
    const { kind, query: text } = splitKind(query.query);
    const results: Record<string, unknown>[] = [];
    if (kind === "prompt") {
      // Seçilince tam metin yapışsın: özetler yerine tam promptlar (tek toplu okuma).
      const ids = text
        ? (await searchPrompts(client, { query: text, limit: INLINE_LIMIT })).items.map((item) => item.id)
        : (await popularPrompts(client, { period: "month", by: "copies", limit: INLINE_LIMIT })).map((item) => item.id);
      for (const prompt of await getPrompts(client, ids)) {
        const view = promptText(lang, prompt);
        results.push({
          type: "article",
          id: prompt.id,
          title: prompt.title,
          description: prompt.promptText.replace(/\s+/g, " ").slice(0, 120),
          input_message_content: { message_text: view.text, parse_mode: "HTML", disable_web_page_preview: true },
          reply_markup: { inline_keyboard: [[openButton(msg(lang, "openOnSite"), prompt.url)]] },
        });
      }
    } else {
      for (const item of (await searchPublicContent(client, kind, { query: text, limit: INLINE_LIMIT })).items) {
        const textHtml = `<b>${escapeHtml(item.title)}</b>\n${byline(lang, item.author.username, `@${item.author.username} · Promptly`)}\n\n${clipEscaped(item.description, 800).html}\n\n${link(item.url, msg(lang, "openOnSite"))}`;
        results.push({
          type: "article",
          id: item.id,
          title: item.title,
          description: item.description.slice(0, 120),
          input_message_content: { message_text: textHtml, parse_mode: "HTML", disable_web_page_preview: true },
          reply_markup: { inline_keyboard: [[openButton(msg(lang, "openOnSite"), item.url)]] },
        });
      }
    }
    await api.call("answerInlineQuery", { inline_query_id: query.id, results, cache_time: 30, is_personal: false });
  }

  // --- Yönlendirme ---------------------------------------------------------------------------------------------------------------------------------------
  async function onCommand(ctx: Ctx, name: string, args: string): Promise<void> {
    switch (name) {
      case "start": {
        const payload = /^link_([A-Za-z0-9-]{4,16})$/.exec(args.trim());
        if (payload) return cmdLink(ctx, payload[1]);
        return send(ctx.chatId, msg(ctx.lang, "welcome", escapeHtml(botName ?? "PromptlyBot")));
      }
      case "yardim": case "help": return send(ctx.chatId, msg(ctx.lang, "help"));
      case "ara": case "search": return cmdSearch(ctx, args);
      case "populer": case "popular": return cmdPopular(ctx, args);
      case "prompt": return args ? showPrompt(ctx, args.split(/\s+/)[0]) : send(ctx.chatId, msg(ctx.lang, "needId", "/prompt &lt;id&gt;"));
      case "istek": case "request": return args ? showContent(ctx, "request", args.split(/\s+/)[0]) : send(ctx.chatId, msg(ctx.lang, "needId", "/istek &lt;id&gt;"));
      case "hazirayar": case "ayar": case "preset": return args ? showContent(ctx, "preset", args.split(/\s+/)[0]) : send(ctx.chatId, msg(ctx.lang, "needId", "/hazirayar &lt;id&gt;"));
      case "workflow": return args ? showContent(ctx, "workflow", args.split(/\s+/)[0]) : send(ctx.chatId, msg(ctx.lang, "needId", "/workflow &lt;id&gt;"));
      case "doldur": case "fill": return cmdFill(ctx, args);
      case "baglan": case "link": return cmdLink(ctx, args);
      case "ayril": case "unlink": return cmdUnlink(ctx);
      case "ben": case "me": return cmdMe(ctx);
      case "benim": case "mine": return cmdMine(ctx, args);
      case "taslak": case "draft": return cmdDraft(ctx, args);
      case "duzenle": case "edit": return cmdEdit(ctx, args);
      case "bildirim": case "notify": return notifyView(ctx);
      default: return send(ctx.chatId, msg(ctx.lang, "unknown"));
    }
  }

  async function onMessage(message: TelegramMessage): Promise<void> {
    const from = message.from;
    if (!from || from.is_bot || !message.text) return;
    const ctx: Ctx = { lang: langOf(from.language_code), chatId: message.chat.id, userId: from.id, isPrivate: message.chat.type === "private", from };
    const command = parseCommand(message.text, botName);
    // Gruplarda komut olmayan yazıya karışılmaz; özel sohbette düz yazı arama sayılır.
    if (!command) {
      if (!ctx.isPrivate || message.text.startsWith("/")) return;
      if (!(await allowed(ctx))) return;
      return cmdSearch(ctx, message.text);
    }
    if (!(await allowed(ctx))) return;
    await onCommand(ctx, command.name, command.args);
  }

  async function onCallback(query: TelegramCallbackQuery): Promise<void> {
    const message = query.message;
    if (!message || !query.data) return void (await answerCallback(query.id));
    const ctx: Ctx = { lang: langOf(query.from.language_code), chatId: message.chat.id, userId: query.from.id, isPrivate: message.chat.type === "private", from: query.from };
    await answerCallback(query.id);
    if (!(await allowed(ctx))) return;
    const data = query.data;
    if (data.startsWith("p:")) return showPrompt(ctx, data.slice(2));
    if (data.startsWith("f:")) return fillTemplate(ctx, data.slice(2));
    if (data.startsWith("m:")) return showMine(ctx, data.slice(2));
    const content = /^c:([rwa]):(.+)$/.exec(data);
    if (content) return showContent(ctx, CALLBACK_KIND[content[1]], content[2]);
    if (data.startsWith("lk:")) return confirmLink(ctx, query, data.slice(3));
    if (data === "lx") {
      const edited = await api.call("editMessageText", { chat_id: ctx.chatId, message_id: message.message_id, text: msg(ctx.lang, "linkCancelled"), reply_markup: { inline_keyboard: [] } });
      if (!edited.ok) await send(ctx.chatId, msg(ctx.lang, "linkCancelled"));
      return;
    }
    if (data === "n:w") return notifyView(ctx, "weekly");
    if (data === "n:a") return notifyView(ctx, "activity");
  }

  /** Telegram kullanıcısı başına hız sınırı; aşılınca TEK kısa uyarı. */
  const warnedAt = new Map<number, number>();
  async function allowed(ctx: Ctx): Promise<boolean> {
    const result = await options.rateLimiter?.check(String(ctx.userId));
    if (result && !result.allowed) {
      // Taşkın yapana her mesajda cevap verme: kullanıcı başına 30 sn'de en çok bir uyarı.
      const now = Date.now();
      if (now - (warnedAt.get(ctx.userId) ?? 0) > 30_000) {
        if (warnedAt.size > 500) warnedAt.clear();
        warnedAt.set(ctx.userId, now);
        await send(ctx.chatId, msg(ctx.lang, "tooFast"));
      }
      return false;
    }
    return true;
  }

  return {
    async handleUpdate(update) {
      const target: Ctx | null = update.message?.from
        ? { lang: langOf(update.message.from.language_code), chatId: update.message.chat.id, userId: update.message.from.id, isPrivate: update.message.chat.type === "private", from: update.message.from }
        : update.callback_query?.message
          ? { lang: langOf(update.callback_query.from.language_code), chatId: update.callback_query.message.chat.id, userId: update.callback_query.from.id, isPrivate: update.callback_query.message.chat.type === "private", from: update.callback_query.from }
          : null;
      try {
        if (update.inline_query) return await onInline(update.inline_query);
        if (update.callback_query) return await onCallback(update.callback_query);
        if (update.message) return await onMessage(update.message);
      } catch (error) {
        if (target) await fail(target, error);
        else options.onError?.(error);
      }
    },
  };
}
