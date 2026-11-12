// Shared scene parts: the svg card, windows that light up at night, pigeons.
import { el, pen, shape, blot, inkDefs, f, PAPER, type Vec } from '@/lib/line-art/ink';
import { smooth, minJerk, clamp } from '@/lib/line-art/motion';
import { tint } from './figure';

/** Visible text a scene needs, already translated by the caller. */
export interface SceneLabels { label: string; hint?: string; /** a real number shown in the drawing (the milestone's scoreboard, the 404 plate) */ value?: string }

export interface Stage { svg: SVGSVGElement; scene: SVGGElement; glow: SVGGElement; glowFill: string }

let instance = 0;

export function stage(host: Element, w: number, h: number, label: string, prefix: string): Stage {
  const id = `la-${prefix}${++instance}`; // unique per mount, so two scenes never share a filter or gradient id
  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': label, class: 'ink-scene', preserveAspectRatio: 'xMidYMid slice' });
  const { filter } = inkDefs(svg, id);
  svg.style.color = '';
  // warm light for windows and lamps
  const defs = svg.querySelector('defs')!;
  const rg = el('radialGradient', { id: `${id}-glow` }, defs);
  const s1 = el('stop', { offset: '0' }, rg); s1.style.stopColor = 'var(--la-glow)'; s1.style.stopOpacity = '0.9';
  const s2 = el('stop', { offset: '1' }, rg); s2.style.stopColor = 'var(--la-glow)'; s2.style.stopOpacity = '0';
  host.appendChild(svg);
  const scene = el('g', { filter }, svg);
  const glow = el('g', { 'pointer-events': 'none' }, svg);
  return { svg, scene, glow, glowFill: `url(#${id}-glow)` };
}

/** A window: paper pane, a warm fill that turns on at night past `threshold`, frame and glazing bars. */
export function windowPane(parent: Element, x: number, y: number, w: number, h: number, opts: { threshold: number; arch?: boolean; bars?: 'cross' | 'v' | 'none' }) {
  const g = el('g', {}, parent);
  const outline = opts.arch
    ? `M${x} ${y + h} L${x} ${y + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2} L${x + w} ${y + h}Z`
    : `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h}Z`;
  el('path', { d: outline, fill: PAPER }, g);
  const lit = tint(el('path', { d: outline, opacity: 0 }, g), 'var(--la-glow)');
  const fr = pen(g, 0.9); fr.setAttribute('d', outline);
  const bars = opts.bars ?? 'cross';
  if (bars !== 'none') {
    const b = pen(g, 0.55);
    const mx = x + w / 2, my = y + (opts.arch ? w / 2 + (h - w / 2) * 0.45 : h * 0.5);
    b.setAttribute('d', bars === 'cross' ? `M${f(mx)} ${y + (opts.arch ? 0 : 0)} L${f(mx)} ${y + h} M${x} ${f(my)} L${x + w} ${f(my)}` : `M${f(mx)} ${y} L${f(mx)} ${y + h}`);
  }
  // a sill
  pen(g, 0.9).setAttribute('d', `M${x - 2} ${y + h + 1.2} L${x + w + 2} ${y + h + 1.2}`);
  return {
    step(night: number, t: number) {
      const on = smooth(opts.threshold, opts.threshold + 0.12, night);
      lit.setAttribute('opacity', f(on * (0.82 + 0.06 * Math.sin(t * 1.3 + x))));
    },
  };
}

/** Pigeons that peck about, scatter when someone walks close or is tapped, sit on a ledge, come back. */
export class Pigeon {
  g: SVGGElement; x: number; y: number; dir: 1 | -1;
  private home: Vec; private perch: Vec;
  private state: 'ground' | 'up' | 'perched' | 'down' = 'ground';
  private t = 0; private from: Vec = [0, 0]; private to: Vec = [0, 0];
  private body: SVGPathElement; private head: SVGPathElement; private wing: SVGPathElement; private legs: SVGPathElement; private eye: SVGPathElement;
  private seed: number;
  constructor(parent: Element, home: Vec, perch: Vec, seed: number, onTap: () => void) {
    this.home = home; this.perch = perch; this.x = home[0]; this.y = home[1]; this.seed = seed;
    this.dir = seed % 2 ? 1 : -1;
    this.g = el('g', { class: 'pigeon' }, parent);
    this.legs = pen(this.g, 0.6);
    this.body = shape(this.g, 0.8);
    this.wing = pen(this.g, 0.7);
    this.head = shape(this.g, 0.8);
    this.eye = blot(this.g);
    const hit = el('circle', { r: 11, cy: -3, fill: 'transparent' }, this.g);
    hit.addEventListener('pointerdown', (e) => { e.stopPropagation(); onTap(); });
  }
  get flying(): boolean { return this.state === 'up' || this.state === 'down'; }
  scare(): void {
    if (this.state !== 'ground') return;
    this.state = 'up'; this.t = 0; this.from = [this.x, this.y]; this.to = this.perch;
    this.dir = this.perch[0] > this.x ? 1 : -1;
  }
  step(t: number, dt: number): void {
    this.t += dt;
    let flap = 0, peck = 0, tuck = 0;
    if (this.state === 'ground') {
      const k = t * 1.4 + this.seed * 1.7;
      peck = Math.max(0, Math.sin(k * 2.1)) ** 6; // a quick dip now and then
      const stroll = Math.sin(k * 0.35) * 14;
      const nx = this.home[0] + stroll;
      if (Math.abs(nx - this.x) > 0.02) this.dir = nx > this.x ? 1 : -1;
      this.x = nx; this.y = this.home[1];
    } else if (this.state === 'up' || this.state === 'down') {
      const dur = 1.5, u = clamp(this.t / dur, 0, 1), e = minJerk(u);
      this.x = this.from[0] + (this.to[0] - this.from[0]) * e;
      this.y = this.from[1] + (this.to[1] - this.from[1]) * e - Math.sin(Math.PI * u) * 34;
      flap = Math.sin(this.t * 34) * (1 - smooth(0.8, 1, u) * 0.7);
      if (u >= 1) {
        if (this.state === 'up') { this.state = 'perched'; this.t = 0; }
        else { this.state = 'ground'; this.t = 0; }
      }
    } else {
      tuck = 1;
      if (this.t > 6 + (this.seed % 3) * 1.5) { this.state = 'down'; this.t = 0; this.from = [this.x, this.y]; this.to = this.home; this.dir = this.home[0] > this.x ? 1 : -1; }
    }
    const air = this.state === 'up' || this.state === 'down';
    this.g.setAttribute('transform', `translate(${f(this.x)} ${f(this.y)}) scale(${this.dir * 1.25} 1.25)`);
    this.body.setAttribute('d', `M-7 -5 Q-4 -10 2 -9 Q6.4 -8.4 6.2 -5 Q5 -1.4 -1 -1.4 Q-6 -1.6 -9 -3.4 L-11.4 -4.6 Q-9.4 -5.8 -7 -5Z`);
    const hx = 6 + peck * 3.2, hy = -10.2 + peck * 6.8 + tuck * 1.4;
    this.head.setAttribute('d', `M${f(hx - 2.2)} ${f(hy)} a2.2 2.2 0 1 0 4.4 0 a2.2 2.2 0 1 0 -4.4 0Z`);
    this.eye.setAttribute('d', `M${f(hx + 0.6)} ${f(hy - 0.5)} a0.5 0.5 0 1 0 1 0 a0.5 0.5 0 1 0 -1 0Z M${f(hx + 2)} ${f(hy - 0.4)} L${f(hx + 3.8)} ${f(hy + 0.3)} L${f(hx + 2)} ${f(hy + 0.8)}Z`);
    if (air) {
      const a = flap * 9;
      this.wing.setAttribute('d', `M-3 -6 Q-2 ${f(-12 - a)} ${f(-8)} ${f(-14 - a * 1.2)} M-1 -6 Q1 ${f(-11 - a * 0.8)} ${f(-4)} ${f(-15 - a)}`);
      this.legs.setAttribute('d', 'M-1 -1.6 L-4 0.4');
    } else {
      this.wing.setAttribute('d', 'M-5 -6.4 Q-1 -8.6 3.4 -6');
      this.legs.setAttribute('d', tuck ? '' : 'M-0.6 -1.6 L-0.2 1 M1.8 -1.6 L2.4 1');
    }
  }
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Sun by day, moon and stars by night. */
export function skyBits(parent: Element, rnd: (a?: number, b?: number) => number, o: { w: number; sun: Vec; moon: Vec; set: number; stars: number }) {
  const sun = el('circle', { r: 17, fill: PAPER, stroke: 'currentColor', 'stroke-width': 1.1 }, parent);
  const moon = shape(parent, 1.1);
  const stars = Array.from({ length: o.stars }, () => {
    const s = pen(parent, 0.7); const x = rnd(16, o.w - 16), y = rnd(12, o.moon[1] + 40), r = rnd(1.1, 2.2);
    s.setAttribute('d', `M${f(x - r)} ${f(y)} L${f(x + r)} ${f(y)} M${f(x)} ${f(y - r)} L${f(x)} ${f(y + r)}`);
    return { s, ph: rnd(0, 6) };
  });
  return {
    step(t: number, night: number) {
      sun.setAttribute('cx', f(o.sun[0] + night * 30)); sun.setAttribute('cy', f(o.sun[1] + smooth(0, 0.7, night) * o.set));
      sun.setAttribute('opacity', f(1 - smooth(0.5, 0.8, night)));
      const mx = o.moon[0], my = o.moon[1] + (1 - smooth(0.3, 1, night)) * o.set;
      moon.setAttribute('d', `M${f(mx)} ${f(my - 12)} A12 12 0 1 0 ${f(mx)} ${f(my + 12)} A8.6 12 0 1 1 ${f(mx)} ${f(my - 12)}Z`);
      moon.setAttribute('opacity', f(smooth(0.3, 0.8, night)));
      stars.forEach(({ s, ph }) => s.setAttribute('opacity', f(smooth(0.55, 1, night) * (0.55 + 0.45 * Math.sin(t * 1.7 + ph)))));
    },
  };
}
