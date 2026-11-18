// Parts for the "object" line-art scenes (docs/history/427-*): scenes drawn as a still life of a few props instead of people.
// The drawing is written as a small SVG string in a 400 × 200 space (`ink`), turned into the same ink / paper / flat-colour paths
// the rest of the kit draws (wobble filter, paper that follows the mode, `--la-*` colours), and the pieces a scene animates are
// named with `data-n` and moved from the shared loop with `pose`. Nothing here adds an animation loop of its own.
import { PAPER, f } from '@/lib/line-art/ink';

const NS = 'http://www.w3.org/2000/svg';

/** line width in the 400-unit drawing space (the drawing is shown at ×2, like the other scenes' 800-unit space) */
const SW = 0.62;
/** the line widths the drawings were designed with (2.2) are scaled to SW */
const WIDTH_RATIO = SW / 2.2;

export type Parts = Record<string, SVGElement>;

const COLOURS: Record<string, string> = {
  '--ink': 'currentColor',
  '--paper': PAPER,
  '--pri': 'var(--la-primary)',
  '--heart': 'var(--la-heart)',
  '--glow': 'var(--la-glow)',
};

function colour(v: string): string {
  const name = v.trim().replace(/^var\((--[\w-]+)\)$/, '$1');
  return COLOURS[name] ?? v.trim();
}

function paint(n: SVGElement, prop: 'fill' | 'stroke', value: string) {
  const v = colour(value);
  if (prop === 'fill' && v === PAPER) { n.setAttribute('fill', PAPER); n.classList.add('pp'); return; }
  if (v.startsWith('var(')) { n.removeAttribute(prop); n.style[prop] = v; if (prop === 'fill') n.classList.remove('pp'); return; }
  n.setAttribute(prop, v);
}

function convert(src: Element): SVGElement {
  const n = document.createElementNS(NS, src.tagName) as SVGElement;
  for (const a of Array.from(src.attributes)) if (a.name !== 'class' && a.name !== 'style' && a.name !== 'data-n') n.setAttribute(a.name, a.value);
  const cls = new Set((src.getAttribute('class') ?? '').split(/\s+/));
  const fine = cls.has('t');
  let width = SW;
  const set = (fill: string, stroke: string, w = SW, opacity?: number) => {
    paint(n, 'fill', fill); paint(n, 'stroke', stroke); width = w;
    if (stroke !== 'none') { n.setAttribute('stroke-linecap', 'round'); n.setAttribute('stroke-linejoin', 'round'); }
    if (opacity !== undefined) n.setAttribute('opacity', String(opacity));
  };
  if (cls.has('k')) set('none', '--ink');
  else if (cls.has('p')) set(PAPER, '--ink');
  else if (cls.has('b')) set('none', '--pri', SW * 1.15);
  else if (cls.has('bf')) set('--pri', '--ink', SW * 0.9);
  else if (cls.has('h')) set('none', '--heart', SW * 1.2);
  else if (cls.has('hf')) set('--heart', '--ink', SW * 0.9);
  else if (cls.has('gl')) set('--glow', '--ink', SW * 0.9);
  else if (cls.has('gb')) set('--glow', 'none', SW, 0.45);
  else if (cls.has('dots')) set('none', '--ink', 1.6, 0.45);
  if (fine) { width *= 0.6; n.setAttribute('opacity', '0.55'); }
  if (cls.has('dash')) n.setAttribute('stroke-dasharray', '3 3.6');
  // inline declarations of the design: stroke width, dash, colours
  for (const decl of (src.getAttribute('style') ?? '').split(';')) {
    const [k, v] = decl.split(':').map((s) => s.trim());
    if (!k || !v) continue;
    if (k === 'stroke-width') width = parseFloat(v) * WIDTH_RATIO;
    else if (k === 'stroke-dasharray') n.setAttribute('stroke-dasharray', v);
    else if (k === 'fill') paint(n, 'fill', v);
    else if (k === 'stroke') paint(n, 'stroke', v);
    else if (k === 'stroke-linecap') n.setAttribute('stroke-linecap', v);
  }
  if (n.hasAttribute('stroke') || n.style.stroke) n.setAttribute('stroke-width', f(width));
  return n;
}

/** Turn a drawing (SVG markup in a 400 × 200 space) into ink paths inside `parent`; returns the pieces named with `data-n`. */
export function ink(parent: Element, markup: string): Parts {
  const doc = new DOMParser().parseFromString(`<svg xmlns="${NS}">${markup}</svg>`, 'image/svg+xml');
  const root = document.createElementNS(NS, 'g');
  root.setAttribute('transform', 'scale(2)');
  parent.appendChild(root);
  const parts: Parts = {};
  const walk = (from: Element, to: Element) => {
    for (const child of Array.from(from.children)) {
      const n = convert(child);
      to.appendChild(n);
      const name = child.getAttribute('data-n');
      if (name) parts[name] = n;
      walk(child, n);
    }
  };
  walk(doc.documentElement, root);
  return parts;
}

export interface Pose { x?: number; y?: number; r?: number; s?: number; sy?: number; ox?: number; oy?: number }

/** Move a named piece: translate by (x, y), then rotate by `r` degrees and scale by `s` (× `sy`) around the pivot (ox, oy). */
export function pose(n: SVGElement, p: Pose): void {
  const { x = 0, y = 0, r = 0, s = 1, ox = 0, oy = 0 } = p;
  const sy = p.sy ?? s;
  n.setAttribute('transform', `translate(${f(x)} ${f(y)}) translate(${f(ox)} ${f(oy)}) rotate(${f(r)}) scale(${f(s)} ${f(sy)}) translate(${f(-ox)} ${f(-oy)})`);
}

export const show = (n: SVGElement, o: number) => n.setAttribute('opacity', f(Math.max(0, Math.min(1, o))));

/** −1…1 wave with a period in seconds */
export const wave = (t: number, period: number, phase = 0) => Math.sin((t / period + phase) * Math.PI * 2);
/** 0…1 saw with a period in seconds (always positive) */
export const saw = (t: number, period: number, phase = 0) => { const u = (t / period + phase) % 1; return u < 0 ? u + 1 : u; };

/** Piecewise-linear value over 0…1: keys are [u, value] pairs sorted by u. */
export function keys(u: number, ks: ReadonlyArray<readonly [number, number]>): number {
  if (u <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (u <= ks[i][0]) { const [a, va] = ks[i - 1], [b, vb] = ks[i]; return va + ((vb - va) * (u - a)) / (b - a || 1); }
  }
  return ks[ks.length - 1][1];
}
