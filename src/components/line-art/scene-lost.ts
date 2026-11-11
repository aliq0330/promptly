// Scene 2 — "Kayıp prompt": a prompt card blows down the street; someone almost catches it.
// For the 404 / "not found" page. The house number on the wall is 404.
import { el, pen, shape, f, PAPER, type Vec } from '@/lib/line-art/ink';
import { pendulum, pointerWind, seeded, smooth, wobble, minJerk, clamp } from '@/lib/line-art/motion';
import { Person, promptCard, tint } from './figure';
import { stage, windowPane, skyBits, lerp } from './scene-common';
import { addScene } from './loop';
import type { SceneLabels } from './scene-common';

const W = 800, H = 400, G = 322;

export function lost(host: Element, labels: SceneLabels): () => void {
  const st = stage(host, W, H, labels.label, 'lo');
  const { svg, scene, glow } = st;
  const rnd = seeded(19);
  const wind = pointerWind(svg, 0.35);
  const sky = skyBits(scene, rnd, { w: W, sun: [520, 70], moon: [470, 66], set: 150, stars: 12 });

  // far trees and roofs in diluted ink, two slow clouds
  const far = el('g', { opacity: 0.32 }, scene);
  pen(far, 0.9).setAttribute('d', `M0 ${G - 70} Q30 ${G - 104} 64 ${G - 92} Q90 ${G - 124} 124 ${G - 100} Q150 ${G - 112} 170 ${G - 86} L210 ${G - 86} L210 ${G - 118} L250 ${G - 138} L290 ${G - 118} L290 ${G - 80} Q330 ${G - 110} 372 ${G - 94} Q400 ${G - 128} 440 ${G - 104} Q470 ${G - 96} 490 ${G - 84} L520 ${G - 84} L520 ${G - 112} L560 ${G - 112} L560 ${G - 82} Q590 ${G - 100} 620 ${G - 92}`);
  pen(far, 0.7).setAttribute('d', `M232 ${G - 108} L232 ${G - 96} L246 ${G - 96} L246 ${G - 108}Z M532 ${G - 104} L532 ${G - 94} M546 ${G - 104} L546 ${G - 94}`);
  const clouds = [[90, 70, 80], [330, 104, 60]].map(([x, y, w]) => ({ c: pen(scene, 0.9), x, y, w }));

  // garden wall with bushes along the back of the pavement
  const back = el('g', {}, scene);
  shape(back, 1.1).setAttribute('d', `M-2 ${G - 50} L620 ${G - 50} L620 ${G - 42} L-2 ${G - 42}Z`);
  shape(back, 1.1).setAttribute('d', `M0 ${G - 42} L618 ${G - 42} L618 ${G} L0 ${G}Z`);
  pen(back, 0.5).setAttribute('d', Array.from({ length: 4 }, (_, r) => `M0 ${G - 42 + (r + 1) * 9} L618 ${G - 42 + (r + 1) * 9}`).join(' ') + ' ' + Array.from({ length: 40 }, (_, i) => { const r = i % 4; const x = Math.floor(i / 4) * 64 + (r % 2) * 32 + 14; return `M${x} ${G - 42 + r * 9} L${x} ${G - 33 + r * 9}`; }).join(' '));
  const bushes = el('g', {}, back);
  const bushShape = shape(bushes, 1.1);
  const bushMarks = pen(bushes, 0.6);
  const bushAt = [60, 150, 330, 520];
  back.insertBefore(bushes, back.firstChild);

  // house on the right: door, a lit window, the number 404
  const house = el('g', {}, scene);
  shape(house, 1.2).setAttribute('d', `M620 ${G} L620 132 L802 132 L802 ${G}Z`);
  shape(house, 1.2).setAttribute('d', 'M612 134 L806 134 L806 122 L614 122Z');
  const wins = [windowPane(house, 642, 156, 30, 44, { threshold: 0.3 }), windowPane(house, 712, 156, 30, 44, { threshold: 1.2 }), windowPane(house, 642, 232, 30, 44, { threshold: 0.5 })];
  shape(house, 1.2).setAttribute('d', `M706 ${G} L706 236 Q728 222 750 236 L750 ${G}Z`);
  pen(house, 0.7).setAttribute('d', `M728 ${G} L728 232 M744 282 l0 4 M712 ${G - 6} L744 ${G - 6}`);
  const plate = el('g', {}, house);
  el('rect', { x: 756, y: 236, width: 34, height: 18, rx: 3, fill: PAPER, stroke: 'currentColor', 'stroke-width': 1 }, plate);
  const num = el('text', { x: 773, y: 249.5, 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 600, fill: 'currentColor', class: 'plate' }, plate);
  num.textContent = '404';
  // a wall lamp by the door
  shape(house, 1).setAttribute('d', 'M694 236 L702 236 L700 250 L696 250Z');
  const wallLamp = tint(el('path', { d: 'M695 238 L701 238 L699.5 248 L696.5 248Z', opacity: 0 }, house), 'var(--la-glow)');

  // signpost: home one way, discover the other; the boards swing when tapped
  const post = el('g', { style: 'cursor:pointer' }, scene);
  shape(post, 1.1).setAttribute('d', `M226 ${G} L227.4 176 L230.6 176 L232 ${G}Z`);
  el('circle', { cx: 229, cy: 174, r: 3, fill: PAPER, stroke: 'currentColor', 'stroke-width': 1 }, post);
  const boardL = el('g', {}, post), boardR = el('g', {}, post);
  shape(boardL, 1.1).setAttribute('d', 'M228 0 L184 0 L174 9 L184 18 L228 18Z');
  // a little house
  pen(boardL, 0.9).setAttribute('d', 'M196 12 L196 7 L201 3 L206 7 L206 12Z M200 12 L200 9 L202 9 L202 12 M211 6 L222 6 M211 10 L219 10');
  shape(boardR, 1.1).setAttribute('d', 'M230 0 L274 0 L284 9 L274 18 L230 18Z');
  // a magnifier
  pen(boardR, 0.9).setAttribute('d', 'M262 8 a4 4 0 1 0 0.01 0 M265 11 L268.5 14.5 M238 6 L253 6 M238 10 L250 10');
  const swingL = pendulum(14, 1.4), swingR = pendulum(12, 1.2);
  post.addEventListener('pointerdown', () => { swingL.kick(1.8); swingR.kick(-2.2); });

  // pavement
  const ground = el('g', {}, scene);
  shape(ground, 1).setAttribute('d', `M-2 ${G} L802 ${G} L802 402 L-2 402Z`);
  pen(ground, 1).setAttribute('d', `M0 ${G + 12} L800 ${G + 12}`);
  const tiles = pen(ground, 0.45); tiles.setAttribute('opacity', '0.55');
  tiles.setAttribute('d', Array.from({ length: 20 }, (_, i) => `M${i * 44 + 8} ${G} L${i * 44 + 4} ${G + 12}`).join(' ') + ` M0 ${G + 40} L800 ${G + 40} M0 ${G + 66} L800 ${G + 66}`);
  // street lamp
  shape(ground, 1.1).setAttribute('d', `M578 ${G + 10} L579.6 190 L582.4 190 L584 ${G + 10}Z`);
  shape(ground, 1.1).setAttribute('d', 'M572 188 L590 188 L587 170 L575 170Z');
  const lampPane = tint(el('path', { d: 'M574 186 L588 186 L586 172 L576 172Z', opacity: 0 }, ground), 'var(--la-glow)');
  shape(ground, 1.1).setAttribute('d', 'M571 171 L591 171 L581 160Z');

  // the person and the card
  const people = el('g', {}, scene);
  const p = new Person(people, { coat: 'var(--la-cloth-3)', legs: 'var(--la-legs)', hair: 'cap', cap: 'var(--la-heart)', scarf: 'var(--la-primary)' });
  p.y = G + 6; p.scale = 1.08; p.dir = 1;
  p.g.style.cursor = 'pointer';
  const question = pen(people, 1.3);
  const fx = el('g', {}, scene);
  const cardG = el('g', { style: 'cursor:pointer' }, fx);
  const card = promptCard(cardG, { w: 16, h: 20, lines: 4, accent: 'var(--la-heart)' });
  void card;
  el('circle', { r: 16, fill: 'transparent' }, cardG);
  const dust = pen(fx, 0.6);

  // a 20 s story: drift in · walk up · reach · gust · puzzled · walk after it
  type S = 'approach' | 'reach' | 'escape' | 'puzzle' | 'leave';
  let s: S = 'approach', sT = 0, cyc = 0;
  let cx = 120, cy = 250, ca = 0, cardV = 0, hop = 0;
  const HOVER: Vec = [452, 262];
  let esc0: Vec = [0, 0];
  p.x = 150;
  const restart = () => { s = 'approach'; sT = 0; cyc = 0; p.x = -60; p.dir = 1; p.go = p.goTarget = 1; p.reach = null; cx = -30; cy = 240; };
  p.g.addEventListener('pointerdown', () => { if (s === 'approach' || s === 'leave') { p.goTarget = 0; setTimeout(() => (p.goTarget = 1), 900); } });
  cardG.addEventListener('pointerdown', () => { hop = 1; cardV += 3; });

  const remove = addScene({
    host,
    draw(t, dt, night) {
      const wv = wind.step(t);
      sky.step(t, night);
      clouds.forEach((c) => {
        const x = ((c.x + t * 5 + wv * 3) % (W + 200)) - 100;
        c.c.setAttribute('d', `M${f(x)} ${c.y} L${f(x + c.w)} ${c.y} Q${f(x + c.w + 9)} ${c.y} ${f(x + c.w + 9)} ${c.y - 6} Q${f(x + c.w + 9)} ${c.y - 12} ${f(x + c.w + 2)} ${c.y - 11} M${f(x + 14)} ${c.y + 7} L${f(x + c.w * 0.6)} ${c.y + 7}`);
        c.c.setAttribute('opacity', f(1 - night * 0.6));
      });
      wins.forEach((w) => w.step(night, t));
      wallLamp.setAttribute('opacity', f(smooth(0.3, 0.6, night)));
      lampPane.setAttribute('opacity', f(smooth(0.25, 0.55, night)));
      halos.forEach((h) => h.n.setAttribute('opacity', f(smooth(h.th, h.th + 0.3, night) * h.k)));

      // bushes breathe in the wind
      const sway = wv * 1.2 + wobble(t * 0.7) * 0.6;
      bushShape.setAttribute('d', bushAt.map((x) => `M${x - 30} ${G - 42} Q${f(x - 34 + sway)} ${G - 60} ${f(x - 16 + sway)} ${G - 64} Q${f(x - 6 + sway)} ${G - 78} ${f(x + 10 + sway)} ${G - 68} Q${f(x + 30 + sway)} ${G - 66} ${x + 30} ${G - 42}Z`).join(' '));
      bushMarks.setAttribute('d', bushAt.map((x) => `M${f(x - 12 + sway)} ${G - 56} q3 -3 6 0 M${f(x + 6 + sway)} ${G - 62} q3 -3 6 0 M${f(x + 2 + sway * 0.6)} ${G - 50} q3 -3 6 0`).join(' '));

      const aL = swingL.step(-wv * 0.15, dt), aR = swingR.step(-wv * 0.15, dt);
      boardL.setAttribute('transform', `translate(0 186) rotate(${f(aL * 20)} 229 0)`);
      boardR.setAttribute('transform', `translate(0 210) rotate(${f(aR * 20)} 229 0)`);

      // story
      sT += dt; cyc += dt;
      if (s === 'approach') {
        if (p.x >= 412) p.goTarget = 0;
        if (p.go === 0 && p.x > 380) { s = 'reach'; sT = 0; }
      } else if (s === 'reach') {
        p.reach = p.toLocal(cx - 4, cy + 4);
        if (sT > 0.75) { s = 'escape'; sT = 0; esc0 = [cx, cy]; }
      } else if (s === 'escape') {
        if (sT > 0.35) p.reach = null;
        if (sT > 2.6) { s = 'puzzle'; sT = 0; }
      } else if (s === 'puzzle') {
        p.reach = sT < 1.7 ? [41 + Math.sin(sT * 16) * 1.6, 22] : null;
        if (sT > 2.2) { s = 'leave'; sT = 0; p.goTarget = 1; }
      } else if (s === 'leave') {
        if (p.x > W + 60 && cyc > 20) restart();
      }

      // the card: drift in, hover and bob, then a gust takes it up and away
      if (s === 'approach' || s === 'reach') {
        const k = Math.min(1, dt * 0.9);
        cx += (HOVER[0] - cx) * k; cy += (HOVER[1] + wobble(t * 1.1) * 7 - cy) * k;
        cx += wv * 0.4;
        ca = Math.sin(t * 1.6) * 18 + (HOVER[0] - cx) * 0.6 + wv * 8;
      } else if (s === 'escape' || s === 'puzzle' || s === 'leave') {
        const u = clamp((s === 'escape' ? sT : 3) / 3, 0, 1), e = minJerk(u);
        cx = lerp(esc0[0], W + 60, e); cy = lerp(esc0[1], 70, e) - Math.sin(Math.PI * u) * 40;
        ca += dt * 420 * (1 - u * 0.6);
      }
      cardV -= dt * 9; hop = Math.max(0, hop + cardV * dt); if (hop === 0) cardV = 0;
      cardG.setAttribute('transform', `translate(${f(cx)} ${f(cy - hop * 18)}) rotate(${f(ca)})`);
      // a gust drawn as two quick strokes behind the card
      const gu = s === 'escape' ? smooth(0, 0.3, sT) * (1 - smooth(0.8, 1.6, sT)) : 0;
      dust.setAttribute('d', gu > 0.01 ? `M${f(cx - 40)} ${f(cy + 8)} q16 -6 30 -2 M${f(cx - 52)} ${f(cy + 18)} q20 -6 36 -3` : '');
      dust.setAttribute('opacity', f(gu));

      p.update(t, dt, wv);
      // a question mark while puzzled
      const qa = s === 'puzzle' ? smooth(0.2, 0.5, sT) * (1 - smooth(1.8, 2.2, sT)) : 0;
      const hq = p.toScene(44, 4);
      question.setAttribute('d', `M${f(hq[0] - 3)} ${f(hq[1] - 8)} q0 -5 4 -5 q4 0 4 4 q0 3 -4 4 l0 3 M${f(hq[0] + 1)} ${f(hq[1] + 2.4)} l0 0.4`);
      question.setAttribute('opacity', f(qa));
    },
  });

  const halo = (x: number, y: number, r: number, th: number, k: number) => ({ n: el('circle', { cx: x, cy: y, r, fill: st.glowFill, opacity: 0 }, glow), th, k });
  const halos = [halo(581, 180, 64, 0.25, 0.55), halo(581, G + 6, 50, 0.3, 0.22), halo(698, 244, 34, 0.3, 0.45), halo(657, 178, 40, 0.3, 0.3)];
  return remove;
}
