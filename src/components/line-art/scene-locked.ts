// "Bu kapı kilitli": a padlocked door, the key hanging out of reach on a nail. For private or sign-in-only links.
import { defineScene } from './kit';
import { ink, pose, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<rect class="p" x="146" y="34" width="108" height="126" rx="6"/>
<rect class="k t" x="160" y="48" width="36" height="42"/><rect class="k t" x="204" y="48" width="36" height="42"/>
<rect class="k t" x="160" y="98" width="80" height="50"/>
<path class="b" d="M190 104v-10a10 10 0 0 1 20 0v10"/>
<rect class="hf" x="184" y="104" width="32" height="26" rx="5"/>
<circle cx="200" cy="114" r="3.2" style="fill:var(--ink)"/>
<path class="k" d="M200 116v8"/>
<path class="b" d="M158 164h84"/>
<circle class="bf" cx="316" cy="48" r="3.5"/>
<g data-n="key"><path class="k t" d="M316 52V68"/><circle class="p" cx="316" cy="78" r="9"/><circle class="k" cx="316" cy="78" r="3"/><path class="k" style="stroke-width:3" d="M316 87V120M316 106h8M316 115h6"/></g>
<path class="b dash" d="M306 112Q268 150 224 124"/>`;

export function locked(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'lk', w: 800, h: 400, G: 320, seed: 37, ground: 'paving' }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      pose(q.key, { r: wave(t, 3) * 7, ox: 316, oy: 48 });
    };
  });
}
