import { test } from "node:test";
import assert from "node:assert/strict";
import { bulkMuteTarget, bulkPinTarget, hubRouteView, matchesHubFilter, matchesHubQuery, pickDefaultChannel, pickProjectChannel, pinnedFirst, resolveHubTarget } from "./messages-hub.ts";

const none = { hub: null, team: null, project: null, id: null };

test("sol sütun: açık hub parametresi kazanır, yoksa açık sohbetin ekibi/projesi/topluluğu, hiçbiri yoksa sohbet listesi", () => {
  assert.deepEqual(resolveHubTarget({ ...none, hub: "team", team: "t1" }, null), { kind: "team", teamId: "t1", projectId: null });
  assert.deepEqual(resolveHubTarget({ ...none, hub: "team", team: "t1", project: "p1" }, { teamId: "t1", projectId: null, communityId: null }), { kind: "team", teamId: "t1", projectId: "p1" });
  assert.deepEqual(resolveHubTarget({ ...none, hub: "community", id: "c1" }, null), { kind: "community", communityId: "c1" });
  assert.deepEqual(resolveHubTarget({ ...none, id: "ch1" }, { teamId: "t1", projectId: "p1", communityId: null }), { kind: "team", teamId: "t1", projectId: "p1" });
  assert.deepEqual(resolveHubTarget({ ...none, id: "c1" }, { teamId: null, projectId: null, communityId: "c1" }), { kind: "community", communityId: "c1" });
  assert.equal(resolveHubTarget({ ...none, id: "dm" }, { teamId: null, projectId: null, communityId: null }), null);
  assert.equal(resolveHubTarget(none, null), null);
  // team adı eksik hub adresi sohbet listesine düşmez, ama açık sohbet de yoksa null kalır
  assert.equal(resolveHubTarget({ ...none, hub: "team" }, null), null);
});

test("sağ bölme: telefonda liste sayfa, bilgisayarda sohbet; kanal seçili değilken ekip için varsayılan kanal açtırılır", () => {
  const team = { ...none, hub: "team", team: "t1", room: null };
  assert.equal(hubRouteView(team, false), "hub");
  assert.equal(hubRouteView(team, true), "open-default");
  assert.equal(hubRouteView({ ...team, id: "ch1" }, false), "chat");
  assert.equal(hubRouteView({ ...team, id: "ch1" }, true), "chat");
  const community = { ...none, hub: "community", id: "c1", room: null };
  assert.equal(hubRouteView(community, false), "hub");
  assert.equal(hubRouteView({ ...community, room: "r1" }, false), "chat");
  assert.equal(hubRouteView(community, true), "chat");
  assert.equal(hubRouteView({ ...none, id: "x", room: null }, false), "chat");
});

test("varsayılan kanal seçimi", () => {
  const rows = [
    { id: "a", isDefault: false, projectId: "p" , projectMain: true },
    { id: "b", isDefault: false, projectId: null },
    { id: "c", isDefault: true, projectId: null },
  ];
  assert.equal(pickDefaultChannel(rows)?.id, "c");
  assert.equal(pickDefaultChannel(rows.slice(0, 2))?.id, "b");
  assert.equal(pickDefaultChannel(rows.slice(0, 1))?.id, "a");
  assert.equal(pickDefaultChannel([]), null);
  assert.equal(pickProjectChannel([{ id: "x" }, { id: "y", projectMain: true }])?.id, "y");
  assert.equal(pickProjectChannel([{ id: "x" }])?.id, "x");
  assert.equal(pickProjectChannel([]), null);
});

test("sabitlenmişler başa çıkar, sıra kararlıdır", () => {
  const rows = ["a", "b", "c", "d"];
  assert.deepEqual(pinnedFirst(rows, (r) => r === "c" || r === "b"), ["b", "c", "a", "d"]);
  assert.deepEqual(pinnedFirst(rows, () => false), rows);
});

test("toplu sabitle / sessize al: hepsi zaten açıksa kapatır, değilse hepsini açar; boş seçimde açar", () => {
  const set = new Set(["a", "b"]);
  assert.equal(bulkPinTarget(["a", "b"], (k) => set.has(k)), false);
  assert.equal(bulkPinTarget(["a", "c"], (k) => set.has(k)), true);
  assert.equal(bulkPinTarget([], (k) => set.has(k)), true);
  assert.equal(bulkMuteTarget(["a", "b"], (k) => set.has(k)), false);
  assert.equal(bulkMuteTarget(["a", "c"], (k) => set.has(k)), true);
});

test("süzgeç ve arama", () => {
  assert.equal(matchesHubFilter("all", { unread: 0, muted: false }), true);
  assert.equal(matchesHubFilter("unread", { unread: 2, muted: false }), true);
  assert.equal(matchesHubFilter("unread", { unread: 2, muted: true }), false, "sessiz satırın rozeti görünmez");
  assert.equal(matchesHubFilter("muted", { unread: 0, muted: true }), true);
  assert.equal(matchesHubFilter("muted", { unread: 0, muted: false }), false);
  assert.equal(matchesHubQuery("", "genel"), true);
  assert.equal(matchesHubQuery("MİM", "mimari", null), true);
  assert.equal(matchesHubQuery("kahve", "genel", "Deniz: Kahve molası"), true);
  assert.equal(matchesHubQuery("zzz", "genel", "x"), false);
});
