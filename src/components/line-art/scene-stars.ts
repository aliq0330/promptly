// "Kavanoz boş": an empty glass jar under a night sky while one star falls toward it. For the starred-messages list.
import { defineScene } from './kit';
import { ink, keys, pose, saw, show, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<path class="k t" d="M60 40h8M64 36v8M330 60h8M334 56v8M110 100h6M113 97v6M300 30h6M303 27v6M44 130h6M47 127v6"/>
<rect class="p" x="160" y="58" width="80" height="14" rx="4"/>
<path class="p" d="M168 72H232V82a14 14 0 0 1 8 12V150a14 14 0 0 1-14 14H174a14 14 0 0 1-14-14V94a14 14 0 0 1 8-12Z"/>
<path class="k t" d="M174 102v40"/>
<circle data-n="glow" class="gb" cx="200" cy="148" r="14"/>
<g transform="translate(200 40)"><g data-n="star"><path class="k t dash" d="M-4 -4L-40 -30"/><path class="gl" d="M0 -11l3.4 7 7.6 1-5.5 5.4 1.3 7.6L0 6.2l-6.8 3.8 1.3-7.6L-11 -3l7.6-1z"/></g></g>`;

export function stars(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'sr', w: 800, h: 400, G: 328, seed: 45, ground: 'floor' }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      // the star drops into the jar, then a new one starts from the sky (the still frame, t = 3, has it just above the jar)
      const u = saw(t, 3.6);
      pose(q.star, { x: keys(u, [[0, -50], [0.75, 0], [1, 0]]), y: keys(u, [[0, -60], [0.75, 0], [1, 34]]), r: keys(u, [[0, -20], [0.75, 10], [1, 10]]) });
      show(q.star, u < 0.15 ? u / 0.15 : u < 0.75 ? 1 : (1 - u) / 0.25);
      show(q.glow, 0.5 + wave(t, 1.8) * 0.5);
    };
  });
}
