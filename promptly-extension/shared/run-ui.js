// Promptly uzantısı — "Çalıştır" arayüzü: bölünmüş düğme, hedef menüsü, çalıştırma + bildirim. popup, yan panel ve kütüphane satırları AYNI parçaları kullanır.
// Mantık (karar/yazma) shared/platforms.js'te; burada yalnız DOM ve metinler vardır.
self.PRunUI = (() => {
  const { el, btn, icon } = PUI;
  const t = PUI.t;
  let current = PPlatforms.DEFAULT_ID;
  const subs = new Set();
  const nameOf = (id) => (PPlatforms.byId(id) || PPlatforms.byId(PPlatforms.DEFAULT_ID)).name;

  function notify() { for (const s of [...subs]) { if (!s.node.isConnected) subs.delete(s); else s.fn(current); } }
  async function init() {
    const id = await PStore.get("platform");
    current = PPlatforms.byId(id) ? id : PPlatforms.DEFAULT_ID;
    if (!init.bound) {
      init.bound = true;
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.platform && PPlatforms.byId(changes.platform.newValue)) { current = changes.platform.newValue; notify(); }
      });
    }
    return current;
  }
  const currentId = () => current;
  async function setPlatform(id) { if (!PPlatforms.byId(id)) return; current = id; await PStore.set({ platform: id }); notify(); }
  const watch = (node, fn) => { subs.add({ node, fn }); fn(current); };

  function say(res) {
    const name = res.platform.name;
    const key = res.mode === "insert" ? "runInserted" : res.mode === "open" ? "runOpened" : res.mode === "copy-open" ? (res.copied ? "runCopiedOpened" : "runFailed") : (res.copied ? "runCopiedOnly" : "runFailed");
    PUI.toast(t(key, { name }));
  }

  // Bir promptun çözümlenmiş metni. `values`: kullanıcı değerleri; `selection`: sayfada seçili metin ({seçim} değişkenine yazılır).
  async function resolveText(item, values, selection) {
    const data = await PLib.text(item);
    const names = PVars.variablesOf(data.text);
    const merged = Object.assign({}, selection ? PBrowse.selectionValues(names, selection) : {}, values || {});
    const text = PVars.resolve(data.text, data.variables, merged);
    return { text, data, names, left: PVars.variablesOf(text) };
  }
  // Çalıştırır. Doldurulmamış değişken kalırsa `force` yoksa DURUR ({ needVars }): ham {değişken} jetonu yapay zekâya gitmesin.
  async function runItem(item, { values, selection, platformId, force } = {}) {
    let r;
    try { r = await resolveText(item, values, selection); } catch (err) { PUI.toast(PUI.errText(err)); return null; }
    if (r.left.length && !force) { PUI.toast(t("runNeedVars")); return { needVars: true, names: r.left }; }
    try { await PLib.markUsed(item); } catch { /* son kullanılan yazılamadı: çalıştırmayı engellemez */ }
    const res = await PPlatforms.run(platformId || current, r.text);
    say(res);
    return res;
  }

  // Hedef menüsü: her satırda yöntem yazar (bu sekmeye yazar / adresle açar / kopyalar ve açar).
  async function openMenu(anchor, onPick) {
    document.querySelectorAll(".pmenu").forEach((n) => n.remove());
    let activeUrl = "";
    try { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); activeUrl = (tab && tab.url) || ""; } catch { /* okunamadı */ }
    const here = PPlatforms.byUrl(activeUrl);
    const m = el("div", "pmenu"); m.setAttribute("role", "menu");
    m.append(el("div", "label", t("runWhere")));
    for (const p of PPlatforms.LIST) {
      const how = here && here.id === p.id ? "runHowInsert" : p.app ? "runHowApp" : p.build ? "runHowOpen" : "runHowCopy";
      const b = el("button", "pitem" + (p.id === current ? " on" : "")); b.type = "button"; b.setAttribute("role", "menuitemradio"); b.setAttribute("aria-checked", String(p.id === current));
      b.append(el("span", "pname", p.name), el("span", "phow", t(how)));
      b.addEventListener("click", () => { close(); onPick(p.id); });
      m.append(b);
    }
    m.append(el("div", "hint", t("runNoAuto")));
    document.body.append(m);
    const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    const top = r.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6;
    m.style.left = `${left}px`; m.style.top = `${top}px`;
    function close() { m.remove(); document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", key, true); }
    function away(e) { if (!m.contains(e.target) && e.target !== anchor) close(); }
    function key(e) { if (e.key === "Escape") { e.stopPropagation(); close(); anchor.focus(); } }
    setTimeout(() => { document.addEventListener("pointerdown", away, true); document.addEventListener("keydown", key, true); }, 0);
    const first = m.querySelector(".pitem.on") || m.querySelector(".pitem"); if (first) first.focus();
  }

  // Bölünmüş düğme: sol = seçili hedefte çalıştır, sağ ▾ = hedef seç (seçilen hemen çalıştırır ve hedef olarak hatırlanır).
  function splitButton(onRun, { small } = {}) {
    const wrap = el("div", "split" + (small ? " sm" : ""));
    const main = btn("splitmain", "", () => onRun(undefined));
    const chev = btn("splitchev", "", null);
    chev.innerHTML = icon("chevron"); chev.title = t("runMenu"); chev.setAttribute("aria-label", t("runMenu")); chev.setAttribute("aria-haspopup", "menu");
    chev.addEventListener("click", (e) => { e.stopPropagation(); openMenu(chev, async (id) => { await setPlatform(id); onRun(id); }); });
    watch(wrap, (id) => { main.innerHTML = icon("play"); main.append(document.createTextNode(t("runOnPlatform", { name: nameOf(id) }))); });
    wrap.append(main, el("span", "splitsep"), chev);
    return wrap;
  }

  // Üst çubuktaki hedef seçici (<select>): popup başlığında.
  function targetSelect(select) {
    select.replaceChildren();
    for (const p of PPlatforms.LIST) { const o = el("option", "", p.name); o.value = p.id; select.append(o); }
    select.addEventListener("change", () => setPlatform(select.value));
    watch(select, (id) => { select.value = id; });
  }

  return { init, currentId, setPlatform, nameOf, say, resolveText, runItem, openMenu, splitButton, targetSelect, watch };
})();
