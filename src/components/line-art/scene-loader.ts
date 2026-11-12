// The loader: a 32 px figure walks in place while the ground slides by. Small enough to sit inside a button.
import { Person } from './figure';
import { defineScene, f, pen } from './kit';
import type { SceneLabels } from './scene-common';

export function loader(host: Element, labels: SceneLabels): () => void {
  const G = 31;
  return defineScene(host, labels, { id: 'ld', w: 80, h: 34, G }, (c) => {
    c.scene.removeAttribute('filter'); // the ink wobble is for large drawings
    const dashes = pen(c.mid, 0.6);
    const p = new Person(c.people, { coat: 'var(--la-primary)', legs: 'var(--la-legs)', hair: 'cap', cap: 'var(--la-heart)' });
    p.scale = 0.34; p.y = G; p.dir = 1;
    let off = 0;
    return (t, dt) => {
      p.x = 40;
      p.update(t, dt, 0);
      off = (off + p.walk.speed * p.scale * dt) % 24;
      let d = '';
      for (let i = -1; i < 5; i++) d += `M${f(i * 24 - off)} ${G + 1.6} l12 0 `;
      dashes.setAttribute('d', d);
    };
  });
}
