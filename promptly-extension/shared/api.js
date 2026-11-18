// Promptly uzantısı — açık API istemcisi (`/functions/v1/api/v1`, docs/developers). Kişisel uçlar OAuth belirteciyle, herkese açık uçlar belirteçsiz.
// Yazma YALNIZ `POST /v1/me/prompts` (sunucu hep özel TASLAK yazar: yayınlama, görünürlük, silme yoktur) + `media-upload` (taslağa görsel).
self.PApi = (() => {
  const cfg = self.PROMPTLY_CONFIG;
  const apiBase = () => `${cfg.supabaseUrl}/functions/v1/api/v1`;
  const mediaUrl = () => `${cfg.supabaseUrl}/functions/v1/media-upload`;
  const TIMEOUT_MS = 20_000;

  function toError(status, json, headers) {
    const e = (json && json.error) || {};
    const message = typeof e === "string" ? e : e.message || "";
    if (status === 401) return new PErr("unauthorized", message, { status });
    if (status === 403) return new PErr(/scope/i.test(`${e.code || ""} ${message}`) ? "insufficient_scope" : "forbidden", message, { status });
    if (status === 404) return new PErr("not_found", message, { status });
    if (status === 429) return new PErr("rate_limited", message, { status, retryAfter: Number(headers && headers.get && headers.get("retry-after")) || 0 });
    if (status >= 500) return new PErr("server", message, { status });
    return new PErr(status === 422 ? "invalid" : "bad_request", message, { status });
  }

  // auth=true: Bearer ekler; 401'de belirteci bir kez yenileyip yeniden dener. raw=true: 422 gövdesini hata yerine döndürür (içe aktarma raporu).
  async function call(url, { method = "GET", body, auth = false, raw = false } = {}, retried = false) {
    const headers = { Accept: "application/json" };
    let token = null;
    if (auth) { token = await PAuth.getToken(); headers.Authorization = `Bearer ${token}`; }
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let res;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
    } catch {
      throw new PErr("offline", "network");
    } finally { clearTimeout(timer); }
    const json = await res.json().catch(() => null);
    if (res.status === 401 && auth && !retried) {
      await PAuth.getToken({ invalid: token }); // başka bağlam yenilediyse onu alır, yoksa yeniler; başarısızsa fırlatır
      return call(url, { method, body, auth, raw }, true);
    }
    if (res.ok || (raw && res.status === 422)) return json;
    throw toError(res.status, json, res.headers);
  }

  const qs = (obj) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v)) { for (const x of v) if (x !== undefined && x !== null && x !== "") p.append(k, String(x)); }
      else if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  const me = () => call(`${apiBase()}/me`, { auth: true });
  const myPrompts = ({ status, limit, cursor } = {}) => call(`${apiBase()}/me/prompts${qs({ status, limit, cursor })}`, { auth: true });
  const myPrompt = (id) => call(`${apiBase()}/me/prompts/${encodeURIComponent(id)}`, { auth: true });
  const mySaved = ({ limit, cursor } = {}) => call(`${apiBase()}/me/saved${qs({ limit, cursor })}`, { auth: true });
  const popular = ({ limit, contentType, by, period } = {}) => call(`${apiBase()}/prompts/popular${qs({ limit, content_type: contentType, by, period })}`);
  // tools: araç başvuruları (biri yeter), tags: etiket slug'ları (hepsi gerekir) — sunucu kuralı.
  const search = ({ q, contentType, limit, cursor, sort, tools, tags, category } = {}) => call(`${apiBase()}/prompts${qs({ q, content_type: contentType, limit, cursor, sort, tool: tools, tag: tags, category })}`);
  const prompt = (id) => call(`${apiBase()}/prompts/${encodeURIComponent(id)}`);
  // Herkese açık workflow'lar (adımlar: başlık, açıklama, yönerge, varsa herkese açık prompt'un kimlik + başlığı).
  const workflows = ({ q, limit, cursor } = {}) => call(`${apiBase()}/workflows${qs({ q, limit, cursor })}`);
  const workflow = (id) => call(`${apiBase()}/workflows/${encodeURIComponent(id)}`);

  // Kimlik: kullanıcı adı + kapsamlar (`/me`); oturum kaydına yazılır.
  async function syncIdentity() {
    const info = await me();
    const a = (await PStore.get("auth")) || {};
    const scopes = Array.isArray(info.scopes) ? info.scopes : a.scopes || [];
    await PStore.set({ auth: { ...a, scopes, user: { username: info.user && info.user.username, displayName: info.user && info.user.displayName } } });
    return info;
  }

  async function savePrompts(file) {
    return call(`${apiBase()}/me/prompts`, { method: "POST", body: file, auth: true, raw: true });
  }
  async function attachImage(promptId, imageUrl, alt) {
    return call(mediaUrl(), { method: "POST", body: { prompt_id: promptId, image_url: imageUrl, ...(alt ? { alt } : {}) }, auth: true });
  }

  // Bir yakalamayı özel taslak olarak gönderir (+ görsel). Sonuç: { id, duplicate, editUrl, imageError }.
  async function sendDraft(draft) {
    const report = await savePrompts(PVars.buildPromptsFile(draft));
    const r = PVars.readImportReport(report);
    if (r.status === "invalid") throw new PErr("invalid", `${r.field}:${r.code}`, { field: r.field, detail: r.code });
    if (r.status === "unknown") throw new PErr("server", "empty_report");
    const out = { id: r.id, duplicate: r.status === "duplicate", editUrl: r.id ? `${cfg.siteUrl}/create/?edit=${r.id}` : null, imageError: null };
    if (draft.imageUrl && draft.type === "image" && r.status === "ok" && r.id) {
      if (!PVars.imageUploadable(draft.imageUrl)) out.imageError = "https";
      else {
        try { await attachImage(r.id, draft.imageUrl, draft.title); } catch (e) { out.imageError = (e && (e.message || e.code)) || "error"; }
      }
    }
    return out;
  }

  return { call, me, myPrompts, myPrompt, mySaved, popular, search, prompt, workflows, workflow, syncIdentity, savePrompts, attachImage, sendDraft, _test: { toError, qs } };
})();
