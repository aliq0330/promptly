// "Sürgüler sıfırda": a mixing desk with five faders at the bottom that slide up and down as if being tried. For a preset with no parameters yet.
import { defineScene } from './kit';
import { ink, pose } from './scene-parts';
import type { SceneLabels } from './scene-common';

const FADERS = [100, 150, 200, 250, 300];
const knob = (i: number) => `<g data-n="k${i}"><rect class="${i === 2 ? 'bf' : 'p'}" x="${FADERS[i] - 12}" y="124" width="24" height="13" rx="3"/><path class="k t" d="M${FADERS[i] - 8} 130h16"/></g>`;
const ART = `
<rect class="p" x="60" y="34" width="280" height="122" rx="12"/>
<path class="k" style="stroke-width:3" d="${FADERS.map((x) => `M${x} 62V138`).join('')}"/>
<circle class="bf" cx="100" cy="46" r="3.4"/><circle class="hf" cx="150" cy="46" r="3.4"/><circle class="bf" cx="200" cy="46" r="3.4"/><circle class="hf" cx="250" cy="46" r="3.4"/><circle class="bf" cx="300" cy="46" r="3.4"/>
${FADERS.map((_, i) => knob(i)).join('')}`;

export function params(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'pm', w: 800, h: 400, G: 312, seed: 50, ground: 'floor' }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      FADERS.forEach((_, i) => {
        const up = 0.5 - 0.5 * Math.cos((t / 4 + i * 0.125) * Math.PI * 2);
        pose(q[`k${i}`], { y: -up * 36 });
      });
    };
  });
}
