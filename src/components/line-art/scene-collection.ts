// "Koleksiyon": someone sorts cards from a pile on a table into three labelled crates, one at a time. Tap the cat.
import { Person, promptCard } from './figure';
import { Cat, act, bush, defineScene, el, f, lamp, lerp, pen, script, shape, smooth, sparkle, table, tint, tree, until, wait, walkTo, clamp, type Step } from './kit';
import type { SceneLabels } from './scene-common';

export function collection(host: Element, labels: SceneLabels): () => void {
  const G = 270, CX = [330, 396, 462], PILE = 236, TAGS = ['var(--la-primary)', 'var(--la-heart)', 'var(--la-cloth-3)'];
  return defineScene(host, labels, { id: 'co', w: 640, h: 320, G, seed: 141, sun: [120, 70], moon: [120, 70], set: 150, stars: 12, clouds: [44, 96], ground: 'paving' }, (c) => {
    tree(c, 60, 1);
    bush(c, 596, 0.8);
    lamp(c, 560, 150, 0.3);
    // the pile on a table
    table(c, PILE - 26, 52, G - 62);
    const pile = [0, 1, 2].map((i) => { const n = shape(c.mid, 0.8); n.setAttribute('d', `M${PILE - 14 + i} ${G - 66 - i * 3} L${PILE + 14 + i} ${G - 66 - i * 3} L${PILE + 14 + i} ${G - 63 - i * 3} L${PILE - 14 + i} ${G - 63 - i * 3}Z`); return n; });
    // three crates with a coloured tag and the cards sticking out
    const crates = CX.map((x, i) => {
      const cards = el('g', {}, c.mid);
      shape(c.mid, 1.2).setAttribute('d', `M${x - 25} ${G} L${x - 25} ${G - 34} L${x + 25} ${G - 34} L${x + 25} ${G}Z`);
      pen(c.mid, 0.6).setAttribute('d', `M${x - 25} ${G - 22} L${x + 25} ${G - 22}`);
      tint(el('path', { d: `M${x - 10} ${G - 30} L${x + 10} ${G - 30} L${x + 10} ${G - 24} L${x - 10} ${G - 24}Z`, stroke: 'currentColor', 'stroke-width': 0.8 }, c.mid), TAGS[i]);
      const slots = [-14, -4, 8, 18].map((dx, k) => { const g = promptCard(cards, { w: 11, h: 15, lines: 2 }); g.setAttribute('transform', `translate(${x + dx} ${G - 44 - (k % 2) * 2}) rotate(${(k - 1.5) * 6})`); g.setAttribute('opacity', '0'); return g; });
      return { slots, n: 0, bounce: 0, x };
    });
    const cat = new Cat(c.mid, 290, G + 2, 1, 1.4);
    const p = new Person(c.people, { coat: 'var(--la-cloth-3)', legs: 'var(--la-legs)', hair: 'cap', cap: 'var(--la-heart)' });
    p.scale = 1.3; p.y = G + 8; p.x = 190; p.go = p.goTarget = 0;
    const card = promptCard(c.front, { w: 11, h: 15, lines: 2 });
    const spark = sparkle(c.fx);
    let carrying = false, drop = -1, dropTo = 0;
    const deliver = (i: number): Step[] => [
      act(() => { p.dir = 1; p.reach = p.toLocal(PILE - 8, G - 66); }),
      until(() => p.reachAmt > 0.9),
      act(() => { carrying = true; pile[2].setAttribute('opacity', '0'); setTimeout(() => pile[2].setAttribute('opacity', '1'), 700); p.reach = [54, 62]; }),
      wait(0.4),
      walkTo(p, CX[i] - 30),
      act(() => { p.reach = p.toLocal(CX[i], G - 62); }),
      until(() => p.reachAmt > 0.9),
      wait(0.2),
      act(() => { carrying = false; drop = 0; dropTo = i; }),
      wait(0.7),
      act(() => { p.reach = null; }),
      walkTo(p, 190),
      act(() => { p.dir = 1; }),
    ];
    const run = script(
      act(() => { crates.forEach((cr) => { cr.n = 0; cr.slots.forEach((s) => s.setAttribute('opacity', '0')); }); }),
      ...deliver(0), ...deliver(1), ...deliver(2),
      wait(1.4),
    );
    return (t, dt, night, wv) => {
      if (dt === 0) { crates.forEach((cr, i) => { cr.n = 2 + (i % 2); }); p.x = 286; p.go = 0; } else run(dt);
      p.update(t, dt, wv);
      if (carrying) { const h = p.toScene(p.hand[0] + 4, p.hand[1] - 1); card.setAttribute('transform', `translate(${f(h[0])} ${f(h[1])})`); card.setAttribute('opacity', '1'); }
      else if (drop >= 0) {
        drop += dt;
        const k = clamp(drop / 0.5, 0, 1), x = CX[dropTo];
        card.setAttribute('transform', `translate(${f(x)} ${f(lerp(G - 62, G - 40, k * k))})`);
        card.setAttribute('opacity', drop > 0.5 ? '0' : '1');
        if (drop > 0.5 && crates[dropTo].n < 4 && crates[dropTo].bounce === 0) { crates[dropTo].n++; crates[dropTo].bounce = 1; spark.fire(x, G - 44); }
        if (drop > 0.8) { drop = -1; }
      } else card.setAttribute('opacity', '0');
      crates.forEach((cr) => { cr.slots.forEach((s, k) => s.setAttribute('opacity', k < cr.n ? '1' : '0')); cr.bounce = Math.max(0, cr.bounce - dt * 3); });
      cat.step(t, dt, night);
      spark.step(dt);
      void smooth;
    };
  });
}
