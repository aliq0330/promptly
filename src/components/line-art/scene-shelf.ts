// "Raf boş": a bookcase with three books and a plant, most of it empty, dust in the air. For a list with no posts yet.
import { defineScene } from './kit';
import { ink, pose, show, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<rect class="p" x="110" y="26" width="180" height="138" rx="4"/>
<path class="k" d="M110 72H290M110 116H290"/>
<rect class="p" x="122" y="40" width="12" height="32" rx="1.5"/>
<rect class="p" x="136" y="46" width="12" height="26" rx="1.5"/>
<g transform="rotate(14 160 72)"><rect class="p" x="154" y="42" width="12" height="30" rx="1.5"/></g>
<path class="hf" d="M262 72V54h8v18Z"/>
<rect class="bf" x="140" y="104" width="64" height="12" rx="1.5"/>
<path class="p" d="M238 116l-4-20h30l-4 20z"/>
<path data-n="leaves" class="b" d="M249 96q-14-14-4-26M249 96q12-12 4-24"/>
<path data-n="dust" class="k t" d="M180 90h4M206 82h3M166 98h3M232 142h3"/>
<rect class="k t dash" x="212" y="126" width="62" height="30"/>`;

export function shelf(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'sh', w: 800, h: 400, G: 328, seed: 43, ground: 'floor' }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      pose(q.leaves, { r: wave(t, 3.4) * 4, ox: 249, oy: 96 });
      show(q.dust, 0.55 + wave(t, 2.2) * 0.45);
    };
  });
}
