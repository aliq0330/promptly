// "Defter henüz boş": an open notebook with a blinking cursor between two curly braces and a pencil beside it. For an empty prompts tab.
import { defineScene } from './kit';
import { ink, show, wave } from './scene-parts';
import type { SceneLabels } from './scene-common';

const ART = `
<path class="k" d="M100 62V160Q160 150 200 164Q240 150 300 160V62"/>
<path class="p" d="M200 60Q160 46 106 56V148Q160 138 200 152Z"/>
<path class="p" d="M200 60Q240 46 294 56V148Q240 138 200 152Z"/>
<path class="k t" d="M120 78h60M120 92h52M120 106h58M120 120h38"/>
<path class="b" d="M232 78q-10 0-10 10v8q0 6-8 6q8 0 8 6v8q0 10 10 10"/>
<path class="b" d="M270 78q10 0 10 10v8q0 6 8 6q-8 0-8 6v8q0 10-10 10"/>
<rect data-n="cursor" class="bf" x="249" y="90" width="3" height="26"/>
<g transform="rotate(30 346 104)"><rect class="p" x="338" y="62" width="16" height="76" rx="2"/><path class="gl" d="M338 138l8 18l8-18z"/><path class="k t" d="M338 78h16"/></g>`;

export function notebook(host: Element, labels: SceneLabels): () => void {
  return defineScene(host, labels, { id: 'nb', w: 800, h: 400, G: 336, seed: 51, ground: 'floor' }, (c) => {
    const q = ink(c.mid, ART);
    return (t) => {
      // a text cursor: on for a while, off for a while, never a fade
      show(q.cursor, wave(t, 1.1) > -0.2 ? 1 : 0.08);
    };
  });
}
