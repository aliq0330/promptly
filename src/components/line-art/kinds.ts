// The line-art scenes (docs/history/374-*): their names, drawing ratio and aria-label keys. Static and tiny on purpose — pages
// import it to size a scene before its drawing code (a separate chunk) has loaded, so nothing jumps.
import type { TranslationKey } from "@/lib/i18n/translations";

export interface LineArtMeta {
  /** width / height of the drawing */
  ratio: number;
  label: TranslationKey;
  /** the small tap-hint line drawn inside (a few scenes) */
  hint?: TranslationKey;
}

export const LINE_ART = {
  meydan: { ratio: 2, label: "lineArt.meydanLabel", hint: "lineArt.meydanHint" },
  lost: { ratio: 2, label: "lineArt.lostLabel" },
  share: { ratio: 2, label: "lineArt.shareLabel" },
  milestone: { ratio: 2, label: "lineArt.milestoneLabel", hint: "lineArt.milestoneHint" },
  studio: { ratio: 2, label: "lineArt.studioLabel" },
  offline: { ratio: 2, label: "lineArt.offlineLabel" },
  inbox: { ratio: 2, label: "lineArt.inboxLabel" },
  chat: { ratio: 2, label: "lineArt.chatLabel" },
  saved: { ratio: 2, label: "lineArt.savedLabel" },
  search: { ratio: 2, label: "lineArt.searchLabel" },
  community: { ratio: 2, label: "lineArt.communityLabel" },
  spaces: { ratio: 2, label: "lineArt.spacesLabel" },
  requests: { ratio: 2, label: "lineArt.requestsLabel" },
  workflow: { ratio: 2, label: "lineArt.workflowLabel" },
  preset: { ratio: 2, label: "lineArt.presetLabel" },
  drafts: { ratio: 2, label: "lineArt.draftsLabel" },
  insights: { ratio: 2, label: "lineArt.insightsLabel" },
  team: { ratio: 2, label: "lineArt.teamLabel" },
  collection: { ratio: 2, label: "lineArt.collectionLabel" },
  feedStalled: { ratio: 2, label: "lineArt.feedStalledLabel" },
  focusJam: { ratio: 2, label: "lineArt.focusJamLabel" },
  fishing: { ratio: 2, label: "lineArt.fishingLabel" },
  cutString: { ratio: 2, label: "lineArt.cutStringLabel" },
  halfBridge: { ratio: 2, label: "lineArt.halfBridgeLabel" },
  invite: { ratio: 2, label: "lineArt.inviteLabel" },
  locked: { ratio: 2, label: "lineArt.lockedLabel" },
  story: { ratio: 2, label: "lineArt.storyLabel" },
  emptyFrame: { ratio: 2, label: "lineArt.emptyFrameLabel" },
  files: { ratio: 2, label: "lineArt.filesLabel" },
  mailbox: { ratio: 2, label: "lineArt.mailboxLabel" },
  following: { ratio: 2, label: "lineArt.followingLabel" },
  shelf: { ratio: 2, label: "lineArt.shelfLabel" },
  talk: { ratio: 2, label: "lineArt.talkLabel" },
  stars: { ratio: 2, label: "lineArt.starsLabel" },
  filter: { ratio: 2, label: "lineArt.filterLabel" },
  members: { ratio: 2, label: "lineArt.membersLabel" },
  archive: { ratio: 2, label: "lineArt.archiveLabel" },
  sprout: { ratio: 2, label: "lineArt.sproutLabel" },
  params: { ratio: 2, label: "lineArt.paramsLabel" },
  notebook: { ratio: 2, label: "lineArt.notebookLabel" },
  bottle: { ratio: 2, label: "lineArt.bottleLabel" },
  dominoes: { ratio: 2, label: "lineArt.dominoesLabel" },
  quoteBoard: { ratio: 2, label: "lineArt.quoteBoardLabel" },
  toolbox: { ratio: 2, label: "lineArt.toolboxLabel" },
  loader: { ratio: 80 / 34, label: "lineArt.loaderLabel" },
} satisfies Record<string, LineArtMeta>;

export type LineArtKind = keyof typeof LINE_ART;
