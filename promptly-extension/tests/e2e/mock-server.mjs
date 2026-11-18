// Uçtan uca test için sahte Promptly sunucusu: açık API, kişisel uçlar, OAuth belirteç ucu ve media-upload. Gelen yazmaları kaydeder.
import http from "node:http";

export function startMock() {
  const state = { posts: [], media: [], refreshes: 0, hits: [], failTitle: "BOZUK", down: false, scopes: ["read", "write", "interact"], writes: [], eng: {} };
  const mine = [
    { id: "m1", title: "Sisli sabah ormanı", description: "", contentType: "image", status: "published", visibility: "public", url: "https://site.example/prompts/local?id=m1", createdAt: "x", updatedAt: "x" },
    { id: "m2", title: "Haftalık bülten özeti", description: "", contentType: "text", status: "published", visibility: "public", url: "https://site.example/prompts/local?id=m2", createdAt: "x", updatedAt: "x" },
  ];
  const texts = {
    m1: { promptText: "Sisli bir sabah ormanında yürüyen kız, {mekan} atmosferi, 35mm", variables: ["mekan"] },
    m2: { promptText: "{okur} için {ton} bir bülten özeti yaz.", variables: ["okur", "ton"] },
    p1: { promptText: "Işıldayan kanatlı bir orman perisi, {renk} tonlarında", variables: [{ name: "renk", defaultValue: "mavi" }] },
    c1: { promptText: "Şunu üç maddede özetle: {seçim}", variables: ["seçim"] },
    j1: { promptText: '{"prompt": "a {subject} portrait", "style": "noir", "steps": 30}', variables: ["subject"] },
  };
  const pub = (id, title, type = "image") => ({ id, title, description: "", contentType: type, tools: ["midjourney"], author: { username: "ayse" }, promptPreview: "...", variableNames: [], url: `https://site.example/prompts/local?id=${id}` });
  // Benim durumum: kimlik başına (tepki, kaydet, koleksiyonlar, takip, oy). Yazmalar bunu değiştirir; okuma güncel hâli verir.
  const engOf = (id) => (state.eng[id] ??= { reaction: null, saved: false, collectionIds: [], authorUsername: "ayse", followingAuthor: false, works: { yes: 3, no: 0, myVote: null, canVote: id === "p1" } });
  const KNOWN = new Set(["p1", "p2", "j1", "f1", "f2", "f3", "g1", "k1", "e1", "e2", "c1", "s1"]);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    state.hits.push(`${req.method} ${url.pathname}${url.search}`);
    const send = (status, json, headers = {}) => { res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...headers }); res.end(JSON.stringify(json)); };
    if (req.method === "OPTIONS") return send(204, {});
    const p = url.pathname;
    if (p.endsWith("/oauth/token")) { state.refreshes += 1; return send(200, { token_type: "Bearer", access_token: "TOK" + (state.refreshes + 1), refresh_token: "R" + (state.refreshes + 1), expires_in: 3600, scope: state.scopes.join(" ") }); }
    if (p.endsWith("/oauth/revoke")) return send(200, {});
    if (p.endsWith("/media-upload")) { state.media.push(JSON.parse(raw)); return send(200, { ok: true }); }
    if (!p.includes("/api/v1/")) return send(404, { error: { code: "not_found", message: "x" } });
    const r = p.split("/api/v1")[1];
    const authed = /^Bearer TOK/.test(req.headers.authorization || "") || req.headers.authorization === "Bearer LIVE";
    if (r.startsWith("/me")) {
      if (!authed) return send(401, { error: { code: "unauthorized", message: "no key" } });
      if (state.down) return send(503, { error: { code: "server", message: "down" } });
      if (r === "/me") return send(200, { user: { id: "u", username: "aliq", displayName: "Ali" }, scopes: state.scopes, via: "oauth" });
      if (r === "/me/feed") {
        const tab = url.searchParams.get("tab"), cursor = url.searchParams.get("cursor");
        if (tab === "following") return send(200, { tab, items: [pub("g1", "Takipten gelen kart")], nextCursor: null });
        if (cursor === "n2") return send(200, { tab, items: [pub("f3", "Sana özel ikinci sayfa")], nextCursor: null });
        return send(200, { tab, items: [{ ...pub("f1", "Sana özel kart"), reason: { kind: "tag", ref: "neon" } }, { ...pub("f2", "Nedensiz kart"), reason: { kind: "popular", ref: null } }], nextCursor: "n2" });
      }
      if (r === "/me/collections") return send(200, { items: [{ id: "col1", name: "Logolar", visibility: "private", promptCount: 1, shared: false, mine: true, ownerUsername: "aliq" }] });
      if (r === "/me/collections/col1/prompts") return send(200, { items: [pub("k1", "Koleksiyondaki prompt")], nextCursor: null });
      if (r === "/me/engagement") {
        const ids = (url.searchParams.get("ids") || "").split(",").filter((id) => KNOWN.has(id));
        return send(200, { items: Object.fromEntries(ids.map((id) => [id, engOf(id)])) });
      }
      let w;
      if (req.method !== "GET" && (w = /^\/me\/(prompts\/([^/]+)\/(reaction|saved|works)|collections\/([^/]+)\/prompts\/([^/]+)|following\/([^/]+))$/.exec(r))) {
        state.writes.push(`${req.method} ${r}${raw ? " " + raw : ""}`);
        if (!state.scopes.includes("interact")) return send(403, { error: { code: "insufficient_scope", message: "This credential does not have the \"interact\" scope." } });
        const on = req.method === "PUT", body = raw ? JSON.parse(raw) : {};
        if (w[3] === "reaction") { engOf(w[2]).reaction = on ? body.reaction || "love" : null; return send(200, { reaction: engOf(w[2]).reaction }); }
        if (w[3] === "saved") { const e = engOf(w[2]); e.saved = on; if (!on) e.collectionIds = []; return send(200, { saved: on }); }
        if (w[3] === "works") { const e = engOf(w[2]); e.works.myVote = on ? body.works : null; return send(200, { works: { yes: 3 + (e.works.myVote === true ? 1 : 0), no: e.works.myVote === false ? 1 : 0, myVote: e.works.myVote } }); }
        if (w[4]) { const e = engOf(w[5]); e.collectionIds = on ? [...new Set([...e.collectionIds, w[4]])] : e.collectionIds.filter((c) => c !== w[4]); if (on) e.saved = true; return send(200, { inCollection: on }); }
        if (w[6]) { for (const e of Object.values(state.eng)) if (e.authorUsername === w[6]) e.followingAuthor = on; for (const id of KNOWN) if (engOf(id).authorUsername === w[6]) engOf(id).followingAuthor = on; return send(200, { following: on }); }
      }
      if (r === "/me/prompts" && req.method === "POST") {
        const file = JSON.parse(raw); const item = file.items[0];
        if (!state.scopes.includes("write")) return send(403, { error: { code: "insufficient_scope", message: "This key needs the write scope." } });
        if (item.title.startsWith(state.failTitle)) return send(422, { dryRun: false, ok: false, created: 0, items: [{ index: 0, status: "invalid", field: "title", code: "required" }] });
        state.posts.push(file);
        return send(200, { ok: true, created: 1, items: [{ index: 0, status: "ok", id: "new-" + state.posts.length }] });
      }
      if (r === "/me/prompts") return send(200, { items: url.searchParams.get("status") === "draft" ? [{ ...mine[0], id: "d1", title: "Eski taslak", status: "draft", visibility: "private" }] : mine, nextCursor: null });
      if (r === "/me/saved") return send(200, { items: [{ id: "s1", title: "Kaydettiğim prompt", description: "", contentType: "text", url: "https://site.example/prompts/local?id=s1", savedAt: "x" }], nextCursor: null });
      const m = /^\/me\/prompts\/(.+)$/.exec(r);
      if (m && texts[m[1]]) return send(200, { id: m[1], ...texts[m[1]] });
    }
    if (r === "/prompts/p1/results") return send(200, { items: [{ id: "r1", author: { username: "ali", displayName: "Ali" }, mediaType: "text", imageUrl: null, text: "Harika çıktı aldım", tool: "midjourney", modified: true, modificationSummary: "rengi değiştirdim", likes: 4, comments: 1, createdAt: "2026-11-01T00:00:00Z", url: "https://site.example/results/local?id=r1" }], nextCursor: null });
    if (r === "/prompts/p1/versions") return send(200, { items: [{ id: "v2", versionNumber: 2, title: "Orman perisi v2", description: "", promptText: "İkinci sürüm {renk}", tool: null, source: "edit", author: { username: "ayse", displayName: null }, createdAt: "2026-11-02T00:00:00Z" }, { id: "v1", versionNumber: 1, title: "Orman perisi", description: "", promptText: "İlk sürüm", tool: null, source: "edit", author: { username: "ayse", displayName: null }, createdAt: "2026-11-01T00:00:00Z" }], nextCursor: null });
    if (r === "/prompts/p1/comments") return send(200, { items: [{ id: "k1", author: { username: "ali", displayName: "Ali" }, text: "Üst yorum", likes: 2, pinned: true, edited: false, createdAt: "2026-11-03T00:00:00Z", replies: [{ id: "k2", author: { username: "ayse", displayName: null }, text: "Yanıt yorumu", likes: 0, pinned: false, edited: false, createdAt: "2026-11-03T01:00:00Z", replies: [] }] }], nextCursor: null });
    if (r.startsWith("/prompts/popular")) return send(200, { items: [pub("p1", "Orman perisi karakter")] });
    if (r === "/prompts") {
      const q = url.searchParams.get("q") || "", tags = url.searchParams.getAll("tag"), tools = url.searchParams.getAll("tool");
      if (tools.includes("chatgpt")) return send(200, { items: [{ ...pub("c1", "ChatGPT özet promptu", "text"), tools: ["chatgpt"], variableNames: ["seçim"] }], nextCursor: null });
      if (url.searchParams.get("sort") === "popular" && !q && !tags.length) return send(200, { items: [{ ...pub("p1", "Orman perisi karakter"), variableNames: ["renk"], stats: { likes: 3, saves: 1, comments: 0, copies: 9 }, thumbnailUrl: "https://img.example.test/p1.png", works: { yes: 9, no: 1 } }, { ...pub("p2", "Değişkensiz resim"), thumbnailUrl: "https://img.example.test/gone.png", works: { yes: 1, no: 1 } }, { ...pub("j1", "Yapılandırılmış prompt", "text"), variableNames: ["subject"] }], nextCursor: null });
      return send(200, { items: [{ ...pub("e1", "Keşfet sonucu: " + (q || "yeni") + (tags.length ? " #" + tags.join(",") : "")), variableNames: ["renk"] }, pub("e2", "Değişkensiz sonuç")], nextCursor: null });
    }
    if (r === "/workflows") return send(200, { items: [{ id: "w1", kind: "workflow", title: "Ürün lansmanı", stepCount: 2, author: { username: "ayse" } }], nextCursor: null });
    if (r === "/workflows/w1") return send(200, { id: "w1", title: "Ürün lansmanı", url: "https://site.example/workflows/local?id=w1", steps: [{ position: 1, title: "Özet", description: "Önce özetle.", instructions: "", prompt: { id: "c1", title: "ChatGPT özet promptu" } }, { position: 2, title: "Duyuru", description: "", instructions: "Elle duyuru yaz.", prompt: null }] });
    const m = /^\/prompts\/(.+)$/.exec(r);
    if (m && texts[m[1]]) return send(200, { id: m[1], ...texts[m[1]] });
    return send(404, { error: { code: "not_found", message: "x" } });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ port: server.address().port, state, close: () => server.close() })));
}

// Test sayfası sunucusu (ayrı kaynak = ayrı origin): seçilecek metin, görsel, sohbet kutusu.
export function startPage() {
  const html = `<!doctype html><meta charset="utf-8"><title>Orman promptları</title>
  <body style="font:16px system-ui;padding:24px"><h1>Orman promptları</h1>
  <p id="pr">Sisli bir sabah ormanında yürüyen kız, [mekan] atmosferi, 35mm</p>
  <img id="pic" alt="" width="80" height="60" src="data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E">
  <textarea id="chat" rows="4" cols="50"></textarea><input id="plain" type="text"></body>`;
  const server = http.createServer((req, res) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(html); });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ port: server.address().port, close: () => server.close() })));
}
