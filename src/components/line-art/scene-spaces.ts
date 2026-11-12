// "Space": a pinboard fills up — notes, pictures, a colour palette fly onto it from a conductor's hand, then arrows link them. Tap the cat.
import { Person } from './figure';
import { Cat, bush, defineScene, el, f, lamp, lerp, pen, shape, smooth, tint, tree, clamp, type Vec } from './kit';
import type { SceneLabels } from './scene-common';

type Kind = 'note' | 'image' | 'palette' | 'tall';
const SLOTS: Array<{ k: Kind; x: number; y: number; r: number }> = [
  { k: 'note', x: 346, y: 104, r: -3 },
  { k: 'image', x: 432, y: 106, r: 2 },
  { k: 'palette', x: 528, y: 102, r: -1 },
  { k: 'tall', x: 350, y: 184, r: 2 },
  { k: 'note', x: 440, y: 184, r: -2 },
  { k: 'image', x: 532, y: 184, r: 3 },
];
const ARROWS: Array<[number, number]> = [[0, 1], [1, 2], [0, 3], [3, 4], [4, 5]];

function item(parent: Element, k: Kind): SVGGElement {
  const g = el('g', {}, parent);
  if (k === 'note') {
    shape(g, 0.9).setAttribute('d', 'M-22 -20 L22 -20 L22 20 L-22 20Z');
    pen(g, 0.6).setAttribute('d', 'M-15 -10 L15 -10 M-15 -3 L10 -3 M-15 4 L14 4 M-15 11 L4 11');
    tint(el('circle', { cy: -20, r: 3, stroke: 'currentColor', 'stroke-width': 0.6 }, g), 'var(--la-heart)');
  } else if (k === 'image') {
    shape(g, 0.9).setAttribute('d', 'M-32 -22 L32 -22 L32 22 L-32 22Z');
    pen(g, 0.8).setAttribute('d', 'M-26 14 L-12 -4 L-4 6 L8 -10 L26 14Z M16 -12 a5 5 0 1 0 0.01 0');
    tint(el('circle', { cy: -22, r: 3, stroke: 'currentColor', 'stroke-width': 0.6 }, g), 'var(--la-primary)');
  } else if (k === 'tall') {
    shape(g, 0.9).setAttribute('d', 'M-20 -22 L20 -22 L20 22 L-20 22Z');
    tint(el('path', { d: 'M-14 -14 L14 -14 L14 4 L-14 4Z', stroke: 'currentColor', 'stroke-width': 0.6 }, g), 'var(--la-cloth-3)');
    pen(g, 0.6).setAttribute('d', 'M-14 11 L12 11 M-14 16 L6 16');
    tint(el('circle', { cy: -22, r: 3, stroke: 'currentColor', 'stroke-width': 0.6 }, g), 'var(--la-heart)');
  } else {
    shape(g, 0.9).setAttribute('d', 'M-30 -18 L30 -18 L30 18 L-30 18Z');
    ['var(--la-primary)', 'var(--la-heart)', 'var(--la-cloth-3)', 'var(--la-cloth-2)'].forEach((col, i) => tint(el('path', { d: `M${-24 + i * 12.5} -12 L${-14 + i * 12.5} -12 L${-14 + i * 12.5} 12 L${-24 + i * 12.5} 12Z`, stroke: 'currentColor', 'stroke-width': 0.6 }, g), col));
  }
  return g;
}

export function spaces(host: Element, labels: SceneLabels): () => void {
  const G = 270;
  return defineScene(host, labels, { id: 'sp', w: 640, h: 320, G, seed: 71, sun: [150, 70], moon: [150, 70], set: 150, stars: 12, clouds: [46, 94], ground: 'paving' }, (c) => {
    tree(c, 56, 0.95);
    lamp(c, 262, 150, 0.3);
    bush(c, 620, 0.8);
    // the board on two legs
    pen(c.mid, 1.6).setAttribute('d', `M334 238 L326 ${G} M574 238 L582 ${G}`);
    shape(c.mid, 1.3).setAttribute('d', 'M300 58 L604 58 L604 238 L300 238Z');
    pen(c.mid, 0.6).setAttribute('d', 'M308 66 L596 66 L596 230 L308 230Z');
    const arrowsG = el('g', {}, c.mid);
    const arrows = ARROWS.map(([a, b]) => {
      const A = SLOTS[a], B = SLOTS[b];
      const horizontal = Math.abs(A.y - B.y) < 30;
      const w = (k: Kind) => (k === 'image' || k === 'palette' ? 32 : k === 'tall' ? 20 : 22);
      const h = (k: Kind) => (k === 'tall' ? 22 : k === 'note' ? 20 : 22);
      const [x0, y0, x1, y1] = horizontal ? [A.x + w(A.k) + 3, A.y, B.x - w(B.k) - 3, B.y] : [A.x, A.y + h(A.k) + 3, B.x, B.y - h(B.k) - 3];
      const n = pen(arrowsG, 1.1); n.style.stroke = 'var(--la-primary)'; n.setAttribute('pathLength', '1'); n.style.strokeDasharray = '1 1';
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const head = pen(arrowsG, 1.1); head.style.stroke = 'var(--la-primary)';
      head.setAttribute('d', `M${f(x1 - 6 * Math.cos(ang - 0.5))} ${f(y1 - 6 * Math.sin(ang - 0.5))} L${f(x1)} ${f(y1)} L${f(x1 - 6 * Math.cos(ang + 0.5))} ${f(y1 - 6 * Math.sin(ang + 0.5))}`);
      n.setAttribute('d', `M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}`);
      return { n, head };
    });
    const itemsG = el('g', {}, c.mid);
    const items = SLOTS.map((s) => ({ s, g: item(itemsG, s.k), t0: 0.7 + SLOTS.indexOf(s) * 0.85 }));
    const cat = new Cat(c.mid, 606, G + 2, -1, 1.4);
    cat.g.setAttribute('opacity', '1');
    const p = new Person(c.people, { coat: 'var(--la-cloth-1)', legs: 'var(--la-legs)', hair: 'short', scarf: 'var(--la-heart)' });
    p.scale = 1.3; p.x = 206; p.y = G + 6; p.go = p.goTarget = 0;
    let cyc = 0;
    p.g.style.cursor = 'pointer';
    p.g.addEventListener('pointerdown', () => { if (cyc > 8) cyc = 0.1; });
    return (t, dt, night, wv) => {
      if (dt === 0) cyc = 9; else { cyc += dt; if (cyc > 13) cyc -= 13; }
      const u = cyc;
      // the hand flicks forward just before each item leaves it
      const next = items.find((it) => u >= it.t0 - 0.25 && u < it.t0 + 0.3);
      p.reach = next ? [58 + (u > next.t0 ? 4 : 0), 26] : u < 8 ? [48, 54] : null;
      p.update(t, dt, wv);
      const hand: Vec = p.toScene(p.hand[0] + 6, p.hand[1] - 2);
      const out = u > 11 ? 1 - smooth(11, 12.2, u) : 1;
      items.forEach((it) => {
        const k = clamp((u - it.t0) / 0.75, 0, 1);
        if (u < it.t0) { it.g.setAttribute('opacity', '0'); return; }
        const e = 1 - Math.pow(1 - k, 3);
        const x = lerp(hand[0], it.s.x, e), y = lerp(hand[1], it.s.y, e) - Math.sin(Math.PI * k) * 46;
        const sc = k < 1 ? 0.35 + 0.75 * e + Math.sin(Math.PI * k) * 0.1 : 1 + Math.max(0, 0.1 - (u - it.t0 - 0.75) * 0.3);
        it.g.setAttribute('opacity', f(out));
        it.g.setAttribute('transform', `translate(${f(x)} ${f(y)}) rotate(${f(lerp(-28, it.s.r, e))}) scale(${f(sc)})`);
      });
      arrows.forEach((a, i) => {
        const k = clamp((u - (6.6 + i * 0.35)) / 0.5, 0, 1);
        a.n.style.strokeDashoffset = f(1 - k); a.head.setAttribute('opacity', f(k >= 1 ? out : 0)); a.n.setAttribute('opacity', f(out));
      });
      cat.step(t, dt, night);
      void smooth;
    };
  });
}
