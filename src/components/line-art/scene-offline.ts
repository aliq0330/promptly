// "Bağlantı yok": someone carries a plug to a wall socket. Plugged in, the desk lamp and the wifi sign come on.
// The scene never decides the connection is back — it is shown only where the page says so.
import { Person } from './figure';
import { defineScene, el, f, pen, pt, shape, smooth, tint, lerp, clamp, type Vec } from './kit';
import type { SceneLabels } from './scene-common';

export function offline(host: Element, labels: SceneLabels): () => void {
  const G = 290, SX = 424, SY = 188;
  return defineScene(host, labels, { id: 'of', w: 640, h: 320, G, seed: 9, sun: [270, 78], moon: [270, 78], set: 150, stars: 12, clouds: [46, 110], ground: 'paving' }, (c) => {
    // wall with a socket and a wifi sign
    shape(c.back, 1.2).setAttribute('d', `M410 ${G} L410 70 L642 70 L642 ${G}Z`);
    pen(c.back, 0.9).setAttribute('d', `M410 ${G - 14} L642 ${G - 14}`);
    shape(c.back, 1).setAttribute('d', `M${SX - 7} ${SY - 11} L${SX + 7} ${SY - 11} L${SX + 7} ${SY + 11} L${SX - 7} ${SY + 11}Z`);
    pen(c.back, 0.9).setAttribute('d', `M${SX - 1} ${SY - 5} l0 3 M${SX - 1} ${SY + 3} l0 3`);
    const cx = 520, cy = 168;
    const arcs = [10, 20, 30].map((r) => {
      const n = pen(c.back, 1.5);
      n.setAttribute('d', `M${f(cx - r * 0.643)} ${f(cy - r * 0.766)} A${r} ${r} 0 0 1 ${f(cx + r * 0.643)} ${f(cy - r * 0.766)}`);
      return n;
    });
    tint(el('circle', { cx, cy, r: 2.6 }, c.back), 'currentColor');
    const slash = pen(c.back, 1.6); slash.setAttribute('d', `M${cx - 30} ${cy - 34} L${cx + 26} ${cy + 6}`);
    // desk with a lamp
    pen(c.mid, 1.3).setAttribute('d', `M34 240 L34 ${G} M118 240 L118 ${G}`);
    shape(c.mid, 1.2).setAttribute('d', 'M24 232 L128 232 L128 241 L24 241Z');
    shape(c.mid, 1).setAttribute('d', 'M62 232 Q62 226 74 226 Q86 226 86 232Z');
    pen(c.mid, 1.4).setAttribute('d', 'M74 226 L74 204 L94 186');
    shape(c.mid, 1.1).setAttribute('d', 'M84 180 L108 192 L100 204 L78 192Z');
    const lampLit = tint(el('path', { d: 'M86 182 L106 192 L99 202 L80 192Z', opacity: 0 }, c.mid), 'var(--la-glow)');
    const halo = c.halo(94, 192, 84);
    const cable = pen(c.front, 1.7);
    const p = new Person(c.people, { coat: 'var(--la-cloth-2)', legs: 'var(--la-legs)', hair: 'short', scarf: 'var(--la-primary)' });
    p.scale = 1.5; p.y = G; p.x = 190;
    shape(p.prop, 0.8).setAttribute('d', 'M-3 -3.4 L4 -3.4 L4 3.4 L-3 3.4Z');
    pen(p.prop, 0.9).setAttribute('d', 'M4 -1.6 L8 -1.6 M4 1.6 L8 1.6');
    const spark = pen(c.fx, 1); spark.style.stroke = 'var(--la-heart)';
    const A: Vec = [76, 234], L = 372;
    type S = 'right' | 'stop' | 'reach' | 'plugged' | 'unplug' | 'left' | 'turn';
    let s: S = 'right', sT = 0, lit = 0, plugT = 99;
    p.reach = [53, 62];
    return (t, dt, _night, wv) => {
      if (dt === 0) { s = 'plugged'; sT = 2; p.x = 383; p.go = p.goTarget = 0; p.reach = p.toLocal(SX - 6, SY); p.reachAmt = 1; lit = 1; plugT = 5; }
      sT += dt; plugT += dt;
      p.farReach = s === 'plugged' && sT > 0.9 && sT < 2.9 ? [52 + Math.sin(t * 12) * 3, 20] : null;
      if (s === 'right') { if (p.x >= 366) { p.goTarget = 0; s = 'stop'; } }
      else if (s === 'stop') { if (p.go < 0.02) { s = 'reach'; sT = 0; p.reach = p.toLocal(SX - 6, SY); } }
      else if (s === 'reach') { if (p.reachAmt >= 0.98) { s = 'plugged'; sT = 0; plugT = 0; } }
      else if (s === 'plugged') { if (sT > 3.6) { s = 'unplug'; sT = 0; p.reach = [53, 62]; } }
      else if (s === 'unplug') { if (sT > 0.9) { s = 'left'; p.dir = -1; p.goTarget = 1; } }
      else if (s === 'left') { if (p.x <= 200) { p.goTarget = 0; s = 'turn'; } }
      else if (s === 'turn') { if (p.go < 0.02) { p.dir = 1; p.goTarget = 1; s = 'right'; } }
      p.update(t, dt, wv);
      const on = s === 'plugged';
      const flick = plugT < 0.5 ? (Math.sin(plugT * 55) > 0.1 ? 1 : 0.15) : 1;
      lit += ((on ? 1 : 0) - lit) * Math.min(1, dt * (on ? 14 : 5));
      lampLit.setAttribute('opacity', f(lit * flick));
      halo.setAttribute('opacity', f(lit * flick * 0.5));
      arcs.forEach((a, i) => { a.style.stroke = lit > 0.5 ? 'var(--la-primary)' : ''; a.setAttribute('opacity', f(lit > 0.5 ? smooth(0.2 + i * 0.12, 0.4 + i * 0.12, plugT) : 0.28)); });
      slash.setAttribute('opacity', f(1 - lit));
      spark.setAttribute('d', plugT < 0.35 ? `M${SX + 9} ${SY - 12} l6 -6 M${SX + 11} ${SY - 4} l9 -2 M${SX + 9} ${SY + 6} l7 4` : '');
      const h = p.toScene(p.hand[0] - 3, p.hand[1]);
      const d = Math.hypot(h[0] - A[0], h[1] - A[1]);
      const sag = Math.sqrt(Math.max(0, L * L - d * d)) * 0.55;
      cable.setAttribute('d', `M${pt(A)} Q${f((A[0] + h[0]) / 2)} ${f(Math.min(G - 4, (A[1] + h[1]) / 2 + sag))} ${pt(h)}`);
      void lerp; void clamp;
    };
  });
}
