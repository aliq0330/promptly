// A Promptly figure (docs/history/372-*): the walker from line-art-animation (MIT), generalised.
// Drawn in figure space (feet on y 120, facing +x, standing on x 40) and placed with place().
// Colours are CSS custom properties so the figure follows the page theme.
import { el, pen, shape, blot, paint, limb, shoe, place, f, pt, PEN, PAPER, type Vec, type Limb } from '@/lib/line-art/ink';
import { gait, type Gait, type GaitKind } from '@/lib/line-art/gait';
import { spring } from '@/lib/line-art/motion';
import { elbowFor, reachable } from '@/lib/line-art/arm';

export type Hair = 'hat' | 'short' | 'bun' | 'long' | 'cap';
export interface Look {
  /** CSS colour for the coat/dress, or 'paper'. */
  coat: string;
  /** Hem height in figure space: 92 coat, 102 dress. */
  hem?: number;
  /** CSS colour for trousers; omit for paper legs. */
  legs?: string;
  hair: Hair;
  /** Cap colour when hair is 'cap'. */
  cap?: string;
  scarf?: string;
}

/** Fill a node with a CSS colour (custom properties included) and drop the paper class. */
export function tint<T extends SVGElement>(n: T, colour: string): T {
  n.classList.remove('pp');
  n.removeAttribute('fill');
  n.style.fill = colour;
  return n;
}
function tintLimb(l: Limb, colour: string): Limb { const p = l.g.querySelector('path'); if (p) tint(p, colour); return l; }

const mixP = (a: Vec, b: Vec, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const approach = (x: number, to: number, step: number) => (x < to ? Math.min(to, x + step) : Math.max(to, x - step));

export class Person {
  g: SVGGElement;
  x = 0; y = 0; dir: 1 | -1 = 1; scale = 1;
  walk: Gait;
  phase = 0; go = 1; goTarget = 1;
  /** Near-hand target in figure space; null lets the arm swing. */
  reach: Vec | null = null; reachAmt = 0;
  farReach: Vec | null = null; farAmt = 0;
  hatLift = 0;
  /** Things held in the near hand, drawn at the hand in figure space. */
  prop: SVGGElement;
  propTilt = 0;
  /** The near hand in figure space, after update(). */
  hand: Vec = [40, 80];
  private look: Look;
  private farArm: Limb; private nearArm: Limb; private legs: Limb[]; private shoes: SVGPathElement[];
  private coat: SVGPathElement; private seam: SVGPathElement;
  private head: SVGEllipseElement; private hair: SVGPathElement; private hat?: SVGPathElement;
  private scarf?: SVGPathElement; private scarfTail?: SVGPathElement;
  private swing = [spring(60, 9), spring(60, 9)];
  private tail = spring(30, 4); private hairSwing = spring(26, 4);

  constructor(parent: Element, look: Look, kind: GaitKind = 'walk') {
    this.look = look;
    this.walk = gait({ kind });
    const g = (this.g = el('g', { class: 'figure' }, parent));
    this.farArm = limb(g, 3.6);
    this.legs = [limb(g, 4.2), limb(g, 4.2)];
    if (look.legs) this.legs.forEach((l) => tintLimb(l, look.legs!));
    this.shoes = [blot(g), blot(g)];
    this.coat = look.coat === 'paper' ? shape(g) : tint(paint(g, 'none'), look.coat);
    if (look.coat !== 'paper') tintLimb(this.farArm, look.coat);
    this.seam = pen(g, PEN * 0.6);
    if (look.scarf) this.scarfTail = tint(paint(g, 'none', PEN * 0.8), look.scarf);
    this.head = el('ellipse', { rx: 3.6, ry: 4.6, fill: PAPER, stroke: 'currentColor', 'stroke-width': PEN }, g);
    this.hair = blot(g);
    if (look.hair === 'hat') this.hat = blot(g);
    if (look.hair === 'cap') this.hat = tint(paint(g, 'none', PEN * 0.8), look.cap ?? 'currentColor');
    if (look.scarf) this.scarf = tint(paint(g, 'none', PEN * 0.8), look.scarf);
    this.nearArm = limb(g, 3.6);
    if (look.coat !== 'paper') tintLimb(this.nearArm, look.coat);
    this.prop = el('g', {}, g);
  }

  /** Advance the walk and redraw. wind ≈ -2.4…2.4. */
  update(t: number, dt: number, wind = 0): void {
    const w = this.walk;
    this.go = approach(this.go, this.goTarget, dt * 1.7);
    const go = this.go;
    this.phase += (dt / w.period) * go;
    this.x += this.dir * w.speed * this.scale * dt * go;
    place(this.g, this.x, this.y, this.dir, this.scale);
    this.reachAmt = approach(this.reachAmt, this.reach ? 1 : 0, dt * 2.6);
    this.farAmt = approach(this.farAmt, this.farReach ? 1 : 0, dt * 2.6);

    const p = w.pose(this.phase, go);
    const b = p.bob;
    const g = this.g;
    p.feet.forEach((fo, i) => { this.legs[i].draw([p.hip, fo.knee, fo.ankle], [0.3, 0.8]); shoe(this.shoes[i], fo.ankle, fo.pitch); });
    g.insertBefore(this.legs[p.front].g, this.coat); g.insertBefore(this.shoes[p.front], this.coat);

    // Coat or dress, drawn around the forward knee so the hem opens with the stride.
    const kF = p.feet[p.front].knee, aF = p.feet[p.front].ankle;
    const sh: Vec = [41, 41 + b], hem = this.look.hem ?? 92;
    const fx = Math.max(kF[0] + 2.4, 46.4) + (hem > 95 ? 1.4 : 0);
    const back = hem > 95 ? 29 : 30.6;
    this.coat.setAttribute('d', `M${f(sh[0] - 6)} ${f(sh[1] + 1)} Q${f(sh[0] - 1)} ${f(sh[1] - 2.4)} ${f(sh[0] + 5)} ${f(sh[1] + 1)} L${f(fx - 0.6)} ${f(70 + b)} Q${f(fx)} ${f(82 + b * 0.5)} ${f(Math.max(fx, aF[0] - 4))} ${hem} L${f(back)} ${hem + 1} L${f(33.2)} ${f(70 + b)}Z`);
    this.seam.setAttribute('d', `M${f(sh[0] + 2.6)} ${f(sh[1] + 4)} L${f(sh[0] + 3.8)} ${f(66 + b)}`);

    // Head and hair.
    const cx = 42.6, cy = 31.6 + b;
    this.head.setAttribute('cx', f(cx)); this.head.setAttribute('cy', f(cy));
    const short = `M${f(cx - 3.9)} ${f(cy + 1.8)} C${f(cx - 4.8)} ${f(cy - 4.5)} ${f(cx - 1)} ${f(cy - 6.4)} ${f(cx + 2.2)} ${f(cy - 5.2)} C${f(cx + 4.2)} ${f(cy - 4.4)} ${f(cx + 4.1)} ${f(cy - 2.6)} ${f(cx + 3.4)} ${f(cy - 2)} C${f(cx + 1.2)} ${f(cy - 2.9)} ${f(cx - 0.6)} ${f(cy - 1.6)} ${f(cx - 1.4)} ${f(cy + 0.4)} C${f(cx - 1.9)} ${f(cy + 2.2)} ${f(cx - 2.8)} ${f(cy + 3)} ${f(cx - 3.9)} ${f(cy + 1.8)}Z`;
    const hs = this.hairSwing.step(-w.speed * 0.02 * go - wind * 1.2, dt);
    const lift = this.hatLift * 5;
    switch (this.look.hair) {
      case 'short': this.hair.setAttribute('d', short); break;
      case 'bun': this.hair.setAttribute('d', `${short} M${f(cx - 6.6)} ${f(cy - 3.4)} a2.2 2.2 0 1 0 4.4 0 a2.2 2.2 0 1 0 -4.4 0Z`); break;
      case 'long': this.hair.setAttribute('d', `${short} M${f(cx - 1)} ${f(cy - 3)} Q${f(cx - 5.3)} ${f(cy - 2.6)} ${f(cx - 5)} ${f(cy + 3)} L${f(cx - 5.6 + hs)} ${f(cy + 10)} Q${f(cx - 3 + hs * 0.5)} ${f(cy + 10.6)} ${f(cx - 2)} ${f(cy + 8.6)} L${f(cx - 1.6)} ${f(cy + 2)}Z`); break;
      case 'cap':
        this.hair.setAttribute('d', `M${f(cx - 3.9)} ${f(cy + 1.8)} C${f(cx - 4.4)} ${f(cy - 1)} ${f(cx - 3)} ${f(cy - 2)} ${f(cx - 1.2)} ${f(cy - 1.4)} C${f(cx - 1.6)} ${f(cy + 1)} ${f(cx - 2.6)} ${f(cy + 3)} ${f(cx - 3.9)} ${f(cy + 1.8)}Z`);
        this.hat!.setAttribute('d', `M${f(cx - 4.2)} ${f(cy - 1.4 - lift)} Q${f(cx - 4.4)} ${f(cy - 6.8 - lift)} ${f(cx + 0.2)} ${f(cy - 6.6 - lift)} Q${f(cx + 4.2)} ${f(cy - 6.3 - lift)} ${f(cx + 4)} ${f(cy - 2.4 - lift)} L${f(cx + 8.4)} ${f(cy - 1.8 - lift)} Q${f(cx + 8)} ${f(cy - 0.6 - lift)} ${f(cx + 3.4)} ${f(cy - 0.9 - lift)} L${f(cx - 4.2)} ${f(cy - 1.4 - lift)}Z`);
        break;
      case 'hat':
        this.hair.setAttribute('d', `M${f(cx - 3.9)} ${f(cy + 1.8)} C${f(cx - 4.4)} ${f(cy - 1)} ${f(cx - 3)} ${f(cy - 2)} ${f(cx - 1.2)} ${f(cy - 1.4)} C${f(cx - 1.6)} ${f(cy + 1)} ${f(cx - 2.6)} ${f(cy + 3)} ${f(cx - 3.9)} ${f(cy + 1.8)}Z`);
        this.hat!.setAttribute('d', `M${f(cx - 6.4)} ${f(cy - 3.6 - lift)} L${f(cx + 6.6)} ${f(cy - 3.6 - lift)} Q${f(cx + 4.4)} ${f(cy - 5 - lift)} ${f(cx + 4)} ${f(cy - 8 - lift)} Q${f(cx)} ${f(cy - 11 - lift)} ${f(cx - 3.8)} ${f(cy - 8 - lift)} Q${f(cx - 4.2)} ${f(cy - 5 - lift)} ${f(cx - 6.4)} ${f(cy - 3.6 - lift)}Z`);
        break;
    }
    if (this.scarf && this.scarfTail) {
      this.scarf.setAttribute('d', `M${f(cx - 4.6)} ${f(cy + 4.6)} Q${f(cx)} ${f(cy + 8.4)} ${f(cx + 4)} ${f(cy + 4.8)} L${f(cx + 4.4)} ${f(cy + 7.6)} Q${f(cx)} ${f(cy + 11)} ${f(cx - 4.8)} ${f(cy + 7.4)}Z`);
      const flow = this.tail.step(-6 - w.speed * 0.08 * go - wind * 5 * this.dir + Math.sin(t * 9) * 0.8 * go, dt);
      this.scarfTail.setAttribute('d', `M${f(cx - 3.6)} ${f(cy + 6)} Q${f(cx - 6 + flow * 0.4)} ${f(cy + 9)} ${f(cx - 4 + flow)} ${f(cy + 16 + flow * 0.2)} L${f(cx - 1 + flow * 0.9)} ${f(cy + 16.6 + flow * 0.2)} Q${f(cx - 3 + flow * 0.3)} ${f(cy + 10)} ${f(cx - 0.8)} ${f(cy + 7.4)}Z`);
    }

    // Arms swing opposite the legs through springs; a reach target pulls the hand there.
    const legSwing = (p.feet[0].ankle[0] - 40) / (w.stride / 2);
    const fa = (this.swing[0].step(-legSwing * 16 * go, dt) * Math.PI) / 180;
    const na = (this.swing[1].step(legSwing * 14 * go, dt) * Math.PI) / 180;
    const shF: Vec = [sh[0] - 1, sh[1] + 2], shN: Vec = [sh[0] + 1.6, sh[1] + 2.4];
    const arm = (s: Vec, a: Vec, bend: number, target: Vec | null, amt: number, l: Limb, gap: [number, number]): Vec => {
      const elb: Vec = [s[0] + 17 * Math.sin(a[0]), s[1] + 17 * Math.cos(a[0])];
      let hand: Vec = [elb[0] + 16 * Math.sin(a[0] + bend), elb[1] + 16 * Math.cos(a[0] + bend)];
      if (amt > 0.001 && target) {
        const e = amt * amt * (3 - 2 * amt);
        hand = reachable(s, mixP(hand, target, e));
        l.draw([s, elbowFor(s, hand), hand], gap);
      } else l.draw([s, elb, hand], gap);
      return hand;
    };
    arm(shF, [fa, 0], 0.25, this.farReach, this.farAmt, this.farArm, [0.2, 0.5]);
    this.hand = arm(shN, [na, 0], 0.1, this.reach, this.reachAmt, this.nearArm, [0.2, 0.4]);
    this.prop.setAttribute('transform', `translate(${pt(this.hand)}) rotate(${f(this.propTilt)})`);
  }

  /** Scene coordinates of a figure-space point. */
  toScene(lx: number, ly: number): Vec {
    return [this.x + this.dir * this.scale * (lx - 40), this.y + this.scale * (ly - 120)];
  }
  /** Figure-space coordinates of a scene point (for reach targets). */
  toLocal(sx: number, sy: number): Vec {
    return [40 + (sx - this.x) / (this.dir * this.scale), 120 + (sy - this.y) / this.scale];
  }
}

/** A prompt card: paper with a few lines of "text" and a pin, in local units (≈ 14 × 18). */
export function promptCard(parent: Element, opts: { w?: number; h?: number; brace?: boolean; lines?: number; accent?: string } = {}): SVGGElement {
  const w = opts.w ?? 13, h = opts.h ?? 16;
  const g = el('g', {}, parent);
  shape(g, 0.9).setAttribute('d', `M${f(-w / 2)} ${f(-h / 2 + 0.4)} Q0 ${f(-h / 2 - 0.3)} ${f(w / 2)} ${f(-h / 2)} L${f(w / 2 - 0.3)} ${f(h / 2)} Q0 ${f(h / 2 + 0.4)} ${f(-w / 2 + 0.2)} ${f(h / 2 - 0.2)}Z`);
  if (opts.brace) {
    const s = Math.min(w, h) / 20;
    const br = el('g', { transform: `translate(0 ${f(-h * 0.08)}) scale(${f(s * 0.62)}) translate(-32 -32)` }, g);
    const bp = el('path', { fill: 'none', 'stroke-width': 5.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', d: 'M25 13c-6 0-7.5 3-7.5 8v5.5c0 3.5-2 5.5-5.5 5.5 3.5 0 5.5 2 5.5 5.5V43c0 5 1.5 8 7.5 8M39 13c6 0 7.5 3 7.5 8v5.5c0 3.5 2 5.5 5.5 5.5-3.5 0-5.5 2-5.5 5.5V43c0 5-1.5 8-7.5 8' }, br);
    bp.style.stroke = 'var(--la-primary)';
    tint(el('path', { d: 'M32 41.5c-1-.8-9-6.4-9-12.2a4.6 4.6 0 0 1 9-1.5a4.6 4.6 0 0 1 9 1.5c0 5.8-8 11.4-9 12.2z' }, br), 'var(--la-heart)');
    pen(g, 0.5).setAttribute('d', `M${f(-w / 2 + 2.4)} ${f(h / 2 - 3)} L${f(w / 2 - 3.4)} ${f(h / 2 - 3)}`);
  } else {
    const n = opts.lines ?? 4, step = (h - 6) / Math.max(1, n - 1);
    const d: string[] = [];
    for (let i = 0; i < n; i++) {
      const y = -h / 2 + 3 + i * step;
      const len = (w - 4.4) * [1, 0.82, 0.94, 0.6, 0.88][i % 5];
      d.push(`M${f(-w / 2 + 2.2)} ${f(y)} L${f(-w / 2 + 2.2 + len)} ${f(y + 0.15)}`);
    }
    pen(g, 0.5).setAttribute('d', d.join(' '));
    if (opts.accent) {
      // a {variable}: a short coloured bar on the second line, the way Promptly marks variables
      const v = el('path', { fill: 'none', 'stroke-width': 1.1, 'stroke-linecap': 'round', d: `M${f(-w / 2 + 2.2)} ${f(-h / 2 + 3 + step)} L${f(-w / 2 + 5.8)} ${f(-h / 2 + 3 + step)}` }, g);
      v.style.stroke = opts.accent;
    }
  }
  return g;
}

/** A small heart that floats up and fades: the Promptly reaction. Returns a stepper. */
export function heartPop(parent: Element): { fire(x: number, y: number): void; step(dt: number): void } {
  const g = el('g', { opacity: 0 }, parent);
  const h = tint(el('path', { d: 'M0 4c-.6-.5-5.4-3.8-5.4-7.3a2.75 2.75 0 0 1 5.4-.9a2.75 2.75 0 0 1 5.4 .9c0 3.5-4.8 6.8-5.4 7.3z', stroke: 'currentColor', 'stroke-width': 0.8, 'stroke-linejoin': 'round' }, g), 'var(--la-heart)');
  void h;
  let life = -1, x = 0, y = 0;
  return {
    fire(nx, ny) { x = nx; y = ny; life = 0; },
    step(dt) {
      if (life < 0) { g.setAttribute('opacity', '0'); return; }
      life += dt;
      const u = life / 1.6;
      if (u >= 1) { life = -1; g.setAttribute('opacity', '0'); return; }
      const s = u < 0.18 ? 0.4 + (u / 0.18) * 1.0 : 1.4 - Math.min(0.4, (u - 0.18) * 1.2);
      g.setAttribute('opacity', f(u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3));
      g.setAttribute('transform', `translate(${f(x + Math.sin(life * 5) * 1.5)} ${f(y - u * 26)}) scale(${f(s)})`);
    },
  };
}
