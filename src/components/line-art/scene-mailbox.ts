// "Posta kutusu boş": a mailbox with its flag down and a spider in the corner, a paper plane leaving. For chats, channels and rooms that no longer exist.
import { defineScene } from './kit';
import { ink, pose, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<path class="k" style="stroke-width:6" d="M200 98V160"/>
<path class="k" d="M184 160h32"/>
<path class="p" d="M152 98V74a48 38 0 0 1 96 0V98Z"/>
<path class="k t" d="M164 98V76a36 26 0 0 1 72 0V98"/>
<circle class="k" cx="200" cy="88" r="3"/>
<path class="k" d="M248 80H258"/>
<rect class="hf" x="256" y="80" width="9" height="22" rx="1.5"/>
<path class="k t" d="M156 78q8 4 14-4M156 78q4-8 12-10M156 78q10-2 12 4"/>
<g data-n="spider"><path class="k t" d="M170 50V68"/><circle class="k" cx="170" cy="70" r="2.5"/></g>
<g data-n="plane"><path class="b" d="M300 70l56-18-20 40-10-16z"/><path class="b" d="M326 76l10-14"/></g>`;

export function mailbox(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'mb', w: 800, h: 400, G: 320, seed: 41, ground: 'paving' }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      pose(q.spider, { y: wave(t, 2.6) * 3, ox: 170, oy: 50 });
      pose(q.plane, { x: wave(t, 5) * 5 + 5, y: wave(t, 5, 0.25) * -4, r: wave(t, 5) * 3, ox: 328, oy: 70 });
    };
  });
}
