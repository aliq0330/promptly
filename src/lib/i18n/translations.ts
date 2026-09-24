/**
 * Site-wide language dictionary (Türkçe/English) — the user's explicit
 * request for a real "language" preference, switchable from `/settings`.
 *
 * SCOPE DECISION (made explicit, not hidden): this app has dozens of
 * feature areas (CLAUDE.md's Bölüm 9.1-9.48) with hundreds of Turkish
 * strings hardcoded throughout. Translating every single one in one pass
 * is not realistic — this dictionary covers the app SHELL (sidebar,
 * mobile nav, header) and the `/settings` page (where the toggle itself
 * lives), which is what a visitor sees on literally every page regardless
 * of which feature they're using. Extending coverage to individual
 * feature pages (feed, prompts, requests, profile, messages, generators,
 * etc.) is real, follow-up work — this dictionary's flat `key -> {tr, en}`
 * shape is designed so more keys can be appended without any
 * architecture change, and `useTranslation()`'s `t()` falls back to the
 * key itself (not a crash) for anything not yet added here.
 */

export const translations = {
  // ---- Primary navigation (desktop sidebar) ----
  "nav.home": { tr: "Ana Sayfa", en: "Home" },
  "nav.discover": { tr: "Keşfet", en: "Discover" },
  "nav.createPrompt": { tr: "Prompt Oluştur", en: "Create Prompt" },
  "nav.generators": { tr: "Generatorlar", en: "Generators" },
  "nav.requests": { tr: "Prompt İstekleri", en: "Prompt Requests" },
  "nav.tags": { tr: "Etiketler", en: "Tags" },
  "nav.saved": { tr: "Kaydedilenler", en: "Saved" },
  "nav.following": { tr: "Takip Ettiklerim", en: "Following" },
  "nav.profile": { tr: "Profil", en: "Profile" },
  "nav.settings": { tr: "Ayarlar", en: "Settings" },
  // ---- Mobile bottom navigation (shorter labels, limited width) ----
  "nav.createShort": { tr: "Oluştur", en: "Create" },
  "nav.requestsShort": { tr: "İstekler", en: "Requests" },

  "nav.groupDiscover": { tr: "Keşfet", en: "Discover" },
  "nav.groupLibrary": { tr: "Kütüphanem", en: "My library" },
  "nav.primaryLabel": { tr: "Ana gezinme", en: "Main navigation" },
  "nav.tagline": { tr: "Prompt topluluğu", en: "Prompt community" },

  // ---- Header ----
  "header.homeAriaLabel": { tr: "Promptly ana sayfa", en: "Promptly home" },
  "header.searchPlaceholder": { tr: "Prompt, kullanıcı veya etiket ara", en: "Search prompts, users, or tags" },
  "header.searchAriaLabel": { tr: "Ara", en: "Search" },
  "header.notificationsAriaLabel": { tr: "Bildirimler", en: "Notifications" },
  "header.messagesAriaLabel": { tr: "Mesajlar", en: "Messages" },
  "header.login": { tr: "Giriş Yap", en: "Log In" },

  // ---- Settings page ----
  "settings.pageTitle": { tr: "Hesap ayarları", en: "Account settings" },
  "settings.profileHintBefore": {
    tr: "Profil bilgileri (görünen ad, biyografi, ilgi alanları) için",
    en: "For profile information (display name, bio, interests), use the",
  },
  "settings.profileHintLink": { tr: "Profili Düzenle", en: "Edit Profile" },
  "settings.profileHintAfter": {
    tr: "sayfasını kullan — burada yalnızca gerçek hesap bilgilerin var.",
    en: "page — this page only holds your real account details.",
  },
  "settings.email": { tr: "E-posta", en: "Email" },
  "settings.changePassword": { tr: "Şifre değiştir", en: "Change password" },
  "settings.newPassword": { tr: "Yeni şifre", en: "New password" },
  "settings.newPasswordConfirm": { tr: "Yeni şifre (tekrar)", en: "New password (again)" },
  "settings.passwordTooShortPrefix": { tr: "Şifre en az", en: "Password must be at least" },
  "settings.passwordTooShortSuffix": { tr: "karakter olmalı.", en: "characters." },
  "settings.passwordMismatch": { tr: "Şifreler eşleşmiyor.", en: "Passwords don't match." },
  "settings.passwordUpdated": { tr: "Şifren güncellendi.", en: "Your password has been updated." },
  "settings.updating": { tr: "Güncelleniyor...", en: "Updating..." },
  "settings.updatePassword": { tr: "Şifreyi güncelle", en: "Update password" },
  "settings.messagePrivacyTitle": { tr: "Mesaj gizliliği", en: "Message privacy" },
  "settings.messagePrivacyQuestion": { tr: "Kimler sana yeni bir mesaj gönderebilir?", en: "Who can send you a new message?" },
  "settings.loadingEllipsis": { tr: "Yükleniyor…", en: "Loading…" },
  "settings.everyone": { tr: "Herkes", en: "Everyone" },
  "settings.everyoneHint": {
    tr: 'Seni takip etmeyenlerin mesajları önce "Mesaj İstekleri"ne düşer, kabul edene kadar ana gelen kutunda görünmez.',
    en: 'Messages from people who don\'t follow you first land in "Message Requests" and won\'t appear in your main inbox until you accept.',
  },
  "settings.followersOnly": { tr: "Yalnızca takip ettiklerim", en: "Only people I follow" },
  "settings.followersOnlyHint": {
    tr: "Takip etmediğin kimse sana mesaj isteği bile gönderemez.",
    en: "Anyone you don't follow can't even send you a message request.",
  },
  "settings.appearanceTitle": { tr: "Görünüm", en: "Appearance" },
  "settings.appearanceHint": {
    tr: "Renk temasını ve açık/koyu modu seç. Bu tercih yalnızca bu tarayıcıda saklanır.",
    en: "Choose a color theme and light/dark mode. This preference is only stored on this browser.",
  },
  "settings.modeLabel": { tr: "Mod", en: "Mode" },
  "settings.modeLight": { tr: "Açık", en: "Light" },
  "settings.modeDark": { tr: "Koyu", en: "Dark" },
  "settings.paletteLabel": { tr: "Renk teması", en: "Color theme" },
  "settings.palette.lavender": { tr: "Lavanta", en: "Lavender" },
  "settings.palette.ocean": { tr: "Okyanus", en: "Ocean" },
  "settings.palette.forest": { tr: "Orman", en: "Forest" },
  "settings.palette.sand": { tr: "Kum", en: "Sand" },
  "settings.languageTitle": { tr: "Dil", en: "Language" },
  "settings.languageHint": {
    tr: "Arayüz dilini seç. Bu tercih yalnızca bu tarayıcıda saklanır.",
    en: "Choose the interface language. This preference is only stored on this browser.",
  },
  "settings.signOut": { tr: "Çıkış yap", en: "Sign out" },
  "settings.signingOut": { tr: "Çıkış yapılıyor...", en: "Signing out..." },
  "settings.notLoggedInBody": {
    tr: "Hesap ayarlarını görebilmek için giriş yapmalısın.",
    en: "You need to log in to see your account settings.",
  },
  "settings.login": { tr: "Giriş yap", en: "Log in" },
} as const;

export type TranslationKey = keyof typeof translations;
export type Language = "tr" | "en";
