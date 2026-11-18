// "Pano henüz boş": a pin board with one pinned card holding two quote marks. For an empty quotes tab.
import { defineScene } from './kit';
import { ink, pose, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<rect class="p" x="90" y="26" width="220" height="134" rx="8"/>
<path class="k t" style="stroke-width:3" d="M110 50h0M150 136h0M276 58h0M254 144h0M120 98h0M290 112h0"/>
<g data-n="card">
  <rect class="p" x="146" y="50" width="108" height="76" rx="4"/>
  <circle class="bf" cx="178" cy="82" r="9"/><path class="b" style="stroke-width:6" d="M171 86q-2 14-12 22"/>
  <circle class="bf" cx="218" cy="82" r="9"/><path class="b" style="stroke-width:6" d="M211 86q-2 14-12 22"/>
  <path class="k t" d="M172 116h58"/>
  <circle class="hf" cx="200" cy="50" r="6"/>
</g>`;

export function quoteBoard(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'qb', w: 800, h: 400, G: 320, seed: 54, ground: 'floor' }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      pose(q.card, { r: wave(t, 3.4) * 4, ox: 200, oy: 50 });
    };
  });
}
