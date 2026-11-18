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
import { feedStalled } from "./scene-feedStalled";
import { focusJam } from "./scene-focusJam";
import { fishing } from "./scene-fishing";
import { cutString } from "./scene-cutString";
import { halfBridge } from "./scene-halfBridge";
import { invite } from "./scene-invite";
import { locked } from "./scene-locked";
import { story } from "./scene-story";
import { emptyFrame } from "./scene-emptyFrame";
import { files } from "./scene-files";
import { mailbox } from "./scene-mailbox";
import { following } from "./scene-following";
import { shelf } from "./scene-shelf";
import { talk } from "./scene-talk";
import { stars } from "./scene-stars";
import { filter } from "./scene-filter";
import { members } from "./scene-members";
import { archive } from "./scene-archive";
import { sprout } from "./scene-sprout";
import { params } from "./scene-params";
import { notebook } from "./scene-notebook";
import { bottle } from "./scene-bottle";
import { dominoes } from "./scene-dominoes";
import { quoteBoard } from "./scene-quoteBoard";
import { toolbox } from "./scene-toolbox";

const SCENES: Record<LineArtKind, (host: Element, labels: SceneLabels) => () => void> = { meydan, lost, share, milestone, studio, offline, loader, inbox, chat, saved, search, community, spaces, requests, workflow, preset, drafts, insights, team, collection,
  feedStalled, focusJam, fishing, cutString, halfBridge, invite, locked, story, emptyFrame, files, mailbox, following, shelf, talk, stars, filter, members, archive, sprout, params, notebook, bottle, dominoes, quoteBoard, toolbox };

/** Draw a scene into `host`; returns the unmount, which also removes the drawing. */
export function mountLineArt(kind: LineArtKind, host: Element, labels: SceneLabels): () => void {
  const stop = SCENES[kind](host, labels);
  return () => {
    stop();
    host.replaceChildren();
  };
}
