// "Akış durdu": cards jam on a stopped conveyor belt while a cog stutters and a wrench tries to free it. For a feed that failed to load.
import { defineScene, smooth } from './kit';
import { ink, keys, pose, saw, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<path class="k" d="M96 140V160M304 140V160"/>
<rect class="p" x="40" y="118" width="320" height="22" rx="11"/>
<circle class="p" cx="53" cy="129" r="6"/><circle class="p" cx="347" cy="129" r="6"/>
<path class="k t dash" d="M74 129H326"/>
<g><rect class="p" x="62" y="76" width="32" height="42" rx="5"/><path class="k t" d="M69 88h18M69 96h18M69 104h10"/></g>
<g><rect class="p" x="122" y="76" width="32" height="42" rx="5"/><path class="k t" d="M129 88h18M129 96h18M129 104h10"/></g>
<g transform="rotate(-12 196 118)"><rect class="p" x="180" y="76" width="32" height="42" rx="5"/><path class="k t" d="M187 88h18M187 96h18M187 104h10"/></g>
<g transform="rotate(10 232 118)"><rect class="p" x="216" y="68" width="32" height="50" rx="5"/><path class="k t" d="M223 80h18M223 88h18M223 96h10"/></g>
<g data-n="top"><g transform="rotate(24 236 40)"><rect class="p" x="220" y="22" width="32" height="42" rx="5"/><path class="k t" d="M227 34h18M227 42h18"/></g></g>
<g data-n="warn"><path class="h" d="M276 42v14"/><circle class="hf" cx="276" cy="66" r="2.4"/></g>
<circle data-n="gear" class="k" cx="322" cy="70" r="21" style="stroke-width:7;stroke-dasharray:8.25 8.25"/>
<circle class="p" cx="322" cy="70" r="15"/><circle class="b" cx="322" cy="70" r="5"/>
<g data-n="wrench"><path class="k" style="stroke-width:6" d="M296 108L334 88"/><circle class="hf" cx="335" cy="85" r="7"/></g>`;

export function feedStalled(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'fs', w: 800, h: 400, G: 320, seed: 31, ground: 'paving' }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      pose(q.top, { y: wave(t, 3.2) * -3, r: wave(t, 3.2) * 2, ox: 236, oy: 40 });
      pose(q.warn, { y: smooth(0, 1, saw(t, 2)) * -3 });
      // the cog catches, slips back, catches again
      pose(q.gear, { r: keys(saw(t, 3.4), [[0, 0], [0.1, 14], [0.16, 8], [0.6, 8], [0.7, 20], [0.76, 14], [1, 0]]), ox: 322, oy: 70 });
      pose(q.wrench, { r: wave(t, 3.4, 0.05) * 3, ox: 296, oy: 108 });
    };
  });
}
