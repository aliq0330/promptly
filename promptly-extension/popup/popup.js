// Promptly Extension — popup
// Giriş + yerel kuyruk (bekleyenler) + taslaklara kaydedilenler. Yayınlama burada yok.

const $ = (id) => document.getElementById(id);
const t = PromptlyI18n.t;

const els = {
  user: $("user"), logout: $("logout"), lang: $("lang"),
  login: $("login"), identifier: $("identifier"), password: $("password"),
  loginBtn: $("login-btn"), loginError: $("login-error"),
  pending: $("pending"), pendingTitle: $("pending-title"), pendingNote: $("pending-note"),
  pendingError: $("pending-error"), pendingList: $("pending-list"), retry: $("retry"),
  saved: $("saved"), savedList: $("saved-list"),
  empty: $("empty"),
};

let session = null;

const showMessage = (el, msg) => { el.textContent = msg || ""; el.hidden = !msg; };

function applyI18n() {
  document.documentElement.lang = PromptlyI18n.getLang();
  document.querySelectorAll("[data-i18n]").forEach((n) => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll("[data-i18n-aria]").forEach((n) => { n.setAttribute("aria-label", t(n.dataset.i18nAria)); });
  els.lang.textContent = PromptlyI18n.getLang() === "tr" ? "EN" : "TR"; // geçilecek dil
}

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString(PromptlyI18n.getLang() === "tr" ? "tr-TR" : "en-US", {
    dateStyle: "short", timeStyle: "short",
  });
}

async function render() {
  const [queue, saved, error] = await Promise.all([
    PromptlyQueue.getQueue(), PromptlyQueue.getSaved(), PromptlyQueue.getError(),
  ]);
  const loggedIn = Boolean(session);

  els.logout.hidden = !loggedIn;
  els.user.hidden = !loggedIn;
  els.login.hidden = loggedIn;

  // Bekleyenler
  els.pending.hidden = queue.length === 0;
  els.pendingTitle.textContent = t("pending", { n: queue.length });
  els.pendingNote.hidden = loggedIn;
  els.pendingNote.textContent = t("pendingSignedOut");
  showMessage(els.pendingError, loggedIn && error ? t("pendingFailed", { error }) : "");
  els.retry.hidden = !(loggedIn && queue.length);
  els.pendingList.replaceChildren(
    ...queue.map((item) => {
      const li = el("li", "item");
      const body = el("div", "item-body");
      body.append(
        el("p", "item-title", item.text),
        el("p", "item-meta", `${t("characters", { n: item.text.length })} · ${formatDate(item.capturedAt)}`),
      );
      const rm = el("button", "link", "×");
      rm.type = "button";
      rm.title = t("remove");
      rm.setAttribute("aria-label", t("remove"));
      rm.addEventListener("click", () => chrome.runtime.sendMessage({ type: "remove", id: item.id }));
      li.append(body, rm);
      return li;
    }),
  );

  // Taslaklara kaydedilenler (yalnızca giriş yapılmışken)
  els.saved.hidden = !loggedIn || saved.length === 0;
  els.savedList.replaceChildren(
    ...saved.map((entry) => {
      const li = el("li", "item");
      const body = el("div", "item-body");
      const meta = el("p", "item-meta", `${formatDate(entry.savedAt)} · `);
      const a = el("a", "", t("editAndPublish"));
      a.href = entry.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      meta.append(a);
      body.append(el("p", "item-title", entry.title), meta);
      li.append(body);
      return li;
    }),
  );

  els.empty.hidden = !loggedIn || queue.length > 0 || saved.length > 0;
}

async function loadUser() {
  const profile = session ? await PromptlyApi.getProfile(session) : null;
  els.user.textContent = profile ? `@${profile.username}` : session?.email || "";
}

els.login.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage(els.loginError, "");
  els.loginBtn.disabled = true;
  try {
    // Oturum yazılınca background bekleyenleri otomatik taslağa gönderir.
    session = await PromptlyApi.login(els.identifier.value, els.password.value);
    els.password.value = "";
    await loadUser();
    await render();
  } catch (err) {
    showMessage(els.loginError, err.message);
  } finally {
    els.loginBtn.disabled = false;
  }
});

els.logout.addEventListener("click", async () => {
  await PromptlyApi.logout();
  session = null;
  await render();
});

els.retry.addEventListener("click", () => chrome.runtime.sendMessage({ type: "flush" }));

els.lang.addEventListener("click", async () => {
  await PromptlyI18n.setLang(PromptlyI18n.getLang() === "tr" ? "en" : "tr");
  applyI18n();
  await render();
});

// Kuyruk/kayıt/hata değişince (background çalıştıkça) canlı güncelle.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[PromptlyQueue.QUEUE_KEY] || changes[PromptlyQueue.SAVED_KEY] || changes[PromptlyQueue.ERROR_KEY]) render();
});

(async function init() {
  await PromptlyI18n.init();
  applyI18n();
  session = await PromptlyApi.getSession();
  await render();
  if (session) {
    loadUser();
    chrome.runtime.sendMessage({ type: "flush" }); // açılışta bekleyen varsa gönder
  }
})();
