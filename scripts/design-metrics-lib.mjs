// Tasarım sistemi ölçümü — kütüphane kısmı (docs/history/403-*): `scripts/design-metrics.mjs` (CLI) ve `scripts/design-metrics.test.mjs` (npm test) kullanır.
import fs from "node:fs";
import path from "node:path";

const ROOT = new URL("../src/", import.meta.url).pathname;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".tsx") || (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts") && !full.includes("/lib/i18n/"))) out.push(full);
  }
  return out;
}

export function loadFiles() {
  return walk(ROOT).map((file) => ({ file, rel: path.relative(ROOT, file), text: fs.readFileSync(file, "utf8") }));
}

/** Her `<Etiket …>` açılışı için [etiket adı, öznitelik metni]: `{…}` ve dizgeler içindeki `>` açılışı bitirmez. */
export function jsxTags(text) {
  const out = [];
  const open = /<([A-Za-z_][\w.]*)(?=[\s/>])/g;
  let match;
  while ((match = open.exec(text))) {
    let i = match.index + match[0].length;
    let depth = 0;
    let quote = null;
    const start = i;
    for (; i < text.length; i += 1) {
      const c = text[i];
      if (quote) {
        if (c === "\\") i += 1;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0) break;
    }
    out.push([match[1], text.slice(start, i)]);
  }
  return out;
}

// Bu etiketlerde `size` bir piksel kutusudur (avatar, kimlik bloğu, ışık kutusu…), ikon ölçeği değil.
export const NOT_ICONS = new Set(["Avatar", "PresenceAvatar", "ProfileAvatar", "GroupAvatar", "TeamMark", "BrandMark", "ReplyThumb", "ReactionIcon", "HubTile", "InfoIdentity", "PhoneHomeIdentity", "ImageLightbox", "RoomIconTile", "div"]);
export const isNotIcon = (name) => NOT_ICONS.has(name) || name.startsWith("Hub");
/** İşlevsel ikon: 12/16/20/24. Süs (boş durum, karo): 32'den büyük, 4'ün katı. */
export const iconSizeOk = (n) => n === 12 || n === 16 || n === 20 || n === 24 || (n >= 32 && n % 4 === 0);

/** Metindeki her dizge için { str, tag }: `tag` dizgeyi içeren en içteki JSX açılışının adıdır (yoksa null). */
export function stringsWithTag(text) {
  const tags = [];
  const open = /<([A-Za-z][A-Za-z0-9.]*)(?=[\s/>])/g;
  let match;
  while ((match = open.exec(text))) {
    let i = match.index + match[0].length;
    let depth = 0;
    let quote = null;
    for (; i < text.length; i += 1) {
      const c = text[i];
      if (quote) {
        if (c === "\\") i += 1;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0) break;
    }
    tags.push([match.index, i, match[1]]);
  }
  const out = [];
  const str = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;
  while ((match = str.exec(text))) {
    let tag = null;
    for (const [a, b, name] of tags) if (a < match.index && match.index < b) tag = name;
    out.push({ str: match[0], tag });
  }
  return out;
}
