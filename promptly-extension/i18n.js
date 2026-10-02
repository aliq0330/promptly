// Promptly Extension — TR/EN metinleri. Tek kaynak; arayüzde hardcoded metin yok.
// Dil: kayıtlı tercih (`lang`) → yoksa tarayıcı arayüz dili (tr → Türkçe, aksi hâlde İngilizce).
// Kullanıcı içeriği ve marka adı (Promptly) çevrilmez.

const PromptlyI18n = (() => {
  const STRINGS = {
    menuSave: { tr: "✦ Promptly'ye Kaydet", en: "✦ Save to Promptly" },
    loginHint: {
      tr: "Promptları kaydetmek için Promptly hesabınla giriş yap.",
      en: "Sign in with your Promptly account to save prompts.",
    },
    identifier: { tr: "E-posta veya kullanıcı adı", en: "Email or username" },
    password: { tr: "Şifre", en: "Password" },
    signIn: { tr: "Giriş yap", en: "Sign in" },
    signOut: { tr: "Çıkış", en: "Sign out" },
    invalidCredentials: { tr: "Giriş bilgileri hatalı.", en: "Invalid sign-in details." },
    tooManyAttempts: { tr: "Çok fazla deneme. Biraz sonra tekrar dene.", en: "Too many attempts. Try again shortly." },
    sessionExpired: { tr: "Oturum süresi doldu. Tekrar giriş yap.", en: "Your session expired. Please sign in again." },
    emptyTitle: { tr: "Henüz yakalanan prompt yok", en: "No captured prompt yet" },
    emptyHint: {
      tr: "Herhangi bir sayfada bir prompt metnini seç, sağ tıkla ve “✦ Promptly'ye Kaydet” seçeneğini kullan.",
      en: "Select a prompt on any page, right-click and choose “✦ Save to Promptly”.",
    },
    title: { tr: "Başlık", en: "Title" },
    prompt: { tr: "Prompt", en: "Prompt" },
    characters: { tr: "{{n}} karakter", en: "{{n}} characters" },
    contentType: { tr: "İçerik türü", en: "Content type" },
    category: { tr: "Kategori", en: "Category" },
    subcategory: { tr: "Alt kategori", en: "Subcategory" },
    none: { tr: "— Seçme —", en: "— None —" },
    typeText: { tr: "Metin", en: "Text" },
    typeImage: { tr: "Görsel", en: "Image" },
    typeAudio: { tr: "Ses", en: "Audio" },
    typeVideo: { tr: "Video", en: "Video" },
    tags: { tr: "Etiketler", en: "Tags" },
    tagsPlaceholder: { tr: "Etiket ara veya ekle…", en: "Search or add a tag…" },
    tagCreate: { tr: "“{{label}}” etiketini oluştur", en: "Create tag “{{label}}”" },
    tagRemove: { tr: "{{label}} etiketini kaldır", en: "Remove tag {{label}}" },
    tagLimit: { tr: "En fazla {{n}} etiket.", en: "Up to {{n}} tags." },
    publishNow: { tr: "Hemen yayınla (aksi hâlde taslak)", en: "Publish now (otherwise saved as draft)" },
    copy: { tr: "Kopyala", en: "Copy" },
    copied: { tr: "Kopyalandı", en: "Copied" },
    copyFailed: { tr: "Kopyalanamadı", en: "Copy failed" },
    clear: { tr: "Temizle", en: "Clear" },
    save: { tr: "Kaydet", en: "Save" },
    saving: { tr: "Kaydediliyor…", en: "Saving…" },
    saveFailed: { tr: "Prompt kaydedilemedi.", en: "Could not save the prompt." },
    sourcePrefix: { tr: "Kaynak", en: "Source" },
    savedDraft: { tr: "Taslak olarak kaydedildi ✦", en: "Saved as draft ✦" },
    savedPublished: { tr: "Yayınlandı ✦", en: "Published ✦" },
    editAndPublish: { tr: "Düzenle ve yayınla", en: "Edit and publish" },
    openPrompt: { tr: "Prompt'u aç", en: "Open prompt" },
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
