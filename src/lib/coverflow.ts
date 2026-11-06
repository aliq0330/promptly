/**
 * Coverflow geometry (docs/history/346-*): the pure maths behind `components/ui/coverflow.tsx`, kept apart so it can be unit tested.
 * The centre card stands upright; its neighbours move sideways, fall back in depth, tilt and shrink.
 */

/** Cards further than this from the centre are hidden (opacity 0, not hit-testable). */
export const COVERFLOW_MAX_VISIBLE = 2;

const SCALE_STEP = 0.16;
const MIN_SCALE = 0.4;
/** Sideways step and depth step, as a fraction of the card width. */
const SPACING = 0.6;
const TILT_Y = 12;
const TILT_Z = 8;

/** Signed distance of `index` from `active` on a loop of `count` cards: the shortest way round, in (-count/2, count/2]. */
export function wrapOffset(index: number, active: number, count: number): number {
  if (count <= 0) return 0;
  let rel = index - active;
  if (rel > count / 2) rel -= count;
  if (rel < -count / 2) rel += count;
  return rel;
}

/** The next active index after moving `delta` places, looping. */
export function stepIndex(active: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((active + delta) % count) + count) % count;
}

/** Card size for a stage of `width` × `height`: as tall as 80% of the stage, never wider than `widthShare` of it. */
export function coverflowCardSize(width: number, height: number, aspect: number, widthShare = 0.46): { width: number; height: number } {
  const cardWidth = Math.max(0, Math.min(height * 0.8 * aspect, width * widthShare));
  return { width: cardWidth, height: aspect > 0 ? cardWidth / aspect : 0 };
}

export interface CoverflowPose {
  x: number;
  z: number;
  rotateY: number;
  rotateZ: number;
  scale: number;
  visible: boolean;
}

/** Where a card `rel` places from the centre sits, for a card `cardWidth` wide. */
export function coverflowPose(rel: number, cardWidth: number): CoverflowPose {
  const distance = Math.abs(rel);
  return {
    x: rel * cardWidth * SPACING,
    z: -distance * cardWidth * SPACING,
    rotateY: -rel * TILT_Y,
    rotateZ: rel * TILT_Z,
    scale: Math.max(MIN_SCALE, 1 - distance * SCALE_STEP),
    visible: distance <= COVERFLOW_MAX_VISIBLE,
  };
}

/** CSS `transform` for a pose; the card is centred on its stage first. */
export function coverflowTransform(pose: CoverflowPose): string {
  return `translate(-50%, -50%) translateX(${pose.x}px) translateZ(${pose.z}px) rotateY(${pose.rotateY}deg) rotateZ(${pose.rotateZ}deg) scale(${pose.scale})`;
}
