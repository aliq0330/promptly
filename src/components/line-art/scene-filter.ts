// "Süzgeçten hiçbiri geçmedi": a sieve over a bowl, nothing left in it, the last drops falling. For a filtered list with no match.
import { defineScene } from './kit';
import { ink, keys, pose, saw, show, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<path class="p" d="M122 142H278L262 164H138Z"/>
<path class="p" d="M122 56H278A78 56 0 0 1 122 56Z"/>
<path class="k" style="stroke-width:3.4" d="M116 56H284"/>
<path class="k" style="stroke-width:5" d="M284 56L350 44"/>
<circle class="k" cx="356" cy="43" r="3.5"/>
<path class="dots" d="M140 74h0M162 74h0M184 74h0M206 74h0M228 74h0M250 74h0M150 88h0M172 88h0M194 88h0M216 88h0M238 88h0M258 88h0M168 102h0M190 102h0M212 102h0M234 102h0"/>
<path data-n="d1" class="bf" d="M190 116q4 8 0 10q-4-2 0-10z"/>
<path data-n="d2" class="bf" d="M210 116q4 8 0 10q-4-2 0-10z"/>
<path data-n="d3" class="bf" d="M170 112q4 8 0 10q-4-2 0-10z"/>
<path data-n="plus" class="b" d="M64 74v12M58 80h12"/>`;

export function filter(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'ft', w: 800, h: 400, G: 328, seed: 46, ground: 'floor' }, (c) => {
    const q = ink(c.mid, ART);
    const drop = (n: SVGElement, u: number) => { pose(n, { y: keys(u, [[0, 0], [1, 22]]) }); show(n, u < 0.15 ? u / 0.15 : 1 - Math.max(0, u - 0.7) / 0.3); };
    return (t) => {
      drop(q.d1, saw(t, 1.8));
      drop(q.d2, saw(t, 1.8, 0.33));
      drop(q.d3, saw(t, 1.8, 0.66));
      pose(q.plus, { y: wave(t, 3.2) * -4 });
    };
  });
}
