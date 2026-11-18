// "Hikâye sönmüş": a candle that has just gone out, two threads of smoke, a faded polaroid and a moon. For a story that expired or was removed.
import { defineScene } from './kit';
import { ink, keys, pose, saw, show, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<g transform="rotate(-10 94 120)"><rect class="p" x="62" y="84" width="64" height="76" rx="4"/><rect class="k t dash" x="70" y="92" width="48" height="44"/></g>
<path class="gl" d="M318 54a22 22 0 1 0 22 22a17 17 0 0 1-22-22z"/>
<path class="k t" d="M290 40h6M293 37v6M356 112h6M359 109v6"/>
<ellipse class="p" cx="200" cy="154" rx="46" ry="9"/>
<path class="p" d="M184 152V96h32V152"/>
<ellipse class="p" cx="200" cy="96" rx="16" ry="4"/>
<path class="k t" d="M190 102v14q0 6 4 0v-14M210 102v22"/>
<path class="k" d="M200 92v-9"/>
<circle data-n="ember" class="hf" cx="200" cy="80" r="2.6"/>
<path data-n="s1" class="b" d="M200 74q-12-10 0-20t0-20"/>
<path data-n="s2" class="b" d="M204 74q10-9 2-18t2-18"/>`;

export function story(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'sy', w: 800, h: 400, G: 320, seed: 38, ground: 'paving' }, (c) => {
    const q = ink(c.mid, ART);
    const smoke = (n: SVGElement, u: number) => {
      pose(n, { y: keys(u, [[0, 8], [1, -16]]) });
      show(n, u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8);
    };
    return (t) => {
      smoke(q.s1, saw(t, 3));
      smoke(q.s2, saw(t, 3, 0.5));
      pose(q.ember, { s: 1 + wave(t, 1.6) * 0.22, ox: 200, oy: 80 });
    };
  });
}
