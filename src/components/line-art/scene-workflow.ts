// "Workflow": a prompt card is handed down a line of three people, each step lit with a number, and ends up in a box. Tap anyone.
import { Person, heartPop, promptCard } from './figure';
import { act, bush, defineScene, el, f, lamp, lerp, pen, script, shape, smooth, sparkle, tint, tree, until, wait, clamp, type Vec } from './kit';
import type { SceneLabels } from './scene-common';

export function workflow(host: Element, labels: SceneLabels): () => void {
  const G = 270, XS = [196, 286, 376];
  return defineScene(host, labels, { id: 'wf', w: 640, h: 320, G, seed: 91, sun: [540, 66], moon: [540, 66], set: 150, stars: 14, clouds: [46, 96], ground: 'paving' }, (c) => {
    tree(c, 70, 1);
    lamp(c, 118, 150, 0.3);
    bush(c, 590, 0.8);
    // chevrons on the ground that light up as the card passes
    const chev = [236, 326, 416].map((x) => { const n = pen(c.mid, 1.6); n.setAttribute('d', `M${x - 6} ${G + 22} L${x + 4} ${G + 28} L${x - 6} ${G + 34}`); return n; });
    // the box at the end
    shape(c.mid, 1.2).setAttribute('d', `M436 ${G} L436 ${G - 34} L488 ${G - 34} L488 ${G}Z`);
    pen(c.mid, 0.7).setAttribute('d', `M436 ${G - 24} L488 ${G - 24} M456 ${G - 34} L456 ${G - 24} M468 ${G - 34} L468 ${G - 24}`);
    const looks = [
      { coat: 'var(--la-cloth-1)', legs: 'var(--la-legs)', hair: 'hat', scarf: 'var(--la-heart)' },
      { coat: 'var(--la-primary)', hem: 102, hair: 'long' },
      { coat: 'var(--la-cloth-3)', legs: 'var(--la-legs)', hair: 'cap', cap: 'var(--la-heart)' },
    ] as const;
    const ps = XS.map((x, i) => { const p = new Person(c.people, looks[i], 'walk'); p.scale = 1.25; p.x = x; p.y = G + 6; p.go = p.goTarget = 0; return p; });
    // step badges
    const badges = ps.map((_, i) => {
      const g = el('g', { opacity: 0 }, c.fx);
      const body = el('circle', { r: 9, stroke: 'currentColor', 'stroke-width': 1.1 }, g); body.style.fill = 'var(--la-paper)';
      const num = el('text', { y: 3.6, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: 'currentColor', class: 'plate' }, g); num.textContent = String(i + 1);
      return { g, k: 0, goal: 0 };
    });
    const card = promptCard(c.front, { w: 12, h: 16, brace: true });
    const heart = heartPop(c.fx), spark = sparkle(c.fx);
    let holder = 0, from = 0, to = 0, tween = -1, drop = -1, lit = 0;
    const hand = (i: number): Vec => ps[i].toScene(ps[i].hand[0] + 5, ps[i].hand[1]);
    const pass = (a: number, b: number) => { from = a; to = b; tween = 0; };
    const meet = (a: number, b: number) => { ps[a].reach = [64, 54]; ps[b].reach = [6, 56]; };
    const rest = (i: number) => { ps[i].reach = i === holder ? [52, 62] : null; };
    for (const [i, p] of ps.entries()) { p.g.style.cursor = 'pointer'; p.g.addEventListener('pointerdown', () => { const h = p.toScene(44, 0); heart.fire(h[0], h[1] - 4); badges[i].goal = 1; }); }
    const run = script(
      act(() => { holder = 0; lit = 0; drop = -1; badges.forEach((b) => (b.goal = 0)); badges[0].goal = 1; ps.forEach((_, i) => rest(i)); }),
      wait(1),
      act(() => meet(0, 1)),
      until(() => ps[0].reachAmt > 0.9 && ps[1].reachAmt > 0.9),
      act(() => pass(0, 1)),
      until(() => tween < 0),
      act(() => { holder = 1; lit = 1; badges[1].goal = 1; ps.forEach((_, i) => rest(i)); }),
      wait(1.3),
      act(() => meet(1, 2)),
      until(() => ps[1].reachAmt > 0.9 && ps[2].reachAmt > 0.9),
      act(() => pass(1, 2)),
      until(() => tween < 0),
      act(() => { holder = 2; lit = 2; badges[2].goal = 1; ps.forEach((_, i) => rest(i)); }),
      wait(1.2),
      act(() => { ps[2].reach = ps[2].toLocal(430, G - 82); }),
      until(() => ps[2].reachAmt > 0.9),
      act(() => { drop = 0; holder = -1; }),
      wait(0.9),
      act(() => { ps[2].reach = [51, 20]; heart.fire(462, G - 56); spark.fire(462, G - 44); lit = 3; }),
      wait(2.6),
      act(() => { ps.forEach((p) => (p.reach = null)); lit = 0; }),
      wait(0.8),
    );
    return (t, dt, _n, wv) => {
      if (dt === 0) { holder = 1; lit = 1; badges[0].goal = badges[1].goal = 1; badges[0].k = badges[1].k = 1; ps[1].reach = [52, 62]; ps[1].reachAmt = 1; } else run(dt);
      ps.forEach((p) => p.update(t, dt, wv));
      badges.forEach((b, i) => {
        b.k += (b.goal - b.k) * Math.min(1, dt * 8);
        const h = ps[i].toScene(43, 0);
        b.g.setAttribute('opacity', f(b.k));
        b.g.setAttribute('transform', `translate(${f(h[0])} ${f(h[1] - 22 - Math.sin(t * 2.4 + i) * 1.5)}) scale(${f(0.6 + 0.4 * b.k)})`);
      });
      chev.forEach((n, i) => { n.style.stroke = lit > i ? 'var(--la-heart)' : ''; n.setAttribute('opacity', lit > i ? '1' : '0.5'); });
      if (tween >= 0) { tween += dt; if (tween >= 0.5) { holder = to; tween = -1; } }
      if (tween >= 0) {
        const e = smooth(0, 1, tween / 0.5), a = hand(from), b = hand(to);
        card.setAttribute('transform', `translate(${f(lerp(a[0], b[0], e))} ${f(lerp(a[1], b[1], e) - Math.sin(Math.PI * e) * 6)})`); card.setAttribute('opacity', '1');
      } else if (drop >= 0) {
        drop += dt;
        const k = clamp(drop / 0.6, 0, 1), a = hand(2);
        card.setAttribute('transform', `translate(${f(lerp(430, 462, k))} ${f(lerp(G - 86, G - 30, k * k))}) scale(${f(1 - k * 0.2)})`);
        card.setAttribute('opacity', drop > 0.7 ? '0' : '1'); void a;
        if (drop > 1.4) drop = -1;
      } else if (holder >= 0) {
        const h = hand(holder); card.setAttribute('transform', `translate(${f(h[0])} ${f(h[1] - 2)})`); card.setAttribute('opacity', '1');
      } else card.setAttribute('opacity', '0');
      heart.step(dt); spark.step(dt);
      void tint;
    };
  });
}
