/**
 * Deterministic, fully offline placeholder art for mock prompt media —
 * no third-party image service dependency (see src/mocks). Replace with
 * real Supabase Storage URLs once uploads exist (CLAUDE.md section 20).
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

export function placeholderArt(seed: string, width: number, height: number): string {
  const index = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const [from, to] = GRADIENTS[index % GRADIENTS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
