// "Sonuç yok": someone sweeps a magnifier along a clothesline of blank cards and finds nothing; a question mark pops. Tap the cat.
import { Person } from './figure';
import { Cat, act, bush, defineScene, el, f, fence, house, pen, script, shape, tint, tree, walkTo, wait, lamp } from './kit';
import type { SceneLabels } from './scene-common';
import { pendulum } from '@/lib/line-art/motion';

export function search(host: Element, labels: SceneLabels): () => void {
  const G = 270, LY = G - 176;
  return defineScene(host, labels, { id: 'sr', w: 640, h: 320, G, seed: 51, sun: [540, 62], moon: [540, 62], set: 150, stars: 12, clouds: [40, 84], ground: 'grass' }, (c) => {
    tree(c, 64, 1.05);
    house(c, 520, 150, 120, { cols: 2, rows: 1 });
    fence(c, 90, 250, 30, c.back);
    bush(c, 470, 0.9);
    lamp(c, 600, 160, 0.3);
    // the clothesline: two posts, a sagging line, eight blank cards on pegs
    pen(c.back, 1.4).setAttribute('d', `M104 ${G} L104 ${LY - 6} M516 ${G} L516 ${LY - 6}`);
    const lineAt = (x: number) => LY + 12 * Math.sin(((x - 104) / 412) * Math.PI);
    pen(c.back, 0.9).setAttribute('d', Array.from({ length: 21 }, (_, i) => `${i ? 'L' : 'M'}${104 + i * 20.6} ${f(lineAt(104 + i * 20.6))}`).join(' '));
    const cards = Array.from({ length: 9 }, (_, i) => {
      const x = 128 + i * 45;
      const g = el('g', {}, c.back);
      shape(g, 0.9).setAttribute('d', 'M-9 0 L9 0 L9 26 L-9 26Z');
      pen(g, 0.9).setAttribute('d', 'M-2 -3 L-2 4 M2 -3 L2 4');
      return { g, x, sw: pendulum(14 + (i % 3), 1.1, (i % 3) * 0.02) };
    });
    const cat = new Cat(c.mid, 566, G + 2, -1, 1.4);
    const p = new Person(c.people, { coat: 'var(--la-cloth-3)', legs: 'var(--la-legs)', hair: 'hat', scarf: 'var(--la-primary)' });
    p.scale = 1.3; p.y = G + 4; p.x = 130; p.go = p.goTarget = 0;
    // the lens, held up at the end of the arm
    pen(p.prop, 1.2).setAttribute('d', 'M0 0 L4 -8');
    const lens = el('circle', { cx: 8, cy: -14, r: 7.5, 'stroke-width': 1.3, stroke: 'currentColor' }, p.prop); lens.style.fill = 'var(--la-paper)'; lens.style.fillOpacity = '0.35';
    const q = pen(c.fx, 1.4);
    let askT = -1;
    const run = script(
      act(() => { p.reach = [57, 14]; }),
      walkTo(p, 500), act(() => { askT = 0; }), wait(1.6),
      walkTo(p, 140), act(() => { askT = 0; }), wait(1.6),
    );
    cat.g.addEventListener('pointerdown', () => { askT = 0; });
    return (t, dt, night, wv) => {
      if (dt === 0) { p.x = 300; p.go = 0; p.reach = [57, 14]; p.reachAmt = 1; } else run(dt);
      p.update(t, dt, wv);
      cards.forEach((cd, i) => {
        const a = cd.sw.step(-wv * 0.5 + Math.sin(t * 1.7 + i) * 0.15, dt);
        cd.g.setAttribute('transform', `translate(${cd.x} ${f(lineAt(cd.x))}) rotate(${f(a * 57)})`);
      });
      cat.step(t, dt, night);
      if (askT >= 0) askT += dt;
      const a = askT >= 0 && askT < 1.6 ? Math.min(1, askT * 4) * (askT > 1.2 ? 1 - (askT - 1.2) / 0.4 : 1) : 0;
      const hq = p.toScene(44, 2);
      q.setAttribute('d', `M${f(hq[0] - 3)} ${f(hq[1] - 26)} q0 -5 4 -5 q4 0 4 4 q0 3 -4 4 l0 3 M${f(hq[0] + 1)} ${f(hq[1] - 17.6)} l0 0.4`);
      q.setAttribute('opacity', f(a));
      void tint;
    };
  });
}
