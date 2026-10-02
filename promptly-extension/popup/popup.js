// Promptly Extension — popup
// Giriş + yakalanan metni kategori/etiketle Promptly'ye kaydetme. TR/EN.

const STORAGE_KEY = "pendingCapture";
const MAX_TAGS = 10;
const $ = (id) => document.getElementById(id);
const t = PromptlyI18n.t;

const els = {
  user: $("user"), logout: $("logout"), lang: $("lang"),
  login: $("login"), identifier: $("identifier"), password: $("password"),
  loginBtn: $("login-btn"), loginError: $("login-error"),
  empty: $("empty"), capture: $("capture"),
  done: $("done"), doneTitle: $("done-title"), doneLink: $("done-link"),
  title: $("title"), text: $("text"), count: $("count"), source: $("source"),
  type: $("type"), category: $("category"),
  subWrap: $("subcategory-wrap"), subcategory: $("subcategory"),
  tagChips: $("tag-chips"), tagInput: $("tag-input"), tagSuggest: $("tag-suggest"), tagNote: $("tag-note"),
  publish: $("publish"),
  saveBtn: $("save"), saveError: $("save-error"),
  copy: $("copy"), clear: $("clear"),
};

let session = null;
let currentCapture = null;
let savedResult = null; // { url, published }
let tags = [];          // [{slug,label}] | [{label,isNew:true}]
let suggestions = [];
let activeSuggest = -1;

const label = (o) => (PromptlyI18n.getLang() === "en" ? o.en : o.tr);
const showMessage = (el, msg) => { el.textContent = msg || ""; el.hidden = !msg; };

/* ---------- i18n + taksonomi ---------- */

function applyI18n() {
  document.documentElement.lang = PromptlyI18n.getLang();
  document.querySelectorAll("[data-i18n]").forEach((n) => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((n) => { n.placeholder = t(n.dataset.i18nPlaceholder); });
  document.querySelectorAll("[data-i18n-aria]").forEach((n) => { n.setAttribute("aria-label", t(n.dataset.i18nAria)); });
  els.lang.textContent = PromptlyI18n.getLang() === "tr" ? "EN" : "TR"; // geçilecek dil
  els.count.textContent = t("characters", { n: els.text.value.length });
  fillTypes();
  fillCategories(true);
  renderTags();
  if (savedResult) renderDone();
}

function option(value, text) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = text;
  return o;
}

function fillTypes() {
  const keep = els.type.value || "text";
  els.type.replaceChildren(
    ...[["text", "typeText"], ["image", "typeImage"], ["audio", "typeAudio"], ["video", "typeVideo"]]
      .map(([v, k]) => option(v, t(k))),
  );
  els.type.value = keep;
}

function fillCategories(keepSelection) {
  const prevCat = keepSelection ? els.category.value : "";
  const cats = PROMPTLY_TAXONOMY[els.type.value] || [];
  els.category.replaceChildren(option("", t("none")), ...cats.map((c) => option(c.id, label(c))));
  els.category.value = cats.some((c) => c.id === prevCat) ? prevCat : "";
  fillSubcategories(keepSelection);
}

function fillSubcategories(keepSelection) {
  const prevSub = keepSelection ? els.subcategory.value : "";
  const cat = (PROMPTLY_TAXONOMY[els.type.value] || []).find((c) => c.id === els.category.value);
  els.subWrap.hidden = !cat;
  if (!cat) { els.subcategory.replaceChildren(); return; }
  els.subcategory.replaceChildren(option("", t("none")), ...cat.subs.map((s) => option(s.id, label(s))));
  els.subcategory.value = cat.subs.some((s) => s.id === prevSub) ? prevSub : "";
}

els.type.addEventListener("change", () => fillCategories(false));
els.category.addEventListener("change", () => fillSubcategories(false));

els.lang.addEventListener("click", async () => {
  await PromptlyI18n.setLang(PromptlyI18n.getLang() === "tr" ? "en" : "tr");
  applyI18n();
});

/* ---------- etiketler ---------- */

const tagKey = (x) => (x.slug || x.label).toLowerCase();

function renderTags() {
  els.tagChips.replaceChildren(
    ...tags.map((tag, i) => {
      const chip = document.createElement("span");
      chip.className = tag.isNew ? "chip new" : "chip";
      chip.append(document.createTextNode(`#${tag.label}`));
      const rm = document.createElement("button");
      rm.type = "button";
      rm.textContent = "×";
      rm.setAttribute("aria-label", t("tagRemove", { label: tag.label }));
      rm.addEventListener("click", () => { tags.splice(i, 1); renderTags(); });
      chip.append(rm);
      return chip;
    }),
  );
  showMessage(els.tagNote, tags.length >= MAX_TAGS ? t("tagLimit", { n: MAX_TAGS }) : "");
}

function addTag(tag) {
  if (tags.length >= MAX_TAGS || tags.some((x) => tagKey(x) === tagKey(tag))) return;
  tags.push(tag);
  els.tagInput.value = "";
  closeSuggest();
  renderTags();
}

function closeSuggest() {
  els.tagSuggest.hidden = true;
  els.tagSuggest.replaceChildren();
  suggestions = [];
  activeSuggest = -1;
}

function paintSuggest() {
  els.tagSuggest.replaceChildren(
    ...suggestions.map((s, i) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === activeSuggest));
      li.textContent = s.isNew ? t("tagCreate", { label: s.label }) : `#${s.label}`;
      li.addEventListener("mousedown", (e) => { e.preventDefault(); addTag(s); });
      return li;
    }),
  );
  els.tagSuggest.hidden = suggestions.length === 0;
}

let searchSeq = 0;
let searchTimer = null;
els.tagInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = els.tagInput.value.trim();
  if (!q) { closeSuggest(); return; }
  searchTimer = setTimeout(async () => {
    const seq = ++searchSeq;
    const found = (await PromptlyApi.searchTags(q)).filter((x) => !tags.some((y) => tagKey(y) === tagKey(x)));
    if (seq !== searchSeq) return; // eski yanıt
    const exact = found.some((x) => x.label.toLowerCase() === q.toLowerCase());
    suggestions = exact ? found : [...found, { label: q, isNew: true }];
    activeSuggest = 0;
    paintSuggest();
  }, 200);
});

els.tagInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (!suggestions.length) return;
    e.preventDefault();
    activeSuggest = (activeSuggest + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length;
    paintSuggest();
  } else if (e.key === "Enter") {
    e.preventDefault(); // formu göndermesin
    const pick = suggestions[activeSuggest];
    if (pick) addTag(pick);
    else if (els.tagInput.value.trim()) addTag({ label: els.tagInput.value.trim(), isNew: true });
  } else if (e.key === "Escape") {
    closeSuggest();
  } else if (e.key === "Backspace" && !els.tagInput.value && tags.length) {
    tags.pop();
    renderTags();
  }
});
els.tagInput.addEventListener("blur", () => setTimeout(closeSuggest, 100));

/* ---------- görünüm ---------- */

function guessTitle(text) {
  const first = text.split("\n").find((l) => l.trim()) || "";
  const s = first.trim();
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

function renderDone() {
  els.doneTitle.textContent = t(savedResult.published ? "savedPublished" : "savedDraft");
  els.doneLink.href = savedResult.url;
  els.doneLink.textContent = t(savedResult.published ? "openPrompt" : "editAndPublish");
}

function render() {
  const loggedIn = Boolean(session);
  const has = Boolean(currentCapture && currentCapture.text);

  els.logout.hidden = !loggedIn;
  els.user.hidden = !loggedIn;
  els.login.hidden = loggedIn;
  els.done.hidden = !loggedIn || !savedResult;
  els.empty.hidden = !loggedIn || has || Boolean(savedResult);
  els.capture.hidden = !loggedIn || !has;
  if (!loggedIn || !has) return;

  // Kullanıcı düzenlemeye başladıysa ezme: yalnızca yeni yakalamada doldur.
  if (els.capture.dataset.capturedAt !== currentCapture.capturedAt) {
    els.capture.dataset.capturedAt = currentCapture.capturedAt;
    els.text.value = currentCapture.text;
    els.title.value = guessTitle(currentCapture.text);
    els.count.textContent = t("characters", { n: currentCapture.text.length });
    els.type.value = "text";
    fillCategories(false);
    tags = [];
    renderTags();
    showMessage(els.saveError, "");

    let href = "";
    try {
      const u = new URL(currentCapture.pageUrl);
      if (u.protocol === "http:" || u.protocol === "https:") href = u.href;
    } catch { /* geçersiz URL */ }
    els.source.hidden = !href;
    if (href) {
      els.source.href = href;
      els.source.textContent = currentCapture.pageTitle || new URL(href).hostname;
    }
  }
}

/* ---------- akışlar ---------- */

els.login.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage(els.loginError, "");
  els.loginBtn.disabled = true;
  try {
    session = await PromptlyApi.login(els.identifier.value, els.password.value);
    els.password.value = "";
    await loadUser();
    render();
  } catch (err) {
    showMessage(els.loginError, err.message);
  } finally {
    els.loginBtn.disabled = false;
  }
});

els.logout.addEventListener("click", async () => {
  await PromptlyApi.logout();
  session = null;
  render();
});

els.text.addEventListener("input", () => {
  els.count.textContent = t("characters", { n: els.text.value.length });
});

els.capture.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage(els.saveError, "");
  els.saveBtn.disabled = true;
  els.saveBtn.textContent = t("saving");
  try {
    const published = els.publish.checked;
    const result = await PromptlyApi.savePrompt({
      title: els.title.value,
      text: els.text.value,
      contentType: els.type.value,
      category: els.category.value,
      subcategory: els.subcategory.value,
      tags,
      sourceUrl: els.source.hidden ? "" : els.source.href,
      publish: published,
    });
    savedResult = { url: result.url, published };
    renderDone();
    await chrome.storage.local.remove(STORAGE_KEY);
    await chrome.action.setBadgeText({ text: "" });
  } catch (err) {
    showMessage(els.saveError, err.message);
  }
  els.saveBtn.disabled = false;
  els.saveBtn.textContent = t("save");
});

els.copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(els.text.value);
    els.copy.textContent = t("copied");
  } catch {
    els.copy.textContent = t("copyFailed");
  }
  setTimeout(() => (els.copy.textContent = t("copy")), 1500);
});

els.clear.addEventListener("click", async () => {
  await chrome.storage.local.remove(STORAGE_KEY);
  await chrome.action.setBadgeText({ text: "" });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[STORAGE_KEY]) return;
  currentCapture = changes[STORAGE_KEY].newValue || null;
  if (currentCapture) savedResult = null;
  if (!currentCapture) els.capture.dataset.capturedAt = "";
  render();
});

async function loadUser() {
  const profile = session ? await PromptlyApi.getProfile(session) : null;
  els.user.textContent = profile ? `@${profile.username}` : session?.email || "";
}

(async function init() {
  await PromptlyI18n.init();
  applyI18n();
  session = await PromptlyApi.getSession();
  currentCapture = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || null;
  render();
  if (session) loadUser();
  await chrome.action.setBadgeText({ text: "" });
})();
