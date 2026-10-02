// Promptly Extension — TR/EN metinleri. Tek kaynak; arayüzde hardcoded metin yok.
// Dil: kayıtlı tercih (`lang`) → yoksa tarayıcı arayüz dili (tr → Türkçe, aksi hâlde İngilizce).
// Kullanıcı içeriği ve marka adı (Promptly) çevrilmez.

const PromptlyI18n = (() => {
  const STRINGS = {
    menuSave: { tr: "✦ Promptly'ye Kaydet", en: "✦ Save to Promptly" },
    loginHint: {
      tr: "Giriş yap: bekleyen promptların otomatik olarak taslaklarına kaydedilir.",
      en: "Sign in: your pending prompts will be saved to your drafts automatically.",
    },
    identifier: { tr: "E-posta veya kullanıcı adı", en: "Email or username" },
    password: { tr: "Şifre", en: "Password" },
    signIn: { tr: "Giriş yap", en: "Sign in" },
    signOut: { tr: "Çıkış", en: "Sign out" },
    invalidCredentials: { tr: "Giriş bilgileri hatalı.", en: "Invalid sign-in details." },
    tooManyAttempts: { tr: "Çok fazla deneme. Biraz sonra tekrar dene.", en: "Too many attempts. Try again shortly." },
    sessionExpired: { tr: "Oturum süresi doldu. Tekrar giriş yap.", en: "Your session expired. Please sign in again." },
    emptyTitle: { tr: "Henüz kaydedilen prompt yok", en: "No saved prompts yet" },
    emptyHint: {
      tr: "Herhangi bir sayfada bir prompt metnini seç, sağ tıkla ve “✦ Promptly'ye Kaydet” seçeneğini kullan. Prompt taslaklarına kaydedilir.",
      en: "Select a prompt on any page, right-click and choose “✦ Save to Promptly”. It is saved to your drafts.",
    },
    pending: { tr: "Bekleyenler ({{n}})", en: "Pending ({{n}})" },
    pendingSignedOut: {
      tr: "Bu cihazda saklanıyor. Giriş yapınca taslaklarına kaydedilecek.",
      en: "Stored on this device. Will be saved to your drafts once you sign in.",
    },
    pendingFailed: { tr: "Taslağa kaydedilemedi: {{error}}", en: "Could not save to drafts: {{error}}" },
    retry: { tr: "Tekrar dene", en: "Retry" },
    remove: { tr: "Kaldır", en: "Remove" },
    savedDrafts: { tr: "Taslaklara kaydedilenler", en: "Saved to drafts" },
    editAndPublish: { tr: "Sitede düzenle ve yayınla", en: "Edit and publish on the site" },
    characters: { tr: "{{n}} karakter", en: "{{n}} characters" },
    untitled: { tr: "Başlıksız prompt", en: "Untitled prompt" },
    saveFailed: { tr: "Prompt kaydedilemedi.", en: "Could not save the prompt." },
    sourcePrefix: { tr: "Kaynak", en: "Source" },
    language: { tr: "Dil", en: "Language" },
  };

  let lang = "tr";

  function detect() {
    const ui = (chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || "en";
    return ui.toLowerCase().startsWith("tr") ? "tr" : "en";
  }

  async function init() {
    const stored = (await chrome.storage.local.get("lang")).lang;
    lang = stored === "tr" || stored === "en" ? stored : detect();
    return lang;
  }

  async function setLang(next) {
    lang = next === "en" ? "en" : "tr";
    await chrome.storage.local.set({ lang });
  }

  function t(key, params) {
    const entry = STRINGS[key];
    let s = entry ? entry[lang] : key;
    if (params) for (const k of Object.keys(params)) s = s.replace(`{{${k}}}`, params[k]);
    return s;
  }

  return { init, setLang, getLang: () => lang, t };
})();
