// "Topluluk": a camp fire and string lights. A newcomer walks up, the others wave, everyone cheers, the newcomer leaves. Tap people or the fire.
import { Person, heartPop } from './figure';
import { Cat, act, bench, defineScene, el, f, pen, script, shape, smooth, tint, tree, wait, walkTo, skyline, lerp, bush } from './kit';
import type { SceneLabels } from './scene-common';

export function community(host: Element, labels: SceneLabels): () => void {
  const G = 272, FX = 360;
  return defineScene(host, labels, { id: 'cm', w: 640, h: 320, G, seed: 61, sun: [110, 70], moon: [110, 70], set: 150, stars: 18, clouds: [44, 96], ground: 'grass' }, (c) => {
    skyline(c, G - 8, 'hills', 4);
    tree(c, 50, 1.1);
    tree(c, 604, 0.9);
    bush(c, 560, 0.8);
    bench(c, 96, 80, c.back);
    const cat = new Cat(c.mid, 150, G - 27, 1, 1.4);
    // string lights between two poles
    pen(c.back, 1.4).setAttribute('d', `M196 ${G} L196 90 M524 ${G} L524 90`);
    const at = (u: number): [number, number] => [lerp(196, 524, u), 90 + 38 * 4 * u * (1 - u)];
    pen(c.back, 0.8).setAttribute('d', Array.from({ length: 25 }, (_, i) => `${i ? 'L' : 'M'}${at(i / 24).map((v) => f(v)).join(' ')}`).join(' '));
    const bulbs = Array.from({ length: 11 }, (_, i) => {
      const [x, y] = at((i + 0.5) / 11);
      const n = el('circle', { cx: x, cy: y + 5, r: 3.4, stroke: 'currentColor', 'stroke-width': 0.9 }, c.back);
      n.style.fill = 'var(--la-paper)';
      const l = tint(el('circle', { cx: x, cy: y + 5, r: 2.6, opacity: 0 }, c.back), 'var(--la-glow)');
      return { l, i };
    });
    c.light(360, 130, 160, 0.2, 0.3);
    // the fire
    pen(c.mid, 1.5).setAttribute('d', `M${FX - 24} ${G + 2} L${FX + 20} ${G - 8} M${FX + 24} ${G + 2} L${FX - 20} ${G - 8}`);
    const flameA = tint(el('path', { stroke: 'currentColor', 'stroke-width': 1, 'stroke-linejoin': 'round' }, c.mid), 'var(--la-heart)');
    const flameB = tint(el('path', {}, c.mid), 'var(--la-glow)');
    const sparks = Array.from({ length: 7 }, () => ({ n: tint(el('circle', { r: 1.3 }, c.fx), 'var(--la-heart)'), x: 0, y: 0, v: 0, life: Math.random() * 2 }));
    const fire = c.halo(FX, G - 22, 120);
    let flare = 0;
    const flareIt = () => { flare = 1; };
    const hitFire = el('circle', { cx: FX, cy: G - 18, r: 30, fill: 'transparent', style: 'cursor:pointer' }, c.mid); hitFire.addEventListener('pointerdown', flareIt);
    const mk = (look: ConstructorParameters<typeof Person>[1], x: number, dir: 1 | -1, y: number, s = 1.3) => { const p = new Person(c.people, look, 'walk'); p.x = x; p.dir = dir; p.y = y; p.scale = s; p.go = p.goTarget = 0; return p; };
    const a = mk({ coat: 'var(--la-cloth-1)', legs: 'var(--la-legs)', hair: 'hat', scarf: 'var(--la-heart)' }, 286, 1, G + 6);
    const b = mk({ coat: 'var(--la-primary)', hem: 102, hair: 'long' }, 438, -1, G + 6);
    const d = mk({ coat: 'var(--la-cloth-3)', legs: 'var(--la-legs)', hair: 'bun' }, 236, 1, G + 14, 1.35);
    const n = mk({ coat: 'var(--la-cloth-2)', legs: 'var(--la-legs)', hair: 'cap', cap: 'var(--la-primary)' }, 700, -1, G + 8);
    const heart = heartPop(c.fx);
    for (const q of [a, b, d]) { q.g.style.cursor = 'pointer'; q.g.addEventListener('pointerdown', () => { const h = q.toScene(44, 0); heart.fire(h[0], h[1] - 2); }); }
    const wave = (q: Person, on: boolean, ph: number, t: number) => { q.reach = on ? [54 + Math.sin(t * 11 + ph) * 3, 18] : null; };
    let greet = false, cheer = false;
    const run = script(
      act(() => { n.x = 700; n.dir = -1; n.goTarget = 1; greet = cheer = false; }),
      walkTo(n, 500),
      act(() => { greet = true; }), wait(2.4),
      act(() => { greet = false; cheer = true; heart.fire(FX, G - 70); flare = 1; }), wait(2.2),
      act(() => { cheer = false; greet = true; }), wait(1.2),
      act(() => { greet = false; }),
      walkTo(n, 720),
      wait(1.5),
    );
    return (t, dt, night, wv) => {
      if (dt === 0) { n.x = 500; n.go = 0; } else run(dt);
      for (const [q, ph] of [[a, 0], [b, 1.3], [d, 2.1]] as Array<[Person, number]>) {
        if (cheer) { q.reach = [56 + Math.sin(t * 13 + ph) * 2.5, 16]; q.farReach = [26 + Math.sin(t * 13 + ph + 1) * 2.5, 16]; } else { wave(q, greet, ph, t); q.farReach = null; }
        q.update(t, dt, wv);
      }
      n.reach = greet ? [54 + Math.sin(t * 11) * 3, 18] : cheer ? [56, 16] : null; n.farReach = cheer ? [26, 16] : null;
      n.update(t, dt, wv);
      cat.step(t, dt, night);
      flare = Math.max(0, flare - dt * 0.8);
      const fl = Math.sin(t * 11) * 0.5 + Math.sin(t * 17 + 1) * 0.3;
      const h = 34 + flare * 16 + fl * 3, w = 15 + flare * 3;
      flameA.setAttribute('d', `M${FX - w} ${G - 4} Q${FX - w - 2 + fl} ${f(G - h * 0.5)} ${f(FX - 2 + fl * 2)} ${f(G - h)} Q${f(FX + 3)} ${f(G - h * 0.6)} ${FX + w} ${G - 4}Z`);
      flameB.setAttribute('d', `M${FX - 7} ${G - 4} Q${FX - 8} ${f(G - h * 0.35)} ${f(FX + fl)} ${f(G - h * 0.62)} Q${FX + 8} ${f(G - h * 0.35)} ${FX + 7} ${G - 4}Z`);
      fire.setAttribute('opacity', f(0.22 + 0.06 * fl + flare * 0.14 + smooth(0, 0.6, night) * 0.3));
      bulbs.forEach((bl) => bl.l.setAttribute('opacity', f(smooth(0.12 + bl.i * 0.02, 0.4 + bl.i * 0.02, night))));
      sparks.forEach((s) => {
        s.life -= dt; if (s.life <= 0) { s.life = 1.2 + Math.random() * 1.4; s.x = FX + (Math.random() - 0.5) * 14; s.y = G - h; s.v = 22 + Math.random() * 20; }
        s.y -= s.v * dt; s.x += Math.sin(t * 3 + s.v) * 6 * dt + wv * 4 * dt;
        s.n.setAttribute('cx', f(s.x)); s.n.setAttribute('cy', f(s.y)); s.n.setAttribute('opacity', f(Math.min(1, s.life)));
      });
      heart.step(dt);
      void shape;
    };
  });
}
