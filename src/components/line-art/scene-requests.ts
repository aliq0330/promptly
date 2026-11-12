// "İstek": a card on a string goes up with a balloon, drifts over the hills; a tiny figure on a hill waves as it passes. Tap the figure.
import { Person, promptCard } from './figure';
import { Cat, bush, defineScene, el, f, pen, shape, smooth, sparkle, tint, tree, clamp, lerp, type Vec } from './kit';
import { spring } from '@/lib/line-art/motion';
import type { SceneLabels } from './scene-common';

export function requests(host: Element, labels: SceneLabels): () => void {
  const G = 272;
  return defineScene(host, labels, { id: 'rq', w: 640, h: 320, G, seed: 81, sun: [470, 62], moon: [470, 62], set: 150, stars: 16, clouds: [44, 100, 150], ground: 'grass' }, (c) => {
    // a hill on the right with a tiny person on top
    shape(c.far, 1).setAttribute('d', `M330 ${G} Q430 ${G - 16} 500 ${G - 62} Q560 ${G - 92} 640 ${G - 54} L640 ${G}Z`);
    pen(c.far, 0.5).setAttribute('d', `M420 ${G - 12} q10 -8 20 0 M560 ${G - 40} q10 -8 20 0`);
    tree(c, 70, 1);
    bush(c, 260, 0.8);
    const cat = new Cat(c.mid, 120, G + 2, 1, 1.4);
    const far = new Person(c.mid, { coat: 'var(--la-heart)', legs: 'var(--la-legs)', hair: 'short' });
    far.scale = 0.55; far.x = 548; far.y = G - 66; far.dir = -1; far.go = far.goTarget = 0;
    const p = new Person(c.people, { coat: 'var(--la-cloth-2)', hem: 102, hair: 'long' });
    p.scale = 1.4; p.x = 210; p.y = G + 6; p.go = p.goTarget = 0;
    // balloon + string + card
    const colours = ['var(--la-primary)', 'var(--la-heart)', 'var(--la-cloth-3)'];
    const bal = el('g', {}, c.fx);
    const body = el('path', { d: 'M0 -13 C9 -13 12 -4 9 4 C7 9 3 12 0 13 C-3 12 -7 9 -9 4 C-12 -4 -9 -13 0 -13Z', stroke: 'currentColor', 'stroke-width': 1.1 }, bal);
    pen(bal, 0.7).setAttribute('d', 'M-4 -8 q-2 3 -1 6'); pen(bal, 1).setAttribute('d', 'M-2.4 15 L0 12.6 L2.4 15Z');
    const string = pen(c.fx, 0.9);
    const card = promptCard(c.fx, { w: 13, h: 17, brace: true });
    const spark = sparkle(c.fx);
    const swing = spring(18, 3, 0);
    let cyc = 0, n = 0, bx = 0, by = 0, sparked = false, waveT = -1;
    far.g.style.cursor = 'pointer';
    far.g.addEventListener('pointerdown', () => { waveT = 0; });
    return (t, dt, night, wv) => {
      if (dt === 0) cyc = 3.2; else { cyc += dt; if (cyc > 11) { cyc -= 11; n++; sparked = false; } }
      body.style.fill = colours[n % 3];
      const u = cyc;
      const holding = u < 1.4;
      // the hand goes up with the balloon, lets go at 1.4 s
      p.reach = holding ? [52, 30] : u < 3.4 ? [50 + Math.sin(t * 6) * 3, 14] : null;
      p.update(t, dt, wv);
      const hand: Vec = p.toScene(p.hand[0], p.hand[1]);
      if (holding) { bx = hand[0] + 4; by = hand[1] - 52; }
      else {
        const k = u - 1.4;
        bx = hand[0] + 4 + k * 52 + Math.sin(k * 1.6) * 12 + wv * k * 3;
        by = hand[1] - 52 - k * k * 0.9 - k * 6;
      }
      const lag = swing.step(clamp((bx - hand[0]) * 0.02, -1, 1) * (holding ? 0 : 1), dt);
      bal.setAttribute('transform', `translate(${f(bx)} ${f(by)}) rotate(${f(Math.sin(u * 2) * 4)})`);
      bal.setAttribute('opacity', by < -30 ? '0' : '1');
      const cx = holding ? hand[0] + 4 : bx - lag * 12, cy = holding ? hand[1] - 6 : by + 46;
      string.setAttribute('d', `M${f(bx)} ${f(by + 15)} Q${f(lerp(bx, cx, 0.5) + lag * 8)} ${f(lerp(by + 15, cy, 0.5))} ${f(cx)} ${f(cy - 8)}`);
      card.setAttribute('transform', `translate(${f(cx)} ${f(cy)}) rotate(${f(lag * 18)})`);
      card.setAttribute('opacity', by < -30 ? '0' : '1');
      if (u > 6.2 && !sparked) { sparked = true; waveT = 0; spark.fire(cx, cy - 4); }
      if (waveT >= 0) { waveT += dt; if (waveT > 3.4) waveT = -1; }
      far.reach = waveT >= 0 ? [54 + Math.sin(t * 12) * 3, 16] : null;
      far.update(t, dt, wv);
      spark.step(dt);
      cat.step(t, dt, night);
      void smooth; void tint;
    };
  });
}
