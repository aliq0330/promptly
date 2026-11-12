// "Yaratıcı paneli": someone waters a sapling; as it grows, the bars of a chart beside it grow too, and a heart blooms on top.
import { Person } from './figure';
import { bush, defineScene, el, f, lamp, lerp, pen, shape, smooth, sparkle, tint, tree, clamp } from './kit';
import { minJerk } from '@/lib/line-art/motion';
import type { SceneLabels } from './scene-common';

const BARS = [0.34, 0.5, 0.44, 0.76, 1];

export function insights(host: Element, labels: SceneLabels): () => void {
  const G = 270, SX = 226, BX = 330;
  return defineScene(host, labels, { id: 'in', w: 640, h: 320, G, seed: 121, sun: [540, 66], moon: [540, 66], set: 150, stars: 12, clouds: [46, 96], ground: 'grass' }, (c) => {
    tree(c, 70, 1);
    bush(c, 590, 0.8);
    lamp(c, 120, 150, 0.3);
    // the chart board
    pen(c.mid, 1.5).setAttribute('d', `M${BX + 20} 214 L${BX + 12} ${G} M${BX + 160} 214 L${BX + 168} ${G}`);
    shape(c.mid, 1.3).setAttribute('d', `M${BX} 62 L${BX + 180} 62 L${BX + 180} 214 L${BX} 214Z`);
    pen(c.mid, 0.6).setAttribute('d', `M${BX + 8} 70 L${BX + 172} 70 L${BX + 172} 206 L${BX + 8} 206Z`);
    pen(c.mid, 1).setAttribute('d', `M${BX + 22} 84 L${BX + 22} 190 L${BX + 162} 190`);
    pen(c.mid, 0.4).setAttribute('d', [112, 134, 156].map((y) => `M${BX + 22} ${y} L${BX + 162} ${y}`).join(' '));
    const bars = BARS.map((_, i) => {
      const n = el('path', { stroke: 'currentColor', 'stroke-width': 1 }, c.mid);
      n.style.fill = i === BARS.length - 1 ? 'var(--la-heart)' : 'var(--la-paper)';
      return n;
    });
    // the pot and the sapling
    shape(c.mid, 1.2).setAttribute('d', `M${SX - 15} ${G - 28} L${SX + 15} ${G - 28} L${SX + 11} ${G} L${SX - 11} ${G}Z`);
    const plant = el('g', {}, c.mid);
    const stem = pen(plant, 1.5);
    const leaves = [0.18, 0.38, 0.58, 0.78].map((th, i) => {
      const n = tint(el('path', { stroke: 'currentColor', 'stroke-width': 0.9, 'stroke-linejoin': 'round' }, plant), 'var(--la-cloth-3)');
      return { n, th, side: i % 2 ? -1 : 1 };
    });
    const bloom = tint(el('path', { d: 'M0 4 c-1 -.8 -9 -6.4 -9 -12.2 a4.6 4.6 0 0 1 9 -1.5 a4.6 4.6 0 0 1 9 1.5 c0 5.8 -8 11.4 -9 12.2z', stroke: 'currentColor', 'stroke-width': 0.9 }, plant), 'var(--la-heart)');
    const drops = Array.from({ length: 9 }, () => ({ n: tint(el('circle', { r: 1.4 }, c.fx), 'var(--la-primary)'), x: 0, y: 0, v: 0, life: 0 }));
    const spark = sparkle(c.fx);
    const p = new Person(c.people, { coat: 'var(--la-cloth-2)', hem: 102, hair: 'long' });
    p.scale = 1.35; p.x = 150; p.y = G + 6; p.go = p.goTarget = 0;
    shape(p.prop, 0.9).setAttribute('d', 'M-4 -3 L8 -3 L8 7 L-4 7Z');
    pen(p.prop, 0.9).setAttribute('d', 'M-4 -1 q-7 4 0 8 M8 0 L22 -9 M22 -9 l2.4 -1 M22 -9 l1.6 2');
    let cyc = 0, bloomed = false;
    const CYC = 14;
    return (t, dt, _n, wv) => {
      if (dt === 0) cyc = 10.5; else { cyc += dt; if (cyc > CYC) { cyc -= CYC; bloomed = false; } }
      const u = cyc;
      const g = u < 12.6 ? minJerk(clamp((u - 0.9) / 8.6, 0, 1)) : 1 - smooth(12.6, 13.6, u);
      const watering = u > 0.4 && u < 9.8;
      p.reach = watering ? [58, 52] : null;
      p.update(t, dt, wv);
      const top = G - 28 - 56 * g, sway = Math.sin(t * 1.4) * 1.5 + wv * 1.5;
      stem.setAttribute('d', `M${SX} ${G - 28} Q${f(SX + sway * 0.5)} ${f(lerp(G - 28, top, 0.5))} ${f(SX + sway)} ${f(top)}`);
      leaves.forEach((l) => {
        const k = smooth(l.th, l.th + 0.16, g);
        const y = lerp(G - 28, top, l.th + 0.12), x = lerp(SX, SX + sway, l.th + 0.12);
        const w = 15 * k, h = 7 * k;
        l.n.setAttribute('d', k > 0.01 ? `M${f(x)} ${f(y)} Q${f(x + l.side * w * 0.5)} ${f(y - h)} ${f(x + l.side * w)} ${f(y - h * 0.4)} Q${f(x + l.side * w * 0.5)} ${f(y + h * 0.4)} ${f(x)} ${f(y)}Z` : '');
      });
      const b = u > 9.5 && u < 12.6 ? smooth(9.5, 10.2, u) : 0;
      bloom.setAttribute('opacity', f(b));
      bloom.setAttribute('transform', `translate(${f(SX + sway)} ${f(top - 7)}) scale(${f(0.4 + b * 0.6)})`);
      if (u > 9.6 && !bloomed) { bloomed = true; spark.fire(SX + 6, top - 20); }
      bars.forEach((bn, i) => {
        const k = clamp((g * 1.3 - i * 0.07) / 0.72, 0, 1) * BARS[i] * 96;
        const x = BX + 30 + i * 27;
        bn.setAttribute('d', k > 0.4 ? `M${x} 190 L${x} ${f(190 - k)} L${x + 17} ${f(190 - k)} L${x + 17} 190Z` : '');
      });
      // droplets from the spout
      const tip = p.toScene(p.hand[0] + 22, p.hand[1] - 9);
      drops.forEach((d) => {
        d.life -= dt;
        if (d.life <= 0) { if (!watering) { d.n.setAttribute('opacity', '0'); return; } d.life = 0.5 + Math.random() * 0.2; d.x = tip[0] + (Math.random() - 0.5) * 4; d.y = tip[1]; d.v = 30; }
        d.v += 360 * dt; d.y += d.v * dt; d.x += 8 * dt;
        d.n.setAttribute('cx', f(d.x)); d.n.setAttribute('cy', f(Math.min(d.y, top + 2)));
        d.n.setAttribute('opacity', d.y > top + 2 ? '0' : '1');
      });
      spark.step(dt);
    };
  });
}
