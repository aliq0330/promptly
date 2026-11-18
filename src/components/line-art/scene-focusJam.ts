// "Film koptu": a film projector whose reel jammed — the beam flickers on a cracked screen. For the Odak (focus) view failing to load.
import { defineScene } from './kit';
import { ink, show, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<path data-n="beam" class="gb" d="M162 114L300 44V132L162 130Z"/>
<rect class="p" x="300" y="30" width="80" height="108" rx="4"/>
<path class="k" d="M328 138L320 160M352 138L360 160"/>
<path class="bf" d="M330 66l22 14l-22 14z"/>
<path class="h" d="M318 34l10 20l-10 10l12 22l-8 14"/>
<circle class="p" cx="62" cy="86" r="17"/><circle class="p" cx="104" cy="86" r="17"/>
<path class="k t" d="M62 72v28M48 86h28M104 72v28M90 86h28"/>
<circle class="p" cx="62" cy="86" r="4"/><circle class="p" cx="104" cy="86" r="4"/>
<rect class="p" x="38" y="102" width="108" height="42" rx="8"/>
<rect class="p" x="146" y="110" width="16" height="26" rx="4"/>
<path class="k" d="M62 144L48 160M122 144L136 160"/>
<path class="k" style="stroke-width:8" d="M88 144q-4 16 12 18q18 2 28-6"/>
<path style="fill:none;stroke:var(--paper);stroke-width:3;stroke-dasharray:2 5;stroke-linecap:round" d="M88 144q-4 16 12 18q18 2 28-6"/>
<circle data-n="led" class="hf" cx="58" cy="122" r="4"/>`;

export function focusJam(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'fj', w: 800, h: 400, G: 320, seed: 32, ground: 'paving' }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      // a projector lamp that stutters: two incommensurate waves make it flutter
      show(q.beam, 0.7 + wave(t, 0.37) * 0.18 + wave(t, 1.3) * 0.12);
      show(q.led, 0.55 + wave(t, 1.1) * 0.45);
    };
  });
}
