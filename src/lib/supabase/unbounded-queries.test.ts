/**
 * Guard against the "fetch everything at once" bug (docs/history/254-*): PostgREST answers at most 1000 rows per request, so a list query
 * with no `.range` / `.limit` / `.single` / `head` / `fetchAllRows` silently stops at 1000 (a 3000-prompt profile showed "1000"; 1516
 * tags came back as 1000) and, on a screen, renders every row at once.
 *
 * It reads the data-access files and lists every exported function that reads a list from a table without one of those bounds. A function
 * is allowed only if it is in `BOUNDED_BY_DESIGN` below WITH the reason it cannot grow past a page — a new list query either bounds itself
 * (page / `fetchAllRows` / `limit`) or is added there on purpose, never by accident.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const DIR = new URL("./", import.meta.url);

/** "file.ts:function" → why it stays small. */
const BOUNDED_BY_DESIGN: Record<string, string> = {
  "challenges.ts:fetchChallenges": "weekly themes: a few per year",
  "chat-features.ts:fetchStarredMessages": "the viewer's own starred messages",
  "chat-groups.ts:fetchGroupLinks": "invite links of one community",
  "chat-groups.ts:fetchProfilesByIds": "ids come from one page of members",
  "collections.ts:fetchPublicCollectionsByOwner": "one person's public collections (capped by the product at 200)",
  "collections.ts:fetchFollowedCollections": "followed collections (capped at 200 by `collection_follows`)",
  "collections.ts:isPromptSaved": "one work",
  "content-interest.ts:fetchContentInterests": "own answers for the posts of one list page (ids in parts of 100)",
  "collections.ts:fetchCollectionIdsContaining": "the collections holding ONE work",
  "comment-likes.ts:fetchLikedCommentIds": "ids of one thread's comments",
  "communities.ts:fetchCommunityPostsByIds": "ids come from one page",
  "content-versions.ts:fetchVersionsForRequest": "versions of ONE request (one row per edit)",
  "content-versions.ts:fetchVersionsForWorkflow": "versions of ONE workflow (one row per edit)",
  "content-versions.ts:fetchVersionsForPreset": "versions of ONE preset (one row per edit)",
  "reactions.ts:fetchMyReaction": "the viewer's reaction on ONE target (batched across one page of cards)",
  "presets.ts:fetchPresetsByIds": "ids come from one page",
  "presets.ts:mapFieldRow": "mapper, not a query",
  "profiles.ts:fetchFollowedProfiles": "pickers pass a cap (`limit`); the /following page pages with fetchFollowedProfilesPage",
  "profiles.ts:fetchFollowerProfiles": "pickers pass a cap (`limit`); the /followers page pages with fetchFollowerProfilesPage",
  "prompt-dna.ts:fetchDnaSections": "the DNA sections of ONE prompt (a handful)",
  "prompt-edit-suggestions.ts:fetchSuggestionsForPrompt": "suggestions on ONE prompt",
  "prompt-edit-suggestions.ts:fetchContributorsForPrompt": "contributors of ONE prompt",
  "prompt-variables.ts:fetchVariablesForPrompt": "variables of ONE prompt",
  "prompt-versions.ts:fetchVersionsForPrompt": "versions of ONE prompt (one row per edit)",
  "prompts.ts:fetchPromptsForRequest": "answers to ONE request",
  "prompts.ts:fetchPromptsByIds": "ids come from one page",
  "requests.ts:fetchRequestsByIds": "ids come from one page",
  "spaces.ts:fetchLeadPalettes": "palettes of the Spaces on one page",
  "spaces.ts:fetchSpaceStats": "aggregate over ONE Space's items",
  "spaces.ts:fetchSpaceRatingDistribution": "five buckets",
  "spaces.ts:fetchSpaceGroups": "groups of ONE Space",
  "spaces.ts:fetchSpacePalettes": "palettes of ONE Space",
  "spaces.ts:fetchSpaceMembers": "members of ONE Space",
  "spaces.ts:fetchPendingSpaceInvitations": "the viewer's own invitations",
  "spaces.ts:fetchSpaceSources": "the sources of ONE Space",
  "spaces.ts:findExistingItems": "ids of one add-batch",
  "stories.ts:fetchStoriesByIds": "ids come from one tray",
  "stories.ts:fetchSeenStoryIds": "ids of one tray",
  "tag-follows.ts:fetchFollowedTags": "capped at 100 per user (`tag_follows`)",
  "tool-follows.ts:fetchFollowedTools": "capped at 100 per user (`tool_follows`)",
  "workflows.ts:fetchWorkflowsByIds": "ids come from one page",
  "workflows.ts:requestRef": "mapper helper",
};

/** A `limit?: number` parameter is "no limit unless the caller asks": `if (limit) query.limit(limit)` does NOT bound the list (it let /followers read 1000 rows and draw them all). */
const OPTIONAL_LIMIT = /\blimit\?: number/;
const BOUNDS = /\.limit\(|\.range\(|\.maybeSingle\(|\.single\(|head: true|count: "exact"|fetchAllRows\(/;
const WRITES = /\.(insert|update|delete|upsert)\(/;

function unboundedFunctions(): string[] {
  const found: string[] = [];
  for (const name of readdirSync(DIR).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))) {
    const source = readFileSync(new URL(name, DIR), "utf8");
    for (const part of source.split(/\n(?=export (?:async )?function )/).slice(1)) {
      const fn = /^export (?:async )?function (\w+)/.exec(part)?.[1];
      if (!fn || !part.includes(".from(") || !part.includes(".select(")) continue;
      if (WRITES.test(part)) continue; // a write, not a list read
      if (BOUNDS.test(part) && !OPTIONAL_LIMIT.test(part.split("{")[0])) continue;
      found.push(`${name}:${fn}`);
    }
  }
  return found.sort();
}

test("every list query is bounded (page / limit / fetchAllRows) or listed with the reason it stays small", () => {
  const unexplained = unboundedFunctions().filter((entry) => !(entry in BOUNDED_BY_DESIGN));
  assert.deepEqual(unexplained, [], `unbounded list queries (PostgREST stops at 1000 rows): ${unexplained.join(", ")}`);
});

test("the allow-list holds no stale entries (a function that got bounded, or was removed, is dropped from it)", () => {
  const present = new Set(unboundedFunctions());
  const stale = Object.keys(BOUNDED_BY_DESIGN).filter((entry) => !present.has(entry));
  assert.deepEqual(stale, [], `remove from BOUNDED_BY_DESIGN: ${stale.join(", ")}`);
});
