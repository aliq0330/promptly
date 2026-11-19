#!/usr/bin/env node
// Arka plan / otomasyon için görsel → Promptly TASLAĞI köprüsü (docs/history/438-*).
//
// Neden var: ChatGPT uygulaması kapalıyken (zamanlanmış görev) istemci dosya başvurusunu `BLOCKED_FILE_REFERENCE` ile engeller; `attach_image` aracı hiç çağrılmaz.
// Görsel baytlarına sahip olan bir iş (cron, GitHub Actions, kendi sunucun…) onları DOĞRUDAN `media-upload` Edge Function'ına gönderir — tarayıcı, ChatGPT ya da
// herkese açık bir adres gerekmez. Bu betik o isteği yapar: görsel dosyasını (ya da herkese açık https adresini) kişisel API anahtarınla bir TASLAĞA ekler.
//
// Kullanım:
//   PROMPTLY_API_KEY=pmt_… PROMPTLY_SUPABASE_URL=https://<ref>.supabase.co \
//   node scripts/attach-draft-image.mjs --prompt-id <taslak-uuid> --generation-id promptly_visual_trend_2026-11-19T10:00 --file ./cikti.png [--alt "…"]
//   (ya da --url https://… ; --file ve --url birlikte verilmez)
//
// • Anahtar `write` kapsamlı olmalı; taslak SENİN, yayınlanmamış, `content_type: "image"` olmalı (önce save_prompt_draft / POST /v1/me/prompts).
// • `--generation-id` iş başına benzersizdir: aynı iş iki kez koşarsa ikinci ek/kopya dosya OLUŞMAZ (sonuçta `duplicate: true`). Bu yüzden ağ hatalarında kendiliğinden
//   yeniden denenir (en çok 3 deneme) — güvenlidir.
// • Hiçbir şey yayınlanmaz; çıktı JSON'dur: { …, pipeline: { draftCheck, imageSource, storageUpload, imageAttachment, published: false } }.
// • Anahtarı çıktıya/loga YAZMAZ. Çıkış kodu: 0 başarı (duplicate dahil), 1 hata, 2 kullanım hatası.

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const GENERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 8 * 1024 * 1024;
const RETRY_STATUS = new Set([429, 502, 503, 504]);

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (!["prompt-id", "generation-id", "file", "url", "alt"].includes(key)) throw new Error(`Unknown option: ${arg}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) throw new Error(`Option ${arg} needs a value.`);
    out[key] = value;
  }
  return out;
}

/** Çalıştırır; { code, result } döner (yazdırmaz — çağıran yazdırır; test edilebilir). `fetchImpl`/`sleep` test için enjekte edilir. */
export async function run(argv, env, { fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), read = readFile } = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    return { code: 2, result: { error: { code: "usage", message: error.message } } };
  }
  const usage = (message) => ({ code: 2, result: { error: { code: "usage", message } } });
  const key = env.PROMPTLY_API_KEY;
  const base = (env.PROMPTLY_MEDIA_UPLOAD_URL || (env.PROMPTLY_SUPABASE_URL ? `${env.PROMPTLY_SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/media-upload` : "")).replace(/\/+$/, "");
  if (!key || !key.startsWith("pmt_")) return usage("Set PROMPTLY_API_KEY to a Promptly API key (pmt_…) with the write scope.");
  if (!base) return usage("Set PROMPTLY_SUPABASE_URL (https://<ref>.supabase.co) or PROMPTLY_MEDIA_UPLOAD_URL.");
  if (!UUID.test(args["prompt-id"] ?? "")) return usage("--prompt-id must be the draft's UUID.");
  if (!GENERATION_ID.test(args["generation-id"] ?? "")) return usage("--generation-id is required: 1–120 characters, start with a letter or digit, then letters, digits and . _ : -");
  if (Boolean(args.file) === Boolean(args.url)) return usage("Pass exactly one of --file <path> or --url <https url>.");

  let request;
  if (args.file) {
    let bytes;
    try {
      bytes = await read(args.file);
    } catch {
      return usage(`Could not read ${args.file}.`);
    }
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return usage("The image must be between 1 byte and 8 MB (PNG, JPEG or WebP).");
    const query = new URLSearchParams({ prompt_id: args["prompt-id"], generation_id: args["generation-id"] });
    if (args.alt) query.set("alt", args.alt);
    request = { url: `${base}?${query}`, init: { method: "POST", headers: { "Content-Type": "application/octet-stream", Authorization: `Bearer ${key}` }, body: bytes } };
  } else {
    request = {
      url: base,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ prompt_id: args["prompt-id"], image_url: args.url, generation_id: args["generation-id"], alt: args.alt ?? null }),
      },
    };
  }

  let last = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let response;
    try {
      response = await fetchImpl(request.url, { ...request.init, signal: AbortSignal.timeout(60_000) });
    } catch {
      last = { code: 1, result: { error: { code: "network", message: "The image service did not answer.", attempts: attempt } } };
      if (attempt < 3) await sleep(1000 * attempt);
      continue;
    }
    const payload = await response.json().catch(() => null);
    if (response.ok && payload && !payload.error) return { code: 0, result: { ...payload, attempts: attempt } };
    last = { code: 1, result: { error: payload?.error ?? { code: "upstream", message: `The image service answered ${response.status}.` }, attempts: attempt } };
    // Yalnız geçici hatalar yeniden denenir; 4xx (yetki, taslak değil, geçersiz görsel…) denenmez. generation_id sayesinde yeniden deneme çift ek üretmez.
    if (!RETRY_STATUS.has(response.status) || attempt === 3) break;
    await sleep(1000 * attempt);
  }
  return last;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { code, result } = await run(process.argv.slice(2), process.env);
  console.log(JSON.stringify(result, null, 2));
  process.exit(code);
}
