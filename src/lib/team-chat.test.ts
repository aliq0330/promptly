/** Ekip sohbeti gruplama ve sessizlik gösterimi (docs/history/369-*): ekip kanalları / projeler ayrımı, kaynak önceliği, rozetler. */
import test from "node:test";
import assert from "node:assert/strict";
import { channelKind, channelLabel, channelParam, communityHubHref, groupTeamChannels, teamHubHref, summarizeTeamRow, teamIsMuted, visibleUnread, type HubChannel } from "./team-chat.ts";

const ch = (id: string, extra: Partial<HubChannel> = {}): HubChannel => ({ id, name: id, mode: "open", archivedAt: null, unreadCount: 0, lastMessageAt: null, ...extra });

test("channelKind: ekip / ana / dosya / ek", () => {
  assert.equal(channelKind({}), "team");
  assert.equal(channelKind({ projectId: "p", projectMain: true }), "main");
  assert.equal(channelKind({ projectId: "p", fileId: "f" }), "file");
  assert.equal(channelKind({ projectId: "p" }), "extra");
});

test("groupTeamChannels: ekip kanalları ayrı, projeler ana kanal önde, arşiv hariç", () => {
  const groups = groupTeamChannels([
    ch("genel"),
    ch("duyurular", { unreadCount: 2 }),
    ch("p1-dosya", { projectId: "p1", projectTitle: "Villa", fileId: "f1", mode: "project", unreadCount: 3 }),
    ch("p1", { projectId: "p1", projectTitle: "Villa", projectMain: true, mode: "project", unreadCount: 1 }),
    ch("p2", { projectId: "p2", projectTitle: "Mobil", projectMain: true, mode: "project" }),
    ch("eski", { archivedAt: "2026-01-01" }),
  ]);
  assert.deepEqual(groups.teamChannels.map((c) => c.id), ["genel", "duyurular"]);
  assert.deepEqual(groups.projects.map((p) => p.projectId), ["p1", "p2"]);
  assert.deepEqual(groups.projects[0].channels.map((c) => c.id), ["p1", "p1-dosya"]);
  assert.equal(groups.projects[0].title, "Villa");
  assert.equal(groups.projects[0].unread, 4);
});

test("proje sessizliği: yalnız TÜM kanallar ekip/proje düzeyinde sessizse; tek kanal sessizliği projeyi sessiz yapmaz", () => {
  const some = groupTeamChannels([ch("a", { projectId: "p", projectMain: true, muteScope: "channel" }), ch("b", { projectId: "p", fileId: "f" })]);
  assert.equal(some.projects[0].muted, false);
  assert.equal(some.projects[0].muteScope, null);
  const project = groupTeamChannels([ch("a", { projectId: "p", projectMain: true, muteScope: "project" }), ch("b", { projectId: "p", fileId: "f", muteScope: "project" })]);
  assert.equal(project.projects[0].muted, true);
  assert.equal(project.projects[0].muteScope, "project");
  const team = groupTeamChannels([ch("a", { projectId: "p", projectMain: true, muteScope: "team" }), ch("b", { projectId: "p", fileId: "f", muteScope: "team" })]);
  assert.equal(team.projects[0].muteScope, "team");
});

test("sessiz kanalın okunmamışı rozete ve proje toplamına girmez", () => {
  assert.equal(visibleUnread({ unreadCount: 5, muteScope: "channel" }), 0);
  assert.equal(visibleUnread({ unreadCount: 5, muteScope: null }), 5);
  assert.equal(visibleUnread({ unreadCount: 5 }), 5);
  const groups = groupTeamChannels([ch("a", { projectId: "p", projectMain: true, unreadCount: 2, muteScope: "channel" }), ch("b", { projectId: "p", fileId: "f", unreadCount: 3 })]);
  assert.equal(groups.projects[0].unread, 3);
});

test("teamIsMuted: herhangi bir kanal 'team' kaynaklı sessizse ekip sessizdir", () => {
  assert.equal(teamIsMuted([ch("a", { muteScope: "team" }), ch("b", { muteScope: "team" })]), true);
  assert.equal(teamIsMuted([ch("a", { muteScope: "channel" }), ch("b")]), false);
  assert.equal(teamIsMuted([]), false);
});

test("summarizeTeamRow: ekip kanal adları + proje sayısı, en çok 3 ad", () => {
  const row = summarizeTeamRow([ch("genel"), ch("duyurular"), ch("mimari"), ch("deneme"), ch("p", { projectId: "p1", projectMain: true }), ch("q", { projectId: "p2", projectMain: true })]);
  assert.deepEqual(row.names, ["genel", "duyurular", "mimari"]);
  assert.equal(row.extra, 1);
  assert.equal(row.projects, 2);
});

test("channelLabel: karışık listelerde proje kanalları projesiyle anılır", () => {
  assert.equal(channelLabel(ch("genel")), "genel");
  assert.equal(channelLabel(ch("villa", { projectId: "p", projectTitle: "Villa", projectMain: true })), "Villa");
  assert.equal(channelLabel(ch("ana-sayfa", { projectId: "p", projectTitle: "Villa", fileId: "f", fileTitle: "Ana sayfa" })), "Villa · Ana sayfa");
  assert.equal(channelLabel(ch("duyurular", { projectId: "p", projectTitle: "Villa" })), "Villa · #duyurular");
});

test("adresler: hub bağlantıları ve kanal parametresi (proje kanalında kimlik, ekip kanalında ad)", () => {
  assert.equal(teamHubHref("t1"), "/messages/local?hub=team&team=t1");
  assert.equal(teamHubHref("t1", "p1"), "/messages/local?hub=team&team=t1&project=p1");
  assert.equal(communityHubHref("c1"), "/messages/local?hub=community&id=c1");
  assert.equal(channelParam({ id: "c9", name: "duyurular", projectId: "p" }), "c9");
  assert.equal(channelParam({ id: "c9", name: "duyurular" }), "duyurular");
});
