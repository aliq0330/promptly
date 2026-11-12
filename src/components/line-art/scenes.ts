// Loaded on demand by LineArtScene (dynamic import), so the drawing code stays out of every other page's bundle.
import type { SceneLabels } from "./scene-common";
import type { LineArtKind } from "./kinds";
import { lost } from "./scene-lost";
import { meydan } from "./scene-meydan";
import { share } from "./scene-share";
import { milestone } from "./scene-milestone";
import { studio } from "./scene-studio";
import { offline } from "./scene-offline";
import { loader } from "./scene-loader";
import { inbox } from "./scene-inbox";
import { chat } from "./scene-chat";
import { saved } from "./scene-saved";
import { search } from "./scene-search";
import { community } from "./scene-community";
import { spaces } from "./scene-spaces";
import { requests } from "./scene-requests";
import { workflow } from "./scene-workflow";
import { preset } from "./scene-preset";
import { drafts } from "./scene-drafts";
import { insights } from "./scene-insights";
import { team } from "./scene-team";
import { collection } from "./scene-collection";

const SCENES: Record<LineArtKind, (host: Element, labels: SceneLabels) => () => void> = { meydan, lost, share, milestone, studio, offline, loader, inbox, chat, saved, search, community, spaces, requests, workflow, preset, drafts, insights, team, collection };

/** Draw a scene into `host`; returns the unmount, which also removes the drawing. */
export function mountLineArt(kind: LineArtKind, host: Element, labels: SceneLabels): () => void {
  const stop = SCENES[kind](host, labels);
  return () => {
    stop();
    host.replaceChildren();
  };
}
