// "İp boş": a clothesline with bare pegs and one blank polaroid swinging, a crate on the ground. For an empty story archive.
import { defineScene } from './kit';
import { ink, pose, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<path class="k" d="M24 30V168M376 30V168"/>
<path class="k t" d="M24 34Q200 84 376 34"/>
<rect class="p" x="95" y="44" width="10" height="14" rx="2"/>
<rect class="p" x="295" y="44" width="10" height="14" rx="2"/>
<rect class="p" x="195" y="54" width="10" height="14" rx="2"/>
<g data-n="polaroid"><rect class="p" x="172" y="64" width="56" height="68" rx="3"/><rect class="k t dash" x="180" y="72" width="40" height="40"/></g>
<rect class="p" x="300" y="130" width="60" height="38" rx="3"/>
<path class="k" d="M296 130h68"/>`;

export function archive(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'ar', w: 800, h: 400, G: 336, seed: 48, ground: 'grass' }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      pose(q.polaroid, { r: wave(t, 3.2) * 6, ox: 200, oy: 60 });
    };
  });
}
