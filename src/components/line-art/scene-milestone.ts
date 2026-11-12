// "Kilometre taşı": a scoreboard counts up to the real number, the winner hops with both arms up, spectators clap, confetti.
import { Person, heartPop } from './figure';
import { Cat, confetti, defineScene, el, f, pen, pt, shape, tint, clamp, lerp, type Vec } from './kit';
import { pendulum } from '@/lib/line-art/motion';
import { minJerk } from '@/lib/line-art/motion';
import type { SceneLabels } from './scene-common';

export function milestone(host: Element, labels: SceneLabels): () => void {
  const G = 266, POD = 30;
  return defineScene(host, labels, { id: 'mi', w: 640, h: 320, G, seed: 3, sun: [96, 104], moon: [96, 104], set: 150, stars: 14, clouds: [62, 150], ground: 'paving' }, (c) => {
    const target = Math.max(1, parseInt((labels.value ?? '100').replace(/\D/g, ''), 10) || 100);
    // bunting between two posts
    const rope = pen(c.back, 0.8);
    const ropeAt = (u: number): Vec => [lerp(30, 610, u), 34 + 30 * 4 * u * (1 - u)];
    const cols = ['var(--la-primary)', 'var(--la-heart)', 'var(--la-paper)'];
    let rd = ''; for (let i = 0; i <= 30; i++) rd += (i ? 'L' : 'M') + pt(ropeAt(i / 30));
    rope.setAttribute('d', rd);
    const flags = Array.from({ length: 21 }, (_, i) => {
      const n = tint(el('path', { stroke: 'currentColor', 'stroke-width': 0.9, 'stroke-linejoin': 'round' }, c.back), cols[i % 3]);
      return { n, u: (i + 0.5) / 21, sw: pendulum(9 + (i % 4), 1.2) };
    });
    // scoreboard
    pen(c.back, 1.1).setAttribute('d', `M505 152 L505 ${G} M555 152 L555 ${G}`);
    shape(c.back, 1.3).setAttribute('d', 'M466 62 L594 62 L594 152 L466 152Z');
    pen(c.back, 0.6).setAttribute('d', 'M472 68 L588 68 L588 146 L472 146Z');
    tint(el('circle', { cx: 484, cy: 80, r: 3, stroke: 'currentColor', 'stroke-width': 0.6 }, c.back), 'var(--la-heart)');
    // two stacked cards = "copied"
    shape(c.back, 0.8).setAttribute('d', 'M520 80 L532 80 L532 98 L520 98Z'); shape(c.back, 0.8).setAttribute('d', 'M526 84 L538 84 L538 102 L526 102Z');
    pen(c.back, 0.5).setAttribute('d', 'M529 90 L535 90 M529 94 L534 94');
    const num = el('text', { x: 530, y: 134, 'text-anchor': 'middle', 'font-size': target >= 1000 ? 30 : 40, 'font-weight': 700, fill: 'currentColor', class: 'plate' }, c.back);
    // podium with a prompt card on its front
    shape(c.mid, 1.2).setAttribute('d', `M296 ${G} L296 ${G - POD} L384 ${G - POD} L384 ${G}Z`);
    pen(c.mid, 0.7).setAttribute('d', `M296 ${G - POD + 6} L384 ${G - POD + 6}`);
    tint(el('path', { d: `M340 ${G - 8} c-1 -.8 -9 -6.4 -9 -12.2 a4.6 4.6 0 0 1 9 -1.5 a4.6 4.6 0 0 1 9 1.5 c0 5.8 -8 11.4 -9 12.2z`, stroke: 'currentColor', 'stroke-width': 0.8 }, c.mid), 'var(--la-heart)');

    const p = new Person(c.people, { coat: 'var(--la-cloth-1)', legs: 'var(--la-legs)', hair: 'hat', scarf: 'var(--la-heart)' });
    p.scale = 1.25; p.x = 340; p.y = G - POD; p.go = p.goTarget = 0;
    const fans = [
      new Person(c.people, { coat: 'var(--la-cloth-2)', hem: 102, hair: 'long' }),
      new Person(c.people, { coat: 'var(--la-primary)', legs: 'var(--la-legs)', hair: 'bun' }),
      new Person(c.people, { coat: 'var(--la-cloth-3)', legs: 'var(--la-legs)', hair: 'cap', cap: 'var(--la-heart)' }),
    ];
    [[218, 1, 1.1], [262, 1, 1.18], [432, -1, 1.12]].forEach(([x, d, s], i) => { const q = fans[i]; q.x = x; q.dir = d as 1 | -1; q.scale = s; q.y = G + 8 + i * 4; q.go = q.goTarget = 0; });
    const cat = new Cat(c.mid, 150, G + 2, 1, 1.4);
    const hearts = [heartPop(c.fx), heartPop(c.fx), heartPop(c.fx)];
    const conf = confetti(c.fx, c.rnd);
    const hint = el('text', { x: 14, y: 312, 'font-size': 9.5, fill: 'currentColor', opacity: 0.55, class: 'hint' }, c.svg);
    hint.textContent = labels.hint ?? '';
    let cyc = 0, fired = false, hf = [false, false, false], last = '';
    const restart = () => { cyc = 0; fired = false; hf = [false, false, false]; };
    p.g.style.cursor = 'pointer';
    p.g.addEventListener('pointerdown', () => { if (cyc > 6) restart(); });

    return (t, dt, night, wv) => {
      if (dt === 0) cyc = 5.6; else { cyc += dt; if (cyc > 10) restart(); }
      const u = cyc;
      const n = Math.round(target * minJerk(clamp(u / 1.8, 0, 1)));
      const txt = n.toLocaleString('tr-TR');
      if (txt !== last) { num.textContent = txt; last = txt; }
      if (u >= 1.8 && !fired) { fired = true; conf.burst(340, G - 140); }
      [1.8, 2.15, 2.5].forEach((at, i) => { if (u >= at && !hf[i]) { hf[i] = true; hearts[i].fire(340 + (i - 1) * 30, G - POD - 120); } });
      const hop = u - 1.8;
      p.y = G - POD - (hop > 0 && hop < 1 ? 15 * Math.abs(Math.sin((Math.PI * hop) / 0.5)) : 0);
      const up = u > 1.8 && u < 5.2;
      p.reach = up ? [56 + Math.sin(u * 13) * 2.5, 16] : null;
      p.farReach = up ? [26 + Math.sin(u * 13 + 1) * 2.5, 16] : null;
      p.update(t, dt, wv);
      const clap = u > 1.8 && u < 6.2;
      fans.forEach((q, i) => {
        const a = 3 * Math.sin(t * 14 + i);
        q.reach = clap ? [49 + a, 60] : null; q.farReach = clap ? [47 - a, 58] : null;
        q.update(t, dt, wv);
      });
      cat.step(t, dt, night);
      flags.forEach((fl, i) => {
        const a = fl.sw.step(-wv * 1.4 + Math.sin(t * 2.3 + i) * 0.3, dt);
        const pa = ropeAt(fl.u), pb = ropeAt(fl.u + 0.018);
        fl.n.setAttribute('d', `M${pt(pa)} L${pt(pb)} L${f((pa[0] + pb[0]) / 2 + Math.sin(a) * 11)} ${f((pa[1] + pb[1]) / 2 + Math.cos(a) * 11)}Z`);
      });
      conf.step(dt);
      hearts.forEach((h) => h.step(dt));
    };
  });
}
