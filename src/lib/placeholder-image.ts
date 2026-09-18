/**
 * Deterministic, fully offline placeholder art for mock prompt media —
 * no third-party image service dependency (see src/mocks). Soft
 * overlapping "bokeh" blobs read as abstract generated art rather than a
 * flat empty rectangle. Replace with real Supabase Storage URLs once
 * uploads exist (CLAUDE.md section 20).
 */
const GRADIENTS: [string, string][] = [
  ["#7C3AED", "#EC4899"],
  ["#0EA5E9", "#7C3AED"],
  ["#F59E0B", "#EF4444"],
  ["#10B981", "#0EA5E9"],
  ["#EC4899", "#F59E0B"],
  ["#8B5CF6", "#06B6D4"],
  ["#F43F5E", "#8B5CF6"],
  ["#06B6D4", "#10B981"],
];

function hashSeed(seed: string): number {
  return Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

export function placeholderArt(seed: string, width: number, height: number): string {
  const hash = hashSeed(seed);
  const [base1, base2] = GRADIENTS[hash % GRADIENTS.length];
  const [blob1] = GRADIENTS[(hash + 3) % GRADIENTS.length];
  const [, blob2] = GRADIENTS[(hash + 5) % GRADIENTS.length];

  const cx1 = 20 + (hash % 35);
  const cy1 = 15 + ((hash * 7) % 35);
  const cx2 = 55 + ((hash * 3) % 35);
  const cy2 = 50 + ((hash * 5) % 40);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${base1}"/>
<stop offset="100%" stop-color="${base2}"/>
</linearGradient>
<radialGradient id="b1" cx="50%" cy="50%" r="50%">
<stop offset="0%" stop-color="${blob1}" stop-opacity="0.85"/>
<stop offset="100%" stop-color="${blob1}" stop-opacity="0"/>
</radialGradient>
<radialGradient id="b2" cx="50%" cy="50%" r="50%">
<stop offset="0%" stop-color="${blob2}" stop-opacity="0.75"/>
<stop offset="100%" stop-color="${blob2}" stop-opacity="0"/>
</radialGradient>
</defs>
<rect width="100" height="100" fill="url(#bg)"/>
<circle cx="${cx1}" cy="${cy1}" r="40" fill="url(#b1)"/>
<circle cx="${cx2}" cy="${cy2}" r="36" fill="url(#b2)"/>
</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Clamps a media aspect ratio (width / height) into a controlled band so
 * portrait vs. landscape prompts read differently in the feed without any
 * card becoming unpredictably tall or short.
 */
export function clampedAspectRatio(width: number, height: number): number {
  const ratio = width / height;
  return Math.min(Math.max(ratio, 0.75), 1.4);
}
