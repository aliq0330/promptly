// "Köprü yarım kaldı": a bridge with a gap, a crane lowering the last plank on a rope. For team pages that failed to load.
import { defineScene } from './kit';
import { ink, pose, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<path class="p" d="M0 124H118V200H0Z"/>
<path class="p" d="M282 124H400V200H282Z"/>
<path class="k t" d="M20 150h30M70 142h26M304 150h34M350 144h30M30 176h40"/>
<path class="p" d="M118 124h38v7h-38z"/>
<path class="p" d="M244 124h38v7h-38z"/>
<path class="k t" d="M156 190q9-6 18 0t18 0t18 0t18 0t18 0"/>
<path class="k" style="stroke-width:3.2" d="M352 124V36H206"/>
<path class="k t" d="M352 58L330 36"/>
<circle class="p" cx="206" cy="36" r="4"/>
<g data-n="plank"><path class="k t" d="M206 40L184 84M206 40L228 84"/><rect class="p" x="176" y="84" width="60" height="9" rx="2"/></g>
<path class="b dash" d="M158 120H242"/>
<path class="hf" d="M82 124l-10-32h20z"/>
<path class="k t" d="M77 108h10"/>`;

export function halfBridge(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'hb', w: 800, h: 400, G: 320, seed: 35, ground: false }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      pose(q.plank, { r: wave(t, 3.4) * 7, ox: 206, oy: 38 });
    };
  });
}
