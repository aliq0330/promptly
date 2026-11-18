// "Dosya yerinde değil": a filing cabinet with an empty drawer pulled out and a lone tag, a paper plane flying off. For missing team items, files and boards.
import { defineScene } from './kit';
import { ink, pose, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<rect class="p" x="130" y="30" width="140" height="130" rx="6"/>
<rect class="k" x="140" y="40" width="120" height="30" rx="3"/>
<path class="k" d="M188 55h24"/>
<rect class="p" x="116" y="82" width="152" height="36" rx="3"/>
<path class="k t" d="M126 92h132"/>
<rect class="k" x="140" y="124" width="120" height="28" rx="3"/>
<path class="k" d="M188 138h24"/>
<g data-n="tag"><path class="k t" d="M240 118v14"/><rect class="p" x="228" y="132" width="24" height="16" rx="2"/><circle class="k" cx="234" cy="140" r="1.5"/></g>
<circle class="k t" cx="150" cy="104" r="5"/>
<g data-n="plane"><path class="b" d="M304 62l56-18-20 40-10-16z"/><path class="b" d="M330 70l10-14"/></g>`;

export function files(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'fl', w: 800, h: 400, G: 320, seed: 40, ground: 'paving' }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      pose(q.tag, { r: wave(t, 3) * 7, ox: 240, oy: 118 });
      pose(q.plane, { x: wave(t, 5) * 5 + 5, y: wave(t, 5, 0.25) * -4, r: wave(t, 5) * 3, ox: 332, oy: 64 });
    };
  });
}
