// "Henüz tomurcuk": a seedling in a pot with a heart for a bud, sunlight reaching it. For a post with no reactions or comments yet.
import { defineScene } from './kit';
import { ink, pose, show, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<circle class="gb" cx="76" cy="48" r="30"/>
<path class="b dash" d="M100 74L158 104"/>
<path class="p" d="M160 122H240L230 164H170Z"/>
<rect class="p" x="154" y="112" width="92" height="12" rx="4"/>
<path class="k" style="stroke-width:3" d="M200 112V86Q200 66 218 60"/>
<path class="bf" d="M200 100Q180 100 174 84Q192 80 200 100Z"/>
<path class="bf" d="M200 92Q222 94 228 78Q208 74 200 92Z"/>
<path data-n="heart" class="h" d="M222 60q-14-9-14-18a8 8 0 0 1 14-4a8 8 0 0 1 14 4q0 9-14 18z"/>
<path data-n="glint" class="k t" d="M270 80h6M273 77v6M130 140h5M300 130h4"/>`;

export function sprout(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'sp', w: 800, h: 400, G: 332, seed: 49, ground: 'grass' }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      pose(q.heart, { s: 1 + wave(t, 2.2) * 0.1 + 0.06, ox: 222, oy: 56 });
      show(q.glint, 0.55 + wave(t, 2) * 0.45);
    };
  });
}
