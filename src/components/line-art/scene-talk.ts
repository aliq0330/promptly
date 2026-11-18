// "Sohbet henüz başlamadı": two empty armchairs either side of a table with two steaming cups, a dotted speech bubble waiting above. For chat lists with no conversation yet.
import { defineScene } from './kit';
import { ink, keys, pose, saw, show, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<rect class="p" x="52" y="78" width="46" height="62" rx="16"/><rect class="p" x="44" y="116" width="66" height="28" rx="10"/>
<path class="k" d="M54 144v16M100 144v16"/>
<rect class="p" x="302" y="78" width="46" height="62" rx="16"/><rect class="p" x="290" y="116" width="66" height="28" rx="10"/>
<path class="k" d="M300 144v16M346 144v16"/>
<ellipse class="p" cx="200" cy="124" rx="34" ry="7"/>
<path class="k" d="M200 131V160M184 160h32"/>
<path class="p" d="M184 100h14v14a7 7 0 0 1-14 0z"/><path class="k" d="M198 104q6 0 0 8"/>
<path class="p" d="M206 100h14v14a7 7 0 0 1-14 0z"/><path class="k" d="M220 104q6 0 0 8"/>
<path data-n="st1" class="b" d="M191 94q-4-6 0-12"/>
<path data-n="st2" class="b" d="M213 94q-4-6 0-12"/>
<ellipse class="k dash" cx="200" cy="48" rx="34" ry="17"/>
<circle data-n="d1" class="bf" cx="188" cy="48" r="3"/><circle data-n="d2" class="bf" cx="200" cy="48" r="3"/><circle data-n="d3" class="bf" cx="212" cy="48" r="3"/>`;

export function talk(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'tk', w: 800, h: 400, G: 320, seed: 44, ground: 'floor' }, (c) => {
    const q = ink(c.mid, ART);
    const steam = (n: SVGElement, u: number) => { pose(n, { y: keys(u, [[0, 6], [1, -12]]) }); show(n, u < 0.25 ? u / 0.25 : 1 - (u - 0.25) / 0.75); };
    return (t) => {
      steam(q.st1, saw(t, 2.6));
      steam(q.st2, saw(t, 2.6, 0.35));
      [q.d1, q.d2, q.d3].forEach((d, i) => show(d, 0.5 + wave(t, 1.8, -i * 0.12) * 0.5));
    };
  });
}
