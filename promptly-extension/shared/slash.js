// Promptly uzantısı — "/ ile aç" (site başına). Varsayılan KAPALI: sayfa erişimi yalnız kullanıcının verdiği site için istenir
// (`optional_host_permissions`) ve o siteye kalıcı bir içerik betiği kaydedilir; kapatınca izin ve betik kalkar.
// İzni popup'tan, kullanıcı hareketiyle (düğme tıklaması) isteriz; arka plan açılışta kayıtları izinlerle uzlaştırır.
self.PSlash = (() => {
  const CONTENT_FILES = ["config.js", "shared/i18n.js", "shared/vars.js", "content/overlay.js"];
  const idOf = (origin) => "slash-" + String(origin).replace(/[^a-zA-Z0-9]/g, "_");
  const patternOf = (origin) => `${origin}/*`;
  const okOrigin = (o) => /^https?:\/\/[^/\s]+$/.test(String(o || ""));

  async function origins() { return PStore.get("slashOrigins"); }
  async function isEnabled(origin) { return (await origins()).includes(origin); }

  async function register(origin) {
    const id = idOf(origin);
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
    if (existing.length) return;
    await chrome.scripting.registerContentScripts([{ id, matches: [patternOf(origin)], js: CONTENT_FILES, runAt: "document_idle", persistAcrossSessions: true }]);
  }
  async function unregister(origin) {
    try { await chrome.scripting.unregisterContentScripts({ ids: [idOf(origin)] }); } catch { /* kayıtlı değildi */ }
  }

  // Kullanıcı hareketi içinde çağrılmalı (permissions.request).
  async function enable(origin) {
    if (!okOrigin(origin)) throw new PErr("bad_request", "origin");
    const granted = await chrome.permissions.request({ origins: [patternOf(origin)] });
    if (!granted) return false;
    await register(origin);
    const list = await origins();
    if (!list.includes(origin)) await PStore.set({ slashOrigins: [...list, origin] });
    return true;
  }
  async function disable(origin) {
    await unregister(origin);
    try { await chrome.permissions.remove({ origins: [patternOf(origin)] }); } catch { /* zaten yoktu */ }
    await PStore.set({ slashOrigins: (await origins()).filter((o) => o !== origin) });
  }
  // İzni kullanıcı chrome://extensions'tan geri aldıysa ya da kayıt kaybolduysa listeyi ve kayıtları düzeltir.
  async function reconcile() {
    const list = await origins();
    const keep = [];
    for (const origin of list) {
      const has = await chrome.permissions.contains({ origins: [patternOf(origin)] });
      if (has) { await register(origin).catch(() => {}); keep.push(origin); } else await unregister(origin);
    }
    if (keep.length !== list.length) await PStore.set({ slashOrigins: keep });
  }
  return { CONTENT_FILES, idOf, okOrigin, isEnabled, enable, disable, reconcile };
})();
