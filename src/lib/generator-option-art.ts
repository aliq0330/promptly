/**
 * Representational, per-concept line-art icons for Generator field catalog
 * option thumbnails (`src/lib/generator-field-catalog.ts`'s `imgOpts`) —
 * replaces the earlier abstract, randomly-colored "bokeh gradient" blobs
 * (`placeholderArt`, still used elsewhere for mock prompt media) after an
 * explicit user report that those blobs looked completely unrelated to the
 * field they represented (a random purple/pink splotch for "Kıvırcık" hair,
 * for example, told the user nothing about what selecting it would do).
 *
 * **Honest scope note:** this environment has no access to a real image
 * generation model or a stock-photo service — these are still fully
 * offline, deterministic, hand-authored SVG line-art icons, not
 * photographs. That is a conscious trade-off, not a claim of photorealism:
 * a clean, minimal icon that actually *depicts* "curly hair" (a head
 * silhouette with a curl pattern) is a real, honest improvement over a
 * color gradient that depicts nothing, even though it is not the literal
 * AI-generated reference photo the user pointed to. See CLAUDE.md's
 * "Generator seçenek ikonları: soyut blob yerine kavramsal çizgi sanatı"
 * note for the full record.
 *
 * Visual language: a soft rounded card (matches the app's own
 * accent-surface/primary token family, Bölüm 4/9.50) with a centered,
 * two-tone line-art icon — one consistent style across every family below,
 * so a generator mixing several of these fields (hair, face, camera, pose…)
 * still reads as one coherent set, not eight unrelated icon packs.
 */

const CARD_BG = "#F1EDFB";
const LINE = "#5B21B6";
const LINE_SOFT = "#A78BFA";
const FILL_SOFT = "#DDD6FE";

function card(inner: string, width: number, height: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 100 100">
<rect width="100" height="100" rx="16" fill="${CARD_BG}"/>
<g fill="none" stroke="${LINE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
${inner}
</g>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function hashSeed(seed: string): number {
  return Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0) * 31, 0);
}

/** Safety net for a label this file doesn't (yet) have a hand-drawn icon for — a deterministic, family-tagged glyph rather than a crash or a blank thumbnail. */
function fallbackGlyph(label: string): string {
  const hash = hashSeed(label);
  const sides = 3 + (hash % 4);
  const points = Array.from({ length: sides }, (_, index) => {
    const angle = (Math.PI * 2 * index) / sides - Math.PI / 2;
    const x = 50 + Math.cos(angle) * 24;
    const y = 50 + Math.sin(angle) * 24;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<polygon points="${points}" fill="${FILL_SOFT}"/>`;
}

// ---------------------------------------------------------------------------
// Yüz Şekli (face shape)
// ---------------------------------------------------------------------------
const FACE_SHAPES: Record<string, string> = {
  Oval: `<path d="M50 22 C64 22 67 38 67 50 C67 66 60 80 50 80 C40 80 33 66 33 50 C33 38 36 22 50 22 Z"/>`,
  Yuvarlak: `<circle cx="50" cy="50" r="29"/>`,
  Kare: `<rect x="26" y="26" width="48" height="48" rx="9"/>`,
  Kalp: `<path d="M50 20 C66 20 70 34 70 44 C70 58 58 70 50 82 C42 70 30 58 30 44 C30 34 34 20 50 20 Z"/>`,
  Elmas: `<path d="M50 17 L69 50 L50 83 L31 50 Z"/>`,
  Uzun: `<path d="M50 14 C62 14 64 34 64 50 C64 70 58 86 50 86 C42 86 36 70 36 50 C36 34 38 14 50 14 Z"/>`,
};

// ---------------------------------------------------------------------------
// Göz Şekli (eye shape)
// ---------------------------------------------------------------------------
const EYE_SHAPES: Record<string, string> = {
  Badem: `<path d="M18 50 C34 30 66 30 82 50 C66 70 34 70 18 50 Z"/><circle cx="50" cy="50" r="8" fill="${LINE}"/>`,
  Yuvarlak: `<circle cx="50" cy="50" r="23"/><circle cx="50" cy="50" r="8" fill="${LINE}"/>`,
  Çekik: `<path d="M18 55 C34 40 66 33 84 44 C66 59 32 63 18 55 Z"/><circle cx="53" cy="47" r="7" fill="${LINE}"/>`,
  Büyük: `<circle cx="50" cy="50" r="29"/><circle cx="50" cy="50" r="12" fill="${LINE}"/>`,
  Küçük: `<path d="M30 50 C39 42 61 42 70 50 C61 58 39 58 30 50 Z"/><circle cx="50" cy="50" r="5" fill="${LINE}"/>`,
  "Derin Set": `<path d="M23 56 C37 45 63 45 77 56 C63 65 37 65 23 56 Z"/><circle cx="50" cy="56" r="7" fill="${LINE}"/><path d="M20 39 C37 30 63 30 80 39" stroke="${LINE_SOFT}"/>`,
};

// ---------------------------------------------------------------------------
// Saç Uzunluğu (hair length) — head outline + hair mass reaching to a
// per-length y-coordinate along the sides.
// ---------------------------------------------------------------------------
const HAIR_LENGTHS: Record<string, number | null> = {
  Kel: null,
  "Çok Kısa": 28,
  Kısa: 44,
  Orta: 62,
  Uzun: 78,
  "Çok Uzun": 92,
};

function hairLengthIcon(label: string): string {
  const endY = HAIR_LENGTHS[label];
  const head = `<circle cx="50" cy="32" r="17"/>`;
  if (endY === null || endY === undefined) return head;
  const cap = `<path d="M33 30 C33 12 67 12 67 30" stroke="${LINE_SOFT}"/>`;
  const mass = `<path d="M31 32 C31 14 69 14 69 32 L69 ${endY} C61 ${endY - 10} 39 ${endY - 10} 31 ${endY} Z" fill="${FILL_SOFT}" stroke="${LINE_SOFT}"/>`;
  return `${mass}${head}${label === "Çok Kısa" ? cap : ""}`;
}

// ---------------------------------------------------------------------------
// Saç Şekli (hair style) — same head silhouette, ten distinct hair textures.
// ---------------------------------------------------------------------------
const HAIR_STYLES: Record<string, string> = {
  Düz: `<path d="M31 34 C31 15 69 15 69 34 L69 66 M31 34 L31 66" fill="none" stroke="${LINE_SOFT}"/><circle cx="50" cy="32" r="17"/>`,
  Dalgalı: `<path d="M31 34 C31 15 69 15 69 34 C63 40 71 46 65 52 C59 58 67 62 61 68 M31 34 C37 40 29 46 35 52 C41 58 33 62 39 68" fill="none" stroke="${LINE_SOFT}"/><circle cx="50" cy="32" r="17"/>`,
  Kıvırcık: `<circle cx="50" cy="30" r="21" fill="${FILL_SOFT}" stroke="${LINE_SOFT}"/><path d="M33 22 a4 4 0 1 1 0.1 0 M42 14 a4 4 0 1 1 0.1 0 M58 14 a4 4 0 1 1 0.1 0 M67 22 a4 4 0 1 1 0.1 0" stroke="${LINE}"/><circle cx="50" cy="34" r="16"/>`,
  Afro: `<circle cx="50" cy="30" r="26" fill="${FILL_SOFT}" stroke="${LINE_SOFT}"/><circle cx="50" cy="36" r="15"/>`,
  Örgülü: `<path d="M31 34 C31 15 69 15 69 34" stroke="${LINE_SOFT}"/><path d="M60 34 L64 42 L58 48 L64 54 L58 60 L64 66" fill="none" stroke="${LINE_SOFT}"/><circle cx="50" cy="32" r="17"/>`,
  "At Kuyruğu": `<path d="M31 34 C31 15 69 15 69 34" stroke="${LINE_SOFT}"/><path d="M66 30 C78 32 82 46 74 58 C70 64 72 70 78 74" fill="none" stroke="${LINE_SOFT}"/><circle cx="50" cy="32" r="17"/>`,
  Topuz: `<circle cx="50" cy="16" r="8" fill="${FILL_SOFT}" stroke="${LINE_SOFT}"/><path d="M31 34 C31 20 69 20 69 34" stroke="${LINE_SOFT}"/><circle cx="50" cy="34" r="16"/>`,
  Bob: `<path d="M31 32 C31 14 69 14 69 32 L69 52 C61 48 39 48 31 52 Z" fill="${FILL_SOFT}" stroke="${LINE_SOFT}"/><circle cx="50" cy="32" r="17"/>`,
  Pixie: `<path d="M36 25 L40 15 L44 24 M44 22 L48 12 L52 22 M52 22 L56 13 L60 23 M60 24 L64 17 L67 26" stroke="${LINE_SOFT}"/><circle cx="50" cy="33" r="16"/>`,
  Dağınık: `<path d="M31 32 C28 22 36 12 42 18 C44 10 56 10 58 18 C64 12 72 22 69 32" fill="none" stroke="${LINE_SOFT}"/><circle cx="50" cy="34" r="16"/>`,
};

// ---------------------------------------------------------------------------
// Üst Türü / Kıyafet (clothing top) — shoulders + torso silhouette, varied
// neckline/sleeve/closure per garment.
// ---------------------------------------------------------------------------
const CLOTHING_TOPS: Record<string, string> = {
  Tişört: `<path d="M32 34 L44 26 L56 26 L68 34 L64 44 L58 40 L58 76 L42 76 L42 40 L36 44 Z" fill="${FILL_SOFT}"/><path d="M44 26 C46 32 54 32 56 26" stroke="${LINE}"/>`,
  Gömlek: `<path d="M30 36 L44 24 L50 32 L56 24 L70 36 L66 48 L60 42 L60 78 L40 78 L40 42 L34 48 Z" fill="${FILL_SOFT}"/><path d="M50 32 L50 78" stroke="${LINE}"/>`,
  Bluz: `<path d="M32 36 C36 28 44 24 50 28 C56 24 64 28 68 36 L64 46 L58 40 L58 78 L42 78 L42 40 L36 46 Z" fill="${FILL_SOFT}"/>`,
  Kazak: `<path d="M31 40 L44 26 L56 26 L69 40 L64 48 L59 42 L59 78 L41 78 L41 42 L36 48 Z" fill="${FILL_SOFT}"/><ellipse cx="50" cy="27" rx="9" ry="4" fill="${CARD_BG}"/>`,
  Sweatshirt: `<path d="M30 38 L44 26 L56 26 L70 38 L65 50 L59 43 L59 78 L41 78 L41 43 L35 50 Z" fill="${FILL_SOFT}"/><ellipse cx="50" cy="27" rx="10" ry="4" fill="${CARD_BG}"/>`,
  Hoodie: `<path d="M30 40 L44 26 L56 26 L70 40 L65 52 L59 45 L59 78 L41 78 L41 45 L35 52 Z" fill="${FILL_SOFT}"/><path d="M38 28 C44 16 56 16 62 28" fill="none" stroke="${LINE}"/>`,
  Ceket: `<path d="M30 36 L44 24 L50 34 L56 24 L70 36 L65 50 L58 43 L58 78 L52 78 L50 60 L48 78 L42 78 L42 43 L35 50 Z" fill="${FILL_SOFT}"/>`,
  "Deri Ceket": `<path d="M30 36 L44 24 L50 34 L56 24 L70 36 L65 50 L58 43 L58 78 L52 78 L50 60 L48 78 L42 78 L42 43 L35 50 Z" fill="${FILL_SOFT}"/><path d="M50 34 L50 78" stroke="${LINE}"/>`,
  Mont: `<path d="M28 40 L44 24 L56 24 L72 40 L67 54 L58 45 L58 80 L42 80 L42 45 L33 54 Z" fill="${FILL_SOFT}"/><circle cx="49" cy="20" r="6" fill="none" stroke="${LINE_SOFT}"/>`,
  Kaban: `<path d="M28 38 L44 22 L56 22 L72 38 L67 52 L59 44 L59 86 L41 86 L41 44 L33 52 Z" fill="${FILL_SOFT}"/><path d="M50 30 L50 86" stroke="${LINE}"/>`,
  Zırh: `<path d="M30 38 L44 24 L56 24 L70 38 L63 78 L37 78 Z" fill="${FILL_SOFT}"/><path d="M50 38 L50 78 M38 48 L62 48 M38 60 L62 60" stroke="${LINE}"/>`,
};

// ---------------------------------------------------------------------------
// Temel Poz (pose) — a stick figure per pose.
// ---------------------------------------------------------------------------
const POSES: Record<string, string> = {
  Ayakta: `<circle cx="50" cy="24" r="8"/><path d="M50 32 L50 62 M50 40 L36 52 M50 40 L64 52 M50 62 L40 86 M50 62 L60 86"/>`,
  Oturuyor: `<circle cx="46" cy="24" r="8"/><path d="M46 32 L46 56 M46 40 L34 50 M46 40 L58 48 M46 56 L70 56 M70 56 L70 82 M46 56 L46 82"/>`,
  Yatıyor: `<circle cx="20" cy="52" r="8"/><path d="M28 52 L82 52 M40 52 L34 40 M56 52 L62 40 M70 52 L78 42 M70 52 L78 62"/>`,
  "Diz Çöküyor": `<circle cx="50" cy="20" r="8"/><path d="M50 28 L50 54 M50 34 L38 44 M50 34 L62 44 M50 54 L36 68 M36 68 L36 86 M50 54 L64 74 M64 74 L64 86"/>`,
  Yürüyor: `<circle cx="50" cy="20" r="8"/><path d="M50 28 L50 58 M50 36 L38 30 M50 36 L62 46 M50 58 L34 86 M50 58 L66 78"/>`,
  Koşuyor: `<circle cx="46" cy="18" r="8"/><path d="M46 26 L52 52 M46 32 L30 24 M50 40 L66 48 M52 52 L34 78 M52 52 L70 62 M70 62 L74 82"/>`,
  Zıplıyor: `<circle cx="50" cy="22" r="8"/><path d="M50 30 L50 54 M50 34 L32 22 M50 34 L68 22 M50 54 L36 70 M50 54 L64 70"/><path d="M22 88 L78 88" stroke="${LINE_SOFT}" stroke-dasharray="2 5"/>`,
  "Dans Ediyor": `<circle cx="48" cy="20" r="8"/><path d="M48 28 L52 54 M48 34 L30 20 M52 40 L70 34 M52 54 L34 60 M34 60 L24 74 M52 54 L72 78"/>`,
};

// ---------------------------------------------------------------------------
// Kamera Açısı (camera angle) — a small camera glyph + subject head, whose
// relative position/line depicts the angle described.
// ---------------------------------------------------------------------------
function cameraGlyph(x: number, y: number, rotate = 0): string {
  return `<g transform="rotate(${rotate} ${x} ${y})"><rect x="${x - 9}" y="${y - 6}" width="18" height="12" rx="2" fill="${FILL_SOFT}"/><circle cx="${x}" cy="${y}" r="4" fill="${CARD_BG}" stroke="${LINE}"/></g>`;
}
const CAMERA_ANGLES: Record<string, string> = {
  "Göz Hizası": `${cameraGlyph(26, 50)}<circle cx="72" cy="50" r="10"/><path d="M36 50 L62 50" stroke="${LINE_SOFT}" stroke-dasharray="2 4"/>`,
  "Alttan Açı": `${cameraGlyph(50, 80, 0)}<circle cx="50" cy="30" r="10"/><path d="M50 70 L50 40" stroke="${LINE_SOFT}" stroke-dasharray="2 4"/>`,
  "Üstten Açı": `${cameraGlyph(50, 20, 0)}<circle cx="50" cy="72" r="10"/><path d="M50 30 L50 62" stroke="${LINE_SOFT}" stroke-dasharray="2 4"/>`,
  Kuşbakışı: `${cameraGlyph(50, 18, 0)}<circle cx="50" cy="70" r="12" fill="${FILL_SOFT}"/><path d="M50 30 L50 58" stroke="${LINE_SOFT}" stroke-dasharray="2 4"/>`,
  "Solucan Bakışı": `${cameraGlyph(50, 92, 0)}<circle cx="50" cy="24" r="16" fill="${FILL_SOFT}"/><path d="M50 82 L50 40" stroke="${LINE_SOFT}" stroke-dasharray="2 4"/>`,
  "Eğik Açı": `<g transform="rotate(-14 50 50)"><rect x="22" y="30" width="56" height="40" rx="4"/></g><circle cx="58" cy="52" r="9"/>`,
  "Omuz Üzerinden": `<path d="M18 84 C18 62 40 62 40 84" fill="${FILL_SOFT}"/><circle cx="29" cy="52" r="12" fill="${FILL_SOFT}"/><circle cx="68" cy="48" r="9"/>`,
};

// ---------------------------------------------------------------------------
// Fotoğraf Türü (photo type / genre) — a small representative pictogram.
// ---------------------------------------------------------------------------
const PHOTO_TYPES: Record<string, string> = {
  Portre: `<rect x="24" y="18" width="52" height="64" rx="6"/><circle cx="50" cy="42" r="12"/><path d="M32 76 C32 58 68 58 68 76"/>`,
  Moda: `<circle cx="50" cy="20" r="7"/><path d="M50 27 L50 60 M50 33 L40 44 M50 33 L60 40 M50 60 L44 88 M50 60 L58 88"/>`,
  Sokak: `<path d="M20 82 L20 40 L34 40 L34 82 M40 82 L40 24 L58 24 L58 82 M64 82 L64 50 L80 50 L80 82"/><circle cx="46" cy="66" r="6"/>`,
  Manzara: `<path d="M16 74 L38 46 L52 62 L66 40 L86 74 Z"/><circle cx="66" cy="26" r="8"/>`,
  Ürün: `<path d="M36 34 L64 34 L64 78 L36 78 Z" fill="${FILL_SOFT}"/><path d="M44 34 L44 24 L56 24 L56 34"/>`,
  Mimari: `<rect x="28" y="20" width="44" height="62"/><path d="M28 34 L72 34 M28 48 L72 48 M28 62 L72 62 M44 20 L44 82 M56 20 L56 82"/>`,
  Yemek: `<circle cx="50" cy="52" r="24"/><path d="M34 30 L34 46 M30 30 L30 46 M38 30 L38 46 M34 46 L34 60 M66 28 C60 30 60 40 66 44 L66 74" stroke-width="2.4"/>`,
  Otomotiv: `<path d="M18 62 L26 44 L74 44 L82 62 L82 70 L18 70 Z" fill="${FILL_SOFT}"/><circle cx="32" cy="70" r="7"/><circle cx="68" cy="70" r="7"/>`,
  Düğün: `<circle cx="40" cy="54" r="16"/><circle cx="60" cy="54" r="16"/>`,
  Belgesel: `<rect x="24" y="34" width="40" height="30" rx="3"/><circle cx="44" cy="49" r="8"/><path d="M64 42 L80 32 L80 66 L64 56 Z" fill="${FILL_SOFT}"/>`,
};

function lookupOrFallback(map: Record<string, string>, label: string): string {
  return map[label] ?? fallbackGlyph(label);
}

/**
 * Concept icons for the Generator field catalog's image-backed fields
 * (`imgOpts`) — dispatches on `fieldSeed` (the catalog field's own id) so
 * every family only has to know its own labels; unrecognized field ids or
 * labels fall back to a deterministic, safe glyph rather than breaking.
 */
export function conceptIcon(fieldSeed: string, label: string, width: number, height: number): string {
  switch (fieldSeed) {
    case "char_face_shape":
      return card(lookupOrFallback(FACE_SHAPES, label), width, height);
    case "char_eye_shape":
      return card(lookupOrFallback(EYE_SHAPES, label), width, height);
    case "char_hair_length":
      return card(hairLengthIcon(label), width, height);
    case "char_hair_style":
      return card(lookupOrFallback(HAIR_STYLES, label), width, height);
    case "cloth_top":
      return card(lookupOrFallback(CLOTHING_TOPS, label), width, height);
    case "pose_base":
      return card(lookupOrFallback(POSES, label), width, height);
    case "cam_angle":
      return card(lookupOrFallback(CAMERA_ANGLES, label), width, height);
    case "photo_type":
      return card(lookupOrFallback(PHOTO_TYPES, label), width, height);
    default:
      return card(fallbackGlyph(label), width, height);
  }
}
