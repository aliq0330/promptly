// Promptly Extension — popup
// Giriş + background.js'in yakaladığı metni Promptly'ye kaydetme.

const STORAGE_KEY = "pendingCapture";
const $ = (id) => document.getElementById(id);

const els = {
  user: $("user"), logout: $("logout"),
  login: $("login"), identifier: $("identifier"), password: $("password"),
  loginBtn: $("login-btn"), loginError: $("login-error"),
  empty: $("empty"), capture: $("capture"),
  title: $("title"), text: $("text"), count: $("count"), source: $("source"),
  type: $("type"), publish: $("publish"),
  saveBtn: $("save"), saveError: $("save-error"),
  done: $("done"), doneTitle: $("done-title"), doneLink: $("done-link"),
  copy: $("copy"), clear: $("clear"),
};

let session = null;
let currentCapture = null;
let savedResult = null;

function showMessage(el, msg) {
  el.textContent = msg || "";
  el.hidden = !msg;
}

function guessTitle(text) {
  const first = text.split("\n").find((l) => l.trim()) || "";
  const t = first.trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
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

  // Kullanıcı düzenlemeye başladıysa taslağı ezme: yalnızca yeni yakalamada doldur.
  if (els.capture.dataset.capturedAt !== currentCapture.capturedAt) {
    els.capture.dataset.capturedAt = currentCapture.capturedAt;
    els.text.value = currentCapture.text;
    els.title.value = guessTitle(currentCapture.text);
    els.count.textContent = `${currentCapture.text.length} karakter`;
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
  els.count.textContent = `${els.text.value.length} karakter`;
});

els.capture.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage(els.saveError, "");
  els.saveBtn.disabled = true;
  try {
    const result = await PromptlyApi.savePrompt({
      title: els.title.value,
      text: els.text.value,
      contentType: els.type.value,
      sourceUrl: els.source.hidden ? "" : els.source.href,
      publish: els.publish.checked,
    });
    const published = els.publish.checked;
    savedResult = result;
    els.doneTitle.textContent = published ? "Yayınlandı ✦" : "Taslak olarak kaydedildi ✦";
    els.doneLink.href = result.url;
    els.doneLink.textContent = published ? "Prompt'u aç" : "Düzenle ve yayınla";
    await chrome.storage.local.remove(STORAGE_KEY);
    await chrome.action.setBadgeText({ text: "" });
  } catch (err) {
    showMessage(els.saveError, err.message);
  }
  els.saveBtn.disabled = false;
});

els.copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(els.text.value);
    els.copy.textContent = "Kopyalandı";
  } catch {
    els.copy.textContent = "Kopyalanamadı";
  }
  setTimeout(() => (els.copy.textContent = "Kopyala"), 1500);
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
  session = await PromptlyApi.getSession();
  currentCapture = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || null;
  render();
  if (session) loadUser();
  await chrome.action.setBadgeText({ text: "" });
})();
