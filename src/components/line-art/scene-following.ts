// "Ufukta kimse yok": a telescope on a tripod pointed at an empty horizon, a flag on the far hill, one bird. For a feed of people you follow when you follow no one yet.
import { defineScene } from './kit';
import { ink, pose, show, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<circle class="gb" cx="332" cy="48" r="28"/>
<path class="k t" d="M0 150Q60 112 120 140T240 132T400 146"/>
<path class="k" d="M150 112L120 160M150 112L180 160M150 112V160"/>
<g transform="rotate(-18 150 106)"><rect class="p" x="78" y="97" width="18" height="18" rx="3"/><rect class="p" x="92" y="92" width="116" height="26" rx="8"/><rect class="p" x="208" y="88" width="22" height="34" rx="5"/><path class="k t" d="M130 92v26M170 92v26"/></g>
<path class="k" d="M316 140V108"/>
<path class="hf" d="M316 108l22 7-22 7z"/>
<path data-n="bird" class="b" d="M270 74q8-9 16 0q8-9 16 0"/>
<path data-n="glint" class="k t" d="M254 54l8-6M258 66h10"/>`;

export function following(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'fo', w: 800, h: 400, G: 320, seed: 42, ground: 'grass' }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      pose(q.bird, { x: wave(t, 6) * 12, y: wave(t, 3, 0.25) * -5 });
      show(q.glint, 0.55 + wave(t, 1.8) * 0.45);
    };
  });
}
