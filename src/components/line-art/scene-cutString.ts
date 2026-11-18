// "Hat kesildi": two tin-can phones, the string between them snipped by a pair of scissors; the sound waves fade out. For chat lists that failed to load.
import { defineScene } from './kit';
import { ink, pose, show, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<path class="k" d="M44 148V160M70 148V160M334 148V160M360 148V160"/>
<rect class="p" x="30" y="100" width="50" height="48" rx="4"/>
<ellipse class="p" cx="80" cy="124" rx="8" ry="24"/>
<rect class="p" x="320" y="100" width="50" height="48" rx="4"/>
<ellipse class="p" cx="320" cy="124" rx="8" ry="24"/>
<path class="k t" d="M40 108v32M360 108v32"/>
<path data-n="w1" class="b" d="M92 110q8 14 0 28"/>
<path data-n="w2" class="b" d="M102 102q14 22 0 44"/>
<path class="k" style="stroke-width:1.8" d="M84 124Q130 158 184 136"/>
<path class="k" style="stroke-width:1.8" d="M222 136Q270 152 316 124"/>
<path class="k t" d="M184 136l7 4M184 136l6-5M222 136l-6-4M222 136l-7 5"/>
<g data-n="scissors"><path class="k" style="stroke-width:3" d="M203 114L195 140M203 114L211 140M203 114L196 98M203 114L210 98"/><circle class="k" cx="194" cy="90" r="7"/><circle class="k" cx="212" cy="90" r="7"/></g>`;

export function cutString(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'cs', w: 800, h: 400, G: 320, seed: 34, ground: 'paving' }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      // snip, snip: the scissors close sideways
      pose(q.scissors, { s: 0.78 + 0.22 * Math.abs(wave(t, 1.6)), sy: 1, ox: 203, oy: 114 });
      show(q.w1, 0.55 + wave(t, 2.4) * 0.45);
      show(q.w2, 0.55 + wave(t, 2.4, 0.3) * 0.45);
    };
  });
}
