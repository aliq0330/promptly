// "Üretiliyor": a painter in a garden studio draws a landscape and a heart on an easel while a result is on its way.
// No text and no percentage — the drawing is the waiting; the real state (running, done) belongs to the page around it.
import { Person } from './figure';
import { Cat, deskLamp, defineScene, el, f, lerp, pen, shape, skyline, smooth, sparkle, table, tint, tree, bush, clamp, type Vec } from './kit';
import { minJerk } from '@/lib/line-art/motion';
import type { SceneLabels } from './scene-common';

const heartD = (cx: number, cy: number, s: number) =>
  `M${cx} ${cy + s * 0.9} C${cx - s * 1.5} ${cy - s * 0.2} ${cx - s * 1.1} ${cy - s * 1.3} ${cx} ${cy - s * 0.45} C${cx + s * 1.1} ${cy - s * 1.3} ${cx + s * 1.5} ${cy - s * 0.2} ${cx} ${cy + s * 0.9}Z`;

export function studio(host: Element, labels: SceneLabels): () => void {
  const G = 296, DX = 36;
  return defineScene(host, labels, { id: 'st', w: 640, h: 320, G, seed: 11, sun: [430, 76], moon: [430, 76], set: 150, stars: 12, clouds: [48, 96], ground: 'grass' }, (c) => {
    skyline(c, G - 6, 'roofs', 5);
    tree(c, 566, 1.05);
    bush(c, 498, 0.9);
    // the easel
    const X = (v: number) => v + DX;
    pen(c.mid, 1.4).setAttribute('d', `M${X(158)} 196 L${X(142)} ${G} M${X(198)} 196 L${X(214)} ${G} M${X(178)} 108 L${X(178)} ${G}`);
    shape(c.mid, 1.2).setAttribute('d', `M${X(146)} 112 L${X(210)} 112 L${X(210)} 190 L${X(146)} 190Z`);
    shape(c.mid, 1.2).setAttribute('d', `M${X(140)} 190 L${X(216)} 190 L${X(216)} 198 L${X(140)} 198Z`);
    // a table with paint pots, a rag and a lamp for the evening
    table(c, 340, 110, G - 56);
    [[362, 'var(--la-primary)'], [384, 'var(--la-heart)'], [406, 'var(--la-cloth-3)']].forEach(([x, col]) => {
      shape(c.mid, 0.9).setAttribute('d', `M${(x as number) - 7} ${G - 56} L${(x as number) - 6} ${G - 68} L${(x as number) + 6} ${G - 68} L${(x as number) + 7} ${G - 56}Z`);
      tint(el('path', { d: `M${(x as number) - 5.4} ${G - 66} L${(x as number) + 5.4} ${G - 66} L${(x as number) + 5.8} ${G - 60} L${(x as number) - 5.8} ${G - 60}Z` }, c.mid), col as string);
    });
    deskLamp(c, 438, G - 56, 0.3);
    const cat = new Cat(c.mid, 300, G + 2, -1, 1.5);

    const art = el('g', {}, c.mid);
    const heartFill = tint(el('path', { d: heartD(X(183), 138, 5.5), opacity: 0 }, art), 'var(--la-heart)');
    const defs = [
      { d: `M${X(154)} 176 L${X(192)} 176`, start: 0.4, dur: 1.2 },
      { d: `M${X(156)} 176 L${X(168)} 152 L${X(176)} 164 L${X(184)} 146 L${X(192)} 176`, start: 1.9, dur: 2.1 },
      { d: `M${X(172.5)} 138 a6.5 6.5 0 1 0 -13 0 a6.5 6.5 0 1 0 13 0`, start: 4.3, dur: 1.4 },
      { d: heartD(X(183), 138, 5.5), start: 6.0, dur: 1.8 },
    ].map((s) => {
      const n = el('path', { d: s.d, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1 }, art);
      n.style.strokeDasharray = '1 1';
      return { ...s, n, len: n.getTotalLength() };
    });

    const p = new Person(c.people, { coat: 'var(--la-primary)', hem: 102, hair: 'bun' });
    p.scale = 1.9; p.x = 124 + DX; p.y = G; p.go = p.goTarget = 0;
    pen(p.prop, 1.1).setAttribute('d', 'M-6 1 L9 -1');
    tint(el('circle', { cx: 9, cy: -1, r: 1.7 }, p.prop), 'var(--la-heart)');
    const spark = sparkle(c.fx);
    p.g.style.cursor = 'pointer';
    let cyc = 0, burst = false;
    p.g.addEventListener('pointerdown', () => { if (cyc > 8.4) cyc = 0.1; });

    return (t, dt, night, wv) => {
      if (dt === 0) cyc = 8.4; else { cyc += dt; if (cyc > 12.2) { cyc -= 12.2; burst = false; } }
      const u = cyc;
      let target: Vec | null = null;
      defs.forEach((s) => {
        const k = clamp((u - s.start) / s.dur, 0, 1);
        const out = u > 10.6 ? 1 - smooth(10.6, 11.6, u) : 1;
        s.n.style.strokeDashoffset = f(1 - minJerk(k));
        s.n.setAttribute('opacity', f(out));
        if (k > 0 && k < 1) { const q = s.n.getPointAtLength(minJerk(k) * s.len); target = [q.x, q.y]; }
        else if (k >= 1 && !target && u < 8.4) { const q = s.n.getPointAtLength(s.len); target = [q.x, q.y]; }
      });
      heartFill.setAttribute('opacity', f(smooth(7.8, 8.3, u) * (u > 10.6 ? 1 - smooth(10.6, 11.6, u) : 1)));
      if (u > 8.1 && !burst) { burst = true; spark.fire(X(183), 132); }
      if (target && u < 8.5) { const tp = target as Vec; p.reach = p.toLocal(tp[0] - 17 + Math.sin(t * 30) * 0.6, tp[1] + 2); } else p.reach = null;
      p.update(t, dt, wv);
      p.prop.setAttribute('opacity', f(smooth(0.2, 0.8, p.reachAmt)));
      cat.step(t, dt, night);
      spark.step(dt);
      void lerp;
    };
  });
}
