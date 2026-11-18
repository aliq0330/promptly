// "Zincir kurulmadı": a row of dominoes tipping one after another under a dashed arrow. For an empty workflows tab.
import { defineScene } from './kit';
import { ink, keys, pose, saw } from './scene-parts';
import type { SceneLabels } from './scene-common';

const X = [64, 106, 148, 190, 232, 274, 316];
const stone = (i: number) =>
  `<g data-n="d${i}"><rect class="${i === 6 ? 'bf' : 'p'}" x="${X[i]}" y="104" width="18" height="56" rx="3"/><path class="k t" d="M${X[i]} 132h18"/><path class="k" style="stroke-width:4.4" d="M${X[i] + 9} 116h0M${X[i] + 9} 148h0"/></g>`;
const ART = `
<path class="b dash" d="M70 82Q200 44 340 82"/>
<path class="b" d="M330 72l12 10-14 4"/>
${X.map((_, i) => stone(i)).join('')}`;

export function dominoes(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'dm', w: 800, h: 400, G: 320, seed: 53, ground: 'floor' }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      // each stone starts 0.45 s after the one before it; the still frame (t = 3) is mid-chain
      X.forEach((x, i) => {
        const u = saw(t - i * 0.45, 6);
        pose(q[`d${i}`], { r: keys(u, [[0, 0], [0.08, 0], [0.28, 60], [0.86, 60], [1, 0]]), ox: x + 18, oy: 160 });
      });
    };
  });
}
