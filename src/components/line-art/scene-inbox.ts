// "Hepsi okundu": a postperson checks a mailbox, finds it empty, lowers the flag, tips the cap and goes on. Tap the box or the cat.
import { Person } from './figure';
import { Cat, act, bush, defineScene, el, f, fence, house, lamp, pen, script, shape, smooth, tint, tree, until, wait, walkTo, lerp } from './kit';
import type { SceneLabels } from './scene-common';

export function inbox(host: Element, labels: SceneLabels): () => void {
  const G = 270, MX = 352, MY = G - 96;
  return defineScene(host, labels, { id: 'ib', w: 640, h: 320, G, seed: 21, sun: [210, 70], moon: [210, 70], set: 150, stars: 12, clouds: [48, 100], ground: 'paving' }, (c) => {
    house(c, 470, 130, 96, { cols: 2, rows: 1, th: [0.3, 0.55] });
    tree(c, 80, 0.9);
    fence(c, 130, 250, 30, c.back);
    lamp(c, 560, 150, 0.32);
    bush(c, 440, 0.8);
    // the mailbox: a post, a body with an arched lid, a door that drops open, a flag
    const post = pen(c.mid, 1.6); post.setAttribute('d', `M${MX} ${G} L${MX} ${MY + 14}`);
    shape(c.mid, 1.2).setAttribute('d', `M${MX - 22} ${MY + 14} L${MX - 22} ${MY - 2} Q${MX - 22} ${MY - 16} ${MX} ${MY - 16} Q${MX + 22} ${MY - 16} ${MX + 22} ${MY - 2} L${MX + 22} ${MY + 14}Z`);
    const inside = el('path', { d: `M${MX - 22} ${MY - 2} L${MX - 22} ${MY + 14} L${MX - 14} ${MY + 14} L${MX - 14} ${MY + 2}Z`, opacity: 0 }, c.mid); inside.style.fill = 'currentColor';
    const door = el('g', {}, c.mid);
    shape(door, 1.1).setAttribute('d', `M${MX - 22} ${MY + 14} L${MX - 22} ${MY - 2} L${MX - 14} ${MY - 2} L${MX - 14} ${MY + 14}Z`);
    const flagG = el('g', { style: 'cursor:pointer' }, c.mid);
    pen(flagG, 1.2).setAttribute('d', 'M0 0 L0 -26');
    tint(el('path', { d: 'M0 -26 L14 -22 L0 -18Z', stroke: 'currentColor', 'stroke-width': 0.9 }, flagG), 'var(--la-heart)');
    el('circle', { cx: 6, cy: -14, r: 16, fill: 'transparent' }, flagG);
    const cat = new Cat(c.mid, 168, G - 30, 1, 1.5);

    const p = new Person(c.people, { coat: 'var(--la-cloth-1)', legs: 'var(--la-legs)', hair: 'cap', cap: 'var(--la-primary)' });
    p.scale = 1.35; p.y = G + 4; p.x = -40;
    shape(p.prop, 0.9).setAttribute('d', 'M-6 4 L-6 22 L8 22 L8 4Z'); // satchel hanging from the hand
    pen(p.prop, 0.7).setAttribute('d', 'M-6 4 Q1 -2 8 4 M-6 10 L8 10');

    let flag = 1, open = 0, flagGoal = 1, openGoal = 0, emptyShown = 0;
    const toggleFlag = () => { flagGoal = flagGoal ? 0 : 1; };
    flagG.addEventListener('pointerdown', toggleFlag);
    const run = script(
      act(() => { p.x = -40; p.dir = 1; p.goTarget = 1; p.reach = null; p.hatLift = 0; flagGoal = 1; openGoal = 0; }),
      walkTo(p, 292),
      wait(0.3),
      act(() => { openGoal = 1; p.reach = p.toLocal(MX - 20, MY + 4); }),
      until(() => p.reachAmt > 0.95 && open > 0.9),
      wait(0.5),
      act(() => { p.reach = [52, 66]; emptyShown = 1; }),
      wait(0.9),
      act(() => { openGoal = 0; emptyShown = 0; p.reach = p.toLocal(MX - 18, MY + 2); }),
      wait(0.7),
      act(() => { flagGoal = 0; p.reach = null; }),
      wait(0.6),
      act(() => { p.hatLift = 1; p.reach = [47, 24]; }),
      wait(1.1),
      act(() => { p.hatLift = 0; p.reach = null; p.goTarget = 1; p.dir = 1; }),
      until(() => p.x > 700),
    );
    return (t, dt, night, wv) => {
      if (dt === 0) { p.x = 290; p.goTarget = 0; p.go = 0; flag = flagGoal = 0; }
      else run(dt);
      p.update(t, dt, wv);
      open += (openGoal - open) * Math.min(1, dt * 7); flag += (flagGoal - flag) * Math.min(1, dt * 8);
      door.setAttribute('transform', `rotate(${f(open * -80)} ${MX - 22} ${MY + 14})`);
      inside.setAttribute('opacity', f(open * 0.35));
      flagG.setAttribute('transform', `translate(${MX + 22} ${MY + 6}) rotate(${f(lerp(80, 0, smooth(0, 1, flag)))})`);
      cat.step(t, dt, night);
      void emptyShown;
    };
  });
}
