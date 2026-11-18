// Promptly uzantısı — yan panel bağlamı: açık sekme bir yapay zekâ sitesi mi, sayfada seçili metin ne?
// Sekme adresini okumak için kalıcı izin YOKTUR: kullanıcı isterse YALNIZ dört yapay zekâ sitesi için (`optional_host_permissions` içinde) izin verir;
// istediği an kaldırır. İzin yokken uzantı hiçbir sekmenin adresini ya da içeriğini okuyamaz.
self.PContext = (() => {
  const SELECTION_MAX = 5000;
  async function has() { try { return await chrome.permissions.contains({ origins: PPlatforms.origins() }); } catch { return false; } }
  // Kullanıcı hareketi (düğme tıklaması) içinde çağrılmalı.
  async function enable() { try { return await chrome.permissions.request({ origins: PPlatforms.origins() }); } catch { return false; } }
  async function disable() { try { await chrome.permissions.remove({ origins: PPlatforms.origins() }); } catch { /* zaten yoktu */ } }

  // Sonuç: { granted, platform (ya da null), selection, tab: { id, url, title } | null }
  async function read() {
    const granted = await has();
    let tab = null;
    try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); } catch { /* sekme okunamadı */ }
    const platform = granted && tab && tab.url ? PPlatforms.byUrl(tab.url) : null;
    let selection = "";
    if (platform && tab.id != null) {
      try {
        const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => String(window.getSelection() || "") });
        selection = String((r && r.result) || "").trim().slice(0, SELECTION_MAX);
      } catch { /* sayfa korumalı ya da kapandı */ }
    }
    return { granted, platform, selection, tab: tab ? { id: tab.id, url: tab.url || "", title: tab.title || "" } : null };
  }
  return { has, enable, disable, read, SELECTION_MAX };
})();
