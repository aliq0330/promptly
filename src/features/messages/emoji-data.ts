import type { TranslationKey } from "@/lib/i18n/translations";

/**
 * A compact, hand-curated emoji set for the message composer — this app
 * deliberately has no emoji-picker dependency (CLAUDE.md §2: no unneeded
 * dependencies), and a few hundred common emoji cover real chat use.
 * Plain Unicode only, so there is nothing to download or keep in sync.
 */
export interface EmojiCategory {
  id: string;
  labelKey: TranslationKey;
  /** Representative glyph for the category tab. */
  icon: string;
  emojis: string[];
}

const words = (value: string) => value.trim().split(/\s+/);

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "faces",
    labelKey: "emoji.catFaces",
    icon: "😀",
    emojis: words(
      "😀 😃 😄 😁 😆 😅 😂 🤣 🥲 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫡 🤭 🫢 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹 💀 👻 👽 🤖 💩",
    ),
  },
  {
    id: "gestures",
    labelKey: "emoji.catGestures",
    icon: "👍",
    emojis: words(
      "👍 👎 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 🙏 ✍️ 💪 🦾 👏 🙌 👐 🤲 🫶 🫵 🙇 🤷 🤦 💁 🙋 🙆 🙅",
    ),
  },
  {
    id: "hearts",
    labelKey: "emoji.catHearts",
    icon: "❤️",
    emojis: words(
      "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 💋 💯 💢 💥 💫 💦 💨 🔥 ✨ ⭐ 🌟 💤",
    ),
  },
  {
    id: "nature",
    labelKey: "emoji.catNature",
    icon: "🐶",
    emojis: words(
      "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🦆 🦉 🦋 🐝 🐞 🐢 🐍 🐙 🐬 🐳 🦈 🌸 🌹 🌻 🌷 🌲 🌴 🍀 🍁 🌍 🌈 ☀️ 🌙 ⭐ ☁️ ⛈️ ❄️ 🌊",
    ),
  },
  {
    id: "food",
    labelKey: "emoji.catFood",
    icon: "🍕",
    emojis: words(
      "🍎 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥝 🍅 🥑 🌽 🥕 🍞 🧀 🥚 🍳 🥓 🍔 🍟 🌭 🍕 🥪 🌮 🌯 🍝 🍜 🍣 🍤 🍦 🍩 🍪 🎂 🍰 🍫 🍬 ☕ 🍵 🥤 🍺 🍷 🥂 🍸",
    ),
  },
  {
    id: "activities",
    labelKey: "emoji.catActivities",
    icon: "⚽",
    emojis: words(
      "⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🥊 🎯 🎮 🕹️ 🎲 🧩 🎨 🎭 🎬 🎤 🎧 🎵 🎶 🎸 🎹 🥁 🏆 🥇 🥈 🥉 🎉 🎊 🎁 🎈 🚀 ✈️ 🚗 🚲 🏠 🌆",
    ),
  },
  {
    id: "objects",
    labelKey: "emoji.catObjects",
    icon: "💡",
    emojis: words(
      "📱 💻 ⌨️ 🖥️ 🖨️ 📷 📸 🎥 📺 ⏰ 💡 🔋 🔌 💾 📁 📌 📎 ✂️ 🔒 🔑 🔧 🛠️ ⚙️ 🧰 📚 📖 📝 ✏️ 🖊️ 📊 📈 💰 💳 🛒 📦 ✉️ 🔔 🎓",
    ),
  },
  {
    id: "symbols",
    labelKey: "emoji.catSymbols",
    icon: "✅",
    emojis: words(
      "✅ ❌ ❓ ❗ ‼️ ⚠️ 🚫 ⭕ ➕ ➖ ➡️ ⬅️ ⬆️ ⬇️ 🔄 ♻️ 🆗 🆕 🔝 ℹ️ ▶️ ⏸️ ⏹️ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🏁 🇹🇷",
    ),
  },
];

const RECENT_KEY = "promptly-recent-emoji";
const RECENT_LIMIT = 24;

/** Recently used emoji, newest first — a per-viewer convenience kept in localStorage only (read/write failures are swallowed, the picker works without it). */
export function readRecentEmojis(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

export function rememberEmoji(emoji: string): string[] {
  const next = [emoji, ...readRecentEmojis().filter((value) => value !== emoji)].slice(0, RECENT_LIMIT);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore — recents are optional */
  }
  return next;
}
