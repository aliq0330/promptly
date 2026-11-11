// Scene 1 — "Meydan": a town square where people pin prompts to a board.
// For the sign-in panel or the guest home page.
import { el, pen, shape, blot, f, pt, PAPER, type Vec } from '@/lib/line-art/ink';
import { pendulum, pointerWind, seeded, smooth, wobble, clamp } from '@/lib/line-art/motion';
import { Person, promptCard, heartPop, tint, type Look } from './figure';
import { stage, windowPane, Pigeon, lerp } from './scene-common';
import { addScene } from './loop';
import type { SceneLabels } from './scene-common';

const W = 800, H = 400, BASE = 300;

export function meydan(host: Element, labels: SceneLabels): () => void {
  const st = stage(host, W, H, labels.label, 'my');
  const { svg, scene, glow } = st;
  const rnd = seeded(7);
  const wind = pointerWind(svg, 0.25);

  // ---------- sky
  const sky = el('g', {}, scene);
  const sun = el('circle', { r: 19, fill: PAPER, stroke: 'currentColor', 'stroke-width': 1.1 }, sky);
  const sunHalo = tint(el('circle', { r: 30, opacity: 0.1 }, sky), 'var(--la-heart)');
  sky.insertBefore(sunHalo, sun);
  const moon = shape(sky, 1.1);
  const stars = Array.from({ length: 16 }, () => {
    const s = pen(sky, 0.7); const x = rnd(20, 780), y = rnd(14, 150), r = rnd(1.2, 2.4);
    s.setAttribute('d', `M${f(x - r)} ${f(y)} L${f(x + r)} ${f(y)} M${f(x)} ${f(y - r)} L${f(x)} ${f(y + r)}`);
    return { s, ph: rnd(0, 6) };
  });
  const clouds = [0, 1, 2].map((i) => {
    const c = pen(sky, 0.9); const y = 46 + i * 26;
    return { c, x: 120 + i * 250, y, w: 70 + i * 16 };
  });

  // ---------- far skyline, diluted ink
  const far = el('g', { opacity: 0.32 }, scene);
  pen(far, 0.9).setAttribute('d', 'M0 238 Q60 226 120 234 T250 228 Q300 222 330 230 L330 214 L346 214 L346 206 Q352 186 368 186 Q384 186 390 206 L390 214 L406 214 L406 230 Q470 224 520 232 T680 224 Q740 218 800 228');
  pen(far, 0.7).setAttribute('d', 'M520 232 L520 208 L540 208 L540 232 M560 230 L560 214 L590 214 L590 230 M200 230 L200 212 L226 212 L226 230');

  // ---------- buildings
  const bld = el('g', {}, scene);
  const wins: Array<ReturnType<typeof windowPane>> = [];
  // clock tower
  shape(bld, 1.2).setAttribute('d', `M36 ${BASE} L40 118 L90 118 L94 ${BASE}Z`);
  shape(bld, 1.2).setAttribute('d', 'M32 120 L98 120 L96 112 L34 112Z');
  shape(bld, 1.2).setAttribute('d', 'M40 112 Q42 92 65 70 Q88 92 90 112Z');
  pen(bld, 0.8).setAttribute('d', 'M65 70 L65 60');
  el('circle', { cx: 65, cy: 57.6, r: 2.4, fill: PAPER, stroke: 'currentColor', 'stroke-width': 0.8 }, bld);
  const clockFace = el('circle', { cx: 65, cy: 146, r: 15, fill: PAPER, stroke: 'currentColor', 'stroke-width': 1.1 }, bld);
  const clockLit = tint(el('circle', { cx: 65, cy: 146, r: 14, opacity: 0 }, bld), 'var(--la-glow)');
  void clockFace;
  pen(bld, 0.7).setAttribute('d', Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `M${f(65 + Math.sin(a) * 11.5)} ${f(146 - Math.cos(a) * 11.5)} L${f(65 + Math.sin(a) * 13.4)} ${f(146 - Math.cos(a) * 13.4)}`; }).join(' '));
  const hourHand = pen(bld, 1.4), minHand = pen(bld, 0.9);
  wins.push(windowPane(bld, 56, 186, 18, 30, { threshold: 0.35, arch: true, bars: 'v' }));
  wins.push(windowPane(bld, 56, 236, 18, 30, { threshold: 0.6, arch: true, bars: 'v' }));
  pen(bld, 0.9).setAttribute('d', `M54 ${BASE} L54 278 Q65 268 76 278 L76 ${BASE}`);

  // building A: café
  shape(bld, 1.2).setAttribute('d', `M106 ${BASE} L106 170 L296 170 L296 ${BASE}Z`);
  shape(bld, 1.2).setAttribute('d', 'M100 172 L302 172 L300 162 L102 162Z');
  pen(bld, 0.8).setAttribute('d', 'M106 230 L296 230');
  [124, 166, 208, 250].forEach((x, i) => wins.push(windowPane(bld, x, 184, 24, 32, { threshold: [0.2, 1.2, 0.46, 0.6][i] })));
  wins.push(windowPane(bld, 118, 252, 92, 44, { threshold: 0.12, bars: 'v' }));
  pen(bld, 1).setAttribute('d', `M226 ${BASE} L226 246 L254 246 L254 ${BASE} M248 274 L248 276`);
  // awning: scallops in Promptly blue and paper
  const awning = el('g', {}, bld);
  for (let i = 0; i < 7; i++) {
    const x = 112 + i * 14;
    const s = paintPath(awning, `M${x} 236 L${x + 14} 236 L${x + 14} 248 Q${x + 7} 254 ${x} 248Z`, i % 2 ? 'var(--la-paper)' : 'var(--la-primary)');
    if (i % 2) s.classList.add('pp');
  }
  pen(awning, 1).setAttribute('d', 'M110 236 L212 236');
  // café table and chairs
  pen(bld, 1).setAttribute('d', `M150 316 L150 300 M136 299 L164 299 M126 316 L128 296 L128 290 M128 304 L138 304 L138 316 M174 316 L172 296 L172 290 M172 304 L162 304 L162 316`);
  const cup = pen(bld, 0.8); cup.setAttribute('d', 'M146 299 L146 295 L152 295 L152 299 M152 296 Q155 296.5 152 298');
  const steam = pen(bld, 0.6);

  // a plane tree between the café and the square
  const tree = el('g', {}, scene);
  pen(tree, 1.2).setAttribute('d', `M318 ${BASE + 6} Q314 260 320 226 M320 252 Q330 244 336 236 M318 240 Q306 234 302 226`);
  const crown = el('g', {}, tree);
  shape(crown, 1.1).setAttribute('d', 'M300 236 Q282 230 290 214 Q284 196 302 192 Q306 176 324 180 Q338 170 350 184 Q366 186 362 202 Q372 214 358 226 Q352 238 336 234 Q326 242 316 236 Q306 242 300 236Z');
  pen(crown, 0.6).setAttribute('d', 'M306 206 q4 -3 8 0 M330 196 q4 -3 8 0 M322 218 q4 -3 8 0 M344 210 q4 -3 8 0 M312 226 q4 -3 8 0');

  // building B: tall
  shape(bld, 1.2).setAttribute('d', `M476 ${BASE} L476 138 L640 138 L640 ${BASE}Z`);
  shape(bld, 1.2).setAttribute('d', 'M470 140 L646 140 L644 130 L472 130Z');
  pen(bld, 0.8).setAttribute('d', 'M476 196 L640 196 M476 250 L640 250');
  [490, 532, 574, 616].forEach((x, i) => {
    wins.push(windowPane(bld, x - 6, 150, 20, 34, { threshold: [0.42, 1.2, 0.58, 0.5][i], arch: true }));
    wins.push(windowPane(bld, x - 6, 206, 20, 34, { threshold: 0.18 + ((i * 3) % 4) * 0.1, arch: true }));
  });
  wins.push(windowPane(bld, 488, 262, 70, 36, { threshold: 0.08, bars: 'v' }));
  pen(bld, 1).setAttribute('d', `M584 ${BASE} L584 260 Q598 252 612 260 L612 ${BASE}`);

  // building C: balcony and plants
  shape(bld, 1.2).setAttribute('d', `M640 ${BASE} L640 176 L800 176 L800 ${BASE}Z`);
  shape(bld, 1.2).setAttribute('d', 'M636 178 L800 178 L800 168 L638 168Z');
  [656, 700, 744].forEach((x, i) => wins.push(windowPane(bld, x, 190, 22, 36, { threshold: [0.3, 0.64, 1.2][i] })));
  pen(bld, 0.9).setAttribute('d', 'M650 230 L790 230 M650 244 L790 244 ' + Array.from({ length: 15 }, (_, i) => `M${654 + i * 9.4} 230 L${654 + i * 9.4} 244`).join(' '));
  const plants = pen(bld, 0.8);
  [660, 708, 760].forEach((x, i) => wins.push(windowPane(bld, x, 256, 20, 40, { threshold: [1.2, 0.55, 0.7][i], bars: 'v' })));

  // ---------- the square
  const ground = el('g', {}, scene);
  shape(ground, 1).setAttribute('d', `M-2 ${BASE} L802 ${BASE} L802 402 L-2 402Z`);
  pen(ground, 0.45).setAttribute('d', [318, 340, 366, 396].map((y) => `M0 ${y} L800 ${y}`).join(' '));
  const tiles = pen(ground, 0.4); tiles.setAttribute('opacity', '0.55');
  tiles.setAttribute('d', Array.from({ length: 34 }, (_, i) => { const x = i * 26 - 10; return `M${x} 300 L${f(x - 6)} 318 M${f(x + 9)} 318 L${f(x + 1)} 340 M${f(x + 3)} 340 L${f(x - 7)} 366 M${f(x + 12)} 366 L${f(x)} 396`; }).join(' '));

  // street lamp
  const lampX = 712;
  shape(ground, 1.1).setAttribute('d', `M${lampX - 3} 334 L${lampX - 1.4} 214 L${lampX + 1.4} 214 L${lampX + 3} 334Z`);
  pen(ground, 1).setAttribute('d', `M${lampX - 7} 334 L${lampX + 7} 334`);
  shape(ground, 1.1).setAttribute('d', `M${lampX - 9} 212 L${lampX + 9} 212 L${lampX + 6} 194 L${lampX - 6} 194Z`);
  const lampPane = tint(el('path', { d: `M${lampX - 7} 210 L${lampX + 7} 210 L${lampX + 5} 196 L${lampX - 5} 196Z`, opacity: 0 }, ground), 'var(--la-glow)');
  shape(ground, 1.1).setAttribute('d', `M${lampX - 10} 195 L${lampX + 10} 195 L${lampX} 184Z`);

  // the board ("pano") with prompt cards hanging from pins
  const board = el('g', {}, scene);
  const bx0 = 350, bx1 = 470, by0 = 216, by1 = 292;
  shape(board, 1.2).setAttribute('d', `M${bx0 + 6} ${by1} L${bx0 + 7} 322 L${bx0 + 12} 322 L${bx0 + 12} ${by1}Z M${bx1 - 12} ${by1} L${bx1 - 12} 322 L${bx1 - 7} 322 L${bx1 - 6} ${by1}Z`);
  shape(board, 1.3).setAttribute('d', `M${bx0} ${by0} L${bx1} ${by0} L${bx1} ${by1} L${bx0} ${by1}Z`);
  pen(board, 0.6).setAttribute('d', `M${bx0 + 4} ${by0 + 4} L${bx1 - 4} ${by0 + 4} L${bx1 - 4} ${by1 - 4} L${bx0 + 4} ${by1 - 4}Z`);
  shape(board, 1.2).setAttribute('d', `M${bx0 - 8} ${by0 + 1} L${(bx0 + bx1) / 2} ${by0 - 16} L${bx1 + 8} ${by0 + 1}Z`);
  const brace = el('g', { transform: `translate(${(bx0 + bx1) / 2} ${by0 - 5}) scale(0.16) translate(-32 -32)` }, board);
  const bp = el('path', { fill: 'none', 'stroke-width': 6, 'stroke-linecap': 'round', d: 'M25 13c-6 0-7.5 3-7.5 8v5.5c0 3.5-2 5.5-5.5 5.5 3.5 0 5.5 2 5.5 5.5V43c0 5 1.5 8 7.5 8M39 13c6 0 7.5 3 7.5 8v5.5c0 3.5 2 5.5 5.5 5.5-3.5 0-5.5 2-5.5 5.5V43c0 5-1.5 8-7.5 8' }, brace);
  bp.style.stroke = 'var(--la-primary)';
  tint(el('path', { d: 'M32 41.5c-1-.8-9-6.4-9-12.2a4.6 4.6 0 0 1 9-1.5a4.6 4.6 0 0 1 9 1.5c0 5.8-8 11.4-9 12.2z' }, brace), 'var(--la-heart)');
  const slots: Vec[] = [[374, 228], [410, 228], [446, 228], [374, 260], [410, 260], [446, 260]];
  const cards = slots.map((s, i) => {
    const g = el('g', {}, board);
    const card = promptCard(g, { w: 15, h: 19, brace: i === 4, lines: 4, accent: i === 2 || i === 3 ? 'var(--la-heart)' : undefined });
    card.setAttribute('transform', 'translate(0 10)');
    const pin = tint(el('circle', { r: 1.9, cy: 1.4, stroke: 'currentColor', 'stroke-width': 0.6 }, g), i % 2 ? 'var(--la-heart)' : 'var(--la-primary)');
    void pin;
    return { g, s, sw: pendulum(16, 1.6, (rnd() - 0.5) * 0.1), shown: i !== 0 ? 1 : 0 };
  });
  const newDot = tint(el('circle', { r: 2.4, cx: slots[0][0] + 6.5, cy: slots[0][1] + 2.6, opacity: 0, stroke: 'currentColor', 'stroke-width': 0.6 }, board), 'var(--la-heart)');

  // bunting from the clock tower to the lamp
  const bunting = el('g', {}, scene);
  const rope = pen(bunting, 0.8);
  const flagCols = ['var(--la-primary)', 'var(--la-heart)', 'var(--la-paper)'];
  const ropeAt = (u: number): Vec => [lerp(96, lampX - 8, u), lerp(150, 200, u) + 44 * 4 * u * (1 - u)];
  const flags = Array.from({ length: 19 }, (_, i) => {
    const node = paintPath(bunting, '', flagCols[i % 3]);
    if (i % 3 === 2) node.classList.add('pp');
    return { node, u: (i + 0.5) / 19, sw: pendulum(9 + (i % 4), 1.2) };
  });

  // ---------- people and pigeons
  const people = el('g', {}, scene);
  const pigeonsG = el('g', {}, scene);
  const fx = el('g', { 'pointer-events': 'none' }, scene);
  const heart = heartPop(fx);

  const looks: Look[] = [
    { coat: 'var(--la-cloth-1)', legs: 'var(--la-legs)', hair: 'hat', scarf: 'var(--la-heart)' },
    { coat: 'var(--la-cloth-2)', hem: 102, hair: 'long' },
    { coat: 'paper', legs: 'var(--la-cloth-3)', hair: 'cap', cap: 'var(--la-primary)' },
    { coat: 'var(--la-cloth-3)', legs: 'var(--la-legs)', hair: 'short' },
  ];
  type Walker = { p: Person; wait: number; waving: number; on: boolean };
  const walkers: Walker[] = looks.map((lk, i) => {
    const p = new Person(people, lk);
    const wk: Walker = { p, wait: 0, waving: -1, on: false };
    p.g.addEventListener('pointerdown', () => { if (wk.waving < 0) wk.waving = 0; });
    p.g.style.cursor = 'pointer';
    // two already in the square at load, so the first frame is never empty
    if (i < 2) launch(wk, i === 0 ? 210 : 600, i === 0 ? 1 : -1);
    else wk.wait = 2 + i * 3;
    return wk;
  });
  function launch(wk: Walker, x?: number, dir?: 1 | -1) {
    const p = wk.p;
    p.dir = dir ?? (rnd() < 0.5 ? 1 : -1);
    p.y = 344 + rnd(0, 22);
    p.scale = 0.9 + (p.y - 344) / 22 * 0.12;
    p.x = x ?? (p.dir === 1 ? -40 : W + 40);
    p.phase = rnd(0, 1); p.go = p.goTarget = 1;
    wk.on = true;
  }

  // the one who pins a new prompt to the board
  const pinner = new Person(people, { coat: 'var(--la-primary)', legs: 'var(--la-legs)', hair: 'bun' });
  pinner.y = 334; pinner.scale = 0.96; pinner.dir = 1;
  const carried = promptCard(pinner.prop, { w: 15 / 0.96, h: 19 / 0.96, lines: 4 });
  carried.setAttribute('transform', `translate(0 ${f(10 / 0.96)})`);
  // starts mid-walk, so a card gets pinned a few seconds after the page opens
  let pinT = 2;
  const pin = { state: 'in' as 'in' | 'reach' | 'after' | 'out', held: 0 };
  pinner.x = 190; pinner.reach = [53, 62];
  const STOP_X = 346;

  const pigeons = [[560, 374], [588, 379], [616, 375], [644, 380]].map((h, i) => new Pigeon(pigeonsG, h as Vec, [500 + i * 30, 137] as Vec, i, () => pigeons.forEach((pg) => pg.scare())));

  // hint, in the scene's own ink
  const hint = el('text', { x: 14, y: 390, 'font-size': 9.5, fill: 'currentColor', opacity: 0.55, class: 'hint' }, svg);
  hint.textContent = labels.hint ?? '';

  const remove = addScene({
    host,
    draw(t, dt, night) {
      const wv = wind.step(t);
      // sky: the sun sets behind the roofs as the moon rises
      const sx = 560 + night * 40, sy = 78 + smooth(0, 0.7, night) * 150;
      sun.setAttribute('cx', f(sx)); sun.setAttribute('cy', f(sy)); sunHalo.setAttribute('cx', f(sx)); sunHalo.setAttribute('cy', f(sy));
      sun.setAttribute('opacity', f(1 - smooth(0.5, 0.8, night)));
      const mx = 220, my = 220 - smooth(0.3, 1, night) * 150;
      moon.setAttribute('d', `M${mx} ${f(my - 14)} A14 14 0 1 0 ${mx} ${f(my + 14)} A10 14 0 1 1 ${mx} ${f(my - 14)}Z`);
      moon.setAttribute('opacity', f(smooth(0.3, 0.8, night)));
      stars.forEach(({ s, ph }) => s.setAttribute('opacity', f(smooth(0.55, 1, night) * (0.55 + 0.45 * Math.sin(t * 1.7 + ph)))));
      clouds.forEach((c) => {
        const x = ((c.x + t * 4 + wv * 3) % (W + 200)) - 100;
        c.c.setAttribute('d', `M${f(x)} ${c.y} L${f(x + c.w)} ${c.y} Q${f(x + c.w + 9)} ${c.y} ${f(x + c.w + 9)} ${c.y - 6} Q${f(x + c.w + 9)} ${c.y - 12} ${f(x + c.w + 2)} ${c.y - 11} M${f(x + 16)} ${c.y + 7} L${f(x + c.w * 0.6)} ${c.y + 7}`);
        c.c.setAttribute('opacity', f(1 - night * 0.6));
      });

      // clock: the hands run forward into the evening when the page goes dark
      const hours = lerp(14.2, 21.4, night) + t / 3600;
      const ha = (hours / 12) * Math.PI * 2, ma = (hours % 1) * Math.PI * 2;
      hourHand.setAttribute('d', `M65 146 L${f(65 + Math.sin(ha) * 7)} ${f(146 - Math.cos(ha) * 7)}`);
      minHand.setAttribute('d', `M65 146 L${f(65 + Math.sin(ma) * 11)} ${f(146 - Math.cos(ma) * 11)}`);
      clockLit.setAttribute('opacity', f(smooth(0.4, 0.9, night) * 0.5));
      wins.forEach((w) => w.step(night, t));
      lampPane.setAttribute('opacity', f(smooth(0.25, 0.6, night)));

      // the café cup steams by day
      const sp = (t * 0.6) % 1;
      steam.setAttribute('d', `M149 ${f(292 - sp * 4)} q${f(2 + wv)} -4 0 -8 q${f(-2 + wv)} -4 0 -8`);
      steam.setAttribute('opacity', f((1 - night) * (0.7 - sp * 0.4)));

      // tree canopy and balcony plants sway with the wind
      const sway = wv * 1.6 + wobble(t * 0.6) * 0.8;
      crown.setAttribute('transform', `rotate(${f(sway * 1.1)} 320 236)`);
      plants.setAttribute('d', [664, 690, 716, 742, 768].map((x) => `M${x} 230 q${f(-3 + sway * 0.6)} -6 ${f(-2 + sway)} -11 M${x + 2} 230 q${f(3 + sway * 0.6)} -5 ${f(5 + sway)} -9`).join(' ') + ' ' + [664, 690, 716, 742, 768].map((x) => `M${x - 3} 230 L${x + 5} 230 L${x + 4} 224 L${x - 2} 224Z`).join(' '));

      // bunting
      let rd = '';
      for (let i = 0; i <= 30; i++) { const p = ropeAt(i / 30); rd += (i ? 'L' : 'M') + pt(p); }
      rope.setAttribute('d', rd);
      flags.forEach((fl, i) => {
        const a = fl.sw.step(-wv * 1.4 + Math.sin(t * 2.3 + i) * 0.3, dt);
        const p = ropeAt(fl.u), q = ropeAt(fl.u + 0.018);
        const tip: Vec = [(p[0] + q[0]) / 2 + Math.sin(a) * 11, (p[1] + q[1]) / 2 + Math.cos(a) * 11];
        fl.node.setAttribute('d', `M${pt(p)} L${pt(q)} L${pt(tip)}Z`);
      });

      // board cards swing a little from their pins
      cards.forEach((c, i) => {
        const a = c.sw.step(-wv * 0.35 + Math.sin(t * 1.9 + i * 1.3) * 0.08, dt);
        c.g.setAttribute('transform', `translate(${c.s[0]} ${c.s[1]}) rotate(${f(a * 57.3)})`);
        c.g.setAttribute('opacity', f(c.shown));
      });

      // walkers
      walkers.forEach((wk) => {
        const p = wk.p;
        if (!wk.on) { wk.wait -= dt; if (wk.wait <= 0) launch(wk); else { p.g.setAttribute('opacity', '0'); return; } }
        p.g.setAttribute('opacity', '1');
        if (wk.waving >= 0) {
          wk.waving += dt;
          p.goTarget = 0.0;
          const u = wk.waving;
          p.reach = u < 1.9 ? [53 + Math.sin(u * 13) * 3.2, 14] : null;
          if (u > 2.3) { wk.waving = -1; p.goTarget = 1; }
        }
        p.update(t, dt, wv);
        if ((p.dir === 1 && p.x > W + 50) || (p.dir === -1 && p.x < -50)) { wk.on = false; wk.wait = 1 + rnd(0, 5); }
        // pigeons scatter when someone walks through them
        pigeons.forEach((pg) => { if (Math.abs(pg.x - p.x) < 26 && Math.abs(pg.y - p.y) < 34 && p.go > 0.5) pg.scare(); });
      });

      // the pinning routine: walk in, pin a card, a heart, walk on (36 s cycle)
      pinT += dt;
      if (pinT > 36) {
        pinT -= 36;
        pin.state = 'in'; pinner.x = -40; pinner.go = pinner.goTarget = 1; pinner.reach = [53, 62]; carried.setAttribute('opacity', '1');
      }
      if (pinT < 1.2) { cards[0].shown = Math.max(0, cards[0].shown - dt); newDot.setAttribute('opacity', f(cards[0].shown)); }
      if (pin.state === 'in') {
        if (pinner.x >= STOP_X - 11) pinner.goTarget = 0;
        if (pinner.go === 0) { pin.state = 'reach'; pin.held = 0; pinner.reach = pinner.toLocal(slots[0][0], slots[0][1] + 1.4); }
      } else if (pin.state === 'reach') {
        if (pinner.reachAmt >= 1 && (pin.held += dt) > 0.45) {
          carried.setAttribute('opacity', '0');
          cards[0].shown = 1; cards[0].sw.kick(1.6);
          newDot.setAttribute('opacity', '1');
          heart.fire(slots[0][0], slots[0][1] - 10);
          pinner.reach = null; pin.state = 'after'; pin.held = 1.1;
        }
      } else if (pin.state === 'after') {
        if ((pin.held -= dt) <= 0) { pinner.goTarget = 1; pin.state = 'out'; }
      }
      if (pinner.x < W + 60) pinner.update(t, dt, wv);
      heart.step(dt);

      // sort people by depth
      const ord = [pinner, ...walkers.map((w) => w.p)].sort((a, b) => a.y - b.y);
      ord.forEach((p, i) => { if (people.children[i] !== p.g) people.appendChild(p.g); });
      pigeons.forEach((pg) => pg.step(t, dt));

      // night light: lamp pool and window glow halos
      glowNodes.forEach((g) => g.node.setAttribute('opacity', f(smooth(g.th, g.th + 0.3, night) * g.k)));
      void clamp;
    },
  });

  // glow halos live on top, outside the ink filter
  const halo = (x: number, y: number, r: number, th: number, k: number) => ({ node: el('circle', { cx: x, cy: y, r, fill: st.glowFill, opacity: 0 }, glow), th, k });
  const glowNodes = [halo(lampX, 204, 70, 0.3, 0.55), halo(lampX, 330, 46, 0.35, 0.25), halo(164, 274, 70, 0.2, 0.35), halo(523, 280, 56, 0.2, 0.3), halo(65, 146, 26, 0.5, 0.3)];
  void blot;
  return remove;
}

function paintPath(parent: Element, d: string, colour: string): SVGPathElement {
  const n = el('path', { d, stroke: 'currentColor', 'stroke-width': 0.9, 'stroke-linejoin': 'round' }, parent);
  n.style.fill = colour;
  return n;
}
