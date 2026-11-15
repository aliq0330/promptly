import test from "node:test";
import assert from "node:assert/strict";
import { composeSkillShareBody, parseSkillShareBody } from "./skill-share-format.ts";

const ID = "0f0f0f0f-1111-4222-8333-444444444444";

test("a skill share block round-trips: note, title and id", () => {
  const body = composeSkillShareBody("Bunu dene", "Logo Skill", ID);
  assert.deepEqual(parseSkillShareBody(body), { note: "Bunu dene", id: ID, title: "Logo Skill" });
});

test("without a note the block is just title + link", () => {
  assert.deepEqual(parseSkillShareBody(composeSkillShareBody("", "Logo Skill", ID)), { note: null, id: ID, title: "Logo Skill" });
});

test("ordinary text, a space link or a link with no title line is not a skill share", () => {
  assert.equal(parseSkillShareBody("merhaba"), null);
  assert.equal(parseSkillShareBody(null), null);
  assert.equal(parseSkillShareBody(`https://x.test/spaces/local?id=${ID}`), null);
  assert.equal(parseSkillShareBody(`https://x.test/skills/local?id=${ID}`), null);
});
