// Scene 3 — "Paylaşma anı": two people meet in a park; one hands the other a prompt card.
// For the welcome tour or an onboarding step.
import { el, pen, shape, f, type Vec } from '@/lib/line-art/ink';
import { pointerWind, seeded, smooth, wobble } from '@/lib/line-art/motion';
import { Person, promptCard, heartPop } from './figure';
import { stage, skyBits, Pigeon } from './scene-common';
import { addScene } from './loop';
import type { SceneLabels } from './scene-common';

const W = 640, H = 320, G = 262;

export function share(host: Element, labels: SceneLabels): () => void {
  const st = stage(host, W, H, labels.label, 'sh');
  const { svg, scene, glow } = st;
  const rnd = seeded(5);
  const wind = pointerWind(svg, 0.3);
  const sky = skyBits(scene, rnd, { w: W, sun: [110, 64], moon: [520, 60], set: 140, stars: 10 });

  // park: a tree, a bench, a low hedge, a path
  const park = el('g', {}, scene);
  const hills = pen(park, 0.8); hills.setAttribute('opacity', '0.35');
  hills.setAttribute('d', `M0 ${G - 58} Q120 ${G - 74} 240 ${G - 62} T480 ${G - 66} T640 ${G - 60}`);
  const treeG = el('g', {}, park);
  pen(treeG, 1.3).setAttribute('d', `M92 ${G} Q88 ${G - 50} 94 ${G - 96} M92 ${G - 60} Q78 ${G - 72} 72 ${G - 84} M93 ${G - 74} Q106 ${G - 86} 112 ${G - 96}`);
  const crown = el('g', {}, treeG);
  shape(crown, 1.1).setAttribute('d', `M54 ${G - 92} Q36 ${G - 104} 50 ${G - 124} Q48 ${G - 150} 74 ${G - 152} Q86 ${G - 176} 110 ${G - 160} Q138 ${G - 162} 136 ${G - 136} Q152 ${G - 118} 134 ${G - 100} Q128 ${G - 84} 106 ${G - 90} Q92 ${G - 80} 78 ${G - 90} Q64 ${G - 82} 54 ${G - 92}Z`);
  pen(crown, 0.6).setAttribute('d', `M66 ${G - 128} q4 -3 8 0 M96 ${G - 140} q4 -3 8 0 M112 ${G - 116} q4 -3 8 0 M80 ${G - 106} q4 -3 8 0 M118 ${G - 146} q4 -3 8 0`);
  // bench
  pen(park, 1.1).setAttribute('d', `M444 ${G - 4} L446 ${G - 24} M514 ${G - 4} L512 ${G - 24} M438 ${G - 24} L520 ${G - 24} M438 ${G - 28} L520 ${G - 28} M448 ${G - 28} L446 ${G - 50} M510 ${G - 28} L512 ${G - 50} M440 ${G - 44} L518 ${G - 44} M440 ${G - 50} L518 ${G - 50}`);
  // hedge
  const hedge = shape(park, 1);
  pen(park, 0.6).setAttribute('d', Array.from({ length: 9 }, (_, i) => `M${f(552 + i * 9)} ${G - 22} q3 -3 6 0`).join(' '));
  // lamp
  shape(park, 1.1).setAttribute('d', `M398 ${G} L399.4 ${G - 116} L401.6 ${G - 116} L403 ${G}Z`);
  el('circle', { cx: 400.5, cy: G - 124, r: 9, fill: 'var(--la-paper)', stroke: 'currentColor', 'stroke-width': 1.1, class: 'pp' }, park);
  const lampLit = el('circle', { cx: 400.5, cy: G - 124, r: 7.6, opacity: 0 }, park); lampLit.style.fill = 'var(--la-glow)';

  // ground
  const ground = el('g', {}, scene);
  shape(ground, 1).setAttribute('d', `M-2 ${G} L642 ${G} L642 322 L-2 322Z`);
  const grass = pen(ground, 0.55); grass.setAttribute('opacity', '0.6');
  grass.setAttribute('d', Array.from({ length: 26 }, () => { const x = rnd(4, 636), y = rnd(G + 34, 314); return `M${f(x)} ${f(y)} l-1.6 -4 M${f(x + 2)} ${f(y)} l0.6 -5 M${f(x + 4)} ${f(y)} l2 -3.6`; }).join(' '));
  pen(ground, 0.8).setAttribute('d', `M0 ${G + 24} Q320 ${G + 30} 640 ${G + 22}`);

  const people = el('g', {}, scene);
  const fxG = el('g', { 'pointer-events': 'none' }, scene);
  const heart = heartPop(fxG);
  const a = new Person(people, { coat: 'var(--la-cloth-1)', legs: 'var(--la-legs)', hair: 'hat', scarf: 'var(--la-heart)' });
  const b = new Person(people, { coat: 'var(--la-primary)', hem: 102, hair: 'long' });
  a.scale = b.scale = 1.12; a.y = G + 4; b.y = G + 14;
  const cardA = promptCard(a.prop, { w: 15, h: 19, brace: true }); cardA.setAttribute('transform', 'translate(0 8)');
  const cardB = promptCard(b.prop, { w: 15, h: 19, brace: true }); cardB.setAttribute('transform', 'translate(0 8)');
  [a, b].forEach((p) => { p.g.style.cursor = 'pointer'; p.g.addEventListener('pointerdown', () => { const h = p.toScene(44, 4); heart.fire(h[0], h[1]); }); });

  const pigeon = new Pigeon(scene, [260, G + 40], [470, G - 50], 1, () => pigeon.scare());

  // the story, 15 s: meet · hand over · a heart · read it, tip the hat · walk on past each other
  type S = 'meet' | 'give' | 'after' | 'part';
  let s: S = 'meet', sT = 0;
  const MEET_A = 268, MEET_B = 352;
  const reset = () => {
    s = 'meet'; sT = 0;
    a.x = 60; a.dir = 1; b.x = 580; b.dir = -1;
    a.go = a.goTarget = b.go = b.goTarget = 1; a.reach = [52, 62]; b.reach = null;
    cardA.setAttribute('opacity', '1'); cardB.setAttribute('opacity', '0'); a.hatLift = 0;
  };
  reset();
  // start part-way, so both are already in view
  a.x = 170; b.x = 470;

  const remove = addScene({
    host,
    draw(t, dt, night) {
      const wv = wind.step(t);
      sky.step(t, night);
      lampLit.setAttribute('opacity', f(smooth(0.25, 0.6, night)));
      halo.setAttribute('opacity', f(smooth(0.25, 0.6, night) * 0.6));
      const sway = wv * 1.3 + wobble(t * 0.6) * 0.8;
      crown.setAttribute('transform', `rotate(${f(sway * 1.2)} 93 ${G - 90})`);
      hedge.setAttribute('d', `M544 ${G} Q${f(540 + sway * 0.5)} ${G - 30} ${f(566 + sway)} ${G - 32} Q${f(600 + sway)} ${G - 38} ${f(626 + sway)} ${G - 30} Q646 ${G - 24} 642 ${G}Z`);

      sT += dt;
      if (s === 'meet') {
        if (a.x >= MEET_A - 10) a.goTarget = 0;
        if (b.x <= MEET_B + 10) b.goTarget = 0;
        if (a.go === 0 && b.go === 0) { s = 'give'; sT = 0; }
      } else if (s === 'give') {
        const mid: Vec = [(a.x + b.x) / 2, a.y - 66];
        a.reach = a.toLocal(mid[0] - 3, mid[1]);
        if (sT > 0.6) b.reach = b.toLocal(mid[0] + 3, mid[1]);
        if (sT > 1.4 && cardA.getAttribute('opacity') === '1') {
          cardA.setAttribute('opacity', '0'); cardB.setAttribute('opacity', '1');
          heart.fire(mid[0], mid[1] - 34);
        }
        if (sT > 1.9) { s = 'after'; sT = 0; a.reach = null; b.reach = [58, 46]; }
      } else if (s === 'after') {
        // a tips the hat; b holds the card up to read it
        a.reach = sT > 0.3 && sT < 1.8 ? [47, 24] : null;
        a.hatLift = sT > 0.6 && sT < 1.6 ? 1 : Math.max(0, a.hatLift - dt * 3);
        if (sT > 2.4) { s = 'part'; sT = 0; a.goTarget = 1; b.goTarget = 1; }
      } else if (s === 'part') {
        if (sT > 1.2) b.reach = [52, 62];
        if (sT > 9) reset();
      }
      a.update(t, dt, wv); b.update(t, dt, wv);
      heart.step(dt);
      pigeon.step(t, dt);
      if ((s === 'meet' || s === 'part') && Math.abs(pigeon.x - a.x) < 30) pigeon.scare();
      const ord = [a, b].sort((p, q) => p.y - q.y);
      ord.forEach((p, i) => { if (people.children[i] !== p.g) people.appendChild(p.g); });
    },
  });
  const halo = el('circle', { cx: 400.5, cy: G - 120, r: 60, fill: st.glowFill, opacity: 0 }, glow);
  return remove;
}
