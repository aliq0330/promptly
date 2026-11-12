import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseTeamCreateContext, teamCreateHref, teamCreateReturnHref, teamItemHref } from "./team-create.ts";

const P = "11111111-1111-4111-8111-111111111111";
const F = "22222222-2222-4222-8222-222222222222";
const B = "33333333-3333-4333-8333-333333333333";
const T = "44444444-4444-4444-8444-444444444444";

test("teamCreateHref: her tür kendi oluşturma ekranına gider ve bağlamı taşır", () => {
  assert.equal(teamCreateHref("prompt", { projectId: P, fileId: F, boardId: null }), `/create?mode=prompt&teamProject=${P}&teamFile=${F}`);
  assert.equal(teamCreateHref("request", { projectId: P, fileId: F, boardId: B }), `/requests/new?teamProject=${P}&teamFile=${F}&teamBoard=${B}`);
  assert.equal(teamCreateHref("workflow", { projectId: P, fileId: F, boardId: null }), `/workflows/create?teamProject=${P}&teamFile=${F}`);
  assert.equal(teamCreateHref("preset", { projectId: P, fileId: F, boardId: B }), `/presets/create?teamProject=${P}&teamFile=${F}&teamBoard=${B}`);
});

test("parseTeamCreateContext: gidiş-dönüş, eksik/bozuk kimlik null", () => {
  const href = teamCreateHref("prompt", { projectId: P, fileId: F, boardId: B });
  assert.deepEqual(parseTeamCreateContext(href.split("?")[1]), { projectId: P, fileId: F, boardId: B });
  assert.deepEqual(parseTeamCreateContext(`teamProject=${P}&teamFile=${F}`), { projectId: P, fileId: F, boardId: null });
  assert.equal(parseTeamCreateContext(`teamFile=${F}`), null);
  assert.equal(parseTeamCreateContext(`teamProject=x&teamFile=${F}`), null);
  assert.equal(parseTeamCreateContext(""), null);
  // Bozuk pano kimliği bağlamı bozmaz, yalnız panoyu atar.
  assert.deepEqual(parseTeamCreateContext(`teamProject=${P}&teamFile=${F}&teamBoard=nope`), { projectId: P, fileId: F, boardId: null });
});

test("teamCreateReturnHref: panodan gelindiyse pano tuvali, değilse dosya", () => {
  const board = teamCreateReturnHref(T, { projectId: P, fileId: F, boardId: B });
  assert.ok(board.includes(`board=${B}`) && board.includes("sub=board") && board.includes(`file=${F}`));
  const file = teamCreateReturnHref(T, { projectId: P, fileId: F, boardId: null });
  assert.ok(file.includes(`file=${F}`) && !file.includes("board="));
});

test("teamItemHref: öğe çekmecesi", () => {
  const href = teamItemHref(T, P, F, "item-1");
  assert.ok(href.includes("item=item-1") && href.includes(`file=${F}`));
  assert.ok(!teamItemHref(T, P, F, null).includes("item="));
});

test("teamGroup: klasörün (grup) içinden gelindiyse bağlam grubu taşır ve dönüş klasörü açar (docs/history/378-*)", () => {
  const G = "55555555-5555-4555-8555-555555555555";
  const href = teamCreateHref("prompt", { projectId: P, fileId: F, boardId: null, groupId: G });
  assert.ok(href.includes(`teamGroup=${G}`));
  assert.deepEqual(parseTeamCreateContext(href.split("?")[1]), { projectId: P, fileId: F, boardId: null, groupId: G });
  assert.deepEqual(parseTeamCreateContext(`teamProject=${P}&teamFile=${F}&teamGroup=bozuk`), { projectId: P, fileId: F, boardId: null });
  assert.ok(teamCreateReturnHref(T, { projectId: P, fileId: F, boardId: null, groupId: G }).includes(`group=${G}`));
  assert.ok(!teamCreateReturnHref(T, { projectId: P, fileId: F, boardId: null }).includes("group="));
});
