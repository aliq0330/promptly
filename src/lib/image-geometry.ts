/**
 * Pure geometry of the photo shrinker (no DOM, no i18n — unit-tested with node:test). The canvas work that uses it lives in
 * `image-processing.ts`.
 */

/** Dimensions are never stepped below this — a result this small is far under any budget. */
const MIN_DIMENSION = 240;
const DIMENSION_FACTOR = 0.8;

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * The centered part of a `width × height` picture that is kept: all of it by default, the largest centered square for
 * `square`, or the largest centered `aspect` (width / height) strip — an avatar and a cover are cropped, never stretched.
 */
export function computeCrop(width: number, height: number, shape: { square?: boolean; aspect?: number } = {}): CropRect {
  const aspect = shape.square ? 1 : shape.aspect;
  if (!aspect || !Number.isFinite(aspect) || aspect <= 0) return { sx: 0, sy: 0, sw: width, sh: height };
  let sw = width;
  let sh = Math.round(width / aspect);
  if (sh > height) {
    sh = height;
    sw = Math.round(height * aspect);
  }
  return { sx: Math.floor((width - sw) / 2), sy: Math.floor((height - sh) / 2), sw, sh };
}

/** The longest-side sizes tried in order: the requested one, then 80% of it each step, never below `MIN_DIMENSION`. */
export function dimensionSteps(start: number, min = MIN_DIMENSION): number[] {
  const steps: number[] = [];
  let current = Math.max(1, Math.round(start));
  while (current > min) {
    steps.push(current);
    current = Math.round(current * DIMENSION_FACTOR);
  }
  steps.push(Math.max(1, Math.min(current, Math.round(start))));
  return steps;
}

