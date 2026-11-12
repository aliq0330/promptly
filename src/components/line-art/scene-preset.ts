// "Ayar paketi": someone walks along a mixing panel and sets five sliders by hand, presses the button, and a gift-wrapped package pops up.
import { Person, heartPop } from './figure';
import { act, bush, defineScene, el, f, lamp, lerp, pen, script, shape, smooth, sparkle, tint, tree, until, wait, walkTo, clamp, type Vec } from './kit';
import type { SceneLabels } from './scene-common';

export function preset(host: Element, labels: SceneLabels): () => void {
  const G = 270, PX0 = 292, PX1 = 492, TOP = 112, XS = [322, 352, 382, 412, 442], GOAL = [0.72, 0.3, 0.86, 0.46, 0.62];
  const ky = (v: number) => lerp(204, 140, v);
  return defineScene(host, labels, { id: 'pr', w: 640, h: 320, G, seed: 101, sun: [160, 70], moon: [160, 70], set: 150, stars: 12, clouds: [46, 98], ground: 'paving' }, (c) => {
    tree(c, 60, 1);
    lamp(c, 236, 150, 0.3);
    bush(c, 600, 0.8);
    // the panel on legs
    pen(c.mid, 1.5).setAttribute('d', `M${PX0 + 14} ${TOP + 112} L${PX0 + 8} ${G} M${PX1 - 14} ${TOP + 112} L${PX1 - 8} ${G}`);
    shape(c.mid, 1.3).setAttribute('d', `M${PX0} ${TOP} L${PX1} ${TOP} L${PX1} ${TOP + 112} L${PX0} ${TOP + 112}Z`);
    pen(c.mid, 0.6).setAttribute('d', `M${PX0 + 8} ${TOP + 8} L${PX1 - 8} ${TOP + 8} L${PX1 - 8} ${TOP + 104} L${PX0 + 8} ${TOP + 104}Z`);
    const knobs = XS.map((x, i) => {
      pen(c.mid, 1.3).setAttribute('d', `M${x} 138 L${x} 206`);
      pen(c.mid, 0.5).setAttribute('d', Array.from({ length: 5 }, (_, k) => `M${x - 4} ${138 + k * 17} l8 0`).join(' '));
      const led = el('circle', { cx: x, cy: 126, r: 3, stroke: 'currentColor', 'stroke-width': 0.9 }, c.mid); led.style.fill = 'var(--la-paper)';
      const g = el('g', {}, c.mid);
      shape(g, 1.1).setAttribute('d', 'M-8 -4.5 L8 -4.5 L8 4.5 L-8 4.5Z');
      pen(g, 0.6).setAttribute('d', 'M-5 0 L5 0');
      return { g, led, v: 0.5, x, i };
    });
    const btn = tint(el('circle', { cx: 476, cy: 208, r: 7, stroke: 'currentColor', 'stroke-width': 1.1 }, c.mid), 'var(--la-heart)');
    // the package: a gift box with a slider mark, popping up above the panel
    const pack = el('g', { opacity: 0 }, c.fx);
    shape(pack, 1.1).setAttribute('d', 'M-14 -12 L14 -12 L14 12 L-14 12Z');
    tint(el('path', { d: 'M-3 -12 L3 -12 L3 12 L-3 12Z', stroke: 'currentColor', 'stroke-width': 0.7 }, pack), 'var(--la-heart)');
    pen(pack, 1).setAttribute('d', 'M0 -12 q-9 -9 -12 -2 M0 -12 q9 -9 12 -2');
    const spark = sparkle(c.fx), heart = heartPop(c.fx);
    const p = new Person(c.people, { coat: 'var(--la-primary)', legs: 'var(--la-legs)', hair: 'bun' });
    p.scale = 1.3; p.y = G + 8; p.x = 250; p.go = p.goTarget = 0;
    let drag = -1, packK = 0, packGoal = 0, packT = 0;
    const kpos = (i: number): Vec => [XS[i], ky(knobs[i].v)];
    const setKnob = (i: number) => {
      const lit = Math.abs(knobs[i].v - GOAL[i]) < 0.02;
      return [
        act(() => { drag = i; p.dir = 1; p.reach = p.toLocal(kpos(i)[0] - 3, kpos(i)[1]); }),
        until(() => p.reachAmt > 0.85),
        until(() => { knobs[i].v += (GOAL[i] - knobs[i].v) * 0.09; return Math.abs(knobs[i].v - GOAL[i]) < 0.015; }),
        act(() => { drag = -1; knobs[i].v = GOAL[i]; p.reach = [50, 60]; spark.fire(XS[i], 126); }),
        wait(0.35),
      ].concat(lit ? [] : []);
    };
    const steps = [
      act(() => { knobs.forEach((k) => (k.v = 0.5)); packGoal = 0; p.x = 250; p.dir = 1; p.reach = null; }),
      wait(0.5),
      ...[0, 2, 4].flatMap((i, n) => [walkTo(p, XS[i] - 28 - (n === 0 ? 0 : 0)), ...setKnob(i), ...(i === 0 ? setKnob(1) : i === 2 ? setKnob(3) : [])]),
      walkTo(p, 446),
      act(() => { p.reach = p.toLocal(468, 204); }),
      until(() => p.reachAmt > 0.85),
      act(() => { packGoal = 1; packT = 0; heart.fire(520, TOP - 14); btn.style.fill = 'var(--la-glow)'; p.reach = [51, 22]; }),
      wait(3),
      act(() => { packGoal = 0; p.reach = null; btn.style.fill = 'var(--la-heart)'; }),
      walkTo(p, 250),
      wait(0.6),
    ];
    const run = script(...steps);
    return (t, dt, _n, wv) => {
      if (dt === 0) { knobs.forEach((k, i) => (k.v = GOAL[i])); packGoal = 1; packK = 1; p.x = 450; p.go = 0; p.reach = [50, 60]; p.reachAmt = 1; } else run(dt);
      if (drag >= 0) p.reach = p.toLocal(kpos(drag)[0] - 3, kpos(drag)[1]);
      p.update(t, dt, wv);
      knobs.forEach((k) => {
        k.g.setAttribute('transform', `translate(${k.x} ${f(ky(k.v))})`);
        k.led.style.fill = Math.abs(k.v - GOAL[k.i]) < 0.02 ? 'var(--la-glow)' : 'var(--la-paper)';
      });
      packK += (packGoal - packK) * Math.min(1, dt * 5); packT += dt;
      pack.setAttribute('opacity', f(clamp(packK * 1.5, 0, 1)));
      pack.setAttribute('transform', `translate(520 ${f(TOP - 34 - Math.abs(Math.sin(packT * 3.2)) * 8 * (packGoal ? 1 : 0))}) scale(${f(0.5 + packK * 0.5)})`);
      spark.step(dt); heart.step(dt);
      void smooth;
    };
  });
}
