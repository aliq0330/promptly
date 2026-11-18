// "Olta boş çıktı": a rod on the bank, the float bobbing — and the fish that got away leaps out of the water. For lists that came back empty-handed.
import { defineScene } from './kit';
import { ink, keys, pose, saw, show, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<circle class="gb" cx="350" cy="44" r="24"/>
<path class="p" d="M0 138H104Q116 140 116 152V200H0Z"/>
<path class="k t" d="M14 138l-3-8M30 138l2-9M48 138l-2-8M70 138l3-7"/>
<path class="k" d="M116 152q14-8 28 0t28 0t28 0t28 0t28 0t28 0t28 0t28 0t28 0"/>
<path class="k t" d="M140 176q14-8 28 0t28 0t28 0t28 0t28 0t28 0t28 0t28 0"/>
<path class="k" style="stroke-width:3.2" d="M50 134L150 34"/>
<circle class="p" cx="64" cy="120" r="5"/>
<path class="k t" d="M150 34Q166 84 160 124"/>
<circle data-n="float" class="hf" cx="160" cy="128" r="5"/>
<path class="b" d="M160 134v10q0 8-7 6"/>
<ellipse class="k t" cx="160" cy="152" rx="14" ry="3"/>
<g data-n="fish"><g transform="rotate(-30 280 100)"><ellipse class="bf" cx="280" cy="100" rx="20" ry="9"/><path class="bf" d="M300 100l14-9v18z"/><circle cx="270" cy="98" r="2" style="fill:var(--paper)"/></g></g>
<path class="k t" d="M262 150q6-12 12-2M286 150q6-12 12-2"/>`;

export function fishing(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'fi', w: 800, h: 400, G: 320, seed: 33, ground: false }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      pose(q.float, { y: wave(t, 2.6) * 2.4 });
      // 4 s: the fish is under water, leaps, falls back (the still frame, t = 3, catches it at the top)
      const u = saw(t, 4);
      pose(q.fish, { y: keys(u, [[0.55, 44], [0.75, -22], [0.92, 34], [1, 44]]) });
      show(q.fish, u < 0.55 ? 0 : u < 0.63 ? (u - 0.55) / 0.08 : u < 0.9 ? 1 : (1 - u) / 0.1);
    };
  });
}
