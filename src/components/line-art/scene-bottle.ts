// "Şişe henüz yola çıkmadı": a message in a bottle bobbing on the sea, a sparkle above the waves. For an empty requests tab.
import { defineScene } from './kit';
import { ink, pose, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<circle class="gb" cx="322" cy="46" r="26"/>
<g data-n="bottle"><g transform="rotate(-14 200 118)">
  <rect class="p" x="140" y="100" width="100" height="38" rx="16"/>
  <path class="p" d="M240 108h30v22h-30"/>
  <rect class="hf" x="268" y="106" width="12" height="26" rx="3"/>
  <path class="b" d="M158 112h56M158 120h40M158 128h50"/>
  <path class="k t" d="M152 106h44"/>
</g></g>
<path class="k" d="M0 138q16-8 32 0t32 0t32 0t32 0t32 0t32 0t32 0t32 0t32 0t32 0t32 0t32 0t32 0"/>
<path class="k t" d="M-10 164q16-8 32 0t32 0t32 0t32 0t32 0t32 0t32 0t32 0t32 0t32 0t32 0t32 0t32 0"/>
<path class="k t" d="M24 186q16-8 32 0t32 0t32 0t32 0t32 0t32 0t32 0t32 0t32 0t32 0t32 0"/>
<path data-n="spark" class="gl" d="M80 62l4 10 10 4-10 4-4 10-4-10-10-4 10-4z"/>`;

export function bottle(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'bt', w: 800, h: 400, G: 320, seed: 52, ground: false }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      pose(q.bottle, { y: wave(t, 3.4) * -4, r: wave(t, 3.4, 0.2) * 2.5, ox: 200, oy: 118 });
      pose(q.spark, { s: 1 + wave(t, 1.8) * 0.18, r: wave(t, 4) * 8, ox: 80, oy: 76 });
    };
  });
}
