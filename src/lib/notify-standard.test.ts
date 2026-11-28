import assert from "node:assert/strict";
import { test } from "node:test";
import { channelPick, muteSourceKey, NOTIFY_PICK_ORDER, pickLevel, pickToServer, roomPick } from "./notify-standard.ts";

test("etkin düzey kanal varsayılanına eşitse 'Varsayılan' seçili görünür", () => {
  assert.equal(channelPick("mentions", "mentions"), "default");
  assert.equal(channelPick("all", "mentions"), "all");
  assert.equal(channelPick("none", "mentions"), "none");
  assert.equal(channelPick("none", "none"), "default");
});

test("'Varsayılan' sunucuya null yazar, diğerleri aynen", () => {
  assert.equal(pickToServer("default"), null);
  assert.equal(pickToServer("all"), "all");
  assert.equal(pickToServer("mentions"), "mentions");
  assert.equal(pickToServer("none"), "none");
});

test("pickLevel: 'Varsayılan' kanalın varsayılan düzeyini verir", () => {
  assert.equal(pickLevel("default", "mentions"), "mentions");
  assert.equal(pickLevel("all", "mentions"), "all");
});

test("gidiş-dönüş: sunucudan gelen seçim aynı seçime döner", () => {
  for (const def of ["all", "mentions", "none"] as const) {
    for (const own of ["all", "mentions", "none"] as const) {
      const pick = channelPick(own, def);
      assert.equal(pickLevel(pick, def), own);
    }
  }
});

test("oda iki düzeyli", () => {
  assert.equal(roomPick(true), "none");
  assert.equal(roomPick(false), "all");
});

test("seçenek sırası ve sessizlik kaynağı", () => {
  assert.deepEqual([...NOTIFY_PICK_ORDER], ["default", "all", "mentions", "none"]);
  assert.equal(muteSourceKey("team"), "team");
  assert.equal(muteSourceKey("project"), "project");
  assert.equal(muteSourceKey(undefined), null);
  assert.equal(muteSourceKey(null), null);
});
