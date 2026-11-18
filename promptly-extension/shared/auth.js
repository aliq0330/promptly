// Promptly uzantısı — giriş: sitenin KENDİ OAuth sunucusu (docs/history/317-*), `chrome.identity.launchWebAuthFlow` + PKCE (S256).
// Şifre uzantıya hiç girmez; Google ile kayıtlı hesaplar da girer. Verilen belirteç hesabın tamamı değil SINIRLI `pmt_` anahtarıdır
// (`read` + kullanıcı işaretlerse `write` = yalnız özel taslak). Yenileme belirteci her kullanımda döner; bu yüzden yenileme
// TÜM bağlamlar (arka plan, popup, yan panel) arasında tek kilitle (`navigator.locks`) sıraya girer — eski sürümdeki yarış bu.
self.PErr = self.PErr || class PErr extends Error {
  constructor(code, message, extra) {
    super(message || code);
    this.code = code;
    Object.assign(this, extra || {});
  }
};

self.PAuth = (() => {
  const cfg = self.PROMPTLY_CONFIG;
  const oauthBase = () => `${cfg.supabaseUrl}/functions/v1/oauth`;
  const SKEW_MS = 60_000;
  const SCOPE = "read write";

  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const randomString = (n = 48) => b64url(crypto.getRandomValues(new Uint8Array(n)));
  async function challengeOf(verifier) {
    return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  }
  function authorizeUrl({ clientId, redirectUri, challenge, state }) {
    const p = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state, scope: SCOPE });
    return `${oauthBase()}/authorize?${p.toString()}`;
  }
  // Yönlendirme adresinden kodu okur; durum (state) uyuşmazsa ya da kullanıcı reddettiyse hata.
  function parseRedirect(responseUrl, expectedState) {
    let u;
    try { u = new URL(responseUrl); } catch { throw new PErr("failed", "bad_redirect"); }
    const q = u.searchParams;
    if (q.get("error")) throw new PErr(q.get("error") === "access_denied" ? "cancelled" : "failed", q.get("error_description") || q.get("error"));
    if (q.get("state") !== expectedState) throw new PErr("failed", "state_mismatch");
    const code = q.get("code");
    if (!code) throw new PErr("failed", "missing_code");
    return code;
  }

  // Tek kilit: tarayıcıda `navigator.locks` (bağlamlar arası), yoksa süreç içi sıra.
  let chain = Promise.resolve();
  function withLock(fn) {
    if (self.navigator && navigator.locks && navigator.locks.request) return navigator.locks.request("promptly-auth", fn);
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  }

  async function oauthPost(path, params) {
    let res;
    try {
      res = await fetch(`${oauthBase()}/${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() });
    } catch { throw new PErr("offline", "network"); }
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  async function ensureClient(redirectUri) {
    const a = await PStore.get("auth");
    if (a && a.clientId && a.redirectUri === redirectUri) return a.clientId;
    let res;
    try {
      res = await fetch(`${oauthBase()}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: "Promptly Chrome uzantısı", client_uri: cfg.siteUrl, redirect_uris: [redirectUri] }),
      });
    } catch { throw new PErr("offline", "network"); }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.client_id) throw new PErr(res.status === 429 || res.status === 503 ? "rate_limited" : "failed", json.error_description || json.error || `register_${res.status}`);
    await PStore.set({ auth: { clientId: json.client_id, redirectUri } });
    return json.client_id;
  }

  function storeTokens(prev, tokens) {
    const scopes = String(tokens.scope || "").split(/\s+/).filter(Boolean);
    return {
      ...prev,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || prev.refreshToken,
      expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
      scopes: scopes.length ? scopes : prev.scopes || [],
    };
  }

  async function connect() {
    const redirectUri = chrome.identity.getRedirectURL();
    const clientId = await ensureClient(redirectUri);
    const verifier = randomString(48);
    const state = randomString(16);
    const url = authorizeUrl({ clientId, redirectUri, challenge: await challengeOf(verifier), state });
    let responseUrl;
    try {
      responseUrl = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
    } catch (e) {
      throw new PErr("cancelled", String((e && e.message) || e));
    }
    if (!responseUrl) throw new PErr("cancelled", "no_response");
    const code = parseRedirect(responseUrl, state);
    const { status, json } = await oauthPost("token", { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri, client_id: clientId });
    if (status !== 200 || !json.access_token) throw new PErr(status === 429 || status >= 500 ? "server" : "failed", json.error_description || json.error || `token_${status}`);
    const prev = (await PStore.get("auth")) || { clientId, redirectUri };
    const next = storeTokens(prev, json);
    await PStore.set({ auth: next, lastError: null });
    return next;
  }

  async function refresh(a) {
    const { status, json } = await oauthPost("token", { grant_type: "refresh_token", refresh_token: a.refreshToken, client_id: a.clientId });
    if (status === 200 && json.access_token) {
      const next = storeTokens(a, json);
      await PStore.set({ auth: next }); // dönen yeni yenileme belirteci kilidin İÇİNDE yazılır
      return next.accessToken;
    }
    if (status === 429) throw new PErr("rate_limited", "refresh_rate_limited");
    if (status >= 500 || status === 0) throw new PErr("server", "refresh_server");
    // 400/401: yenileme belirteci geçersiz/iptal → oturum gerçekten bitti (istemci kaydı kalır, tekrar kayıt gerekmez).
    await PStore.set({ auth: { clientId: a.clientId, redirectUri: a.redirectUri } });
    throw new PErr("unauthorized", json.error || "invalid_grant");
  }

  // Geçerli erişim belirtecini verir. `invalid` = az önce 401 alan belirteç: başka bağlam çoktan yenilediyse onu döner.
  function getToken(opts = {}) {
    return withLock(async () => {
      const a = await PStore.get("auth");
      if (!a || !a.refreshToken) throw new PErr("unauthorized", "signed_out");
      const fresh = a.accessToken && a.expiresAt - Date.now() > SKEW_MS;
      if (fresh && a.accessToken !== opts.invalid) return a.accessToken;
      return refresh(a);
    });
  }

  async function signOut() {
    const a = await PStore.get("auth");
    if (a && a.clientId && a.refreshToken) {
      try { await oauthPost("revoke", { client_id: a.clientId, token: a.refreshToken }); } catch { /* sunucu ulaşılmazsa yerel çıkış yine yapılır */ }
    }
    await PStore.set({ auth: a && a.clientId ? { clientId: a.clientId, redirectUri: a.redirectUri } : null });
  }

  const signedIn = async () => { const a = await PStore.get("auth"); return Boolean(a && a.refreshToken); };
  const canWrite = (a) => Boolean(a && Array.isArray(a.scopes) && a.scopes.includes("write"));

  return { SCOPE, connect, getToken, signOut, signedIn, canWrite, _test: { b64url, challengeOf, authorizeUrl, parseRedirect, ensureClient, storeTokens } };
})();
