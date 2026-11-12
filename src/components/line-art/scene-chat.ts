// "Sohbet": two people talk under a street lamp. A types, B answers with a heart, A sends a prompt card, B hops. Tap either.
import { Person, heartPop } from './figure';
import { bench, bush, bubble, defineScene, el, f, house, lamp, pen, shape, smooth, sparkle, tint, tree, clamp } from './kit';
import type { SceneLabels } from './scene-common';

export function chat(host: Element, labels: SceneLabels): () => void {
  const G = 266;
  return defineScene(host, labels, { id: 'ch', w: 640, h: 320, G, seed: 31, sun: [520, 66], moon: [520, 66], set: 150, stars: 14, clouds: [44, 92], ground: 'paving' }, (c) => {
    house(c, 462, 170, 108, { cols: 3, rows: 1 });
    tree(c, 70, 1);
    bench(c, 120, 80, c.back);
    bush(c, 440, 0.8);
    lamp(c, 320, 120, 0.3);
    const a = new Person(c.people, { coat: 'var(--la-primary)', legs: 'var(--la-legs)', hair: 'short', scarf: 'var(--la-heart)' });
    const b = new Person(c.people, { coat: 'var(--la-cloth-2)', hem: 102, hair: 'long' });
    a.scale = b.scale = 1.3; a.x = 268; a.y = G + 6; a.dir = 1; b.x = 372; b.y = G + 8; b.dir = -1; a.go = a.goTarget = b.go = b.goTarget = 0;
    const heart = heartPop(c.fx), spark = sparkle(c.fx);
    const bubA = bubble(c.fx, 76, 34), bubB = bubble(c.fx, 62, 34);
    // bubble contents: typing dots, text lines, a heart, a prompt card
    const mk = (g: SVGGElement) => {
      const dots = pen(g, 2.6); const lines = pen(g, 1.1); const hrt = tint(el('path', { d: 'M0 7 c-1 -.7 -8 -5.6 -8 -10.6 a4 4 0 0 1 8 -1.3 a4 4 0 0 1 8 1.3 c0 5 -7 9.9 -8 10.6z', stroke: 'currentColor', 'stroke-width': 0.7 }, g), 'var(--la-heart)');
      const card = shape(g, 0.9); card.setAttribute('d', 'M-8 -26 L8 -26 L8 -6 L-8 -6Z');
      const cl = pen(g, 0.6); cl.setAttribute('d', 'M-5 -21 L5 -21 M-5 -17 L4 -17 M-5 -13 L5 -13');
      return { dots, lines, hrt, card, cl };
    };
    const ca = mk(bubA.g), cb = mk(bubB.g);
    let cyc = 0, hopped = false, tapA = 0;
    const set = (cc: ReturnType<typeof mk>, what: 'dots' | 'lines' | 'heart' | 'card' | 'none', t: number) => {
      cc.dots.setAttribute('d', what === 'dots' ? [-12, 0, 12].map((x, i) => `M${x} ${f(-17 - 3 * Math.abs(Math.sin(t * 7 + i)))} l0.01 0`).join(' ') : '');
      cc.lines.setAttribute('d', what === 'lines' ? 'M-24 -24 L24 -24 M-24 -17 L16 -17 M-24 -10 L20 -10' : '');
      cc.hrt.setAttribute('opacity', what === 'heart' ? '1' : '0'); cc.hrt.setAttribute('transform', 'translate(0 -17)');
      cc.card.setAttribute('opacity', what === 'card' ? '1' : '0'); cc.cl.setAttribute('opacity', what === 'card' ? '1' : '0');
    };
    for (const q of [a, b]) { q.g.style.cursor = 'pointer'; q.g.addEventListener('pointerdown', () => { const h = q.toScene(44, 0); heart.fire(h[0], h[1] - 4); tapA = 0.6; }); }
    return (t, dt, _n, wv) => {
      if (dt === 0) cyc = 5; else { cyc += dt; if (cyc > 12) { cyc -= 12; hopped = false; } }
      tapA = Math.max(0, tapA - dt);
      const u = cyc;
      const aSays = u < 3.2 || (u > 6.2 && u < 8.4), bSays = u > 3.4 && u < 6;
      a.reach = aSays ? [52 + Math.sin(t * 5) * 2, 50 + Math.sin(t * 3) * 3] : null;
      b.reach = bSays ? [52 + Math.sin(t * 5) * 2, 52] : null;
      const hop = u > 8.3 && u < 9.3 ? 12 * Math.abs(Math.sin((Math.PI * (u - 8.3)) / 0.5)) : 0;
      b.y = G + 8 - hop;
      if (u > 8.3 && !hopped) { hopped = true; spark.fire(b.x, G - 150); }
      a.update(t, dt, wv); b.update(t, dt, wv);
      const ha = a.toScene(43, 0), hb = b.toScene(43, 0);
      const showA = u < 3.2 ? smooth(0.2, 0.5, u) : u > 6.2 && u < 9.4 ? smooth(6.2, 6.5, u) : 0;
      bubA.place(ha[0] - 10, ha[1] - 24, 1, showA);
      set(ca, u < 1.3 ? 'dots' : u < 3.2 ? 'lines' : u < 7 ? 'dots' : 'card', t);
      const showB = u > 3.4 && u < 6.2 ? smooth(3.4, 3.7, u) : 0;
      bubB.place(hb[0] + 10, hb[1] - 24, -1, showB);
      set(cb, u < 4.3 ? 'dots' : 'heart', t);
      heart.step(dt); spark.step(dt);
      void clamp; void tapA;
    };
  });
}
