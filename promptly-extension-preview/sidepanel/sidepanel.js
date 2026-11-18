// Yan panel: "Şimdi" (az önce kullandığın + Çalıştı mı? + sonuç paylaş), kütüphane, taslaklar. Ağ yok.
const $ = (id) => document.getElementById(id);
const t = PUI.t;
const view = { tab: "now", query: "", open: null, file: null };
let data = null;

function showTab() {
  document.querySelectorAll("#tabs [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === view.tab));
  for (const id of ["now", "library", "drafts"]) $(id).hidden = id !== view.tab;
}

function renderNow() {
  const used = $("used"); used.replaceChildren();
  const lu = data.lastUsed;
  const item = lu && data.library.find((p) => p.id === lu.id);
  $("voteBox").hidden = $("resultBox").hidden = !item;
  if (!item) {
    const p = PUI.el("p", "empty");
    const [a, b] = t("nothingUsed", { k: "§" }).split("§");
    p.append(a, PUI.el("kbd", "", "Alt+Shift+P"), b);
    used.append(p);
  } else {
    const ul = PUI.el("ul", "list");
    const li = PUI.libraryRow(item, view, renderAll);
    ul.append(li); used.append(ul);
    const m = li.querySelector(".m"); m.append(PUI.el("span", "", PI.when(lu.at)));
    $("voteYes").innerHTML = PUI.icon("check") + "<span></span>";
    $("voteYes").lastChild.textContent = t("voteYes");
    $("voteYes").classList.toggle("chosen", lu.vote === "yes");
    $("voteNo").classList.toggle("chosen", lu.vote === "no");
    const voted = lu.vote !== null;
    $("voteYes").disabled = $("voteNo").disabled = voted;
    $("voteMsg").textContent = voted ? t("voteThanks", { n: item.score == null ? 0 : item.score }) : t("voteHint");
  }
  $("dropText").textContent = view.file ? view.file.name : t("dropHere") + " · " + t("dropTypes");
  $("sendResult").disabled = !view.file;
  const n = data.pending.length;
  const st = $("status");
  st.className = "banner " + (!data.session ? "" : !data.online ? "" : n ? "" : "ok");
  st.replaceChildren();
  st.insertAdjacentHTML("beforeend", PUI.icon(data.online && data.session ? "link" : "wifi"));
  st.append(PUI.el("span", "", !data.session ? t("statusSignedOut") : !data.online ? t("statusOffline") : n ? t("statusPending", { n }) : t("statusOnline")));
}

function renderLib() {
  const ul = $("libList"); ul.replaceChildren();
  const items = PUI.filterLibrary(data.library, view.query, "all");
  items.forEach((p) => ul.append(PUI.libraryRow(p, view, renderAll)));
  $("libEmpty").hidden = items.length > 0; $("libEmpty").textContent = t("noResults");
}
function renderDrafts() {
  const ul = $("draftList"); ul.replaceChildren();
  [...data.pending.map((d) => ["pending", d]), ...data.drafts.map((d) => ["draft", d])].forEach(([k, d]) => ul.append(PUI.draftRow(d, k)));
  const none = !data.pending.length && !data.drafts.length;
  $("draftEmpty").hidden = !none; $("draftEmpty").textContent = t("noDrafts");
}
function renderAll() {
  PUI.applyLang();
  $("lang").textContent = PI.getLang() === "tr" ? "EN" : "TR";
  showTab(); renderNow(); renderLib(); renderDrafts();
}

document.querySelectorAll("#tabs [data-tab]").forEach((b) => b.addEventListener("click", () => { view.tab = b.dataset.tab; renderAll(); }));
$("search").addEventListener("input", (e) => { view.query = e.target.value; renderLib(); });
$("lang").addEventListener("click", async () => { await PI.setLang(PI.getLang() === "tr" ? "en" : "tr"); renderAll(); });
$("voteYes").addEventListener("click", () => PStore.vote(true));
$("voteNo").addEventListener("click", () => PStore.vote(false));

function takeFile(f) {
  if (!f || !/^image\/(png|jpeg|webp)$/.test(f.type)) return;
  view.file = f;
  const img = $("dropImg"); img.hidden = false;
  if (img.src) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(f);
  renderNow();
}
$("file").addEventListener("change", (e) => takeFile(e.target.files[0]));
const drop = $("drop");
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("file").click(); } });
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); takeFile(e.dataTransfer.files[0]); });
$("sendResult").addEventListener("click", async () => {
  const lu = data.lastUsed; if (!lu || !view.file) return;
  await PStore.set({ results: [{ id: PStore.uid(), promptId: lu.id, name: view.file.name, at: new Date().toISOString() }, ...data.results] });
  view.file = null; $("dropImg").hidden = true; $("dropImg").removeAttribute("src");
  PUI.toast(t("resultSent"));
  renderNow();
});

chrome.storage.onChanged.addListener(async (_c, area) => { if (area === "local") { data = await PStore.getAll(); renderAll(); } });
(async function init() {
  await PI.init(); await PStore.seed();
  $("head-brand").innerHTML = PUI.brand(22);
  $("search-ico").innerHTML = PUI.icon("search");
  data = await PStore.getAll();
  renderAll();
})();
