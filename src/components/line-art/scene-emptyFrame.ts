// "Çerçeve boş": an empty picture frame on the wall, a ladder against it and a magnifier still looking. For a prompt that is gone or not public.
import { defineScene } from './kit';
import { ink, pose, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<path class="k" style="stroke-width:3" d="M52 160L74 38M98 160L120 38"/>
<path class="k" d="M56 138h46M60.7 112h46M65.3 86h46M70 60h46"/>
<path class="k t" d="M190 36L218 18L246 36"/>
<circle class="bf" cx="218" cy="18" r="3"/>
<rect class="p" x="160" y="36" width="116" height="86" rx="4"/>
<rect class="b dash" x="172" y="48" width="92" height="62" rx="2"/>
<g data-n="glass"><circle class="b" cx="326" cy="88" r="14"/><path class="b" d="M336 98l12 12"/></g>`;

export function emptyFrame(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'ef', w: 800, h: 400, G: 320, seed: 39, ground: 'paving' }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      pose(q.glass, { y: wave(t, 3.2) * -5, r: wave(t, 3.2) * 3, ox: 326, oy: 88 });
    };
  });
}
