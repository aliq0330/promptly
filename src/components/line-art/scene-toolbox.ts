// "Alet çantası boş": an open toolbox with a wrench and a pencil, a star rising out of it. For an empty skills tab.
import { defineScene } from './kit';
import { ink, pose, show, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<path class="p" d="M112 104L100 62H300L288 104Z"/>
<path class="k" d="M164 62V48H236V62"/>
<path class="k" style="stroke-width:6" d="M144 108V76"/><circle class="hf" cx="144" cy="70" r="8"/>
<path class="k" style="stroke-width:6" d="M176 108L182 70"/><path class="gl" d="M180 70l4 0l-2-12z"/>
<rect class="p" x="104" y="104" width="192" height="58" rx="8"/>
<path class="k t" d="M104 134h192"/>
<rect class="bf" x="186" y="98" width="28" height="14" rx="3"/>
<path data-n="star" class="gl" d="M236 76l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z"/>
<path data-n="glint" class="k t" d="M270 54l6-6M276 68h8M224 40v8"/>`;

export function toolbox(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'tb', w: 800, h: 400, G: 324, seed: 55, ground: 'floor' }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      pose(q.star, { y: wave(t, 3) * -6, r: wave(t, 3.6) * 5, ox: 236, oy: 90 });
      show(q.glint, 0.55 + wave(t, 1.7) * 0.45);
    };
  });
}
