// "Kaydedilenler": someone brings a prompt card to a chest, drops it in, closes the lid; the bookmark ribbon swings and a heart pops.
import { Person, heartPop, promptCard } from './figure';
import { Cat, act, bush, defineScene, el, f, house, lamp, pen, script, shape, smooth, tint, tree, until, wait, walkTo, clamp } from './kit';
import type { SceneLabels } from './scene-common';
import { pendulum } from '@/lib/line-art/motion';

export function saved(host: Element, labels: SceneLabels): () => void {
  const G = 270, CT = G - 80, X0 = 348, X1 = 412;
  return defineScene(host, labels, { id: 'sv', w: 640, h: 320, G, seed: 41, sun: [140, 72], moon: [140, 72], set: 150, stars: 12, clouds: [46, 100], ground: 'paving' }, (c) => {
    house(c, 450, 160, 110, { cols: 3, rows: 1, th: [0.3, 0.5, 0.7] });
    tree(c, 60, 0.95);
    bush(c, 250, 0.7);
    lamp(c, 580, 150, 0.3);
    // chest on a stool: card falls behind its front panel, lid hinged at the back
    pen(c.mid, 1.3).setAttribute('d', `M${X0 + 8} ${CT + 40} L${X0 + 4} ${G} M${X1 - 8} ${CT + 40} L${X1 - 4} ${G} M${X0 + 6} ${G - 18} L${X1 - 6} ${G - 18}`);
    const dropG = el('g', { opacity: 0 }, c.mid);
    promptCard(dropG, { w: 11, h: 14, lines: 3 });
    shape(c.mid, 1.2).setAttribute('d', `M${X0} ${CT} L${X1} ${CT} L${X1} ${CT + 40} L${X0} ${CT + 40}Z`);
    pen(c.mid, 0.7).setAttribute('d', `M${X0} ${CT + 12} L${X1} ${CT + 12} M${(X0 + X1) / 2 - 4} ${CT + 8} l8 0 l0 8 l-8 0Z`);
    const lid = el('g', {}, c.mid);
    shape(lid, 1.2).setAttribute('d', `M${X0} ${CT} L${X0} ${CT - 8} Q${X0} ${CT - 20} ${(X0 + X1) / 2} ${CT - 20} Q${X1} ${CT - 20} ${X1} ${CT - 8} L${X1} ${CT}Z`);
    const ribbon = el('g', {}, c.mid);
    tint(el('path', { d: 'M-3 0 L3 0 L3 24 L0 19 L-3 24Z', stroke: 'currentColor', 'stroke-width': 0.8, 'stroke-linejoin': 'round' }, ribbon), 'var(--la-heart)');
    const cat = new Cat(c.mid, 436, G + 2, -1, 1.4);
    const heart = heartPop(c.fx);
    const p = new Person(c.people, { coat: 'var(--la-primary)', legs: 'var(--la-legs)', hair: 'bun' });
    p.scale = 1.35; p.y = G + 4; p.x = -40;
    const held = promptCard(p.prop, { w: 11, h: 14, lines: 3 }); held.setAttribute('transform', 'translate(0 -1)');
    let open = 0, openGoal = 0, drop = -1;
    const sw = pendulum(12, 1.3);
    const run = script(
      act(() => { p.x = -40; p.dir = 1; held.setAttribute('opacity', '1'); openGoal = 0; p.reach = [53, 60]; }),
      walkTo(p, 326),
      wait(0.3),
      act(() => { openGoal = 1; }),
      until(() => open > 0.85),
      act(() => { p.reach = p.toLocal((X0 + X1) / 2 - 4, CT - 22); }),
      until(() => p.reachAmt > 0.9),
      wait(0.3),
      act(() => { held.setAttribute('opacity', '0'); drop = 0; }),
      wait(0.8),
      act(() => { openGoal = 0; p.reach = [53, 60]; }),
      until(() => open < 0.1),
      act(() => { sw.kick(2.4); heart.fire((X0 + X1) / 2, CT - 30); p.reach = [51, 20]; }),
      wait(1.2),
      act(() => { p.reach = null; }),
      walkTo(p, -70),
      wait(0.5),
    );
    return (t, dt, night, wv) => {
      if (dt === 0) { p.x = 326; p.goTarget = 0; p.go = 0; open = 0; held.setAttribute('opacity', '1'); p.reach = [53, 60]; } else run(dt);
      p.update(t, dt, wv);
      open += (openGoal - open) * Math.min(1, dt * 6);
      lid.setAttribute('transform', `rotate(${f(-smooth(0, 1, open) * 84)} ${X1} ${CT})`);
      if (drop >= 0) {
        drop += dt;
        const k = clamp(drop / 0.55, 0, 1);
        dropG.setAttribute('opacity', drop < 0.7 ? '1' : '0');
        dropG.setAttribute('transform', `translate(${(X0 + X1) / 2 - 4} ${f(CT - 24 + k * k * 36)}) rotate(${f((1 - k) * 12)})`);
        if (drop > 0.9) drop = -1;
      } else dropG.setAttribute('opacity', '0');
      const a = sw.step(-wv * 0.3, dt);
      ribbon.setAttribute('transform', `translate(${(X0 + X1) / 2} ${CT + 12}) rotate(${f(a * 57)})`);
      cat.step(t, dt, night);
      heart.step(dt);
    };
  });
}
