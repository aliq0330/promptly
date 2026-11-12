// "Ekip": two people bring a cart of prompt cards along the road — one pushes, one pulls on a rope — with a cat riding on top.
import { Person, promptCard } from './figure';
import { Cat, bush, defineScene, el, f, lamp, pen, pt, shape, skyline, tree, type Vec } from './kit';
import type { SceneLabels } from './scene-common';

export function team(host: Element, labels: SceneLabels): () => void {
  const G = 272;
  return defineScene(host, labels, { id: 'tm', w: 640, h: 320, G, seed: 131, sun: [500, 66], moon: [500, 66], set: 150, stars: 14, clouds: [44, 96], ground: 'paving' }, (c) => {
    skyline(c, G - 8, 'roofs', 9);
    tree(c, 70, 1);
    tree(c, 560, 0.85);
    bush(c, 300, 0.8);
    lamp(c, 430, 150, 0.3);
    const a = new Person(c.people, { coat: 'var(--la-cloth-1)', legs: 'var(--la-legs)', hair: 'hat', scarf: 'var(--la-heart)' });
    const b = new Person(c.people, { coat: 'var(--la-primary)', hem: 102, hair: 'long' });
    a.scale = b.scale = 1.3; a.y = G + 8; b.y = G + 6; a.dir = b.dir = 1;
    // the cart: body, a crop of cards, two wheels, a handle and a rope
    const cart = el('g', {}, c.people);
    const rope = pen(c.people, 1);
    const handle = pen(c.people, 1.4);
    shape(cart, 1.2).setAttribute('d', 'M0 -50 L64 -50 L60 -20 L4 -20Z');
    pen(cart, 0.7).setAttribute('d', 'M2 -38 L62 -38');
    const cards = [[10, -62, -8], [24, -64, 4], [38, -62, -3], [50, -63, 9]].map(([x, y, r]) => { const g = promptCard(cart, { w: 12, h: 17, lines: 3, brace: x === 24 }); g.setAttribute('transform', `translate(${x + 6} ${y + 2}) rotate(${r})`); return g; });
    void cards;
    const wheels = [16, 50].map((x) => {
      const g = el('g', {}, cart);
      const w = shape(g, 1.2); w.setAttribute('d', 'M-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0Z');
      pen(g, 0.7).setAttribute('d', 'M-9 0 L9 0 M0 -9 L0 9');
      return { g, x };
    });
    const cat = new Cat(c.people, 0, 0, 1, 1.15);
    return (t, dt, night, wv) => {
      if (dt === 0) a.x = 236; else { a.x += 0; if (a.x > 720) a.x = -260; }
      if (a.go < 1) a.go = a.goTarget = 1;
      a.update(t, dt, wv);
      const cx = a.x + 31;
      b.x = cx + 64 + 56;
      a.reach = [58, 60]; b.farReach = null; b.reach = [24, 62];
      b.update(t, dt, wv);
      const bob = Math.sin(a.phase * Math.PI * 4) * 0.9;
      cart.setAttribute('transform', `translate(${f(cx)} ${f(G + 6 + bob)})`);
      wheels.forEach((w) => w.g.setAttribute('transform', `translate(${w.x} -9) rotate(${f(((a.x - cx) + a.x) / 9 * 57.3)})`));
      const ha: Vec = a.toScene(a.hand[0], a.hand[1]);
      handle.setAttribute('d', `M${pt(ha)} L${f(cx + 2)} ${f(G + 6 + bob - 44)}`);
      const hb: Vec = b.toScene(b.hand[0], b.hand[1]);
      const rx = cx + 62, ry = G + 6 + bob - 36;
      rope.setAttribute('d', `M${f(rx)} ${f(ry)} Q${f((rx + hb[0]) / 2)} ${f(Math.max(ry, hb[1]) + 10)} ${pt(hb)}`);
      cat.x = cx + 32; cat.y = G + 6 + bob - 50;
      cat.step(t, dt, night);
    };
  });
}
