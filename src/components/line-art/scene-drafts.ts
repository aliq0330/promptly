// "Taslak": someone writes at a standing desk; each page is torn off and added to the stack. The lamp comes on in the evening.
import { Person } from './figure';
import { defineScene, deskLamp, el, f, lamp, lerp, pen, shape, smooth, table, tint, tree, bush, clamp, type Vec } from './kit';
import { minJerk } from '@/lib/line-art/motion';
import type { SceneLabels } from './scene-common';

export function drafts(host: Element, labels: SceneLabels): () => void {
  const G = 270, PX = 244;
  return defineScene(host, labels, { id: 'df', w: 640, h: 320, G, seed: 111, sun: [120, 70], moon: [120, 70], set: 150, stars: 12, clouds: [44, 94], ground: 'paving' }, (c) => {
    tree(c, 64, 1);
    bush(c, 560, 0.8);
    lamp(c, 190, 150, 0.3);
    // the standing desk: a slanted top on two legs
    pen(c.mid, 1.4).setAttribute('d', `M258 ${G - 94} L252 ${G} M300 ${G - 98} L306 ${G}`);
    shape(c.mid, 1.2).setAttribute('d', `M252 ${G - 90} L310 ${G - 95} L306 ${G - 30} L256 ${G - 30}Z`);
    shape(c.mid, 1.2).setAttribute('d', `M246 ${G - 94} L316 ${G - 100} L316 ${G - 94} L246 ${G - 88}Z`);
    pen(c.mid, 0.6).setAttribute('d', `M262 ${G - 76} L300 ${G - 80} M262 ${G - 62} L300 ${G - 66}`);
    // the page being written, and the stack on the table
    const page = el('g', {}, c.mid);
    const sheet = shape(page, 0.9); sheet.setAttribute('d', `M252 ${G - 128} L296 ${G - 131} L296 ${G - 95} L252 ${G - 92}Z`);
    const lines = [0, 1, 2, 3].map((i) => {
      const y = G - 120 + i * 7;
      let d = `M256 ${y}`; for (let k = 1; k <= 13; k++) d += ` L${256 + k * 3} ${f(y + (k % 2 ? -1.5 : 1.2))}`;
      const n = el('path', { d, fill: 'none', stroke: 'currentColor', 'stroke-width': 0.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1 }, page);
      n.style.strokeDasharray = '1 1';
      return { n, len: n.getTotalLength(), start: 0.5 + i * 1.5, dur: 1.3 };
    });
    table(c, 360, 96, G - 64);
    deskLamp(c, 376, G - 64, 0.3);
    const stack = Array.from({ length: 5 }, (_, i) => { const n = shape(c.mid, 0.8); n.setAttribute('d', `M${412 - 2 * (i % 2)} ${G - 66 - i * 3} L${446 - 2 * (i % 2)} ${G - 66 - i * 3} L${446 - 2 * (i % 2)} ${G - 64 - i * 3} L${412 - 2 * (i % 2)} ${G - 64 - i * 3}Z`); n.setAttribute('opacity', '0'); return n; });
    const flying = shape(c.fx, 0.9); flying.setAttribute('d', 'M-22 -18 L22 -18 L22 18 L-22 18Z'); flying.setAttribute('opacity', '0');
    const p = new Person(c.people, { coat: 'var(--la-cloth-2)', legs: 'var(--la-legs)', hair: 'short', scarf: 'var(--la-primary)' });
    p.scale = 1.45; p.x = PX; p.y = G + 6; p.go = p.goTarget = 0;
    pen(p.prop, 1.1).setAttribute('d', 'M-4 1 L6 -1');
    tint(el('circle', { cx: 6, cy: -1, r: 1.3 }, p.prop), 'var(--la-heart)');
    let cyc = 0, count = 0;
    const CYC = 9.6;
    return (t, dt, _n, wv) => {
      if (dt === 0) { cyc = 6; count = 3; } else { cyc += dt; if (cyc > CYC) { cyc -= CYC; count = (count + 1) % 6; } }
      const u = cyc;
      let target: Vec | null = null;
      lines.forEach((l, i) => {
        const k = clamp((u - l.start) / l.dur, 0, 1);
        l.n.style.strokeDashoffset = f(1 - k);
        if (k > 0 && k < 1) { const q = l.n.getPointAtLength(k * l.len); target = [q.x, q.y]; }
        else if (k >= 1 && i === 3) target = null;
      });
      // the page lifts off at 6.6 s and arcs to the stack, a fresh page fades in
      const fly = clamp((u - 6.6) / 0.9, 0, 1);
      const fresh = u > 7.5 ? smooth(7.5, 8.2, u) : u < 0.2 ? 1 : 0;
      page.setAttribute('opacity', f(u < 6.6 ? 1 : u < 7.5 ? 0 : fresh));
      if (u >= 6.6 && u < 7.5) {
        const e = minJerk(fly);
        flying.setAttribute('opacity', '1');
        flying.setAttribute('transform', `translate(${f(lerp(274, 429, e))} ${f(lerp(G - 110, G - 74 - count * 3, e) - Math.sin(Math.PI * e) * 40)}) rotate(${f(lerp(-4, 8, e))}) scale(${f(lerp(1, 0.78, e))})`);
      } else flying.setAttribute('opacity', '0');
      lines.forEach((l) => { if (u > 7.5 && u < 8.2) l.n.style.strokeDashoffset = '1'; });
      stack.forEach((n, i) => n.setAttribute('opacity', i < count + (u > 7.5 ? 1 : 0) ? '1' : '0'));
      if (target && u < 6.3) { const tp = target as Vec; p.reach = p.toLocal(tp[0] - 8.7 + Math.sin(t * 28) * 0.4, tp[1] + 1.5); } else p.reach = u > 6.3 && u < 7.4 ? [54, 40] : null;
      p.update(t, dt, wv);
      p.prop.setAttribute('opacity', f(smooth(0.2, 0.8, p.reachAmt)));
    };
  });
}
