// "Ateşin etrafı boş": a small fire, empty log seats and a tent. For a community with no members or requests yet.
import { defineScene } from './kit';
import { ink, keys, pose, saw, show } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<path class="k t" d="M46 30h6M49 27v6M340 40h6M343 37v6M250 24h6M253 21v6"/>
<path class="p" d="M26 124L72 52L118 124Z"/>
<path class="p" d="M62 124L72 86L82 124Z"/>
<path class="p" d="M112 150v14a18 7 0 0 0 36 0v-14"/><ellipse class="p" cx="130" cy="150" rx="18" ry="7"/>
<path class="p" d="M252 150v14a18 7 0 0 0 36 0v-14"/><ellipse class="p" cx="270" cy="150" rx="18" ry="7"/>
<ellipse class="p" cx="200" cy="156" rx="32" ry="8"/>
<path class="k" style="stroke-width:5" d="M180 152L220 144M180 144L220 152"/>
<path data-n="flame" class="bf" d="M200 148q-16-10-10-28q4 10 10 6q-2-14 8-26q4 14 12 22q6 14-20 26z"/>
<path data-n="core" class="gl" d="M200 148q-8-6-4-14q4 4 6-4q8 8 6 18z"/>
<circle data-n="sp1" class="gb" cx="212" cy="98" r="2.6"/>
<circle data-n="sp2" class="gb" cx="190" cy="104" r="2.2"/>`;

export function members(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'mm', w: 800, h: 400, G: 328, seed: 47, ground: 'grass' }, (c) => {
    const q = ink(c.mid, ART);
    const spark = (n: SVGElement, u: number) => { pose(n, { y: keys(u, [[0, 8], [1, -18]]) }); show(n, u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8); };
    return (t) => {
      // the flame breathes: taller and thinner, then back
      const k = 0.5 + 0.5 * Math.sin(t * 7) * Math.sin(t * 2.3 + 1);
      pose(q.flame, { s: 0.96 - k * 0.04, sy: 1 + k * 0.1, ox: 200, oy: 148 });
      pose(q.core, { s: 0.96 - k * 0.04, sy: 1 + k * 0.12, ox: 200, oy: 148 });
      spark(q.sp1, saw(t, 2.6));
      spark(q.sp2, saw(t, 2.6, 0.5));
    };
  });
}
