// Uzantı betiklerini (tarayıcı global'li klasik betikler) Node'da bir vm bağlamında yükler: sahte chrome.storage, fetch, kilit yok.
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";

export const EXT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(keys) {
      if (keys == null) return { ...data };
      const list = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys);
      const out = {};
      for (const k of list) if (k in data) out[k] = structuredClone(data[k]);
      return out;
    },
    async set(obj) { for (const [k, v] of Object.entries(obj)) data[k] = structuredClone(v); },
    async remove(keys) { for (const k of [].concat(keys)) delete data[k]; },
  };
}

export function loadExtension({ files, fetch, storage, redirectUrl = "https://abc.chromiumapp.org/", flow } = {}) {
  const local = memoryStorage(storage);
  const calls = [];
  const sandbox = {
    console,
    crypto: webcrypto,
    URL, URLSearchParams, TextEncoder, AbortController,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    setTimeout, clearTimeout, setInterval, clearInterval, structuredClone, Promise, Date, JSON, Math,
    navigator: {},
    fetch: fetch || (async () => { throw new TypeError("no network"); }),
    chrome: {
      storage: { local },
      runtime: { id: "test" },
      i18n: { getUILanguage: () => "tr" },
      identity: {
        getRedirectURL: () => redirectUrl,
        launchWebAuthFlow: async (opts) => { calls.push(["launchWebAuthFlow", opts]); if (flow) return flow(opts); throw new Error("The user did not approve access."); },
      },
    },
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  const order = files || ["config.js", "shared/i18n.js", "shared/vars.js", "shared/store.js", "shared/auth.js", "shared/api.js", "shared/queue.js", "shared/library.js"];
  for (const f of order) vm.runInContext(fs.readFileSync(path.join(EXT_DIR, f), "utf8"), sandbox, { filename: f });
  return { ctx: sandbox, local, calls, PI: sandbox.PI, PVars: sandbox.PVars, PStore: sandbox.PStore, PAuth: sandbox.PAuth, PApi: sandbox.PApi, PQueue: sandbox.PQueue, PLib: sandbox.PLib, PErr: sandbox.PErr };
}

// Basit sahte HTTP: sıra ile yanıt verir; her çağrıyı kaydeder.
export function fakeFetch(handler) {
  const log = [];
  const fn = async (url, init = {}) => {
    const entry = { url: String(url), method: init.method || "GET", headers: init.headers || {}, body: init.body };
    log.push(entry);
    const r = await handler(entry, log.length - 1);
    if (r instanceof Error) throw r;
    const headers = new Map(Object.entries(r.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    return { ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: (k) => headers.get(String(k).toLowerCase()) ?? null }, json: async () => { if (r.json === undefined) throw new Error("no json"); return r.json; } };
  };
  fn.log = log;
  return fn;
}
