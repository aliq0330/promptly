// "Davet geçersiz": an invitation ticket torn in two, its wax seal cracked, a question mark above. For invalid or expired invite links.
import { defineScene } from './kit';
import { ink, pose, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<g transform="rotate(-6 150 108)">
  <path class="p" d="M84 70H196L189 80L198 90L189 100L198 110L189 120L198 130L189 140L196 148H84a10 10 0 0 1-10-10V80A10 10 0 0 1 84 70Z"/>
  <path class="k t" d="M92 92h54M92 104h40M92 116h48"/>
  <path class="gl" d="M104 128l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>
</g>
<g data-n="right"><g transform="rotate(7 270 110)">
  <path class="p" d="M222 76L216 86L224 96L216 106L224 116L216 126L224 136L220 144H318a10 10 0 0 0 10-10V86a10 10 0 0 0-10-10Z"/>
  <path class="k t" d="M236 98h28M236 110h20M236 122h26"/>
  <circle class="hf" cx="296" cy="110" r="14"/>
  <path class="k" d="M296 98l-4 9 6 5-5 10"/>
</g></g>
<g data-n="q"><path class="b" d="M200 50q0-10 10-10t10 9q0 7-9 10v6"/><circle class="bf" cx="211" cy="72" r="1.8"/></g>`;

export function invite(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'iv', w: 800, h: 400, G: 320, seed: 36, ground: 'paving' }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      pose(q.right, { x: wave(t, 5) * 5 + 3, y: wave(t, 5, 0.25) * -4, r: wave(t, 5) * 1.5, ox: 270, oy: 110 });
      pose(q.q, { y: wave(t, 2.8) * -3 });
    };
  });
}
