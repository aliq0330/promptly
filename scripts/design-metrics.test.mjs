// Tasarım sistemi kilidi (docs/history/403-*): `scripts/design-metrics.mjs` sayaçlarının hepsi hedefinde kalmalı. Kırılırsa `node scripts/design-metrics.mjs --top`
// hangi dosyaların ihlal ettiğini gösterir. Yeni bir bilinçli istisna `design-metrics.mjs` içindeki `allow` listesine yorumla eklenir.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("tasarım sistemi sayaçları hedefi aşmaz (scripts/design-metrics.mjs --check)", () => {
  try {
    execFileSync(process.execPath, [new URL("./design-metrics.mjs", import.meta.url).pathname, "--check"], { stdio: "pipe" });
  } catch (error) {
    assert.fail(String(error.stdout) + String(error.stderr));
  }
  assert.ok(true);
});
