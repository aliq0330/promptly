// Loaded on demand by LineArtScene (dynamic import), so the drawing code stays out of every other page's bundle.
import { lost } from "./scene-lost";
import { meydan } from "./scene-meydan";
import { share } from "./scene-share";
import type { SceneLabels } from "./scene-common";

export type LineArtKind = "meydan" | "lost" | "share";

const SCENES: Record<LineArtKind, (host: Element, labels: SceneLabels) => () => void> = { meydan, lost, share };

/** Draw a scene into `host`; returns the unmount, which also removes the drawing. */
export function mountLineArt(kind: LineArtKind, host: Element, labels: SceneLabels): () => void {
  const stop = SCENES[kind](host, labels);
  return () => {
    stop();
    host.replaceChildren();
  };
}
