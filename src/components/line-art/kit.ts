// The shared kit of the line-art scenes (docs/history/374-*): a scene skeleton (`defineScene`) that owns the layers, sky, clouds,
// wind, window/lamp light and the unmount, plus the props most scenes use — ground, houses, trees, lamps, a cat, confetti.
// A scene file only says what is in it and what happens; night, wind and cleanup come from here.
import { el, pen, shape, blot, f, pt, PAPER, type Vec } from '@/lib/line-art/ink';
import { pendulum, pointerWind, seeded, smooth, wobble, clamp, type Wind } from '@/lib/line-art/motion';
import { addScene } from './loop';
import { tint } from './figure';
import { lerp, skyBits, stage, windowPane, type SceneLabels } from './scene-common';

export type Draw = (t: number, dt: number, night: number, wv: number) => void;

export interface SceneSpec {
  id: string;
  w: number;
  h: number;
  /** y of the ground line */
  G: number;
  seed?: number;
  /** sun/moon positions; omit for a scene without a sky */
  sun?: Vec;
  moon?: Vec;
  set?: number;
  stars?: number;
  /** y of each slow cloud */
  clouds?: number[];
  ground?: 'paving' | 'grass' | 'floor' | false;
}

export interface Ctx {
  svg: SVGSVGElement;
  scene: SVGGElement;
  w: number;
  h: number;
  G: number;
  labels: SceneLabels;
  rnd: (a?: number, b?: number) => number;
  wind: Wind;
  /** layers, back to front */
  far: SVGGElement;
  back: SVGGElement;
  mid: SVGGElement;
  people: SVGGElement;
  front: SVGGElement;
  fx: SVGGElement;
  /** run something every frame before the scene's own draw */
  each(fn: Draw): void;
  /** a warm halo that comes on at night once `night` passes `threshold` (outside the ink filter) */
  light(x: number, y: number, r: number, threshold: number, k?: number): void;
  /** a warm halo you drive yourself (set its `opacity`), outside the ink filter */
  halo(x: number, y: number, r: number): SVGCircleElement;
}

export function defineScene(host: Element, labels: SceneLabels, spec: SceneSpec, build: (c: Ctx) => Draw | void): () => void {
  const st = stage(host, spec.w, spec.h, labels.label, spec.id);
  const rnd = seeded(spec.seed ?? 7);
  const wind = pointerWind(st.svg, 0.25);
  const layer = () => el('g', {}, st.scene);
  const sky = layer(), far = layer(), back = layer(), mid = layer(), people = layer(), front = layer();
  const fx = el('g', { 'pointer-events': 'none' }, st.scene);
  const steps: Draw[] = [];
  const halos: Array<{ n: SVGCircleElement; th: number; k: number }> = [];
  const c: Ctx = {
    svg: st.svg, scene: st.scene, w: spec.w, h: spec.h, G: spec.G, labels, rnd, wind, far, back, mid, people, front, fx,
    each: (fn) => { steps.push(fn); },
    light: (x, y, r, th, k = 0.5) => { halos.push({ n: el('circle', { cx: x, cy: y, r, fill: st.glowFill, opacity: 0 }, st.glow), th, k }); },
    halo: (x, y, r) => el('circle', { cx: x, cy: y, r, fill: st.glowFill, opacity: 0 }, st.glow),
  };
  const skyStep = spec.sun ? skyBits(sky, rnd, { w: spec.w, sun: spec.sun, moon: spec.moon ?? [spec.w * 0.72, spec.sun[1]], set: spec.set ?? 140, stars: spec.stars ?? 12 }) : null;
  const clouds = (spec.clouds ?? []).map((y, i) => ({ n: pen(sky, 0.9), x: rnd(0, spec.w), y, w: 54 + i * 18 + rnd(0, 20), v: 3 + i }));
  if (spec.ground) ground(c, spec.ground);
  const draw = build(c) ?? (() => {});
  return addScene({
    host,
    draw(t, dt, night) {
      const wv = wind.step(t);
      skyStep?.step(t, night);
      clouds.forEach((cl) => {
        const x = ((cl.x + t * cl.v + wv * 3) % (spec.w + 200)) - 100;
        cl.n.setAttribute('d', `M${f(x)} ${cl.y} L${f(x + cl.w)} ${cl.y} Q${f(x + cl.w + 9)} ${cl.y} ${f(x + cl.w + 9)} ${cl.y - 6} Q${f(x + cl.w + 9)} ${cl.y - 12} ${f(x + cl.w + 2)} ${cl.y - 11} M${f(x + 14)} ${cl.y + 7} L${f(x + cl.w * 0.6)} ${cl.y + 7}`);
        cl.n.setAttribute('opacity', f(1 - night * 0.6));
      });
      steps.forEach((s) => s(t, dt, night, wv));
      halos.forEach((h) => h.n.setAttribute('opacity', f(smooth(h.th, h.th + 0.3, night) * h.k)));
      draw(t, dt, night, wv);
    },
  });
}

/** The ground: paper below the ground line with the hairlines of its kind. */
export function ground(c: Ctx, kind: 'paving' | 'grass' | 'floor') {
  const { G, w, h } = c;
  shape(c.mid, 1).setAttribute('d', `M-2 ${G} L${w + 2} ${G} L${w + 2} ${h + 2} L-2 ${h + 2}Z`);
  if (kind === 'paving') {
    pen(c.mid, 0.45).setAttribute('d', [G + 18, G + 40].map((y) => `M0 ${y} L${w} ${y}`).join(' '));
    const tiles = pen(c.mid, 0.4); tiles.setAttribute('opacity', '0.55');
    tiles.setAttribute('d', Array.from({ length: Math.ceil(w / 26) + 2 }, (_, i) => { const x = i * 26 - 10; return `M${x} ${G} L${f(x - 6)} ${G + 18} M${f(x + 9)} ${G + 18} L${f(x + 1)} ${G + 40}`; }).join(' '));
  } else if (kind === 'floor') {
    pen(c.mid, 0.45).setAttribute('d', [G + 14, G + 34, G + 58].map((y) => `M0 ${y} L${w} ${y}`).join(' '));
  } else {
    const g = pen(c.mid, 0.55); g.setAttribute('opacity', '0.65');
    g.setAttribute('d', Array.from({ length: 30 }, () => { const x = c.rnd(6, w - 6), y = c.rnd(G + 12, h - 6); return `M${f(x)} ${f(y)} l-1.6 -4 M${f(x + 2)} ${f(y)} l0.6 -5 M${f(x + 4)} ${f(y)} l2 -3.6`; }).join(' '));
    pen(c.mid, 0.8).setAttribute('d', `M0 ${G + 22} Q${w / 2} ${G + 28} ${w} ${G + 20}`);
  }
}

/** Distant hills and roofs in diluted ink. */
export function skyline(c: Ctx, y: number, kind: 'hills' | 'roofs' = 'hills', seed = 3) {
  const r = seeded(seed);
  const g = el('g', { opacity: 0.3 }, c.far);
  let d = `M0 ${y}`;
  if (kind === 'hills') {
    for (let x = 0; x < c.w; x += 120) d += ` Q${x + 60} ${f(y - r(18, 44))} ${x + 120} ${f(y - r(0, 14))}`;
  } else {
    for (let x = 0; x < c.w;) { const bw = r(34, 70), bh = r(16, 46); d += ` L${f(x)} ${f(y - bh)} L${f(x + bw / 2)} ${f(y - bh - r(6, 14))} L${f(x + bw)} ${f(y - bh)} L${f(x + bw)} ${y}`; x += bw + r(4, 16); }
    d += ` L${c.w} ${y}`;
  }
  pen(g, 0.9).setAttribute('d', d);
}

/** A building: facade, cornice, a grid of windows that light up one by one at night, an arched door. */
export function house(c: Ctx, x: number, w: number, top: number, o: { cols?: number; rows?: number; th?: number[]; door?: boolean; arch?: boolean } = {}) {
  const { G } = c;
  const p = c.back;
  shape(p, 1.2).setAttribute('d', `M${x} ${G} L${x} ${top} L${x + w} ${top} L${x + w} ${G}Z`);
  shape(p, 1.2).setAttribute('d', `M${x - 5} ${top + 2} L${x + w + 5} ${top + 2} L${x + w + 3} ${top - 9} L${x - 3} ${top - 9}Z`);
  const cols = o.cols ?? Math.max(2, Math.round(w / 46)), rows = o.rows ?? Math.max(1, Math.round((G - top - 70) / 60));
  const cw = Math.min(24, (w - 16) / cols - 10), ch = 32;
  let i = 0;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const wx = x + 8 + ((w - 16) / cols) * (k + 0.5) - cw / 2, wy = top + 18 + r * (ch + 22);
    if (wy + ch > G - 52) continue;
    const win = windowPane(p, wx, wy, cw, ch, { threshold: o.th?.[i % o.th.length] ?? 0.25 + ((i * 37) % 7) * 0.09, arch: o.arch });
    c.each((t, _dt, night) => win.step(night, t));
    i++;
  }
  if (o.door !== false) {
    const dx = x + w / 2 - 12;
    shape(p, 1.1).setAttribute('d', `M${dx} ${G} L${dx} ${G - 38} Q${dx + 12} ${G - 52} ${dx + 24} ${G - 38} L${dx + 24} ${G}Z`);
    pen(p, 0.6).setAttribute('d', `M${dx + 12} ${G} L${dx + 12} ${G - 46} M${dx + 19} ${G - 18} l0 3`);
  }
}

/** A round-crowned tree that sways with the wind. */
export function tree(c: Ctx, x: number, s = 1, parent: Element = c.back) {
  const G = c.G;
  const g = el('g', {}, parent);
  pen(g, 1.3).setAttribute('d', `M${x} ${G} Q${x - 4 * s} ${G - 44 * s} ${x + 2 * s} ${G - 84 * s} M${x - 1 * s} ${G - 52 * s} Q${x - 14 * s} ${G - 64 * s} ${x - 20 * s} ${G - 76 * s} M${x + 1 * s} ${G - 66 * s} Q${x + 14 * s} ${G - 78 * s} ${x + 20 * s} ${G - 90 * s}`);
  const crown = el('g', {}, g);
  const k = (a: number, b: number) => `${f(x + a * s)} ${f(G - b * s)}`;
  shape(crown, 1.1).setAttribute('d', `M${k(-34, 82)} Q${k(-52, 90)} ${k(-40, 112)} Q${k(-44, 140)} ${k(-16, 142)} Q${k(-4, 166)} ${k(22, 150)} Q${k(50, 154)} ${k(48, 126)} Q${k(62, 106)} ${k(44, 92)} Q${k(36, 74)} ${k(14, 80)} Q${k(-4, 70)} ${k(-18, 80)} Q${k(-30, 70)} ${k(-34, 82)}Z`);
  pen(crown, 0.6).setAttribute('d', [[-22, 100], [10, 118], [26, 98], [-6, 134], [34, 126]].map(([a, b]) => `M${k(a, b)} q${4 * s} ${-3 * s} ${8 * s} 0`).join(' '));
  c.each((_t, _dt, _n, wv) => crown.setAttribute('transform', `rotate(${f((wv * 1.6 + wobble(_t * 0.6) * 0.8) * 1.1)} ${x} ${f(G - 80 * s)})`));
}

export function bush(c: Ctx, x: number, s = 1, parent: Element = c.mid) {
  const G = c.G, g = el('g', {}, parent);
  shape(g, 1.1).setAttribute('d', `M${x - 30 * s} ${G} Q${x - 34 * s} ${G - 18 * s} ${x - 16 * s} ${G - 22 * s} Q${x - 6 * s} ${G - 36 * s} ${f(x + 10 * s)} ${G - 26 * s} Q${x + 30 * s} ${G - 24 * s} ${x + 30 * s} ${G}Z`);
  pen(g, 0.6).setAttribute('d', `M${x - 12 * s} ${G - 14 * s} q${3 * s} ${-3 * s} ${6 * s} 0 M${x + 6 * s} ${G - 20 * s} q${3 * s} ${-3 * s} ${6 * s} 0`);
}

/** A street lamp that lights at night. */
export function lamp(c: Ctx, x: number, topY: number, th = 0.3, parent: Element = c.mid) {
  const G = c.G;
  shape(parent, 1.1).setAttribute('d', `M${x - 3} ${G} L${x - 1.4} ${topY + 20} L${x + 1.4} ${topY + 20} L${x + 3} ${G}Z`);
  pen(parent, 1).setAttribute('d', `M${x - 7} ${G} L${x + 7} ${G}`);
  shape(parent, 1.1).setAttribute('d', `M${x - 9} ${topY + 18} L${x + 9} ${topY + 18} L${x + 6} ${topY} L${x - 6} ${topY}Z`);
  const pane = tint(el('path', { d: `M${x - 7} ${topY + 16} L${x + 7} ${topY + 16} L${x + 5} ${topY + 2} L${x - 5} ${topY + 2}Z`, opacity: 0 }, parent), 'var(--la-glow)');
  shape(parent, 1.1).setAttribute('d', `M${x - 10} ${topY + 1} L${x + 10} ${topY + 1} L${x} ${topY - 10}Z`);
  c.each((_t, _dt, night) => pane.setAttribute('opacity', f(smooth(th, th + 0.3, night))));
  c.light(x, topY + 10, 66, th, 0.55);
  c.light(x, G - 4, 40, th + 0.05, 0.22);
}

export function bench(c: Ctx, x: number, w = 76, parent: Element = c.mid) {
  const G = c.G;
  pen(parent, 1.1).setAttribute('d', `M${x + 6} ${G - 4} L${x + 8} ${G - 22} M${x + w - 6} ${G - 4} L${x + w - 8} ${G - 22} M${x} ${G - 22} L${x + w} ${G - 22} M${x} ${G - 26} L${x + w} ${G - 26} M${x + 10} ${G - 26} L${x + 8} ${G - 48} M${x + w - 10} ${G - 26} L${x + w - 8} ${G - 48} M${x + 2} ${G - 42} L${x + w - 2} ${G - 42} M${x + 2} ${G - 48} L${x + w - 2} ${G - 48}`);
}

export function fence(c: Ctx, x0: number, x1: number, h = 26, parent: Element = c.mid) {
  const G = c.G;
  let d = `M${x0} ${G - h * 0.7} L${x1} ${G - h * 0.7} M${x0} ${G - h * 0.25} L${x1} ${G - h * 0.25}`;
  for (let x = x0 + 4; x <= x1; x += 12) d += ` M${x} ${G} L${x} ${G - h} l2.4 -4 l2.4 4`;
  pen(parent, 0.9).setAttribute('d', d);
}

/** A small table or desk; returns its top y. */
export function table(c: Ctx, x: number, w: number, topY: number, parent: Element = c.mid) {
  const G = c.G;
  pen(parent, 1.3).setAttribute('d', `M${x + 8} ${topY + 8} L${x + 8} ${G} M${x + w - 8} ${topY + 8} L${x + w - 8} ${G}`);
  shape(parent, 1.2).setAttribute('d', `M${x} ${topY} L${x + w} ${topY} L${x + w} ${topY + 8} L${x} ${topY + 8}Z`);
  return topY;
}

/** A lit lamp bulb on a table (desk lamp). */
export function deskLamp(c: Ctx, x: number, topY: number, th = 0.3, parent: Element = c.mid) {
  shape(parent, 1).setAttribute('d', `M${x - 9} ${topY} Q${x - 9} ${topY - 6} ${x} ${topY - 6} Q${x + 9} ${topY - 6} ${x + 9} ${topY}Z`);
  pen(parent, 1.3).setAttribute('d', `M${x} ${topY - 6} L${x} ${topY - 28} L${x + 18} ${topY - 44}`);
  shape(parent, 1.1).setAttribute('d', `M${x + 10} ${topY - 50} L${x + 34} ${topY - 38} L${x + 26} ${topY - 26} L${x + 4} ${topY - 38}Z`);
  const lit = tint(el('path', { d: `M${x + 12} ${topY - 48} L${x + 32} ${topY - 38} L${x + 25} ${topY - 28} L${x + 7} ${topY - 38}Z`, opacity: 0 }, parent), 'var(--la-glow)');
  c.each((_t, _dt, night) => lit.setAttribute('opacity', f(smooth(th, th + 0.3, night))));
  c.light(x + 20, topY - 36, 70, th, 0.5);
}

/** A cat: sits, grooms, stretches when poked, and sleeps at night. */
export class Cat {
  g: SVGGElement;
  private body: SVGPathElement; private head: SVGPathElement; private tail: SVGPathElement; private ears: SVGPathElement; private face: SVGPathElement;
  private sw = pendulum(9, 1);
  private u = 0; private goal = 0; private timer = 3; private sleepy = 0;
  constructor(parent: Element, public x: number, public y: number, public dir: 1 | -1 = 1, public s = 1) {
    this.g = el('g', { style: 'cursor:pointer' }, parent);
    this.tail = pen(this.g, 1.4);
    this.body = shape(this.g, 1);
    this.ears = shape(this.g, 0.8);
    this.head = shape(this.g, 1);
    this.face = blot(this.g);
    el('circle', { r: 16, cy: -12, fill: 'transparent' }, this.g);
    this.g.addEventListener('pointerdown', () => this.poke());
  }
  poke() { this.goal = 1; this.timer = 0; this.sw.kick(2.2); }
  step(t: number, dt: number, night: number) {
    this.timer += dt;
    if (this.goal === 1 && this.timer > 2.4) { this.goal = 0; this.timer = 0; }
    else if (this.goal === 0 && this.timer > 11) { this.goal = 1; this.timer = 0; }
    this.u += (this.goal - this.u) * Math.min(1, dt * 3);
    this.sleepy += ((night > 0.6 ? 1 : 0) - this.sleepy) * Math.min(1, dt * 1.5);
    const u = this.u, z = this.sleepy;
    const len = lerp(lerp(16, 24, u), 26, z), hgt = lerp(lerp(15, 9, u), 9, z);
    const hx = lerp(lerp(4, len - 3, u), len - 2, z), hy = lerp(lerp(-hgt - 2, -6, u), -7, z);
    this.g.setAttribute('transform', `translate(${f(this.x)} ${f(this.y)}) scale(${this.dir * this.s} ${this.s})`);
    this.body.setAttribute('d', `M${-len / 2} 0 C${-len / 2 - 1} ${-hgt * 0.7} ${-len * 0.2} ${-hgt} ${f(len * 0.1)} ${-hgt} C${f(len * 0.42)} ${-hgt} ${f(len / 2 + 1)} ${-hgt * 0.5} ${f(len / 2)} 0Z`);
    this.head.setAttribute('d', `M${f(hx - 5)} ${f(hy)} a5 4.6 0 1 0 10 0 a5 4.6 0 1 0 -10 0Z`);
    this.ears.setAttribute('d', `M${f(hx - 4.6)} ${f(hy - 2)} L${f(hx - 4)} ${f(hy - 8.4)} L${f(hx - 0.6)} ${f(hy - 4)}Z M${f(hx + 0.8)} ${f(hy - 4)} L${f(hx + 4)} ${f(hy - 8.4)} L${f(hx + 4.8)} ${f(hy - 2)}Z`);
    this.face.setAttribute('d', z > 0.5 ? `M${f(hx - 0.5)} ${f(hy)} l2 0.4 M${f(hx + 2.4)} ${f(hy)} l2 0.4` : `M${f(hx + 0.6)} ${f(hy - 0.8)} a0.8 0.8 0 1 0 1.6 0 a0.8 0.8 0 1 0 -1.6 0 M${f(hx + 3.2)} ${f(hy - 0.8)} a0.8 0.8 0 1 0 1.6 0 a0.8 0.8 0 1 0 -1.6 0`);
    const a = this.sw.step(Math.sin(t * 1.1) * 0.5, dt);
    const lift = lerp(1, 0.5, z);
    this.tail.setAttribute('d', `M${f(-len / 2 + 1)} ${-1} Q${f(-len / 2 - 8)} ${f(-4 * lift)} ${f(-len / 2 - 8 + a * 6)} ${f(-hgt - 6 * lift - u * 6)}`);
    this.tail.setAttribute('opacity', '1');
  }
}

/** Paper confetti in the brand colours. */
export function confetti(parent: Element, rnd: (a?: number, b?: number) => number, n = 44) {
  const kinds = ['var(--la-primary)', 'var(--la-heart)', 'var(--la-cloth-2)'];
  const bits = Array.from({ length: n }, (_, i) => ({
    n: tint(el('path', { d: 'M-2.4 -1.1 L2.4 -1.1 L2.4 1.1 L-2.4 1.1Z', stroke: 'currentColor', 'stroke-width': 0.5, opacity: 0 }, parent), kinds[i % 3]),
    x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0, life: 0,
  }));
  return {
    burst(x: number, y: number, spread = 24) {
      bits.forEach((b) => {
        b.x = x + rnd(-spread, spread); b.y = y;
        const a = rnd(-Math.PI * 0.92, -Math.PI * 0.08), s = rnd(120, 340);
        b.vx = Math.cos(a) * s; b.vy = Math.sin(a) * s; b.r = rnd(0, 360); b.vr = rnd(-540, 540); b.life = rnd(2.2, 3.6);
      });
    },
    step(dt: number) {
      bits.forEach((b) => {
        if (b.life <= 0) { b.n.setAttribute('opacity', '0'); return; }
        b.life -= dt; b.vy += 340 * dt; b.vx *= Math.pow(0.4, dt); b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt;
        b.n.setAttribute('opacity', f(Math.min(1, b.life / 0.6)));
        b.n.setAttribute('transform', `translate(${f(b.x)} ${f(b.y)}) rotate(${f(b.r)}) scale(1 ${f(0.3 + 0.7 * Math.abs(Math.cos(b.r * 0.05)))})`);
      });
    },
  };
}

/** A four-point sparkle that pops and fades. */
export function sparkle(parent: Element, colour = 'var(--la-heart)') {
  const g = el('g', { opacity: 0 }, parent);
  tint(el('path', { d: 'M0 -6 Q1 -1 6 0 Q1 1 0 6 Q-1 1 -6 0 Q-1 -1 0 -6Z', stroke: 'currentColor', 'stroke-width': 0.6, 'stroke-linejoin': 'round' }, g), colour);
  let life = -1, x = 0, y = 0;
  return {
    fire(nx: number, ny: number) { x = nx; y = ny; life = 0; },
    step(dt: number) {
      if (life < 0) return;
      life += dt;
      const u = life / 0.9;
      if (u >= 1) { life = -1; g.setAttribute('opacity', '0'); return; }
      g.setAttribute('opacity', f(u < 0.3 ? 1 : 1 - (u - 0.3) / 0.7));
      g.setAttribute('transform', `translate(${f(x)} ${f(y - u * 6)}) scale(${f(0.4 + Math.sin(Math.min(1, u * 2) * Math.PI / 2) * 1.0)}) rotate(${f(u * 50)})`);
    },
  };
}

/** A small speech bubble (rounded, with a tail), returns an update(x, y, dir, shown 0..1). */
export function bubble(parent: Element, w: number, h: number) {
  const g = el('g', { opacity: 0 }, parent);
  const body = shape(g, 1);
  return {
    g,
    inner: g,
    place(x: number, y: number, dir: 1 | -1, shown: number) {
      g.setAttribute('opacity', f(clamp(shown * 1.5, 0, 1)));
      g.setAttribute('transform', `translate(${f(x)} ${f(y)}) scale(${f(0.6 + 0.4 * shown)})`);
      const r = 7, tx = dir * (w * 0.22);
      body.setAttribute('d', `M${-w / 2 + r} ${-h} L${w / 2 - r} ${-h} Q${w / 2} ${-h} ${w / 2} ${-h + r} L${w / 2} ${-r} Q${w / 2} 0 ${w / 2 - r} 0 L${f(tx + 6)} 0 L${f(tx)} 8 L${f(tx - 2)} 0 L${-w / 2 + r} 0 Q${-w / 2} 0 ${-w / 2} ${-r} L${-w / 2} ${-h + r} Q${-w / 2} ${-h} ${-w / 2 + r} ${-h}Z`);
    },
  };
}

/**
 * A looping script: each step is called every frame until it returns true, then the next one starts (and after the last, the first).
 * `wait(s)`, `act(fn)` (runs once), `walkTo(person, x)` build the common ones.
 */
export type Step = (dt: number) => boolean;
export function script(...steps: Step[]): (dt: number) => void {
  let i = 0;
  return (dt) => { if (steps[i](dt)) i = (i + 1) % steps.length; };
}
export const wait = (sec: number): Step => { let t = 0; return (dt) => { t += dt; if (t >= sec) { t = 0; return true; } return false; }; };
export const act = (fn: () => void): Step => () => { fn(); return true; };
/** until `cond()` is true */
export const until = (cond: () => boolean): Step => () => cond();
/** walk a Person to x (facing the way of travel) and let it settle; reaches/props are the caller's business */
export function walkTo(p: { x: number; dir: 1 | -1; go: number; goTarget: number; scale: number; walk: { speed: number } }, x: number): Step {
  let started = false;
  return () => {
    if (!started) { started = true; p.dir = x >= p.x ? 1 : -1; p.goTarget = 1; }
    const lead = p.walk.speed * p.scale * 0.3;
    if (p.dir * (x - p.x) <= lead) { p.goTarget = 0; if (p.go < 0.03) { started = false; return true; } }
    return false;
  };
}

export { el, pen, shape, blot, f, pt, PAPER, lerp, clamp, smooth, wobble, tint };
export type { Vec };
